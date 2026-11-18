// form-submit — PÚBLICA. Recebe as respostas, valida, cria o lead na aba Leads
// da agência dona do formulário, envia o evento à API de Conversões da Meta e
// avisa no WhatsApp pelo Acta.
//
// Verify JWT: DESLIGADO (o visitante não tem login).
//
// SEGURANÇA:
// - A agência vem do formulário no banco (apelido + formulário), nunca do navegador.
// - O resultado (qualificado ou desqualificado) é recalculado aqui a partir das
//   respostas; o que o navegador calculou é ignorado.
// - Janela, etapa e tags só são aceitas se forem da mesma agência.
// - Antispam: campo isca, limite de envios por IP e tamanho máximo.

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRACK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid', 'referrer', 'landing'];

type Option = { id: string; label: string; action?: string; endingId?: string; tagIds?: string[] };
type Question = { id: string; type: string; title: string; required?: boolean; options?: Option[] };
type Ending = { id: string; kind?: string };
type Config = {
  questions: Question[];
  endings: Ending[];
  tracking?: { submitEvent?: string };
  destination?: { qualifiedTagIds?: string[]; disqualifiedTagIds?: string[]; notifyPhone?: string };
};
type Answers = Record<string, unknown>;

const isChoice = (t: string) => t === 'single_choice' || t === 'multi_choice' || t === 'image_choice';
const digits = (v: string) => v.replace(/\D/g, '');
const sha256 = async (v: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
const background = (p: Promise<unknown>) => {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
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

// Mesma regra de src/lib/forms/schema.ts (validateAnswer)
const validate = (q: Question, value: unknown): string | null => {
  if (q.type === 'statement') return null;
  const empty = value == null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '');
  if (empty) return q.required ? 'obrigatória' : null;
  if (isChoice(q.type)) {
    const ids = (q.options ?? []).map(o => o.id);
    const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
    if (q.type !== 'multi_choice' && chosen.length !== 1) return 'escolha uma';
    if (chosen.length > 50 || !chosen.every(id => ids.includes(id))) return 'opção inválida';
    return null;
  }
  if (typeof value !== 'string') return 'formato';
  const v = value.trim();
  if (v.length > (q.type === 'long_text' ? 4000 : 300)) return 'longa demais';
  switch (q.type) {
    case 'email': return EMAIL_RE.test(v) ? null : 'e-mail';
    case 'phone': { const d = digits(v); return d.length >= 10 && d.length <= 15 ? null : 'telefone'; }
    case 'number': return /^-?\d+([.,]\d+)?$/.test(v) ? null : 'número';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'data';
    case 'name': return v.length >= 2 ? null : 'nome';
    default: return null;
  }
};

const disqualifying = (q: Question, value: unknown): Option | null => {
  if (!isChoice(q.type) || value == null) return null;
  const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
  return (q.options ?? []).find(o => o.action === 'disqualify' && chosen.includes(o.id)) ?? null;
};

const label = (q: Question, value: unknown): string => {
  if (value == null) return '';
  if (isChoice(q.type)) {
    const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
    return (q.options ?? []).filter(o => chosen.includes(o.id)).map(o => o.label).join(', ');
  }
  return String(value).trim();
};

async function notifyActa(companyId: string, phone: string, message: string) {
  let d = digits(phone);
  if (d.length < 10) return;
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  const [{ data: cfg }, { data: sec }] = await Promise.all([
    admin.from('company_settings').select('crm_endpoint_url').eq('company_id', companyId).maybeSingle(),
    admin.from('company_secrets').select('crm_api_key').eq('company_id', companyId).maybeSingle(),
  ]);
  const endpoint = String((cfg as Record<string, unknown> | null)?.crm_endpoint_url ?? '');
  const token = String((sec as Record<string, unknown> | null)?.crm_api_key ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !/^https:\/\//i.test(endpoint)) return;
  const body = JSON.stringify({ phone: d, message: message.slice(0, 4000) });
  const post = async (authorization: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      return await fetch(endpoint, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: authorization }, body });
    } finally { clearTimeout(t); }
  };
  try {
    let res = await post(token);
    if (res.status === 401 || res.status === 403) { await res.body?.cancel(); res = await post(`Bearer ${token}`); }
    if (!res.ok) console.warn('[form-submit] Acta HTTP', res.status); else await res.body?.cancel();
  } catch (e) { console.warn('[form-submit] Acta falhou', String(e)); }
}

