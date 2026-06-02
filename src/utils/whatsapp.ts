const LS_INSTANCE  = 'zapi_instance';
const LS_TOKEN     = 'zapi_token';
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

/** Strips everything except digits and prepends 55 if needed */
const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return '55' + digits;
};

export interface NotificationPayload {
  phone: string;         // raw phone from professional profile
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

const buildMessage = (p: NotificationPayload): string => {
  const deadline = p.deadline
    ? new Date(p.deadline + 'T12:00:00').toLocaleDateString('pt-BR')
    : 'Sem prazo definido';
  const value = p.value > 0
    ? `R$ ${p.value.toFixed(2).replace('.', ',')}`
    : '—';
  return [
    `Olá, ${p.professionalName}! 👋`,
    '',
    `Você recebeu uma nova demanda no sistema Growth Expert:`,
    '',
    `*${p.demandTitle}*`,
    `📋 Tipo: ${TASK_PT[p.taskType] || p.taskType}`,
    `🏢 Cliente: ${p.clientName}`,
    `📅 Prazo: ${deadline}`,
    `🎯 Prioridade: ${PRIORITY_PT[p.priority] || p.priority}`,
    `💰 Valor: ${value}`,
    '',
    `Acesse o sistema para ver os detalhes e dar início à tarefa.`,
  ].join('\n');
};

/**
 * Sends a WhatsApp message via Z-API.
 * Returns null on success, or an error string on failure.
 */
export const sendWhatsAppNotification = async (
  payload: NotificationPayload,
): Promise<string | null> => {
  const cfg = getZApiConfig();
  if (!cfg) return 'Z-API não configurada. Configure em Configurações → Integrações.';

  const phone   = formatPhone(payload.phone);
  const message = buildMessage(payload);

  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${cfg.instance}/token/${cfg.token}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client-token': cfg.clientToken,
        },
        body: JSON.stringify({ phone, message }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body?.message || `Erro Z-API: ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Erro de rede ao enviar WhatsApp';
  }
};
