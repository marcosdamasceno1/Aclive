-- ============================================================
-- ACLIVE — Setup completo do banco de dados Supabase
-- Execute este script inteiro no SQL Editor do Supabase
-- ============================================================

-- ---- COMPANIES (tabela do super admin, sem RLS) ----
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan        TEXT,
  email       TEXT,
  phone       TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;


-- ---- CLIENTS ----
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  company_name  TEXT NOT NULL,
  contact_name  TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  plan          TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON clients;
CREATE POLICY "company_isolation" ON clients
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- PROFESSIONALS ----
CREATE TABLE IF NOT EXISTS professionals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  name            TEXT NOT NULL,
  profession      TEXT NOT NULL DEFAULT 'other',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  pix_key         TEXT NOT NULL DEFAULT '',
  default_values  JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  user_id         UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON professionals;
CREATE POLICY "company_isolation" ON professionals
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- DEMANDS ----
CREATE TABLE IF NOT EXISTS demands (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL,
  client_id            UUID,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  task_type            TEXT NOT NULL DEFAULT 'other',
  professional_id      UUID,
  deadline             TIMESTAMPTZ,
  priority             TEXT NOT NULL DEFAULT 'medium',
  value                NUMERIC(12,2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'new',
  comments             JSONB DEFAULT '[]',
  financial_registered BOOLEAN DEFAULT false,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE demands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON demands;
CREATE POLICY "company_isolation" ON demands
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- LEADS ----
CREATE TABLE IF NOT EXISTS leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  name                TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  website             TEXT,
  address             TEXT,
  city                TEXT,
  status              TEXT NOT NULL DEFAULT 'new',
  notes               TEXT,
  category            TEXT,
  rating              NUMERIC(3,1),
  review_count        INTEGER,
  converted_client_id UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON leads;
CREATE POLICY "company_isolation" ON leads
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- CALENDAR EVENTS ----
CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,
  end_date    TEXT,
  time        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'blue',
  priority    TEXT NOT NULL DEFAULT 'medium',
  client_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON calendar_events;
CREATE POLICY "company_isolation" ON calendar_events
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- SOCIAL ACCOUNTS ----
CREATE TABLE IF NOT EXISTS social_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  platform    TEXT NOT NULL,
  handle      TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  followers   INTEGER DEFAULT 0,
  client_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON social_accounts;
CREATE POLICY "company_isolation" ON social_accounts
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- SCHEDULED POSTS ----
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  account_id   UUID,
  content      TEXT NOT NULL DEFAULT '',
  image_url    TEXT,
  scheduled_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  notify_phone TEXT,
  notified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON scheduled_posts;
CREATE POLICY "company_isolation" ON scheduled_posts
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- FINANCIAL MOVEMENTS ----
CREATE TABLE IF NOT EXISTS financial_movements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL,
  professional_id      UUID,
  demand_id            UUID,
  demand_title         TEXT NOT NULL DEFAULT '',
  client_id            UUID,
  client_name          TEXT,
  value                NUMERIC(12,2) NOT NULL DEFAULT 0,
  type                 TEXT NOT NULL DEFAULT 'credit',
  status               TEXT NOT NULL DEFAULT 'pending',
  completed_at         TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  paid_by              UUID,
  notes                TEXT,
  category             TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE financial_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON financial_movements;
CREATE POLICY "company_isolation" ON financial_movements
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));


-- ---- AUDIT LOGS ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  user_id      UUID NOT NULL,
  user_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON audit_logs;
CREATE POLICY "company_isolation" ON audit_logs
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));
