-- ═══════════════════════════════════════════════════════════════════════════
--  Migração de segurança — rode o bloco inteiro no Supabase → SQL Editor.
--  Idempotente: pode rodar mais de uma vez.
--
--  ORDEM DE PUBLICAÇÃO (importante):
--    1. Rode este SQL.
--    2. Publique as Edge Functions atualizadas (admin-users, crm-notify,
--       wa-gateway, apify-search, site-leads-webhook, meta-leads-webhook,
--       waha-webhook, meta-wa-webhook, approval-get) e APAGUE a função
--       send-whatsapp-notification no painel.
--    3. Suba o novo dist.
--    4. Todos os usuários saem e entram de novo (o token antigo não tem os
--       dados novos; ele também se renova sozinho em até 1 hora).
--
--  O que corrige:
--    - Isolamento entre agências e papel do usuário vinham do user_metadata,
--      que o PRÓPRIO usuário consegue alterar. Agora vêm do app_metadata,
--      que só o servidor (service role) grava.
--    - Papel conferido no banco: profissional não lê o financeiro dos outros,
--      não altera pagamentos, não lê tokens de integração.
--    - companies estava sem RLS (qualquer um lia/alterava/apagava agências).
--    - Tokens de integração saem de company_settings para company_secrets,
--      acessível só a administradores da agência.
--    - wa_touch_chat (SECURITY DEFINER) estava executável por qualquer um.
--    - apify_usage podia ser apagado pela agência (zerava a cota paga).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Copia empresa/papel para o app_metadata ───────────────────────────────
-- user_profiles (gravado por administradores) tem prioridade sobre o
-- user_metadata. Valores já presentes no app_metadata nunca são sobrescritos.
UPDATE auth.users u
SET raw_app_meta_data =
  jsonb_strip_nulls(jsonb_build_object(
    'company_id',      COALESCE(p.company_id::text, u.raw_user_meta_data->>'company_id'),
    'role',            COALESCE(p.role, u.raw_user_meta_data->>'role', 'admin'),
    'professional_id', COALESCE(p.professional_id::text, u.raw_user_meta_data->>'professionalId'),
    'permissions',     COALESCE(p.permissions, u.raw_user_meta_data->'permissions'),
    'super_admin',     CASE WHEN u.raw_user_meta_data->>'super_admin' = 'true' THEN true END
  ))
  || COALESCE(u.raw_app_meta_data, '{}'::jsonb)
FROM (SELECT au.id, up.company_id, up.role, up.professional_id, up.permissions
      FROM auth.users au LEFT JOIN public.user_profiles up ON up.id = au.id) p
WHERE p.id = u.id;

-- ── 2. Funções que leem o token de forma segura ──────────────────────────────
CREATE OR REPLACE FUNCTION public.jwt_company() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->'app_metadata'->>'company_id', '')::uuid
$$;
CREATE OR REPLACE FUNCTION public.jwt_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt()->'app_metadata'->>'role', '')
$$;
CREATE OR REPLACE FUNCTION public.jwt_is_super() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((auth.jwt()->'app_metadata'->>'super_admin')::boolean, false)
$$;
CREATE OR REPLACE FUNCTION public.jwt_professional() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->'app_metadata'->>'professional_id', '')::uuid
$$;

-- ── 3. Remove todas as políticas antigas (baseadas em user_metadata) ─────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN (
             'user_profiles','companies','clients','professionals','demands','leads',
             'calendar_events','social_accounts','scheduled_posts','financial_movements',
             'audit_logs','company_settings','company_secrets','demand_cards','approvals',
             'wa_chats','wa_messages','apify_usage')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 4. Tabelas de dados comuns: qualquer usuário da própria agência ──────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['demands','leads','calendar_events','social_accounts',
                           'scheduled_posts','demand_cards','approvals','wa_chats','wa_messages']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY tenant_all ON public.%I FOR ALL TO authenticated
                      USING (company_id = public.jwt_company())
                      WITH CHECK (company_id = public.jwt_company())', t);
    END IF;
  END LOOP;
END $$;

-- ── 5. Clientes: todos leem; só admin e gestor alteram ───────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public.clients FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_write ON public.clients FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'));

-- ── 6. Profissionais (inclui chave Pix): todos leem; só admin altera ─────────
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public.professionals FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY admin_write ON public.professionals FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() = 'admin')
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() = 'admin');

-- ── 7. Financeiro ─────────────────────────────────────────────────────────────
-- Admin e financeiro: tudo. Demais: só leem os próprios créditos, e só podem
-- criar o crédito de uma demanda real da agência, com o valor da demanda.
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_all ON public.financial_movements FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','financial'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','financial'));
CREATE POLICY own_credits_read ON public.financial_movements FOR SELECT TO authenticated
  USING (company_id = public.jwt_company() AND professional_id IS NOT NULL
         AND professional_id = public.jwt_professional());
CREATE POLICY credit_from_demand ON public.financial_movements FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.jwt_company() AND type = 'credit' AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.demands d
                WHERE d.id = financial_movements.demand_id
                  AND d.company_id = public.jwt_company()
                  AND d.professional_id = financial_movements.professional_id
                  AND d.value = financial_movements.value)
  );
