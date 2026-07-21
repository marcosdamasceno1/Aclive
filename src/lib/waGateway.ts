/**
 * waGateway.ts — Cliente do gateway central do WAHA (Edge Function wa-gateway).
 *
 * O frontend NUNCA fala direto com o servidor WAHA. Todas as operações
 * (conectar/QR, status, logout, enviar) passam por esta função, que roda no
 * Supabase, guarda a chave-mestra e deriva a sessão do company_id do JWT.
 * Isso garante isolamento total entre agências e não expõe segredo no browser.
 *
 * O supabase-js injeta o Authorization (JWT do usuário) automaticamente na
 * invocação — é assim que o gateway sabe de qual agência é a chamada.
 */

import { supabaseData as supabase } from './supabase';

export interface WaGatewayResult {
  status?: string;
  qr?: string | null;
  providerMessageId?: string | null;
  ok?: boolean;
  error: string | null;
}

const invoke = async (action: string, extra: Record<string, unknown> = {}): Promise<WaGatewayResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('wa-gateway', { body: { action, ...extra } });
    if (error) {
      // Traduz o erro técnico de invocação para algo compreensível.
      const raw = error.message || '';
      const friendly = /Failed to send a request|Failed to fetch|NetworkError|network/i.test(raw)
        ? 'WhatsApp indisponível (conecte em Configurações → Integrações → WhatsApp).'
        : raw;
      return { error: friendly };
    }
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      status: d.status as string | undefined,
      qr: (d.qr as string | null | undefined) ?? null,
      providerMessageId: (d.providerMessageId as string | null | undefined) ?? null,
      ok: d.ok as boolean | undefined,
      error: d.error ? String(d.message ?? d.error) : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

/** Inicia/garante a sessão da agência e retorna status + QR (se precisar escanear). */
export const waStart = () => invoke('start');

/** Consulta o status da sessão (WORKING | SCAN_QR_CODE | STARTING | STOPPED | ...). */
export const waStatus = () => invoke('status');

/** Desconecta a sessão da agência. */
export const waLogout = () => invoke('logout');

/** Envia texto pelo WhatsApp da agência via gateway. */
export const waSend = (chatKey: string, text: string) => invoke('send', { chatKey, text });
