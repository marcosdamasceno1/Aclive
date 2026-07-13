-- ═══════════════════════════════════════════════════════════════════════════
--  Migração: aba "Demandas" (quadro de gargalos, colaborativo por agência)
--  Rode este bloco inteiro no Supabase Dashboard → SQL Editor → Run.
--  É idempotente: pode ser executado mais de uma vez sem erro.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Coluna para as etapas personalizáveis do quadro de Demandas
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS demand_board_stages JSONB;

-- 2) Tabela dos cartões do quadro de Demandas
CREATE TABLE IF NOT EXISTS demand_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  column_id       TEXT NOT NULL DEFAULT 'backlog',
  title           TEXT NOT NULL,
  description     TEXT,
  assigned_to     UUID,
  priority        TEXT NOT NULL DEFAULT 'medium',
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3) RLS: cada agência só enxerga os próprios cartões
ALTER TABLE demand_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON demand_cards;
CREATE POLICY "company_isolation" ON demand_cards
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));
