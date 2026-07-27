-- ═══════════════════════════════════════════════════════════════════════════
--  Migração: Prospecção Apify com chave-mestra no backend + cota por agência
--  Rode o bloco inteiro no Supabase → SQL Editor → Run. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Override de limite por agência (null = usa o padrão do backend = 100/mês)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apify_monthly_limit INTEGER;

-- 2) Registro de uso — cada busca gera 1 linha. A cota mensal é contada por
--    company_id no mês corrente (reseta sozinho ao virar o mês, sem cron).
CREATE TABLE IF NOT EXISTS apify_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  query        TEXT,
  result_count INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE apify_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON apify_usage;
CREATE POLICY "company_isolation" ON apify_usage
  USING (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid))
  WITH CHECK (company_id = ((auth.jwt()->'user_metadata'->>'company_id')::uuid));

-- 3) Índice para a contagem mensal ser rápida
CREATE INDEX IF NOT EXISTS apify_usage_company_month
  ON apify_usage (company_id, created_at);
