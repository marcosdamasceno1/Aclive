import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function priorityLabel(p: string): string {
  return ({ urgent: '🔴 Urgente', high: '🟠 Alta', medium: '🟡 Média', low: '🟢 Baixa' } as Record<string, string>)[p] ?? p;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase database webhooks send { type, table, record, old_record }
    if (payload.type !== 'INSERT' || payload.table !== 'demands') {
      return new Response('skipped', { status: 200 });
    }

    const demand = payload.record;

    if (!demand.professional_id) {
      return new Response('no professional assigned', { status: 200 });
    }

    // ── Fetch professional + client from DB ────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: professional }, { data: client }] = await Promise.all([
      supabase.from('professionals').select('name, phone').eq('id', demand.professional_id).single(),
      demand.client_id
        ? supabase.from('clients').select('company_name').eq('id', demand.client_id).single()
        : Promise.resolve({ data: null }),
    ]);

    if (!professional?.phone?.trim()) {
      return new Response('professional has no phone', { status: 200 });
    }

    // ── Build message ──────────────────────────────────────────────────────
    const clientName = (client as { company_name?: string } | null)?.company_name ?? '—';
    const deadline = demand.deadline
      ? new Date(demand.deadline).toLocaleDateString('pt-BR')
      : 'Sem prazo';

    const message =
      `🚀 *Nova demanda atribuída a você!*\n\n` +
      `📌 *Tarefa:* ${demand.title}\n` +
      `🏢 *Cliente:* ${clientName}\n` +
      `⚡ *Prioridade:* ${priorityLabel(demand.priority)}\n` +
      `📅 *Prazo:* ${deadline}\n\n` +
      `Acesse o sistema para ver os detalhes e iniciar a produção.`;

    // ── Send via Z-API ─────────────────────────────────────────────────────
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const token      = Deno.env.get('ZAPI_TOKEN')!;
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': clientToken,
        },
        body: JSON.stringify({
          phone: formatPhone(professional.phone),
          message,
        }),
      },
    );

    const zapiBody = await zapiRes.json();

    if (!zapiRes.ok) {
      console.error('[whatsapp] Z-API error:', zapiBody);
      return new Response(JSON.stringify({ error: zapiBody }), { status: 500 });
    }

    console.log(`[whatsapp] sent to ${professional.name} (${professional.phone})`);
    return new Response(JSON.stringify({ ok: true, zapi: zapiBody }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('[whatsapp] unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
