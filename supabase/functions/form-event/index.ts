// form-event — PÚBLICA. Registra a visita (type "view"), até onde o visitante
// chegou no formulário (funil por etapa) e manda PageView, ViewContent e
// FormStart pela API de Conversões.
//
// Verify JWT: DESLIGADO. "view" só cria sessão para formulário publicado, com
// limite por IP; os demais tipos só alteram uma sessão existente, com menos de
// 24h e não concluída. A etapa só aumenta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TRACK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid', 'referrer', 'landing'];
const sha256 = async (v: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const background = (p: Promise<unknown>) => {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
};

async function sendCapi(formId: string, pixelId: string, event: Record<string, unknown> | Record<string, unknown>[]) {
  const { data: sec } = await admin.from('form_secrets').select('capi_token, test_event_code').eq('form_id', formId).maybeSingle();
  const s = sec as Record<string, string> | null;
  if (!s?.capi_token) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(s.capi_token)}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: Array.isArray(event) ? event : [event], ...(s.test_event_code ? { test_event_code: s.test_event_code } : {}) }),
    });
    if (!res.ok) console.warn('[form-event] CAPI HTTP', res.status); else await res.body?.cancel();
  } catch (e) { console.warn('[form-event] CAPI falhou', String(e)); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return json({ error: 'too_large' }, 413);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const sessionId = String(body.sessionId ?? '');
    if (!UUID_RE.test(sessionId)) return json({ ok: false });
    const step = Math.max(0, Math.min(200, Math.floor(Number(body.step) || 0)));
    const type = body.type === 'start' ? 'start' : body.type === 'view' ? 'view' : 'step';
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
    const userData = {
      client_ip_address: ip || undefined,
      client_user_agent: req.headers.get('user-agent') ?? undefined,
      fbp: typeof body.fbp === 'string' ? body.fbp.slice(0, 200) : undefined,
      fbc: typeof body.fbc === 'string' ? body.fbc.slice(0, 300) : undefined,
    };

    // ── Visita: cria a sessão do funil + PageView/ViewContent no servidor ──
    if (type === 'view') {
      const formId = String(body.formId ?? '');
      if (!UUID_RE.test(formId)) return json({ ok: false });
      const { data: fr } = await admin.from('forms').select('id, company_id, name, pixel_id, capi_configured')
        .eq('id', formId).eq('status', 'published').maybeSingle();
      const form = fr as { id: string; company_id: string; name: string; pixel_id: string | null; capi_configured: boolean } | null;
      if (!form) return json({ ok: false });
      const ipHash = ip ? await sha256(`${ip}|${SUPABASE_URL}`) : null;
      if (ipHash) {
        const since = new Date(Date.now() - 10 * 60_000).toISOString();
        const { count } = await admin.from('form_sessions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
        if ((count ?? 0) >= 60) return json({ ok: false });
      }
      const dev = ['mobile', 'tablet', 'desktop'].includes(String(body.device)) ? String(body.device) : null;
      await admin.from('form_sessions').upsert(
        { id: sessionId, form_id: form.id, company_id: form.company_id, tracking: cleanTracking(body.tracking), device: dev, ip_hash: ipHash },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      const pvId = String(body.eventId ?? '');
      if (form.pixel_id && form.capi_configured && /^pv_[a-z0-9]{8,64}$/i.test(pvId)) {
        const now = Math.floor(Date.now() / 1000);
        const src = typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : undefined;
        background(sendCapi(form.id, form.pixel_id, [
          { event_name: 'PageView', event_time: now, event_id: pvId, action_source: 'website', event_source_url: src, user_data: userData },
          { event_name: 'ViewContent', event_time: now, event_id: `${pvId}_vc`, action_source: 'website', event_source_url: src, user_data: userData, custom_data: { content_name: form.name } },
        ]));
      }
      return json({ ok: true });
    }

    const { data: s } = await admin.from('form_sessions')
      .select('id, form_id, last_step, started, completed, created_at').eq('id', sessionId).maybeSingle();
    const session = s as { id: string; form_id: string; last_step: number; started: boolean; completed: boolean; created_at: string } | null;
    if (!session || session.completed || Date.now() - new Date(session.created_at).getTime() > 24 * 3600_000) return json({ ok: false });

    const patch: Record<string, unknown> = {};
    if (step > session.last_step) patch.last_step = step;
    if (!session.started) patch.started = true;
    if (Object.keys(patch).length) await admin.from('form_sessions').update(patch).eq('id', session.id);

    const eventId = String(body.eventId ?? '');
    if (type === 'start' && !session.started && /^fs_[a-z0-9]{8,64}$/i.test(eventId)) {
      const { data: form } = await admin.from('forms').select('pixel_id, capi_configured').eq('id', session.form_id).maybeSingle();
      const f = form as { pixel_id: string | null; capi_configured: boolean } | null;
      if (f?.pixel_id && f.capi_configured) {
        background(sendCapi(session.form_id, f.pixel_id, {
          event_name: 'FormStart', event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: 'website',
          event_source_url: typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : undefined,
          user_data: userData,
        }));
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error('[form-event]', e);
    return json({ ok: false }, 500);
  }
});
