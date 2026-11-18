// form-get — PÚBLICA. Entrega o formulário publicado de growthexpert.com.br/f/<agencia>/<formulario>
// e abre a sessão do funil.
//
// Verify JWT: DESLIGADO (o visitante não tem login).
//
// SEGURANÇA:
// - A agência é descoberta no banco pelo par apelido + formulário; nada que o
//   navegador mande define a agência.
// - Só devolve o que a página mostra: perguntas, visual, telas de obrigado e ID
//   do Pixel. Nunca o company_id, tags, telefone de aviso ou o token da API de
//   Conversões.
// - Limite de sessões por IP para não inflar o funil.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const TRACK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid', 'referrer', 'landing'];

const sha256 = async (v: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
const cleanTracking = (t: unknown) => {
  const out: Record<string, string> = {};
  if (t && typeof t === 'object') {
    for (const k of TRACK_KEYS) {
      const v = (t as Record<string, unknown>)[k];
      if (typeof v === 'string' && v) out[k] = v.slice(0, 500);
    }
  }
  return out;
};
const background = (p: Promise<unknown>) => {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
};

// Só o necessário para desenhar o formulário.
const publicConfig = (raw: unknown) => {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const questions = Array.isArray(c.questions) ? c.questions : [];
  return {
    version: 1,
    welcome: c.welcome,
    theme: c.theme,
    endings: c.endings,
    privacyText: c.privacyText,
    tracking: c.tracking,
    questions: questions.map((q: Record<string, unknown>) => ({
      ...q,
      options: Array.isArray(q.options)
        ? q.options.map((o: Record<string, unknown>) => ({ id: o.id, label: o.label, imageUrl: o.imageUrl, action: o.action, endingId: o.endingId }))
        : undefined,
    })),
  };
};

async function sendCapi(formId: string, pixelId: string, events: Record<string, unknown>[]) {
  const { data: sec } = await admin.from('form_secrets').select('capi_token, test_event_code').eq('form_id', formId).maybeSingle();
  const token = (sec as Record<string, string> | null)?.capi_token;
  if (!token) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: events, ...((sec as Record<string, string>).test_event_code ? { test_event_code: (sec as Record<string, string>).test_event_code } : {}) }),
    });
    if (!res.ok) console.warn('[form-get] CAPI HTTP', res.status);
    else await res.body?.cancel();
  } catch (e) { console.warn('[form-get] CAPI falhou', String(e)); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return json({ error: 'too_large' }, 413);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const agency = String(body.agency ?? '').toLowerCase();
    const slug = String(body.form ?? '').toLowerCase();
    if (!SLUG_RE.test(agency) || !SLUG_RE.test(slug)) return json({ error: 'not_found' }, 404);

    const { data: company } = await admin.from('companies').select('id').eq('slug', agency).maybeSingle();
    if (!company) return json({ error: 'not_found' }, 404);
    const companyId = String((company as { id: string }).id);

    const { data: form } = await admin.from('forms')
      .select('id, name, config, pixel_id, capi_configured')
      .eq('company_id', companyId).eq('slug', slug).eq('status', 'published').maybeSingle();
    if (!form) return json({ error: 'not_found' }, 404);
    const f = form as { id: string; name: string; config: unknown; pixel_id: string | null; capi_configured: boolean };

    // Sessão do funil, gravada em segundo plano para a página abrir mais rápido
    // (limite por IP: 60 sessões a cada 10 minutos).
    const ip = clientIp(req);
    const sessionId = crypto.randomUUID();
    const dev = ['mobile', 'tablet', 'desktop'].includes(String(body.device)) ? String(body.device) : null;
    const tracking = cleanTracking(body.tracking);
    background((async () => {
      const ipHash = ip ? await sha256(`${ip}|${SUPABASE_URL}`) : null;
      if (ipHash) {
        const since = new Date(Date.now() - 10 * 60_000).toISOString();
        const { count } = await admin.from('form_sessions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
        if ((count ?? 0) >= 60) return;
      }
      const { error } = await admin.from('form_sessions').insert({ id: sessionId, form_id: f.id, company_id: companyId, tracking, device: dev, ip_hash: ipHash });
      if (error) console.warn('[form-get] sessão', error.message);
    })());

    // PageView + ViewContent pela API de Conversões (mesmo eventID do Pixel)
    const pvId = String(body.pageViewEventId ?? '');
    if (f.pixel_id && f.capi_configured && /^pv_[a-z0-9]{8,64}$/i.test(pvId)) {
      const userData: Record<string, unknown> = {
        client_ip_address: ip || undefined,
        client_user_agent: req.headers.get('user-agent') ?? undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp.slice(0, 200) : undefined,
        fbc: typeof body.fbc === 'string' ? body.fbc.slice(0, 300) : undefined,
      };
      const now = Math.floor(Date.now() / 1000);
      const src = typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : undefined;
      background(sendCapi(f.id, f.pixel_id, [
        { event_name: 'PageView', event_time: now, event_id: pvId, action_source: 'website', event_source_url: src, user_data: userData },
        { event_name: 'ViewContent', event_time: now, event_id: `${pvId}_vc`, action_source: 'website', event_source_url: src, user_data: userData, custom_data: { content_name: f.name } },
      ]));
    }

    return json({ sessionId, form: { name: f.name, config: publicConfig(f.config), pixelId: f.pixel_id } });
  } catch (e) {
    console.error('[form-get]', e);
    return json({ error: 'server_error' }, 500);
  }
});
