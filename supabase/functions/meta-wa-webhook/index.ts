// meta-wa-webhook — recebe mensagens do WhatsApp Cloud API (Meta) e grava no inbox.
//
// Configuração no painel da Meta (developers.facebook.com → seu app → WhatsApp → Configuration):
//   Callback URL:  https://<projeto>.supabase.co/functions/v1/meta-wa-webhook?company_id=<UUID>
//   Verify token:  o mesmo SEGREDO gerado em Configurações → Integrações → WhatsApp
//   Webhook fields: assinar "messages"
//
// Regras de estabilidade:
// - GET  = verificação da Meta (hub.challenge) — valida o verify token.
// - POST = SEMPRE 200 rápido (a Meta desativa webhooks que falham em série).
// - Autenticação do POST: company_id + phone_number_id precisam bater com a
//   configuração salva da agência (proxy de autenticidade da v1).
// - Dedup por provider_message_id (índice único no banco).
// - statuses (sent/delivered/read das NOSSAS mensagens) atualizam o status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (body: string | Record<string, unknown> = { ok: true }) =>
  typeof body === 'string'
    ? new Response(body, { status: 200 })
    : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const companyId = url.searchParams.get('company_id') ?? '';
  if (!UUID_RE.test(companyId)) return new Response('Bad Request', { status: 400 });

  // select('*'): tolerante a colunas ausentes — uma coluna que não existe no
  // banco NÃO pode derrubar a verificação (lição aprendida no company_settings).
  const { data: cfgRow, error: cfgErr } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  const cfg = (cfgRow ?? {}) as Record<string, unknown>;
  const secret = typeof cfg.wa_webhook_secret === 'string' ? cfg.wa_webhook_secret : '';
  const metaPhoneId = typeof cfg.meta_phone_number_id === 'string' ? cfg.meta_phone_number_id : '';

  // ── GET: verificação do webhook pela Meta ─────────────────────────────────
  // As respostas de erro são AUTOEXPLICATIVAS para diagnóstico no navegador.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const verify = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (cfgErr) return new Response(`config_error: ${cfgErr.message}`, { status: 500 });
    if (!cfgRow) return new Response('company_not_found: confira o company_id da URL', { status: 403 });
    if (!secret) return new Response('secret_not_set: clique em "Ativar recepção de mensagens" em Configuracoes → Integracoes → WhatsApp (e rode a migracao wa_inbox.sql se ainda nao rodou)', { status: 403 });
    if (mode !== 'subscribe') return new Response('missing_hub_params: use esta URL apenas na verificacao da Meta', { status: 403 });
    if (verify !== secret) return new Response('token_mismatch: o Verify token colado na Meta nao e igual ao segredo do painel', { status: 403 });
    return ok(challenge);
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!secret) return ok({ ignored: 'unconfigured' });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return ok({ ignored: 'json' }); }
  if (payload.object !== 'whatsapp_business_account') return ok({ ignored: 'object' });

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? (entry as Record<string, unknown>).changes as Record<string, unknown>[]
      : [];
    for (const change of changes) {
      const value = (change.value ?? {}) as Record<string, unknown>;

      // Autenticidade: o número do evento precisa ser o número configurado.
      const phoneId = String((value.metadata as Record<string, unknown> | undefined)?.phone_number_id ?? '');
      if (!metaPhoneId || phoneId !== metaPhoneId) {
        // Diagnóstico visível em Edge Functions → Logs
        console.warn(`[meta-wa-webhook] evento descartado: phone_number_id do evento="${phoneId}" vs configurado="${metaPhoneId || '(vazio — salve o Phone Number ID no painel)'}"`);
        continue;
      }

      // Nome do contato (quando a Meta envia)
      const contacts = Array.isArray(value.contacts) ? value.contacts as Record<string, unknown>[] : [];
      const contactName = String(
        (contacts[0]?.profile as Record<string, unknown> | undefined)?.name ?? '',
      ).slice(0, 120);

      // ── Mensagens recebidas ──────────────────────────────────────────────
      const messages = Array.isArray(value.messages) ? value.messages as Record<string, unknown>[] : [];
      for (const m of messages) {
        const chatKey = String(m.from ?? '').replace(/\D/g, '');
        if (!chatKey || chatKey.length < 8 || chatKey.length > 20) continue;

        const providerId = String(m.id ?? '').slice(0, 200) || null;
        const type = String(m.type ?? 'text');
        const text = type === 'text'
          ? String((m.text as Record<string, unknown> | undefined)?.body ?? '').slice(0, 4096)
          : '';
        const body = text || `[${type} — abra no celular]`;

        const tsSec = Number(m.timestamp);
        const sentAt = Number.isFinite(tsSec) && tsSec > 0
          ? new Date(tsSec * 1000).toISOString()
          : new Date().toISOString();

        const { data: inserted, error } = await supabase
          .from('wa_messages')
          .insert({
            company_id: companyId,
            chat_key: chatKey,
            direction: 'in',
            body,
            msg_type: type === 'text' ? 'text' : 'other',
            status: 'received',
            provider: 'meta',
            provider_message_id: providerId,
            sent_at: sentAt,
          })
          .select('id')
          .maybeSingle();

        if (error || !inserted) continue; // dedup ou falha isolada — segue o lote

        const { error: touchErr } = await supabase.rpc('wa_touch_chat', {
          p_company: companyId,
          p_chat_key: chatKey,
          p_name: contactName,
          p_last_msg: body.slice(0, 200),
          p_last_at: sentAt,
          p_direction: 'in',
        });
        if (touchErr) console.error('[meta-wa-webhook] touch:', touchErr.message);
      }

      // ── Status das mensagens que NÓS enviamos (sent/delivered/read) ─────
      const statuses = Array.isArray(value.statuses) ? value.statuses as Record<string, unknown>[] : [];
      for (const s of statuses) {
        const providerId = String(s.id ?? '');
        const status = String(s.status ?? '');
        if (!providerId || !['sent', 'delivered', 'read'].includes(status)) continue;
        await supabase
          .from('wa_messages')
          .update({ status })
          .eq('company_id', companyId)
          .eq('provider_message_id', providerId);
      }
    }
  }

  return ok();
});
