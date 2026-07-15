// waha-webhook — recebe eventos de mensagem do WAHA e grava no inbox.
//
// Configuração no WAHA (variáveis do container):
//   WHATSAPP_HOOK_URL=https://<projeto>.supabase.co/functions/v1/waha-webhook?company_id=<UUID>&token=<SEGREDO>
//   WHATSAPP_HOOK_EVENTS=message        <- SOMENTE 'message' (recebidas).
//                                          Não use message.any: as enviadas já
//                                          são gravadas pelo próprio painel.
//
// Regras de estabilidade:
// - SEMPRE responde 200 rápido (exceto auth inválida) — evita retry storm.
// - Dedup por (company, provider, provider_message_id) — índice único no banco.
// - Grupos e eventos que não são mensagem: ignorados na v1.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (body: Record<string, unknown> = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = new URL(req.url);
  const companyId = url.searchParams.get('company_id') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!UUID_RE.test(companyId) || !token) return new Response('Unauthorized', { status: 401 });

  // Autentica: o token da URL precisa bater com o segredo da agência.
  // select('*'): tolerante a colunas ausentes no banco.
  const { data: cfgRow, error: cfgErr } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (cfgErr) return new Response(`config_error: ${cfgErr.message}`, { status: 500 });
  const secret = typeof (cfgRow as Record<string, unknown> | null)?.wa_webhook_secret === 'string'
    ? String((cfgRow as Record<string, unknown>).wa_webhook_secret) : '';
  if (!secret || secret !== token) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = await req.json(); } catch { return ok({ ignored: 'json' }); }

  const kind = String(event.event || '');
  if (kind !== 'message' && kind !== 'message.any') return ok({ ignored: kind });

  const p = (event.payload ?? {}) as Record<string, unknown>;
  if (p.fromMe === true) return ok({ ignored: 'fromMe' }); // enviadas: o painel grava

  const from = String(p.from || '');
  if (!from || from.endsWith('@g.us')) return ok({ ignored: 'group' }); // grupos fora da v1

  const chatKey = from.replace(/\D/g, '');
  if (!chatKey || chatKey.length < 8 || chatKey.length > 20) return ok({ ignored: 'chat_key' });

  const providerId = String(
    (p.id as Record<string, unknown> | undefined)?._serialized ?? p.id ?? '',
  ).slice(0, 200) || null;

  const hasMedia = p.hasMedia === true || (p.type && p.type !== 'chat' && p.type !== 'text');
  const rawBody = String(p.body ?? p.caption ?? '').slice(0, 4096);
  const body = rawBody || (hasMedia ? '[mídia — abra no celular]' : '');
  if (!body) return ok({ ignored: 'empty' });

  const tsSec = Number(p.timestamp);
  const sentAt = Number.isFinite(tsSec) && tsSec > 0
    ? new Date(tsSec * 1000).toISOString()
    : new Date().toISOString();

  const name = String(
    (p._data as Record<string, unknown> | undefined)?.notifyName ?? p.notifyName ?? '',
  ).slice(0, 120);

  // Insere com dedup — se o evento repetir, o índice único bloqueia em silêncio.
  const { data: inserted, error } = await supabase
    .from('wa_messages')
    .insert({
      company_id: companyId,
      chat_key: chatKey,
      direction: 'in',
      body,
      msg_type: hasMedia ? 'other' : 'text',
      status: 'received',
      provider: 'waha',
      provider_message_id: providerId,
      sent_at: sentAt,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Conflito de dedup (23505) é esperado em retry — não é erro.
    if (!String(error.message).includes('duplicate')) {
      console.error('[waha-webhook] insert:', error.message);
    }
    return ok({ deduped: true });
  }
  if (!inserted) return ok({ deduped: true });

  // Atualiza a conversa de forma atômica (inclui unread_count).
  const { error: touchErr } = await supabase.rpc('wa_touch_chat', {
    p_company: companyId,
    p_chat_key: chatKey,
    p_name: name,
    p_last_msg: body.slice(0, 200),
    p_last_at: sentAt,
    p_direction: 'in',
  });
  if (touchErr) console.error('[waha-webhook] touch:', touchErr.message);

  return ok();
});
