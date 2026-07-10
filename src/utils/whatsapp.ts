// ─── WAHA (WhatsApp HTTP API — self-hosted) ──────────────────────────────────

const LS_WAHA_URL     = 'waha_url';
const LS_WAHA_API_KEY = 'waha_api_key';
const LS_WAHA_SESSION = 'waha_session';

// Migração: remove as chaves da antiga integração Z-API (descontinuada).
try {
  ['zapi_instance', 'zapi_token', 'zapi_client_token'].forEach(k => localStorage.removeItem(k));
} catch { /* SSR/test */ }

export interface WahaConfig {
  baseUrl: string;
  apiKey: string;
  session: string;
}

export const getWahaConfig = (): WahaConfig | null => {
  const baseUrl = localStorage.getItem(LS_WAHA_URL)     || '';
  const apiKey  = localStorage.getItem(LS_WAHA_API_KEY) || '';
  const session = localStorage.getItem(LS_WAHA_SESSION) || 'default';
  if (!baseUrl) return null;
  return { baseUrl, apiKey, session };
};

export const saveWahaConfig = (cfg: WahaConfig) => {
  localStorage.setItem(LS_WAHA_URL,     cfg.baseUrl.replace(/\/+$/, ''));
  localStorage.setItem(LS_WAHA_API_KEY, cfg.apiKey);
  localStorage.setItem(LS_WAHA_SESSION, cfg.session || 'default');
};

export const clearWahaConfig = () => {
  localStorage.removeItem(LS_WAHA_URL);
  localStorage.removeItem(LS_WAHA_API_KEY);
  localStorage.removeItem(LS_WAHA_SESSION);
};

// ─── Payload comum ────────────────────────────────────────────────────────────

export type WhatsAppProvider = 'waha' | 'meta';

export interface NotificationPayload {
  phone: string;
  professionalName: string;
  demandTitle: string;
  clientName: string;
  deadline: string;
  priority: string;
  taskType: string;
  value: number;
}

const PRIORITY_PT: Record<string, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente',
};

const TASK_PT: Record<string, string> = {
  video: 'Vídeo', art: 'Arte', copy: 'Copy', traffic: 'Tráfego',
  meeting: 'Reunião', planning: 'Planejamento', editing: 'Edição',
  review: 'Revisão', posting: 'Postagem', other: 'Outro',
};

/** Strips non-digits and prepends 55 (Brazil) if needed */
const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return '55' + digits;
};

const formatDeadline = (deadline: string): string =>
  deadline
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline + 'T12:00:00' : deadline)
        .toLocaleDateString('pt-BR')
    : 'Sem prazo definido';

// ─── WAHA sender ──────────────────────────────────────────────────────────────

const buildTextMessage = (p: NotificationPayload): string => {
  const value = p.value > 0 ? `R$ ${p.value.toFixed(2).replace('.', ',')}` : '—';
  return [
    `Olá, ${p.professionalName}! 👋`,
    '',
    `Você recebeu uma nova demanda no sistema:`,
    '',
    `*${p.demandTitle}*`,
    `📋 Tipo: ${TASK_PT[p.taskType] || p.taskType}`,
    `🏢 Cliente: ${p.clientName}`,
    `📅 Prazo: ${formatDeadline(p.deadline)}`,
    `🎯 Prioridade: ${PRIORITY_PT[p.priority] || p.priority}`,
    `💰 Valor: ${value}`,
    '',
    `Acesse o sistema para ver os detalhes e dar início à tarefa.`,
  ].join('\n');
};

/**
 * Envia texto livre via WAHA (POST /api/sendText).
 * Retorna null em sucesso ou string de erro.
 */
const sendViaWaha = async (phone: string, text: string): Promise<string | null> => {
  const cfg = getWahaConfig();
  if (!cfg) return 'WAHA não configurado. Configure em Configurações → Integrações.';

  try {
    const res = await fetch(`${cfg.baseUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {}),
      },
      body: JSON.stringify({
        session: cfg.session || 'default',
        chatId: `${formatPhone(phone)}@c.us`,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return (body as { message?: string })?.message || `Erro WAHA: ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Erro de rede (WAHA)';
  }
};

// ─── Meta Cloud API sender ────────────────────────────────────────────────────

export interface MetaConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
}

/**
 * Envia via Meta WhatsApp Business Cloud API usando template aprovado.
 *
 * O template deve ter exatamente 5 variáveis no body na ordem:
 *   {{1}} profissional  {{2}} demanda  {{3}} cliente  {{4}} prazo  {{5}} prioridade
 *
 * Crie e aprove o template em:
 *   business.facebook.com → WhatsApp Manager → Message Templates
 */
const sendViaMeta = async (payload: NotificationPayload, cfg: MetaConfig): Promise<string | null> => {
  const phone = formatPhone(payload.phone);

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: cfg.templateName,
      language: { code: 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: payload.professionalName },
          { type: 'text', text: payload.demandTitle },
          { type: 'text', text: payload.clientName },
          { type: 'text', text: formatDeadline(payload.deadline) },
          { type: 'text', text: PRIORITY_PT[payload.priority] || payload.priority },
        ],
      }],
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return err?.error?.message || `Erro Meta API: ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Erro de rede (Meta API)';
  }
};

/** Texto livre via Meta Cloud API (só entrega dentro da janela de 24h). */
const sendTextViaMeta = async (phone: string, text: string, cfg: MetaConfig): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formatPhone(phone),
          type: 'text',
          text: { body: text },
        }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return err?.error?.message || `Erro Meta API: ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Erro de rede (Meta API)';
  }
};

// ─── Router público ───────────────────────────────────────────────────────────

const getProvider = async (): Promise<{ provider: WhatsAppProvider; meta: MetaConfig | null }> => {
  // import dinâmico evita dependência circular (store → whatsapp → store)
  const { useCompanySettingsStore } = await import('../store/companySettingsStore');
  const state = useCompanySettingsStore.getState();
  const provider: WhatsAppProvider = state.whatsappProvider === 'meta' ? 'meta' : 'waha';
  const meta = state.metaAccessToken && state.metaPhoneNumberId
    ? {
        accessToken: state.metaAccessToken,
        phoneNumberId: state.metaPhoneNumberId,
        templateName: state.metaTemplateName || 'nova_demanda',
      }
    : null;
  return { provider, meta };
};

/**
 * Envia notificação de nova demanda pelo provider configurado na agência.
 * Retorna null em sucesso ou string de erro.
 */
export const sendWhatsAppNotification = async (
  payload: NotificationPayload,
): Promise<string | null> => {
  const { provider, meta } = await getProvider();

  if (provider === 'meta') {
    if (!meta) return 'Meta API não configurada. Configure em Configurações → Integrações.';
    return sendViaMeta(payload, meta);
  }

  return sendViaWaha(payload.phone, buildTextMessage(payload));
};

/**
 * Envia uma mensagem de texto livre pelo provider configurado.
 * Usado para lembretes (ex: postagens agendadas no Social).
 */
export const sendWhatsAppText = async (
  phone: string,
  message: string,
): Promise<string | null> => {
  const { provider, meta } = await getProvider();

  if (provider === 'meta') {
    if (!meta) return 'Meta API não configurada. Configure em Configurações → Integrações.';
    return sendTextViaMeta(phone, message, meta);
  }

  return sendViaWaha(phone, message);
};
