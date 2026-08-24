-- ═══════════════════════════════════════════════════════════════════════════
--  Migração: Aprovação de vídeo/legenda por link público
--  Rode o bloco inteiro no Supabase → SQL Editor → Run. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- Nome da agência (branding da página do cliente) + telefone de aviso padrão
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS agency_name TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS approval_notify_phone TEXT;

CREATE TABLE IF NOT EXISTS approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL,
  demand_id        UUID,
  token            TEXT NOT NULL UNIQUE,     -- credencial pública (UUID)
  title            TEXT NOT NULL DEFAULT '',
  agency_name      TEXT,
  video_url        TEXT,                     -- link de compartilhamento do Drive
  notify_phone     TEXT,                     -- para avisar a agência no WhatsApp
  video_status     TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | changes
  video_feedback   TEXT,
  captions         JSONB NOT NULL DEFAULT '[]',        -- [{ id, text }]
  caption_choice   TEXT,                     -- id da legenda escolhida
  caption_status   TEXT NOT NULL DEFAULT 'pending',
  caption_feedback TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  decided_at       TIMESTAMPTZ
);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON approvals;
-- Lado da agência (autenticado): só a própria agência lê/escreve.
-- O lado público (cliente) NUNCA usa RLS — passa pelas Edge Functions com
-- service_role, filtrando pelo token. A tabela não é exposta ao anon.
CREATE POLICY "company_isolation" ON approvals
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));

CREATE INDEX IF NOT EXISTS approvals_token ON approvals (token);
CREATE INDEX IF NOT EXISTS approvals_company ON approvals (company_id, created_at);
