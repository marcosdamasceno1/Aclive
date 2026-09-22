// crm-notify — Gateway para a API de notificações do CRM (api.apiintegracoes.com).
//
// O frontend NUNCA fala direto com a API do CRM: a API Key da agência fica
// guardada em company_settings (linha isolada por company_id via RLS) e só
// esta função a lê, usando a service role. O supabase-js injeta o JWT do
// usuário automaticamente — é assim que a função sabe de qual agência é a
// chamada e busca a API Key/instance_id corretos.
//
// Mantenha "Verify JWT" LIGADO nesta função (é chamada autenticada).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const CRM_BASE_URL  = (Deno.env.get('CRM_API_BASE_URL') ?? 'https://api.apiintegracoes.com/v1').replace(/\/+$/, '');

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
    .from('company_settings').select('crm_api_key, crm_instance_id').eq('company_id', companyId).maybeSingle();
  const apiKey     = (cfg as Record<string, unknown> | null)?.crm_api_key as string || '';
  const instanceId = (cfg as Record<string, unknown> | null)?.crm_instance_id as string || '';
  if (!apiKey || !instanceId) {
    return json({ error: 'not_configured', message: 'CRM não configurado. Configure em Configurações → Integrações → WhatsApp.' });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const phone = String(body.phone ?? '').replace(/\D/g, '');
  const content = String(body.content ?? '');
  if (!phone || phone.length < 10 || !content) return json({ error: 'bad_request' }, 400);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${CRM_BASE_URL}/notifications`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        instance_id: instanceId,
        phone,
        content_type: 'text',
        content,
      }),
    }).finally(() => clearTimeout(t));

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      const err = data.error as { code?: string; message?: string } | undefined;
      return json({ error: 'crm_error', message: err?.message || err?.code || `HTTP ${res.status}` });
    }
    const result = (data.data ?? {}) as Record<string, unknown>;
    return json({ ok: true, providerMessageId: (result.notification_id as string) ?? null, status: (result.status as string) ?? null });
  } catch (e) {
    return json({ error: 'gateway_error', message: String(e) });
  }
});
