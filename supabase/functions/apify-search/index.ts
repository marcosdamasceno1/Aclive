// apify-search — Prospecção Google Maps com CHAVE-MESTRA no backend.
//
// O dono do software banca a Apify. O usuário não cadastra token nenhum.
// Secret a definir em Supabase → Edge Functions → apify-search → Secrets:
//   APIFY_TOKEN = seu token da Apify (apify_api_...)
//
// FREIOS DE CUSTO (inegociáveis):
// - Cota mensal por agência (padrão 100; override em companies.apify_monthly_limit).
//   Contada por linhas de apify_usage no mês corrente → reseta sozinho.
// - Teto de resultados por busca fixado no servidor (MAX_RESULTS), ignora o que
//   o frontend pedir — o custo escala com o nº de resultados.
// - Cada busca é registrada em apify_usage (auditoria/base para planos pagos).
//
// SEGURANÇA: o company_id vem do JWT verificado no servidor (getUser). A chave
// da Apify vive só aqui. Mantenha "Verify JWT" DESLIGADO (auth é feita no código).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const APIFY_TOKEN  = Deno.env.get('APIFY_TOKEN') ?? '';

const ACTOR = 'compass~crawler-google-places';
const DEFAULT_LIMIT = 100; // cota mensal padrão por agência
const MAX_RESULTS = 20;    // teto de resultados por busca (controle de custo)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const monthStartISO = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

async function getQuota(companyId: string): Promise<{ used: number; limit: number }> {
  const { data: comp } = await admin
    .from('companies').select('apify_monthly_limit').eq('id', companyId).maybeSingle();
  const override = (comp as Record<string, unknown> | null)?.apify_monthly_limit;
  const limit = typeof override === 'number' ? override : DEFAULT_LIMIT;
  const { count } = await admin
    .from('apify_usage')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('created_at', monthStartISO());
  return { used: count ?? 0, limit };
}

// fetch à Apify com timeout — nada pendura a função
const apify = (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`https://api.apify.com/v2${path}${sep}token=${APIFY_TOKEN}`, {
    ...init,
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  }).finally(() => clearTimeout(t));
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!APIFY_TOKEN) {
    return json({ error: 'not_configured', message: 'Prospecção indisponível: a chave da Apify não está configurada no servidor.' });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: 'unauthorized' }, 401);
  const companyId = (user.user_metadata?.company_id as string) || '';
  if (!companyId) return json({ error: 'no_company', message: 'Usuário sem agência associada.' });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const action = String(body.action ?? '');

  try {
    if (action === 'quota') {
      return json(await getQuota(companyId));
    }

    if (action === 'start') {
      const q = await getQuota(companyId);
      if (q.used >= q.limit) {
        return json({ error: 'quota_exceeded', message: `Limite mensal de buscas atingido (${q.used}/${q.limit}). Renova no início do próximo mês.`, used: q.used, limit: q.limit });
      }
      const segment = String(body.segment ?? '').trim();
      const city = String(body.city ?? '').trim();
      if (!segment || !city) return json({ error: 'bad_request', message: 'Informe segmento e cidade.' });

      const runRes = await apify(`/acts/${ACTOR}/runs`, {
        method: 'POST',
        body: JSON.stringify({
          searchStringsArray: [`${segment} em ${city}`],
          maxCrawledPlacesPerSearch: MAX_RESULTS,
          language: 'pt-BR',
          maxImages: 0,
          scrapeDirectories: false,
        }),
      });
      if (!runRes.ok) {
        const e = await runRes.json().catch(() => ({})) as { error?: { message?: string } };
        return json({ error: 'apify_error', message: e?.error?.message || `Erro ao iniciar a busca: ${runRes.status}` });
      }
      const rd = await runRes.json();
      // Registra a busca (conta na cota) — o run já custa, mesmo se falhar depois.
      const { data: usage } = await admin
        .from('apify_usage')
        .insert({ company_id: companyId, query: `${segment} em ${city}` })
        .select('id').maybeSingle();
      const after = await getQuota(companyId);
      return json({
        runId: rd.data.id,
        datasetId: rd.data.defaultDatasetId,
        usageId: (usage as Record<string, unknown> | null)?.id ?? null,
        used: after.used, limit: after.limit,
      });
    }

    if (action === 'poll') {
      const runId = String(body.runId ?? '');
      const datasetId = String(body.datasetId ?? '');
      const usageId = String(body.usageId ?? '');
      if (!runId || !datasetId) return json({ error: 'bad_request' });

      const stRes = await apify(`/actor-runs/${runId}`);
      const st = await stRes.json().catch(() => ({}));
      const status = String((st as { data?: { status?: string } })?.data?.status ?? '');

      if (status === 'SUCCEEDED') {
        const itemsRes = await apify(`/datasets/${datasetId}/items?limit=${MAX_RESULTS}&fields=title,phone,website,address,city,totalScore,reviewsCount,categoryName`);
        const items = await itemsRes.json().catch(() => []);
        const valid = Array.isArray(items) ? items.filter((i: { title?: string }) => i.title) : [];
        if (usageId) await admin.from('apify_usage').update({ result_count: valid.length }).eq('id', usageId);
        return json({ status: 'SUCCEEDED', items: valid });
      }
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        return json({ status: 'FAILED', message: 'A busca falhou na Apify. Tente novamente.' });
      }
      return json({ status: 'RUNNING' });
    }

    return json({ error: 'unknown_action' });
  } catch (e) {
    return json({ error: 'server_error', message: String(e) });
  }
});
