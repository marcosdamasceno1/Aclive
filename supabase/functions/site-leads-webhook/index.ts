import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token',
};

const safeEqual = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const url = new URL(req.url);

  // ── Resolve company_id ────────────────────────────────────────────────────
  const companyId = url.searchParams.get('company_id')
    ?? url.searchParams.get('company')
    ?? null;

  if (!companyId || !UUID_RE.test(companyId)) {
    return new Response(JSON.stringify({ error: 'company_id inválido ou ausente' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Autenticação: token secreto da agência (Configurações → Integrações → Site)
  // Sem ele, qualquer pessoa que descobrisse o company_id poderia jogar leads
  // falsos no CRM da agência.
  const token = url.searchParams.get('token') ?? req.headers.get('x-webhook-token') ?? '';
  const { data: sec } = await supabase
    .from('company_secrets')
    .select('site_webhook_secret')
    .eq('company_id', companyId)
    .maybeSingle();
  const secret = String((sec as Record<string, unknown> | null)?.site_webhook_secret ?? '');
  if (!secret || !safeEqual(secret, token)) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const raw = await req.text();
  if (raw.length > 20_000) {
    return new Response(JSON.stringify({ error: 'Conteúdo muito grande' }), {
      status: 413, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const name  = String(body.name  || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().slice(0, 254) || null;
  const phone = String(body.phone || '').trim().slice(0, 30) || null;
  const notes = String(body.notes || body.message || '').trim().slice(0, 2000) || null;

  if (!name) {
    return new Response(JSON.stringify({ error: 'Campo "name" é obrigatório' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Insere lead ───────────────────────────────────────────────────────────
  const { error } = await supabase.from('leads').insert({
    id:         crypto.randomUUID(),
    company_id: companyId,
    name,
    email,
    phone,
    notes,
    source:     'website',
    status:     'new',
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[site-leads-webhook] insert error:', error);
    return new Response(JSON.stringify({ error: 'Erro ao salvar lead' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
