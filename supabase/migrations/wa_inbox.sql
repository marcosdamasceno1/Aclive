-- ═══════════════════════════════════════════════════════════════════════════
--  Migração: Atendimento WhatsApp (inbox) — v1
--  Rode este bloco inteiro no Supabase Dashboard → SQL Editor → Run.
--  Idempotente: pode ser executado mais de uma vez sem erro.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Segredo do webhook por agência (autentica WAHA e verifica o Meta)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS wa_webhook_secret TEXT;

-- 2) Conversas
CREATE TABLE IF NOT EXISTS wa_chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  chat_key        TEXT NOT NULL,             -- telefone só dígitos (ex: 5511999998888)
  name            TEXT,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  last_direction  TEXT,                      -- 'in' | 'out'
  last_inbound_at TIMESTAMPTZ,               -- para a janela de 24h da Meta
  unread_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, chat_key)
);
ALTER TABLE wa_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON wa_chats;
CREATE POLICY "company_isolation" ON wa_chats
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));

-- 3) Mensagens
CREATE TABLE IF NOT EXISTS wa_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  chat_key            TEXT NOT NULL,
  direction           TEXT NOT NULL,          -- 'in' | 'out'
  body                TEXT,
  msg_type            TEXT NOT NULL DEFAULT 'text',   -- text | image | audio | document | other
  status              TEXT NOT NULL DEFAULT 'received',-- received | sending | sent | delivered | read | error
  provider            TEXT,                   -- 'waha' | 'meta'
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON wa_messages;
CREATE POLICY "company_isolation" ON wa_messages
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));

-- 4) Dedup de webhooks: o mesmo evento pode chegar 2x — a segunda grava nada.
CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_dedup
  ON wa_messages (company_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 5) Índice de leitura da conversa
CREATE INDEX IF NOT EXISTS wa_messages_thread
  ON wa_messages (company_id, chat_key, sent_at);

-- 6) Upsert atômico da conversa (usado pelos webhooks; evita corrida no unread)
CREATE OR REPLACE FUNCTION wa_touch_chat(
  p_company   UUID,
  p_chat_key  TEXT,
  p_name      TEXT,
  p_last_msg  TEXT,
  p_last_at   TIMESTAMPTZ,
  p_direction TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO wa_chats (company_id, chat_key, name, last_message, last_message_at,
                        last_direction, unread_count, last_inbound_at)
  VALUES (p_company, p_chat_key, NULLIF(p_name, ''), p_last_msg, p_last_at, p_direction,
          CASE WHEN p_direction = 'in' THEN 1 ELSE 0 END,
          CASE WHEN p_direction = 'in' THEN p_last_at ELSE NULL END)
  ON CONFLICT (company_id, chat_key) DO UPDATE SET
    name            = COALESCE(NULLIF(EXCLUDED.name, ''), wa_chats.name),
    last_message    = EXCLUDED.last_message,
    last_message_at = EXCLUDED.last_message_at,
    last_direction  = EXCLUDED.last_direction,
    unread_count    = wa_chats.unread_count + CASE WHEN EXCLUDED.last_direction = 'in' THEN 1 ELSE 0 END,
    last_inbound_at = CASE WHEN EXCLUDED.last_direction = 'in'
                           THEN EXCLUDED.last_message_at ELSE wa_chats.last_inbound_at END;
END $$;

-- 7) Realtime: a tela de atendimento recebe mensagens novas ao vivo
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE wa_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE wa_chats;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
