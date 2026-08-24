// approval-get — PÚBLICA. Devolve UMA aprovação pelo token (o cliente abre o
// link sem login). Nunca lista nada e nunca expõe dados internos da agência.
//
// Verify JWT: DESLIGADO (é acesso público via token). Sem secrets sensíveis.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const token = String(body.token ?? '').trim();
  if (!token || token.length > 100) return json({ error: 'not_found' });

  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) { console.error('[approval-get]', error.message); return json({ error: 'server_error' }); }
  if (!data) return json({ error: 'not_found' });

  const a = data as Record<string, unknown>;
  // Apenas os campos que o cliente precisa ver — nada de company_id, notify_phone, etc.
  return json({
    title: a.title,
    agencyName: a.agency_name,
    videoUrl: a.video_url,
    videoStatus: a.video_status,
    videoFeedback: a.video_feedback,
    captions: a.captions,
    captionChoice: a.caption_choice,
    captionStatus: a.caption_status,
    captionFeedback: a.caption_feedback,
    decidedAt: a.decided_at,
  });
});
