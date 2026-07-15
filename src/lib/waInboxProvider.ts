/**
 * waInboxProvider.ts — Envio e saúde da sessão do Atendimento WhatsApp.
 *
 * O inbox NUNCA lê mensagens daqui — leitura vem exclusivamente do banco
 * (webhooks → tabelas → Realtime). Este módulo só ENVIA pelo provider ativo
 * e consulta a saúde da sessão WAHA. Toda falha retorna erro tratado;
 * nenhuma chamada pode travar a UI (timeouts explícitos).
 */

import { getWahaConfig } from '../utils/whatsapp';

const SEND_TIMEOUT = 15_000;

const withTimeout = (p: Promise<Response>, ms = SEND_TIMEOUT): Promise<Response> =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout de ${ms / 1000}s`)), ms)),
  ]);

export interface SendResult {
  providerMessageId: string | null;
  error: string | null;
}

// ─── WAHA ─────────────────────────────────────────────────────────────────────

const sendViaWaha = async (chatKey: string, text: string): Promise<SendResult> => {
  const cfg = getWahaConfig();
  if (!cfg) return { providerMessageId: null, error: 'WAHA não configurado (Configurações → Integrações).' };
  try {
    const res = await withTimeout(fetch(`${cfg.baseUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {}),
      },
      body: JSON.stringify({
        session: cfg.session || 'default',
        chatId: `${chatKey}@c.us`,
        text,
      }),
    }));
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      return { providerMessageId: null, error: (body as { message?: string })?.message || `Erro WAHA: ${res.status}` };
    }
    // Formatos possíveis de id conforme a engine do WAHA
    const rawId = (body as Record<string, unknown>).id;
    const id = typeof rawId === 'string'
      ? rawId
      : String((rawId as Record<string, unknown> | undefined)?._serialized ?? '') || null;
    return { providerMessageId: id, error: null };
  } catch (e) {
    return { providerMessageId: null, error: e instanceof Error ? e.message : 'Erro de rede (WAHA)' };
  }
};

/** Saúde da sessão WAHA: 'WORKING' = ok; qualquer outra coisa = banner na tela. */
export const getWahaSessionStatus = async (): Promise<{ status: string; error: string | null }> => {
  const cfg = getWahaConfig();
  if (!cfg) return { status: 'NOT_CONFIGURED', error: null };
  try {
    const res = await withTimeout(fetch(`${cfg.baseUrl}/api/sessions/${cfg.session || 'default'}`, {
      headers: cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {},
    }), 8000);
    if (!res.ok) return { status: 'UNKNOWN', error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    return { status: String((body as Record<string, unknown>).status ?? 'UNKNOWN'), error: null };
  } catch (e) {
    return { status: 'UNREACHABLE', error: e instanceof Error ? e.message : String(e) };
  }
};

// ─── Meta Cloud API ───────────────────────────────────────────────────────────

const sendViaMeta = async (
  chatKey: string,
  text: string,
  cfg: { accessToken: string; phoneNumberId: string },
): Promise<SendResult> => {
  try {
    const res = await withTimeout(fetch(
      `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: chatKey,
          type: 'text',
          text: { body: text },
        }),
      },
    ));
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const err = (body as { error?: { message?: string } })?.error?.message || `Erro Meta API: ${res.status}`;
      return { providerMessageId: null, error: err };
    }
    const msgs = (body as { messages?: { id?: string }[] }).messages;
    return { providerMessageId: msgs?.[0]?.id ?? null, error: null };
  } catch (e) {
    return { providerMessageId: null, error: e instanceof Error ? e.message : 'Erro de rede (Meta API)' };
  }
};

// ─── Router ───────────────────────────────────────────────────────────────────

/** Envia texto para um contato pelo provider ativo da agência. */
export const sendInboxText = async (chatKey: string, text: string): Promise<SendResult> => {
  const { useCompanySettingsStore } = await import('../store/companySettingsStore');
  const s = useCompanySettingsStore.getState();

  if (s.whatsappProvider === 'meta') {
    if (!s.metaAccessToken || !s.metaPhoneNumberId) {
      return { providerMessageId: null, error: 'Meta API não configurada (Configurações → Integrações).' };
    }
    return sendViaMeta(chatKey, text, { accessToken: s.metaAccessToken, phoneNumberId: s.metaPhoneNumberId });
  }
  return sendViaWaha(chatKey, text);
};

/** Janela de 24h da Meta: só é possível texto livre até 24h após a última msg do cliente. */
export const isMetaWindowOpen = (lastInboundAt?: string): boolean => {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
};