async function sendCapi(formId: string, pixelId: string, event: Record<string, unknown>, submissionId: string) {
  const { data: sec } = await admin.from('form_secrets').select('capi_token, test_event_code').eq('form_id', formId).maybeSingle();
  const s = sec as Record<string, string> | null;
  if (!s?.capi_token) return;
  let status = 'erro';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(s.capi_token)}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], ...(s.test_event_code ? { test_event_code: s.test_event_code } : {}) }),
    });
    const txt = await res.text();
    status = res.ok ? 'enviado' : `erro ${res.status}: ${txt.slice(0, 180)}`;
  } catch (e) { status = `erro: ${String(e).slice(0, 120)}`; }
  finally { clearTimeout(t); }
  await admin.from('form_submissions').update({ capi_status: status }).eq('id', submissionId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 60_000) return json({ error: 'Respostas grandes demais.' }, 413);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const agency = String(body.agency ?? '').toLowerCase();
    const slug = String(body.form ?? '').toLowerCase();
    if (!SLUG_RE.test(agency) || !SLUG_RE.test(slug)) return json({ error: 'Formulário não encontrado.' }, 404);

    // ── Formulário e agência (sempre do banco) ──
    const { data: company } = await admin.from('companies').select('id').eq('slug', agency).maybeSingle();
    if (!company) return json({ error: 'Formulário não encontrado.' }, 404);
    const companyId = String((company as { id: string }).id);
    const { data: formRow } = await admin.from('forms')
      .select('id, name, config, pixel_id, capi_configured, board_id, stage_id')
      .eq('company_id', companyId).eq('slug', slug).eq('status', 'published').maybeSingle();
    if (!formRow) return json({ error: 'Formulário não encontrado.' }, 404);
    const form = formRow as { id: string; name: string; config: Config; pixel_id: string | null; capi_configured: boolean; board_id: string | null; stage_id: string | null };
    const cfg: Config = {
      questions: Array.isArray(form.config?.questions) ? form.config.questions : [],
      endings: Array.isArray(form.config?.endings) ? form.config.endings : [],
      tracking: form.config?.tracking ?? {},
      destination: form.config?.destination ?? {},
    };

    // ── Antispam: campo isca ──
    if (typeof body.honeypot === 'string' && body.honeypot.trim() !== '') {
      return json({ ok: true }); // robô: finge sucesso e não grava nada
    }

    // ── Validação + resultado (recalculado no servidor, sem consultar o banco) ──
    const answersIn = (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) ? body.answers as Answers : {};
    let stop = cfg.questions.length;
    let dqOption: Option | null = null;
    for (let i = 0; i < cfg.questions.length; i++) {
      const q = cfg.questions[i];
      const err = validate(q, answersIn[q.id]);
      if (err) return json({ error: `Revise a resposta: "${q.title}".` }, 400);
      const dq = disqualifying(q, answersIn[q.id]);
      if (dq) { dqOption = dq; stop = i; break; }
    }
    const asked = cfg.questions.slice(0, Math.min(stop + 1, cfg.questions.length));
    const answers: Answers = {};
    for (const q of asked) if (answersIn[q.id] != null) answers[q.id] = answersIn[q.id];
    const outcome = dqOption ? 'disqualified' : 'qualified';
    const qualifiedEnding = cfg.endings.find(e => e.kind === 'qualified') ?? cfg.endings[0];
    const dqEnding = cfg.endings.find(e => e.kind === 'disqualified') ?? qualifiedEnding;
    const endingId = dqOption ? (cfg.endings.find(e => e.id === dqOption!.endingId) ?? dqEnding)?.id : qualifiedEnding?.id;

    // Contato do lead (primeira pergunta de cada tipo)
    const first = (type: string) => { const q = asked.find(x => x.type === type); return q ? String(answers[q.id] ?? '').trim() : ''; };
    const name = first('name') || 'Lead do formulário';
    const email = first('email').toLowerCase();
    const phone = first('phone');

    const wantedTags = [
      ...(outcome === 'qualified' ? cfg.destination?.qualifiedTagIds ?? [] : cfg.destination?.disqualifiedTagIds ?? []),
      ...(dqOption?.tagIds ?? []),
    ].filter(t => typeof t === 'string' && UUID_RE.test(t)).slice(0, 20);
    const eventId = typeof body.eventId === 'string' && /^ld_[a-z0-9]{8,64}$/i.test(body.eventId) ? body.eventId : `ld_${crypto.randomUUID().replace(/-/g, '')}`;

    // ── Tudo o que depende do banco, de uma vez (em paralelo) ──
    const ip = clientIp(req);
    const ipHash = ip ? await sha256(`${ip}|${SUPABASE_URL}`) : null;
    const tenMin = new Date(Date.now() - 10 * 60_000).toISOString();
    const hour = new Date(Date.now() - 3600_000).toISOString();
    const none = Promise.resolve({ count: 0, data: null as unknown });
    const [dup, perForm, perHour, boardsRes, stagesRes, tagsRes] = await Promise.all([
      // Reenvio do mesmo envio (nova tentativa do navegador): não duplica o lead
      admin.from('form_submissions').select('id').eq('form_id', form.id).eq('event_id', eventId).limit(1),
      ipHash ? admin.from('form_submissions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('form_id', form.id).gte('created_at', tenMin) : none,
      ipHash ? admin.from('form_submissions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', hour) : none,
      admin.from('lead_boards').select('id, sources').eq('company_id', companyId).order('position'),
      admin.from('lead_stages').select('id, board_id, kind, legacy_status, position').eq('company_id', companyId).order('position'),
      wantedTags.length ? admin.from('lead_tags').select('id').eq('company_id', companyId).in('id', wantedTags) : Promise.resolve({ data: [] }),
    ]);
    if (((dup as { data: unknown[] | null }).data ?? []).length) return json({ ok: true, outcome, endingId, duplicate: true });
    if (((perForm as { count: number | null }).count ?? 0) >= 5 || ((perHour as { count: number | null }).count ?? 0) >= 30) {
      return json({ error: 'rate_limited' }, 429);
    }

    // ── Janela, etapa e tags (só da própria agência) ──
    const boards = ((boardsRes as { data: unknown }).data ?? []) as { id: string; sources: string[] }[];
    const boardId = (boards.find(b => b.id === form.board_id) ?? boards.find(b => (b.sources ?? []).includes('form')) ?? boards[0])?.id ?? null;
    let stage: { id: string; kind: string; legacy_status: string | null } | null = null;
    if (boardId) {
      const stages = (((stagesRes as { data: unknown }).data ?? []) as { id: string; board_id: string; kind: string; legacy_status: string | null }[])
        .filter(s => s.board_id === boardId);
      const chosen = stages.find(s => s.id === form.stage_id) ?? stages.find(s => s.kind === 'open') ?? stages[0] ?? null;
      stage = outcome === 'disqualified' ? (stages.find(s => s.kind === 'lost') ?? chosen) : chosen;
    }
    const status = stage?.legacy_status ?? (stage?.kind === 'won' ? 'client' : stage?.kind === 'lost' ? 'lost' : 'new');
    const tagIds = [...new Set((((tagsRes as { data: unknown }).data ?? []) as { id: string }[]).map(t => t.id))];

    // ── Grava o lead ──
    const tracking: Record<string, string> = { ...cleanTracking(body.tracking), outcome, form: form.name };
    const readable = asked.filter(q => q.type !== 'statement').map(q => ({ question: q.title.slice(0, 200), answer: label(q, answers[q.id]).slice(0, 4000) }));
    const leadId = crypto.randomUUID();
    const leadRow: Record<string, unknown> = {
      id: leadId, company_id: companyId, name: name.slice(0, 120), email: email || null, phone: phone || null,
      status, source: 'form', notes: dqOption ? `Desqualificado: ${dqOption.label}`.slice(0, 500) : null,
      board_id: boardId, stage_id: stage?.id ?? null, tag_ids: tagIds, form_id: form.id,
      answers: readable, tracking, created_at: new Date().toISOString(),
    };
    // Grava em até 3 tentativas: a tabela leads de cada instalação pode ter
    // regras próprias (ex.: lista fechada de origens). O lead nunca se perde.
    const attempts: Record<string, unknown>[] = [
      leadRow,
      { ...leadRow, source: 'website' },
      {
        id: leadId, company_id: companyId, name: leadRow.name, phone: leadRow.phone, status, source: 'website',
        notes: [`Formulário: ${form.name}`, dqOption ? `Desqualificado: ${dqOption.label}` : '', ...readable.map(r => `${r.question}: ${r.answer}`)]
          .filter(Boolean).join('\n').slice(0, 4000),
        created_at: leadRow.created_at,
      },
    ];
    let leadErr: { message: string; code?: string; details?: string } | null = null;
    for (const row of attempts) {
      const { error } = await admin.from('leads').insert(row);
      if (!error) { leadErr = null; break; }
      leadErr = error;
      console.error('[form-submit] lead insert falhou:', error.code, error.message, error.details ?? '');
    }
    if (leadErr) return json({ error: 'Não foi possível salvar. Tente novamente.', code: leadErr.code ?? null }, 500);

    const sessionId = typeof body.sessionId === 'string' && UUID_RE.test(body.sessionId) ? body.sessionId : null;
    const { data: sub } = await admin.from('form_submissions').insert({
      form_id: form.id, company_id: companyId, session_id: sessionId, lead_id: leadId,
      answers, outcome, ending_id: endingId ?? null, tracking, ip_hash: ipHash, event_id: eventId,
    }).select('id').single();
    if (sessionId) {
      background(Promise.resolve(admin.from('form_sessions').update({ completed: true, completed_at: new Date().toISOString(), started: true, last_step: asked.length })
        .eq('id', sessionId).eq('form_id', form.id)));
    }

    // ── API de Conversões (mesmo eventID do Pixel) ──
    if (form.pixel_id && form.capi_configured && sub) {
      const nameParts = name.toLowerCase().trim().split(/\s+/);
      const userData: Record<string, unknown> = {
        em: email ? [await sha256(email)] : undefined,
        ph: phone ? [await sha256(digits(phone))] : undefined,
        fn: name !== 'Lead do formulário' && nameParts[0] ? [await sha256(nameParts[0])] : undefined,
        ln: nameParts.length > 1 ? [await sha256(nameParts[nameParts.length - 1])] : undefined,
        external_id: [await sha256(leadId)],
        client_ip_address: ip || undefined,
        client_user_agent: req.headers.get('user-agent') ?? undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp.slice(0, 200) : undefined,
        fbc: typeof body.fbc === 'string' ? body.fbc.slice(0, 300) : undefined,
      };
      const submitEvent = cfg.tracking?.submitEvent === 'CompleteRegistration' ? 'CompleteRegistration' : 'Lead';
      background(sendCapi(form.id, form.pixel_id, {
        event_name: outcome === 'qualified' ? submitEvent : 'LeadDisqualified',
        event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: 'website',
        event_source_url: typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : undefined,
        user_data: userData,
        custom_data: { form_name: form.name, outcome },
      }, (sub as { id: string }).id));
    }

    // ── Aviso no WhatsApp (Acta), só para leads qualificados ──
    const notify = cfg.destination?.notifyPhone;
    if (notify && outcome === 'qualified') {
      const lines = readable.slice(0, 12).map(r => `• ${r.question}: ${r.answer}`).join('\n');
      const utm = tracking.utm_campaign ? `\n📣 Campanha: ${tracking.utm_campaign}${tracking.utm_content ? ` / ${tracking.utm_content}` : ''}` : '';
      background(notifyActa(companyId, notify, `📥 *Novo lead* — ${form.name}\n\n${lines}${utm}\n\nAbra o Growth Expert para ver: https://growthexpert.com.br/leads`));
    }

    return json({ ok: true, outcome, endingId });
  } catch (e) {
    console.error('[form-submit]', e);
    return json({ error: 'Não foi possível enviar. Tente novamente.' }, 500);
  }
});
