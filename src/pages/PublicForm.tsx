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
type PublicFormData = { id?: string; name: string; config: unknown; pixelId?: string | null };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq; __gxForm?: Promise<PublicFormData | null> } }

const fetchPublicForm = async (agency: string, slug: string): Promise<PublicFormData | null> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_agency: agency.toLowerCase(), p_slug: slug.toLowerCase() }),
  });
  return res.ok ? res.json() : null;
};

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
  window.fbq('init', pixelId);
  // Os eventos ficam na fila; o script da Meta (~100 KB) só baixa depois que o
  // formulário já está na tela, para não disputar a internet do celular.
  const append = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(append, { timeout: 1500 }); else setTimeout(append, 800);
};

// ─── Envio garantido ─────────────────────────────────────────────────────────
// A tela de obrigado aparece na hora; o envio segue em segundo plano, com novas
// tentativas. Se a internet cair, o envio fica guardado no aparelho e é
// reenviado na próxima abertura. O servidor ignora repetições (mesmo eventId).
const PENDING_KEY = 'gx_pending_submits';
type Pending = { body: Record<string, unknown>; tries: number };
const readPending = (): Pending[] => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; } };
const writePending = (list: Pending[]) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10))); } catch { /* sem storage */ } };

const deliver = async (body: Record<string, unknown>): Promise<'ok' | 'retry' | 'drop'> => {
  try {
    const { ok, status } = await call('form-submit', body, true);
    if (ok) return 'ok';
    return status >= 500 || status === 429 ? 'retry' : 'drop';
  } catch { return 'retry'; }
};

const sendWithRetry = async (body: Record<string, unknown>) => {
  const id = String(body.eventId);
  writePending([...readPending().filter(p => p.body.eventId !== id), { body, tries: 0 }]);
  for (const wait of [0, 2000, 5000, 12000]) {
    if (wait) await new Promise(res => setTimeout(res, wait));
    const res = await deliver(body);
    if (res !== 'retry') { writePending(readPending().filter(p => p.body.eventId !== id)); return; }
  }
};

const flushPending = () => {
  const list = readPending();
  if (!list.length) return;
  writePending([]);
  for (const p of list) {
    if (p.tries >= 5) continue;
    void deliver(p.body).then(res => { if (res === 'retry') writePending([...readPending(), { body: p.body, tries: p.tries + 1 }]); });
  }
};

const CACHE_PREFIX = 'gx_form:';

export const PublicForm = () => {
  const [, , agency = '', formSlug = ''] = window.location.pathname.split('/');
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [config, setConfig] = useState<FormConfig | null>(null);
  const session = useRef<string | null>(null);
  const pixel = useRef<string | null>(null);
  const submitEvent = useRef<'Lead' | 'CompleteRegistration'>('Lead');
  const tracking = useRef(readTracking());
  // Eventos do funil esperam a visita ser registrada (a sessão precisa existir)
  const viewDone = useRef<Promise<unknown>>(Promise.resolve());

  const fbcValue = () => {
    const c = cookie('_fbc');
    if (c) return c;
    const fbclid = tracking.current.fbclid;
    return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
  };

  useEffect(() => {
    let alive = true;
    const pageViewId = newEventId('pv');

    const show = (form: PublicFormData, sessionId: string | null) => {
      const cfg = normalizeConfig(form.config);
      session.current = sessionId;
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
    };

    flushPending();
    let shown = false;
    const showFast = (form: PublicFormData) => {
      if (shown) return;
      shown = true;
      const sessionId = crypto.randomUUID?.() ?? null;
      show(form, sessionId);
      if (sessionId) {
        viewDone.current = call('form-event', {
          type: 'view', sessionId, formId: form.id, tracking: tracking.current, device: device(),
          eventId: pageViewId, sourceUrl: window.location.href, fbp: cookie('_fbp'), fbc: fbcValue(),
        }, true).catch(() => {});
      }
    };

    // Quem já abriu este formulário vê na hora (cópia guardada no aparelho);
    // a versão do servidor substitui logo em seguida se algo mudou.
    const cacheKey = `${CACHE_PREFIX}${agency}/${formSlug}`;
    let cachedRaw: string | null = null;
    try { cachedRaw = localStorage.getItem(cacheKey); } catch { /* sem storage */ }
    if (cachedRaw) { try { const c = JSON.parse(cachedRaw) as PublicFormData; if (c?.id) showFast(c); } catch { /* cópia inválida */ } }

    // Caminho rápido: o HTML já começou a buscar o formulário direto do banco.
    // A visita (funil + API de Conversões) é registrada em segundo plano.
    const early = window.__gxForm ?? fetchPublicForm(agency, formSlug);
    early.then(async (form) => {
      if (!alive) return;
      if (form && form.id) {
        const fresh = JSON.stringify(form);
        try { localStorage.setItem(cacheKey, fresh); } catch { /* sem storage */ }
        if (!shown) showFast(form);
        else if (fresh !== cachedRaw) setConfig(normalizeConfig(form.config));
        return;
      }
      if (shown && form === null) {
        // Formulário despublicado: some a cópia guardada
        try { localStorage.removeItem(cacheKey); } catch { /* sem storage */ }
      }
      // Reserva: função form-get (caso a migração rápida ainda não tenha sido rodada)
      const { ok, status, data } = await call('form-get', { agency, form: formSlug, tracking: tracking.current, device: device(), pageViewEventId: pageViewId, sourceUrl: window.location.href, fbp: cookie('_fbp'), fbc: fbcValue() });
      if (!alive) return;
      if (!ok || !data.form) {
        if (shown && status !== 404) return; // sem internet: mantém a cópia guardada
        setState('missing'); document.title = 'Formulário indisponível'; return;
      }
      if (!shown) show(data.form as PublicFormData, (data.sessionId as string) ?? null);
    }).catch(() => { if (alive && !shown) setState('missing'); });
    return () => { alive = false; };
  }, [agency, formSlug]);

  const onStart = () => {
    const eventId = newEventId('fs');
    if (pixel.current) window.fbq?.('trackCustom', 'FormStart', {}, { eventID: eventId });
    const sid = session.current;
    if (sid) void viewDone.current.then(() => call('form-event', { sessionId: sid, type: 'start', step: 0, eventId, fbp: cookie('_fbp'), fbc: fbcValue(), sourceUrl: window.location.href }, true)).catch(() => {});
  };

  const onStep = (answered: number) => {
    if (pixel.current) window.fbq?.('trackCustom', 'FormStep', { step: answered });
    const sid = session.current;
    if (sid) void viewDone.current.then(() => call('form-event', { sessionId: sid, type: 'step', step: answered }, true)).catch(() => {});
  };

  const onSubmit = async (answers: Answers, outcome: Outcome, honeypot: string) => {
    const eventId = newEventId('ld');
    // As respostas já foram validadas na tela com as mesmas regras do servidor:
    // mostra o obrigado na hora e envia em segundo plano, com novas tentativas.
    void sendWithRetry({
      agency, form: formSlug, sessionId: session.current, answers, honeypot, eventId,
      fbp: cookie('_fbp'), fbc: fbcValue(), sourceUrl: window.location.href, tracking: tracking.current,
    });
    if (pixel.current) {
      if (outcome.outcome === 'qualified') window.fbq?.('track', submitEvent.current, {}, { eventID: eventId });
      else window.fbq?.('trackCustom', 'LeadDisqualified', {}, { eventID: eventId });
    }
    return {};
  };

  if (state === 'loading') {
    return <div id="gx-boot"><i /></div>;
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
