-- ═══════════════════════════════════════════════════════════════════════════
-- Abertura rápida do formulário público
--
-- A página pública lê o formulário direto do banco por esta função (sem
-- esperar uma Edge Function "acordar"). Ela devolve SÓ o que a página mostra,
-- e só de formulários publicados: sem company_id, tags, telefone de aviso ou
-- token da API de Conversões.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_public_form(p_agency TEXT, p_slug TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'pixelId', f.pixel_id,
    'config', jsonb_build_object(
      'version', 1,
      'welcome', f.config -> 'welcome',
      'theme', f.config -> 'theme',
      'endings', f.config -> 'endings',
      'privacyText', f.config -> 'privacyText',
      'tracking', f.config -> 'tracking',
      'questions', COALESCE((
        SELECT jsonb_agg(
          (q - 'options') ||
          CASE WHEN jsonb_typeof(q -> 'options') = 'array'
               THEN jsonb_build_object('options', (SELECT jsonb_agg(o - 'tagIds') FROM jsonb_array_elements(q -> 'options') o))
               ELSE '{}'::jsonb END
          ORDER BY t.ord)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.config -> 'questions') = 'array' THEN f.config -> 'questions' ELSE '[]'::jsonb END)
             WITH ORDINALITY AS t(q, ord)
      ), '[]'::jsonb)
    )
  )
  FROM public.forms f
  JOIN public.companies c ON c.id::text = f.company_id
  WHERE c.slug = lower(p_agency) AND f.slug = lower(p_slug) AND f.status = 'published'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_form(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_form(TEXT, TEXT) TO anon, authenticated;

-- Índice para achar a agência pelo apelido na hora
CREATE INDEX IF NOT EXISTS forms_slug_published ON public.forms (slug) WHERE status = 'published';

-- Reenvios do mesmo envio (novas tentativas do navegador) são achados na hora
CREATE INDEX IF NOT EXISTS form_submissions_event ON public.form_submissions (form_id, event_id);
