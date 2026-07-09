import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);

  // ── GET: verificação do webhook pelo Meta ─────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
      return new Response('Bad Request', { status: 400, headers: CORS });
    }

    const { data } = await supabase
      .from('company_settings')
      .select('company_id')
      .eq('meta_leads_verify_token', token)
      .maybeSingle();

    if (!data) return new Response('Forbidden', { status: 403, headers: CORS });

    return new Response(challenge, { status: 200, headers: CORS });
  }

  // ── POST: lead chegou ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400, headers: CORS }); }

    // Meta envia um echo de teste — responde OK e ignora
    if (body.object !== 'page') return new Response('OK', { status: 200, headers: CORS });

    const entries = (body.entry as Record<string, unknown>[]) ?? [];

    for (const entry of entries) {
      const pageId  = entry.id as string;
      const changes = (entry.changes as Record<string, unknown>[]) ?? [];

      // Busca agência pelo page_id
      const { data: settings } = await supabase
        .from('company_settings')
        .select('company_id, meta_leads_page_token')
        .eq('meta_leads_page_id', pageId)
        .maybeSingle();

      if (!settings) {
        console.warn(`[meta-leads] Nenhuma agência encontrada para page_id=${pageId}`);
        continue;
      }

      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const value      = change.value as Record<string, unknown>;
        const leadgenId  = value.leadgen_id  as string;
        const formId     = value.form_id     as string;

        // Busca dados do lead na Graph API
        const graphRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,created_time&access_token=${settings.meta_leads_page_token}`,
        );

        if (!graphRes.ok) {
          console.error(`[meta-leads] Erro ao buscar lead ${leadgenId}:`, await graphRes.text());
          continue;
        }

        const leadData = await graphRes.json() as {
          field_data?: { name: string; values: string[] }[];
          created_time?: string;
        };

        // Normaliza field_data em mapa chave→valor
        const f: Record<string, string> = {};
        for (const fd of leadData.field_data ?? []) {
          f[fd.name] = fd.values?.[0] ?? '';
        }

        // Nome: tenta variações comuns (PT e EN)
        let name =
          f['full_name'] || f['nome_completo'] || f['nome'] ||
          [f['first_name'] || f['primeiro_nome'], f['last_name'] || f['sobrenome']]
            .filter(Boolean).join(' ') || 'Lead Meta';

        const phone = f['phone_number'] || f['telefone'] || f['celular'] || null;
        const email = f['email'] || f['e-mail'] || null;

        const { error } = await supabase.from('leads').insert({
          id:         crypto.randomUUID(),
          company_id: settings.company_id,
          name:       name.trim(),
          email,
          phone,
          source:     'meta',
          status:     'new',
          notes:      `Formulário Meta ID: ${formId}`,
          created_at: new Date().toISOString(),
        });

        if (error) console.error('[meta-leads] Erro ao inserir lead:', error);
        else console.log(`[meta-leads] Lead inserido para agência ${settings.company_id}: ${name}`);
      }
    }

    return new Response('OK', { status: 200, headers: CORS });
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS });
});
