// approval-submit — PÚBLICA. Recebe a decisão do cliente (aprovar/alterar +
// observação, e a legenda escolhida) e grava. Avisa a agência no WhatsApp.
//
// Verify JWT: DESLIGADO. Segurança: o token é a credencial; só a aprovação
// daquele token é alterada, e apenas os campos que o cliente pode mexer.
// Textos têm tamanho limitado. Nenhum dado interno é exposto.
//
// Secrets (compartilhados com wa-gateway): WAHA_BASE_URL, WAHA_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const WAHA_BASE = (Deno.env.get('WAHA_BASE_URL') ?? '').replace(/\/+$/, '');
const WAHA_KEY  = Deno.env.get('WAHA_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATUSES = ['pending', 'approved', 'changes'];
const clampStatus = (v: unknown): string | null => (STATUSES.includes(String(v)) ? String(v) : null);
const clampText = (v: unknown, max = 2000): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

async function notifyAgency(companyId: string, phone: string, message: string): Promise<void> {
  if (!WAHA_BASE || !WAHA_KEY || !phone) return;
  const chatKey = phone.replace(/\D/g, '');
  if (chatKey.length < 8) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    await fetch(`${WAHA_BASE}/api/sendText`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_KEY },
      body: JSON.stringify({ session: `c_${companyId.replace(/-/g, '')}`, chatId: `${chatKey}@c.us`, text: message }),
    }).finally(() => clearTimeout(t));
  } catch (e) { console.warn('[approval-submit] notify falhou:', String(e)); }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const token = String(body.token ?? '').trim();
  if (!token || token.length > 100) return json({ error: 'not_found' });

  const { data: approval, error } = await supabase
    .from('approvals').select('*').eq('token', token).maybeSingle();
  if (error) { console.error('[approval-submit]', error.message); return json({ error: 'server_error' }); }
  if (!approval) return json({ error: 'not_found' });
  const a = approval as Record<string, unknown>;

  // Monta o patch apenas com o que o cliente pode editar.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), decided_at: new Date().toISOString() };

  const vStatus = clampStatus(body.videoStatus);
  if (vStatus) patch.video_status = vStatus;
  if ('videoFeedback' in body) patch.video_feedback = clampText(body.videoFeedback);

  const cStatus = clampStatus(body.captionStatus);
  if (cStatus) patch.caption_status = cStatus;
  if ('captionFeedback' in body) patch.caption_feedback = clampText(body.captionFeedback);

  // caption_choice precisa ser o id de uma das legendas cadastradas
  if ('captionChoice' in body) {
    const choice = clampText(body.captionChoice, 60);
    const opts = Array.isArray(a.captions) ? (a.captions as { id?: string }[]) : [];
    patch.caption_choice = choice && opts.some(o => o.id === choice) ? choice : null;
  }

  const { error: upErr } = await supabase.from('approvals').update(patch).eq('token', token);
  if (upErr) { console.error('[approval-submit] update', upErr.message); return json({ error: 'server_error' }); }

  // Aviso no WhatsApp da agência (não bloqueia a resposta ao cliente)
  const label = (s: string) => s === 'approved' ? 'Aprovado ✅' : s === 'changes' ? 'Pediu alteração ✍️' : 'Pendente';
  const msg = [
    `📋 Resposta de aprovação: *${a.title || 'Vídeo'}*`,
    ``,
    `🎬 Vídeo: ${label(String(patch.video_status ?? a.video_status))}`,
    patch.video_feedback ? `   Obs.: ${patch.video_feedback}` : ``,
    `📝 Legenda: ${label(String(patch.caption_status ?? a.caption_status))}`,
    patch.caption_feedback ? `   Obs.: ${patch.caption_feedback}` : ``,
    ``,
    `Abra o Growth Expert para ver os detalhes.`,
  ].filter(Boolean).join('\n');
  await notifyAgency(String(a.company_id), String(a.notify_phone ?? ''), msg);

  return json({ ok: true });
});
