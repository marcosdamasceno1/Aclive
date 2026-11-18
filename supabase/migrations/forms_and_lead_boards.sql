-- ═══════════════════════════════════════════════════════════════════════════
-- Formulários + Leads em janelas, etapas e tags (Fase 1)
--
-- Rode DEPOIS do security_hardening.sql (usa jwt_company() e jwt_role()).
-- Pode rodar mais de uma vez: tudo é "IF NOT EXISTS" / idempotente.
--
-- Isolamento entre agências:
-- - Toda tabela nova tem company_id e RLS por agência.
-- - O visitante anônimo do formulário NÃO acessa nenhuma tabela: ele só fala
--   com as Edge Functions form-get, form-event e form-submit (service role),
--   que descobrem a agência pelo próprio formulário no banco.
-- - O token da API de Conversões fica em form_secrets, sem leitura pelo
--   painel: só é gravado pela função set_form_secret e lido pelo servidor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Apelido público da agência (growthexpert.com.br/f/<apelido>/<form>) ──
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON public.companies (slug) WHERE slug IS NOT NULL;

-- Só o admin da própria agência define o apelido (companies só aceita
-- escrita do super admin, então a troca passa por esta função controlada).
CREATE OR REPLACE FUNCTION public.set_company_slug(p_slug TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug TEXT := lower(trim(p_slug));
BEGIN
  IF public.jwt_role() <> 'admin' OR public.jwt_company() IS NULL THEN
    RAISE EXCEPTION 'Somente o administrador da agência pode definir o apelido.';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Use de 3 a 40 letras minúsculas, números ou hífen.';
  END IF;
  IF v_slug IN ('admin','api','app','login','f','form','forms','growth','growthexpert','aprovar','master','suporte','www') THEN
    RAISE EXCEPTION 'Este apelido é reservado. Escolha outro.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug AND id::text <> public.jwt_company()) THEN
    RAISE EXCEPTION 'Este apelido já está em uso por outra agência.';
  END IF;
  UPDATE public.companies SET slug = v_slug WHERE id::text = public.jwt_company();
  RETURN v_slug;
END $$;
REVOKE ALL ON FUNCTION public.set_company_slug(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_slug(TEXT) TO authenticated;

-- ── 2. Janelas (boards), etapas (stages) e tags de leads ────────────────────
CREATE TABLE IF NOT EXISTS public.lead_boards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  -- Origens que caem nesta janela quando o lead não tem janela definida
  -- (apify = Google Maps, meta, website, manual, form).
  sources     TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_boards_company ON public.lead_boards (company_id);

CREATE TABLE IF NOT EXISTS public.lead_stages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     TEXT NOT NULL,
  board_id       UUID NOT NULL REFERENCES public.lead_boards(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT 'blue',
  position       INT  NOT NULL DEFAULT 0,
  -- open = em andamento · won = fechado/ganho · lost = perdido
  kind           TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('open','won','lost')),
  -- Status antigo do lead que esta etapa representa (janela "Comercial").
  legacy_status  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_stages_board ON public.lead_stages (board_id);

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'slate',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_tags_company ON public.lead_tags (company_id);

-- ── 3. Novas colunas em leads ────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS board_id   TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_id   TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tag_ids    TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS form_id    TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS answers    JSONB;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tracking   JSONB;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email      TEXT;

-- A regra antiga só aceitava 'apify' e 'manual' e barrava leads do site, da
-- Meta e dos formulários.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('apify', 'manual', 'meta', 'website', 'form'));

-- ── 4. Formulários ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       TEXT NOT NULL,
  client_id        TEXT,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused')),
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  pixel_id         TEXT,
  capi_configured  BOOLEAN NOT NULL DEFAULT false,
  board_id         TEXT,
  stage_id         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forms_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  CONSTRAINT forms_pixel_format CHECK (pixel_id IS NULL OR pixel_id ~ '^[0-9]{5,20}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS forms_company_slug ON public.forms (company_id, slug);

-- Token da API de Conversões: nenhuma política de leitura para o painel.
CREATE TABLE IF NOT EXISTS public.form_secrets (
  form_id          UUID PRIMARY KEY REFERENCES public.forms(id) ON DELETE CASCADE,
  company_id       TEXT NOT NULL,
  capi_token       TEXT,
  test_event_code  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  company_id    TEXT NOT NULL,
  tracking      JSONB,
  device        TEXT,
  ip_hash       TEXT,
  last_step     INT NOT NULL DEFAULT 0,
  started       BOOLEAN NOT NULL DEFAULT false,
  completed     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS form_sessions_form ON public.form_sessions (form_id, created_at);
CREATE INDEX IF NOT EXISTS form_sessions_ip ON public.form_sessions (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  company_id   TEXT NOT NULL,
  session_id   UUID,
  lead_id      TEXT,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome      TEXT NOT NULL DEFAULT 'qualified',
  ending_id    TEXT,
  tracking     JSONB,
  ip_hash      TEXT,
  event_id     TEXT,
  capi_status  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_form ON public.form_submissions (form_id, created_at);
CREATE INDEX IF NOT EXISTS form_submissions_ip ON public.form_submissions (ip_hash, created_at);

-- ── 5. Segurança (RLS) ───────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
           AND tablename IN ('lead_boards','lead_stages','lead_tags','forms','form_secrets','form_sessions','form_submissions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.lead_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_secrets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Janelas, etapas e tags: toda a agência lê; admin e gestor alteram.
CREATE POLICY tenant_read ON public.lead_boards FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_write ON public.lead_boards FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'));

CREATE POLICY tenant_read ON public.lead_stages FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_write ON public.lead_stages FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager')
              AND EXISTS (SELECT 1 FROM public.lead_boards b
                          WHERE b.id = lead_stages.board_id AND b.company_id = public.jwt_company()));

CREATE POLICY tenant_read ON public.lead_tags FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_write ON public.lead_tags FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'));

-- Formulários: toda a agência lê; admin e gestor criam e alteram.
CREATE POLICY tenant_read ON public.forms FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_write ON public.forms FOR ALL TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'))
  WITH CHECK (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'));

-- form_secrets: SEM políticas → o painel não lê nem grava diretamente.

-- Sessões e respostas: a agência só lê (quem grava é o servidor).
CREATE POLICY tenant_read ON public.form_sessions FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY tenant_read ON public.form_submissions FOR SELECT TO authenticated
  USING (company_id = public.jwt_company());
CREATE POLICY managers_delete ON public.form_submissions FOR DELETE TO authenticated
  USING (company_id = public.jwt_company() AND public.jwt_role() IN ('admin','manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_boards, public.lead_stages, public.lead_tags, public.forms TO authenticated;
GRANT SELECT ON public.form_sessions TO authenticated;
GRANT SELECT, DELETE ON public.form_submissions TO authenticated;
REVOKE ALL ON public.form_secrets FROM anon, authenticated;
REVOKE ALL ON public.lead_boards, public.lead_stages, public.lead_tags, public.forms,
              public.form_sessions, public.form_submissions FROM anon;

-- Grava o token da API de Conversões (o painel nunca lê o valor de volta).
CREATE OR REPLACE FUNCTION public.set_form_secret(p_form_id UUID, p_capi_token TEXT, p_test_event_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company TEXT;
  v_token   TEXT := NULLIF(trim(coalesce(p_capi_token, '')), '');
  v_test    TEXT := NULLIF(trim(coalesce(p_test_event_code, '')), '');
BEGIN
  IF public.jwt_role() NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  SELECT company_id INTO v_company FROM public.forms WHERE id = p_form_id;
  IF v_company IS NULL OR v_company <> public.jwt_company() THEN
    RAISE EXCEPTION 'Formulário não encontrado.';
  END IF;
  IF v_token IS NOT NULL AND length(v_token) > 500 THEN RAISE EXCEPTION 'Token inválido.'; END IF;
  IF v_test  IS NOT NULL AND length(v_test)  > 40  THEN RAISE EXCEPTION 'Código de teste inválido.'; END IF;

  INSERT INTO public.form_secrets (form_id, company_id, capi_token, test_event_code, updated_at)
  VALUES (p_form_id, v_company, v_token, v_test, now())
  ON CONFLICT (form_id) DO UPDATE
    SET capi_token = EXCLUDED.capi_token, test_event_code = EXCLUDED.test_event_code, updated_at = now();
  UPDATE public.forms SET capi_configured = (v_token IS NOT NULL) WHERE id = p_form_id;
  RETURN v_token IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.set_form_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_form_secret(UUID, TEXT, TEXT) TO authenticated;

-- ── 6. Janela "Comercial" para cada agência (leads atuais, sem perder nada) ─
DO $$
DECLARE c record; v_board UUID;
BEGIN
  FOR c IN SELECT id::text AS id FROM public.companies LOOP
    IF NOT EXISTS (SELECT 1 FROM public.lead_boards WHERE company_id = c.id) THEN
      INSERT INTO public.lead_boards (company_id, name, position, sources)
      VALUES (c.id, 'Comercial', 0, ARRAY['manual','website','apify','meta','form'])
      RETURNING id INTO v_board;
      INSERT INTO public.lead_stages (company_id, board_id, name, color, position, kind, legacy_status) VALUES
        (c.id, v_board, 'Novo',      'blue',   0, 'open', 'new'),
        (c.id, v_board, 'Contatado', 'amber',  1, 'open', 'contacted'),
        (c.id, v_board, 'Proposta',  'orange', 2, 'open', 'proposal'),
        (c.id, v_board, 'Fechado',   'green',  3, 'won',  'client'),
        (c.id, v_board, 'Perdido',   'slate',  4, 'lost', 'lost');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lead_tags WHERE company_id = c.id) THEN
      INSERT INTO public.lead_tags (company_id, name, color) VALUES
        (c.id, 'Qualificado', 'green'),
        (c.id, 'Desqualificado', 'red');
    END IF;
  END LOOP;
END $$;

-- ── 7. Confira ───────────────────────────────────────────────────────────────
SELECT c.name AS agencia, c.slug AS apelido,
       (SELECT count(*) FROM public.lead_boards b WHERE b.company_id = c.id::text) AS janelas,
       (SELECT count(*) FROM public.lead_tags t WHERE t.company_id = c.id::text)   AS tags
FROM public.companies c ORDER BY c.name;
