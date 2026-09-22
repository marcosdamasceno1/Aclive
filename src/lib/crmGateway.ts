/**
 * crmGateway.ts — Cliente da Edge Function crm-notify (API de notificações do CRM).
 *
 * O frontend NUNCA fala direto com api.apiintegracoes.com — a chamada passa
 * pela função crm-notify, que guarda a API Key da agência e isola por
 * company_id. O supabase-js injeta o Authorization (JWT do usuário)
 * automaticamente na invocação.
 */

import { supabaseData as supabase } from './supabase';

export interface CrmGatewayResult {
  providerMessageId?: string | null;
  status?: string | null;
  ok?: boolean;
  error: string | null;
}

/** Envia notificação de texto via CRM para o telefone informado. */
export const crmSend = async (phone: string, content: string): Promise<CrmGatewayResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('crm-notify', { body: { phone, content } });
    if (error) {
      const raw = error.message || '';
      const friendly = /Failed to send a request|Failed to fetch|NetworkError|network/i.test(raw)
        ? 'CRM indisponível (conecte em Configurações → Integrações → WhatsApp).'
        : raw;
      return { error: friendly };
    }
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: d.ok as boolean | undefined,
      providerMessageId: (d.providerMessageId as string | null | undefined) ?? null,
      status: (d.status as string | null | undefined) ?? null,
      error: d.error ? String(d.message ?? d.error) : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};