-- Um crédito por demanda (evita pagamento em dobro).
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS financial_one_credit_per_demand
    ON public.financial_movements (demand_id) WHERE type = 'credit' AND demand_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Existem créditos duplicados para a mesma demanda: remova os duplicados e rode de novo para criar o índice.';
END $$;

-- ── 8. Histórico (auditoria): todos registram; admin e financeiro leem ───────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.jwt_company() AND user_id = auth.uid());
CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','financial'));

-- ── 9. Perfis de usuário: leitura na agência; escrita só pela Edge Function ──
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read ON public.user_profiles FOR SELECT TO authenticated
  USING (company_id = public.jwt_company() OR public.jwt_is_super());

-- ── 10. Agências: cada uma vê a sua; só o super admin altera ─────────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_read ON public.companies FOR SELECT TO authenticated
  USING (id = public.jwt_company() OR public.jwt_is_super());
CREATE POLICY super_write ON public.companies FOR ALL TO authenticated
  USING (public.jwt_is_super()) WITH CHECK (public.jwt_is_super());

-- ── 11. Configurações: todos leem; só admin altera ───────────────────────────
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY admin_write ON public.company_settings FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() = 'admin')
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() = 'admin');

-- ── 12. Tokens de integração: tabela só para administradores ─────────────────
CREATE TABLE IF NOT EXISTS public.company_secrets (
  company_id              UUID PRIMARY KEY,
  crm_api_key             TEXT,
  meta_access_token       TEXT,
  meta_leads_page_token   TEXT,
  meta_leads_verify_token TEXT,
  wa_webhook_secret       TEXT,
  site_webhook_secret     TEXT,
  updated_at              TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.company_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON public.company_secrets FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() = 'admin')
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() = 'admin');

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS crm_api_key TEXT;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS meta_access_token TEXT;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS meta_leads_page_token TEXT;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS meta_leads_verify_token TEXT;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS wa_webhook_secret TEXT;

-- Move os tokens existentes e apaga as cópias em company_settings.
INSERT INTO public.company_secrets (company_id, crm_api_key, meta_access_token, meta_leads_page_token,
                                    meta_leads_verify_token, wa_webhook_secret)
SELECT company_id, crm_api_key, meta_access_token, meta_leads_page_token,
       meta_leads_verify_token, wa_webhook_secret
FROM public.company_settings
ON CONFLICT (company_id) DO UPDATE SET
  crm_api_key             = COALESCE(EXCLUDED.crm_api_key, company_secrets.crm_api_key),
  meta_access_token       = COALESCE(EXCLUDED.meta_access_token, company_secrets.meta_access_token),
  meta_leads_page_token   = COALESCE(EXCLUDED.meta_leads_page_token, company_secrets.meta_leads_page_token),
  meta_leads_verify_token = COALESCE(EXCLUDED.meta_leads_verify_token, company_secrets.meta_leads_verify_token),
  wa_webhook_secret       = COALESCE(EXCLUDED.wa_webhook_secret, company_secrets.wa_webhook_secret);

UPDATE public.company_settings SET crm_api_key = NULL, meta_access_token = NULL,
  meta_leads_page_token = NULL, meta_leads_verify_token = NULL, wa_webhook_secret = NULL;

-- Token do webhook de leads do site, um por agência.
INSERT INTO public.company_secrets (company_id)
SELECT id FROM public.companies ON CONFLICT (company_id) DO NOTHING;
UPDATE public.company_secrets SET site_webhook_secret = replace(gen_random_uuid()::text, '-', '')
WHERE site_webhook_secret IS NULL;

-- ── 13. Uso do Apify: agência só lê (gravação só pelo servidor) ──────────────
DO $$
BEGIN
  IF to_regclass('public.apify_usage') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.apify_usage ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY tenant_read ON public.apify_usage FOR SELECT TO authenticated
             USING (company_id = public.jwt_company())';
  END IF;
END $$;

-- ── 14. Função do inbox: só o servidor executa ───────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.wa_touch_chat(uuid,text,text,text,timestamptz,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.wa_touch_chat(uuid,text,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.wa_touch_chat(uuid,text,text,text,timestamptz,text) TO service_role;
  END IF;
END $$;

-- ── 15. Confira o resultado ──────────────────────────────────────────────────
-- Revise esta lista: cada usuário deve estar na agência e no papel certos, e
-- só você deve aparecer como super admin. Se alguém estiver errado, corrija
-- pela tela de usuários (ou pelo app_metadata no painel de Authentication).
SELECT u.email,
       u.raw_app_meta_data->>'company_id'  AS company_id,
       c.name                               AS agencia,
       u.raw_app_meta_data->>'role'        AS papel,
       u.raw_app_meta_data->>'super_admin' AS super_admin
FROM auth.users u
LEFT JOIN public.companies c ON c.id::text = u.raw_app_meta_data->>'company_id'
ORDER BY (u.raw_app_meta_data->>'super_admin') NULLS LAST, c.name, u.email;
