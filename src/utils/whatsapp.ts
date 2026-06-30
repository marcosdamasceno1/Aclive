// ─── Z-API ────────────────────────────────────────────────────────────────────

const LS_INSTANCE     = 'zapi_instance';
const LS_TOKEN        = 'zapi_token';
const LS_CLIENT_TOKEN = 'zapi_client_token';

export interface ZApiConfig {
  instance: string;
  token: string;
  clientToken: string;
}

export const getZApiConfig = (): ZApiConfig | null => {
  const instance    = localStorage.getItem(LS_INSTANCE)     || '';
  const token       = localStorage.getItem(LS_TOKEN)        || '';
  const clientToken = localStorage.getItem(LS_CLIENT_TOKEN) || '';
  if (!instance || !token) return null;
  return { instance, token, clientToken };
};

export const saveZApiConfig = (cfg: ZApiConfig) => {
  localStorage.setItem(LS_INSTANCE,     cfg.instance);
  localStorage.setItem(LS_TOKEN,        cfg.token);
  localStorage.setItem(LS_CLIENT_TOKEN, cfg.clientToken);
};

export const clearZApiConfig = () => {
  localStorage.removeItem(LS_INSTANCE);
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_CLIENT_TOKEN);
};

// ─── Payload comum ────────────────────────────────────────────────────────────

export type WhatsAppProvider = 'zapi' | 'meta';

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

// ─── Z-API sender ─────────────────────────────────────────────────────────────

const buildZapiMessage = (p: NotificationPayload): string => {
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

const sendViaZapi = async (payload: NotificationPayload): Promise<string | null> => {
  const cfg = getZApiConfig();
  if (!cfg) return 'Z-API não configurada. Configure em Configurações → Integrações.';

  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${cfg.instance}/token/${cfg.token}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': cfg.clientToken },
        body: JSON.stringify({ phone: formatPhone(payload.phone), message: buildZapiMessage(payload) }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return (body as { message?: string })?.message || `Erro Z-API: ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Erro de rede (Z-API)';
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

// ─── Router público ───────────────────────────────────────────────────────────

/**
 * Envia notificação WhatsApp pelo provider configurado na agência.
 * Importa o store dinamicamente para evitar dependência circular.
 * Retorna null em sucesso ou string de erro.
 */
export const sendWhatsAppNotification = async (
  payload: NotificationPayload,
): Promise<string | null> => {
  // import dinâmico evita dependência circular (store → whatsapp → store)
  const { useCompanySettingsStore } = await import('../store/companySettingsStore');
  const state = useCompanySettingsStore.getState();
  const provider: WhatsAppProvider = state.whatsappProvider || 'zapi';

  if (provider === 'meta') {
    const { metaAccessToken, metaPhoneNumberId, metaTemplateName } = state;
    if (!metaAccessToken || !metaPhoneNumberId) {
      return 'Meta API não configurada. Configure em Configurações → Integrações.';
    }
    return sendViaMeta(payload, {
      accessToken: metaAccessToken,
      phoneNumberId: metaPhoneNumberId,
      templateName: metaTemplateName || 'nova_demanda',
    });
  }

  // default: Z-API
  return sendViaZapi(payload);
};
