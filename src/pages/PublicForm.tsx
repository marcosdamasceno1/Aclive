/**
 * PublicForm — página pública growthexpert.com.br/f/<agencia>/<formulario>.
 *
 * Carregada fora do pacote do sistema (ver main.tsx) para abrir rápido no 4G.
 * Fala só com as Edge Functions públicas form-get / form-event / form-submit;
 * a agência dona das respostas é definida no servidor, pelo formulário.
 *
 * Cada evento do Pixel leva um eventID que também vai ao servidor, que manda
 * o mesmo evento pela API de Conversões — a Meta conta uma vez só.
 */
import { useEffect, useRef, useState } from 'react';
import { FormRunner } from '../components/forms/FormRunner';
import { normalizeConfig, type Answers, type FormConfig, type Outcome } from '../lib/forms/schema';
import { SUPABASE_URL, ANON_KEY } from '../lib/supabaseConfig';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const call = async (fn: string, body: Record<string, unknown>, keepalive = false) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
};

const newEventId = (prefix: string) =>
  `${prefix}_${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '')}`;

const cookie = (name: string) =>
  document.cookie.split('; ').find(c => c.startsWith(`${name}=`))?.split('=')[1];

const readTracking = () => {
  const p = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid'];
  const t: Record<string, string> = {};
  for (const k of keys) { const v = p.get(k); if (v) t[k] = v.slice(0, 300); }
  if (document.referrer) t.referrer = document.referrer.slice(0, 300);
  t.landing = window.location.href.slice(0, 500);
  return t;
};

const device = () => /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'desktop';

const loadPixel = (pixelId: string) => {
  if (window.fbq) return;
  const f: Fbq = function (...args: unknown[]) {
    if (f.callMethod) (f.callMethod as (...a: unknown[]) => void)(...args); else f.queue!.push(args);
  } as Fbq;
  f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
  window.fbq = f; window._fbq = f;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  window.fbq('init', pixelId);
};

export const PublicForm = () => {
  const [, , agency = '', formSlug = ''] = window.location.pathname.split('/');
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [config, setConfig] = useState<FormConfig | null>(null);
  const session = useRef<string | null>(null);
  const pixel = useRef<string | null>(null);
  const submitEvent = useRef<'Lead' | 'CompleteRegistration'>('Lead');
  const tracking = useRef(readTracking());

  const fbcValue = () => {
    const c = cookie('_fbc');
    if (c) return c;
    const fbclid = tracking.current.fbclid;
    return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
  };

  useEffect(() => {
    let alive = true;
    const pageViewId = newEventId('pv');
    call('form-get', { agency, form: formSlug, tracking: tracking.current, device: device(), pageViewEventId: pageViewId, sourceUrl: window.location.href, fbp: cookie('_fbp'), fbc: fbcValue() })
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok || !data.form) { setState('missing'); document.title = 'Formulário indisponível'; return; }
        const form = data.form as { name: string; config: unknown; pixelId?: string };
        const cfg = normalizeConfig(form.config);
        session.current = (data.sessionId as string) ?? null;
        submitEvent.current = cfg.tracking.submitEvent;
        document.title = form.name;
        if (form.pixelId && /^\d{5,20}$/.test(form.pixelId)) {
          pixel.current = form.pixelId;
          loadPixel(form.pixelId);
          window.fbq?.('track', 'PageView', {}, { eventID: pageViewId });
          window.fbq?.('track', 'ViewContent', { content_name: form.name }, { eventID: `${pageViewId}_vc` });
        }
        setConfig(cfg);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => { alive = false; };
  }, [agency, formSlug]);

  const onStart = () => {
    const eventId = newEventId('fs');
    if (pixel.current) window.fbq?.('trackCustom', 'FormStart', {}, { eventID: eventId });
    if (session.current) void call('form-event', { sessionId: session.current, type: 'start', step: 0, eventId, fbp: cookie('_fbp'), fbc: fbcValue(), sourceUrl: window.location.href }, true).catch(() => {});
  };

  const onStep = (answered: number) => {
    if (pixel.current) window.fbq?.('trackCustom', 'FormStep', { step: answered });
    if (session.current) void call('form-event', { sessionId: session.current, type: 'step', step: answered }, true).catch(() => {});
  };

  const onSubmit = async (answers: Answers, outcome: Outcome, honeypot: string) => {
    const eventId = newEventId('ld');
    try {
      const { ok, status, data } = await call('form-submit', {
        agency, form: formSlug, sessionId: session.current, answers, honeypot, eventId,
        fbp: cookie('_fbp'), fbc: fbcValue(), sourceUrl: window.location.href, tracking: tracking.current,
      });
      if (!ok) {
        return { error: status === 429 ? 'Muitos envios seguidos. Aguarde alguns minutos e tente de novo.' : (String(data.error ?? '') || 'Não foi possível enviar. Tente novamente.') };
      }
      if (pixel.current) {
        if (outcome.outcome === 'qualified') window.fbq?.('track', submitEvent.current, {}, { eventID: eventId });
        else window.fbq?.('trackCustom', 'LeadDisqualified', {}, { eventID: eventId });
      }
      return {};
    } catch {
      return { error: 'Sem conexão. Verifique a internet e tente de novo.' };
    }
  };

  if (state === 'loading') {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin" /></div>;
  }
  if (state === 'missing' || !config) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white px-6 text-center">
        <div>
          <p className="text-xl font-bold text-slate-900">Formulário indisponível</p>
          <p className="text-slate-500 mt-2">Este link não existe ou foi pausado.</p>
        </div>
      </div>
    );
  }
  return <FormRunner config={config} mode="live" onStart={onStart} onStep={onStep} onSubmit={onSubmit} />;
};

export default PublicForm;
