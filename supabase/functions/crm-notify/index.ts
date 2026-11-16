// crm-notify — Envia notificações para o endpoint (webhook) do sistema Acta.
//
// O frontend NUNCA fala direto com o Acta: a URL do endpoint e o token da
// agência ficam em company_settings e só esta função os lê, usando a service
// role. O supabase-js injeta o JWT do usuário automaticamente — é assim que a
// função sabe de qual agência é a chamada.
//
// Mantenha "Verify JWT" LIGADO nesta função (é chamada autenticada).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Isolamento: valida o token e extrai o company_id NO SERVIDOR ──────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);
  const companyId = (user.user_metadata?.company_id as string) || '';
  if (!companyId) return json({ error: 'no_company', message: 'Usuário sem agência associada.' });

  const { data: cfg } = await admin
    .from('company_settings').select('crm_api_key, crm_endpoint_url').eq('company_id', companyId).maybeSingle();
  const actaToken = (cfg as Record<string, unknown> | null)?.crm_api_key as string || '';
  const endpoint  = (cfg as Record<string, unknown> | null)?.crm_endpoint_url as string || '';
  if (!actaToken || !endpoint) {
    return json({ error: 'not_configured', message: 'Acta não configurado. Configure em Configurações → Integrações → WhatsApp.' });
  }
  if (!/^https:\/\//i.test(endpoint)) {
    return json({ error: 'bad_endpoint', message: 'O endpoint do Acta precisa começar com https://' });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const phone   = String(body.phone ?? '').replace(/\D/g, '');
  const message = String(body.content ?? '');
  const name    = String(body.name ?? '');
  if (!phone || phone.length < 10 || !message) return json({ error: 'bad_request' }, 400);

  const payload = JSON.stringify({ phone, message, ...(name ? { name } : {}) });
  const post = (authorization: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    return fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': authorization },
      body: payload,
    }).finally(() => clearTimeout(t));
  };

  try {
    const rawToken = actaToken.replace(/^Bearer\s+/i, '').trim();
    let res = await post(rawToken);
    // O Acta pode esperar o token puro ou no formato "Bearer <token>": tenta os dois.
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel();
      res = await post(`Bearer ${rawToken}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { message?: string; error?: string | { message?: string } };
        detail = j.message || (typeof j.error === 'string' ? j.error : j.error?.message) || detail;
      } catch { /* resposta não-JSON */ }
      return json({ error: 'acta_error', message: detail || `HTTP ${res.status}` });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'gateway_error', message: String(e) });
  }
});
