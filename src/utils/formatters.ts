export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Date-only strings (YYYY-MM-DD) must be treated as local time.
// new Date("2024-12-26") → UTC midnight → UTC-3 = 2024-12-25 21:00 → shows wrong day.
// Fix: append T12:00:00 so JS parses as local noon, safe in any UTC-N timezone.
// For full ISO strings (from timestamp columns) use them directly — no suffix needed.
export const parseLocalDate = (dateStr: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T12:00:00') : new Date(dateStr);

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('pt-BR');
};

export const getProfessionLabel = (profession: string): string => {
  const labels: Record<string, string> = {
    editor_video: 'Editor de Vídeo',
    designer: 'Designer',
    social_media: 'Social Media',
    traffic_manager: 'Gestor de Tráfego',
    copywriter: 'Copywriter',
    account_manager: 'Atendimento',
    financial: 'Financeiro',
    manager: 'Gestor de Projetos',
    other: 'Outros',
  };
  return labels[profession] || profession;
};

export const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    video: 'Vídeo',
    art: 'Arte',
    copy: 'Copy',
    traffic: 'Tráfego',
    meeting: 'Reunião',
    planning: 'Planejamento',
    editing: 'Edição',
    review: 'Revisão',
    posting: 'Postagem',
    other: 'Outro',
  };
  return labels[type] || type;
};

export const getPriorityLabel = (priority: string): string => {
  const labels: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente',
  };
  return labels[priority] || priority;
};

export const getPriorityColor = (priority: string): string => {
  const colors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };
  return colors[priority] || 'bg-gray-100 text-gray-700';
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    new: 'Nova Demanda',
    briefing: 'Em Briefing',
    production: 'Em Produção',
    review: 'Em Revisão',
    adjustments: 'Ajustes Solicitados',
    approved: 'Aprovado',
    completed: 'Concluído',
    paid: 'Pago',
  };
  return labels[status] || status;
};

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    new: 'bg-slate-100 text-slate-700',
    briefing: 'bg-blue-100 text-blue-700',
    production: 'bg-indigo-100 text-indigo-700',
    review: 'bg-purple-100 text-purple-700',
    adjustments: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-100 text-green-700',
    completed: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-gray-100 text-gray-600',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
};

export const isOverdue = (deadline: string, status: string): boolean => {
  if (['completed', 'paid'].includes(status)) return false;
  if (!deadline) return false;
  return parseLocalDate(deadline) < new Date();
};
