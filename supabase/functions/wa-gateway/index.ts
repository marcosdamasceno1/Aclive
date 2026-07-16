// wa-gateway — Gateway central do WAHA (multi-agência num único servidor SEU).
//
// Secrets a definir em Supabase → Edge Functions → wa-gateway → Settings → Secrets:
//   WAHA_BASE_URL = https://seu-waha.dominio.com   (seu servidor WAHA Plus)
//   WAHA_API_KEY  = valor de WHATSAPP_API_KEY do seu WAHA
//
// SEGURANÇA / ISOLAMENTO (inegociável):
// - O nome da sessão é SEMPRE derivado do company_id do JWT verificado no
//   servidor (getUser). O cliente NUNCA escolhe a sessão — logo uma agência
//   jamais acessa a sessão de outra.
// - A chave-mestra do WAHA vive só aqui (env), nunca no frontend.
// - Toda chamada ao WAHA tem timeout (não trava) e a função nunca lança para
//   o cliente: devolve erro tratado.
// - Mantenha "Verify JWT" LIGADO nesta função (é chamada autenticada).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const WAHA_BASE    = (Deno.env.get('WAHA_BASE_URL') ?? '').replace(/\/+$/, '');
const WAHA_KEY     = Deno.env.get('WAHA_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// fetch ao WAHA com timeout de 12s — nada pode pendurar a função
const wahaFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(`${WAHA_BASE}${path}`, {
    ...init,
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_KEY, ...(init.headers ?? {}) },
  }).finally(() => clearTimeout(t));
};

async function statusAndQr(session: string): Promise<Response> {
  let status = 'UNKNOWN';
  try {
    const sRes = await wahaFetch(`/api/sessions/${session}`);
    if (sRes.status === 404) return json({ status: 'STOPPED' });
    const s = await sRes.json().catch(() => ({}));
    status = String((s as Record<string, unknown>).status ?? 'UNKNOWN');
  } catch {
    return json({ status: 'UNREACHABLE', error: 'waha_unreachable' });
  }

  let qr: string | null = null;
  if (status === 'SCAN_QR_CODE') {
    try {
      const qrRes = await wahaFetch(`/api/${session}/auth/qr?format=image`);
      if (qrRes.ok) {
        const buf = new Uint8Array(await qrRes.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        qr = `data:image/png;base64,${btoa(bin)}`;
      }
    } catch { /* QR indisponível neste tick — o front tenta de novo */ }
  }
  return json({ status, qr });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!WAHA_BASE || !WAHA_KEY) {
    return json({ error: 'server_not_configured', message: 'Servidor WAHA não configurado. Defina WAHA_BASE_URL e WAHA_API_KEY nos secrets da função wa-gateway.' });
  }

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

  // Sessão determinística e à prova de injeção — vem só do JWT.
  const session = `c_${companyId.replace(/-/g, '')}`;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const action = String(body.action ?? '');

  try {
    // ── Conectar: garante segredo do webhook, cria/inicia a sessão e retorna QR ──
    if (action === 'start') {
      const { data: cfg } = await admin
        .from('company_settings').select('*').eq('company_id', companyId).maybeSingle();
      let secret = (cfg as Record<string, unknown> | null)?.wa_webhook_secret as string || '';
      if (!secret) {
        secret = crypto.randomUUID().replace(/-/g, '');
        await admin.from('company_settings').upsert(
          { company_id: companyId, wa_webhook_secret: secret, updated_at: new Date().toISOString() },
          { onConflict: 'company_id' },
        );
      }
      const hookUrl = `${SUPABASE_URL}/functions/v1/waha-webhook?company_id=${companyId}&token=${secret}`;
      const config = { webhooks: [{ url: hookUrl, events: ['message'] }] };

      const createRes = await wahaFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: session, start: true, config }),
      });
      // Já existe (409/422/400): atualiza a config do webhook e garante o start.
      if ([400, 409, 422].includes(createRes.status)) {
        await wahaFetch(`/api/sessions/${session}`, { method: 'PUT', body: JSON.stringify({ config }) }).catch(() => {});
        await wahaFetch(`/api/sessions/${session}/start`, { method: 'POST' }).catch(() => {});
      } else if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        return json({ error: 'waha_error', message: (err as { message?: string })?.message || `HTTP ${createRes.status}` });
      }
      return await statusAndQr(session);
    }

    if (action === 'status') {
      return await statusAndQr(session);
    }

    if (action === 'logout') {
      await wahaFetch(`/api/sessions/${session}/logout`, { method: 'POST' }).catch(() => {});
      await wahaFetch(`/api/sessions/${session}/stop`, { method: 'POST' }).catch(() => {});
      return json({ ok: true, status: 'STOPPED' });
    }

    if (action === 'send') {
      const chatKey = String(body.chatKey ?? '').replace(/\D/g, '');
      const text = String(body.text ?? '');
      if (!chatKey || chatKey.length < 8 || !text) return json({ error: 'bad_request' });
      const res = await wahaFetch('/api/sendText', {
        method: 'POST',
        body: JSON.stringify({ session, chatId: `${chatKey}@c.us`, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ error: 'send_failed', message: (data as { message?: string })?.message || `HTTP ${res.status}` });
      }
      const rawId = (data as Record<string, unknown>).id;
      const id = typeof rawId === 'string' ? rawId : String((rawId as Record<string, unknown> | undefined)?._serialized ?? '') || null;
      return json({ ok: true, providerMessageId: id });
    }

    return json({ error: 'unknown_action' });
  } catch (e) {
    return json({ error: 'gateway_error', message: String(e) });
  }
});
