// ─── Payload comum ────────────────────────────────────────────────────────────

// Todas as mensagens saem pelo Acta (Edge Function crm-notify), configurado
// por agência em Configurações → Integrações → WhatsApp.
export type WhatsAppProvider = 'crm';

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

// ─── Texto da notificação ──────────────────────────────────────────────────────────────

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

// ─── Acta (endpoint/webhook) sender ───────────────────────────────────────────

/**
 * Envia texto livre para o endpoint do Acta — pelo gateway central
 * (Edge Function crm-notify), que guarda endpoint e token da agência e isola
 * por company_id. O navegador nunca fala direto com o Acta.
 */
const sendViaCrm = async (phone: string, text: string, name?: string): Promise<string | null> => {
  const { crmSend } = await import('../lib/crmGateway');
  const { error } = await crmSend(formatPhone(phone), text, name);
  return error;
};

/**
 * Envia notificação de nova demanda pelo Acta da agência.
 * Retorna null em sucesso ou string de erro.
 */
export const sendWhatsAppNotification = async (
  payload: NotificationPayload,
): Promise<string | null> =>
  sendViaCrm(payload.phone, buildTextMessage(payload), payload.professionalName);

/**
 * Envia uma mensagem de texto livre pelo Acta da agência.
 * Usado para lembretes (ex: postagens agendadas no Social).
 */
export const sendWhatsAppText = async (
  phone: string,
  message: string,
  name?: string,
): Promise<string | null> => sendViaCrm(phone, message, name);
