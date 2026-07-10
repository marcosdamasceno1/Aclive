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

  // ── Verifica se a empresa existe ──────────────────────────────────────────
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return new Response(JSON.stringify({ error: 'Empresa não encontrada' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

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
    return new Response(JSON.stringify({ error: 'Erro ao salvar lead' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
