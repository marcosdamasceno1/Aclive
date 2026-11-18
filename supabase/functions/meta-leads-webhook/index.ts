import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Comparação em tempo constante (não vaza o segredo pelo tempo de resposta).
const safeEqual = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// Assinatura X-Hub-Signature-256 da Meta. Só é exigida quando o segredo
// META_APP_SECRET está configurado nas Edge Functions (recomendado).
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
const validMetaSignature = async (raw: string, header: string | null) => {
  if (!APP_SECRET) return true;
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, header.slice(7));
};

const clip = (v: unknown, n: number) => (v == null ? null : String(v).trim().slice(0, n) || null);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);

  // ── GET: verificação do webhook pelo Meta ─────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || token.length < 8 || !challenge) {
      return new Response('Bad Request', { status: 400, headers: CORS });
    }

    const { data } = await supabase
      .from('company_secrets')
      .select('company_id')
      .eq('meta_leads_verify_token', token)
      .limit(1)
      .maybeSingle();

    if (!data) return new Response('Forbidden', { status: 403, headers: CORS });

    return new Response(challenge, { status: 200, headers: CORS });
  }

  // ── POST: lead chegou ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const raw = await req.text();
    if (!(await validMetaSignature(raw, req.headers.get('x-hub-signature-256')))) {
      console.warn('[meta-leads] assinatura inválida — evento descartado');
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return new Response('Bad Request', { status: 400, headers: CORS }); }

    // Meta envia um echo de teste — responde OK e ignora
    if (body.object !== 'page') return new Response('OK', { status: 200, headers: CORS });

    const entries = (body.entry as Record<string, unknown>[]) ?? [];

    for (const entry of entries) {
      const pageId  = String(entry.id ?? '');
      if (!/^\d{1,30}$/.test(pageId)) continue;
      const changes = (entry.changes as Record<string, unknown>[]) ?? [];

      // Busca agência pelo page_id
      const { data: cfg } = await supabase
        .from('company_settings')
        .select('company_id')
        .eq('meta_leads_page_id', pageId)
        .limit(1)
        .maybeSingle();
      const { data: sec } = cfg
        ? await supabase.from('company_secrets').select('meta_leads_page_token').eq('company_id', cfg.company_id).maybeSingle()
        : { data: null };
      const settings = cfg && sec?.meta_leads_page_token
        ? { company_id: cfg.company_id as string, meta_leads_page_token: sec.meta_leads_page_token as string }
        : null;

      if (!settings) {
        console.warn(`[meta-leads] Nenhuma agência encontrada para page_id=${pageId}`);
        continue;
      }

      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const value      = change.value as Record<string, unknown>;
        const leadgenId  = String(value?.leadgen_id ?? '');
        const formId     = String(value?.form_id ?? '').slice(0, 40);
        if (!/^\d{1,30}$/.test(leadgenId)) continue;

        // Busca dados do lead na Graph API
        const graphRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,created_time&access_token=${encodeURIComponent(settings.meta_leads_page_token)}`,
        );

        if (!graphRes.ok) {
          console.error(`[meta-leads] Erro ao buscar lead ${leadgenId}: HTTP ${graphRes.status}`);
          continue;
        }

        const leadData = await graphRes.json() as {
          field_data?: { name: string; values: string[] }[];
          created_time?: string;
        };

        // Normaliza field_data em mapa chave→valor
        const f: Record<string, string> = {};
        for (const fd of leadData.field_data ?? []) {
          f[fd.name] = fd.values?.[0] ?? '';
        }

        // Nome: tenta variações comuns (PT e EN)
        let name =
          f['full_name'] || f['nome_completo'] || f['nome'] ||
          [f['first_name'] || f['primeiro_nome'], f['last_name'] || f['sobrenome']]
            .filter(Boolean).join(' ') || 'Lead Meta';

        const phone = f['phone_number'] || f['telefone'] || f['celular'] || null;
        const email = f['email'] || f['e-mail'] || null;

        const { error } = await supabase.from('leads').insert({
          id:         crypto.randomUUID(),
          company_id: settings.company_id,
          name:       name.trim().slice(0, 120),
          email:      clip(email, 254),
          phone:      clip(phone, 30),
          source:     'meta',
          status:     'new',
          notes:      `Formulário Meta ID: ${formId}`,
          created_at: new Date().toISOString(),
        });

        if (error) console.error('[meta-leads] Erro ao inserir lead:', error);
        else console.log(`[meta-leads] Lead inserido para agência ${settings.company_id}`);
      }
    }

    return new Response('OK', { status: 200, headers: CORS });
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS });
});
