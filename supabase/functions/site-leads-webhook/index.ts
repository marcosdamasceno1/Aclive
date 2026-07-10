import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  // ── Resolve token ─────────────────────────────────────────────────────────
  const url   = new URL(req.url);
  const token = url.searchParams.get('token')
    ?? req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    ?? null;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Token ausente' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Encontra empresa pelo token ───────────────────────────────────────────
  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_id')
    .eq('site_webhook_token', token)
    .maybeSingle();

  if (!settings) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const companyId = settings.company_id as string;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const name  = String(body.name  || '').trim();
  const email = String(body.email || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const notes = String(body.notes || body.message || '').trim() || null;

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
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
