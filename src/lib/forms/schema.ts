/**
 * schema.ts — Modelo dos formulários (construtor, página pública e servidor).
 *
 * Sem dependências: é usado pela página pública, que precisa ser leve.
 * A mesma lógica de validação e de qualificação está copiada na Edge Function
 * form-submit — o servidor NUNCA confia no resultado calculado pelo navegador.
 */

export type QuestionType =
  | 'short_text' | 'long_text' | 'name' | 'email' | 'phone'
  | 'single_choice' | 'multi_choice' | 'image_choice'
  | 'number' | 'date' | 'statement';

export interface ChoiceOption {
  id: string;
  label: string;
  imageUrl?: string;
  /** continue = segue para a próxima pergunta · disqualify = encerra e desqualifica */
  action: 'continue' | 'disqualify';
  /** Tela de obrigado mostrada quando esta opção desqualifica */
  endingId?: string;
  /** Tags aplicadas ao lead quando esta opção desqualifica (motivo) */
  tagIds?: string[];
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  /** Texto de ajuda / exemplo de resposta (ex.: "Ex.: Drogaria Saúde Popular") */
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: ChoiceOption[];
}

export interface Ending {
  id: string;
  /** qualified = quem conclui · disqualified = destino padrão das opções que desqualificam */
  kind: 'qualified' | 'disqualified';
  title: string;
  text?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  whatsappNumber?: string;
  whatsappMessage?: string;
  /** Redireciona sozinho para buttonUrl após alguns segundos */
  autoRedirect?: boolean;
}

export interface FormTheme {
  primary: string;
  background: string;
  text: string;
  backgroundImage?: string;
  logoUrl?: string;
  font: 'system' | 'Inter' | 'Poppins' | 'Montserrat' | 'Lato';
  buttonText: string;
}

export interface FormWelcome {
  enabled: boolean;
  title: string;
  subtitle?: string;
  bullets: string[];
  imageUrl?: string;
  buttonText: string;
}

export interface FormConfig {
  version: 1;
  welcome: FormWelcome;
  questions: Question[];
  endings: Ending[];
  theme: FormTheme;
  tracking: { submitEvent: 'Lead' | 'CompleteRegistration' };
  destination: {
    qualifiedTagIds: string[];
    disqualifiedTagIds: string[];
    /** WhatsApp que recebe o aviso de novo lead (pelo Acta) */
    notifyPhone?: string;
  };
  privacyText?: string;
}

export type Answers = Record<string, string | string[]>;

export const QUESTION_TYPES: { type: QuestionType; label: string; hint: string }[] = [
  { type: 'name',          label: 'Nome',              hint: 'Nome do contato' },
  { type: 'phone',         label: 'WhatsApp',          hint: 'Com DDD e máscara' },
  { type: 'email',         label: 'E-mail',            hint: 'Valida o formato' },
  { type: 'short_text',    label: 'Texto curto',       hint: 'Uma linha' },
  { type: 'long_text',     label: 'Texto longo',       hint: 'Vários parágrafos' },
  { type: 'single_choice', label: 'Escolha única',     hint: 'A, B, C…' },
  { type: 'multi_choice',  label: 'Múltipla escolha',  hint: 'Marca várias' },
  { type: 'image_choice',  label: 'Cartões com imagem', hint: 'Escolha com foto' },
  { type: 'number',        label: 'Número',            hint: 'Só números' },
  { type: 'date',          label: 'Data',              hint: 'Calendário' },
  { type: 'statement',     label: 'Tela de texto',     hint: 'Sem resposta' },
];

export const isChoice = (t: QuestionType) =>
  t === 'single_choice' || t === 'multi_choice' || t === 'image_choice';

export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export const newQuestion = (type: QuestionType): Question => {
  const base: Question = { id: uid(), type, title: '', required: type !== 'statement' };
  switch (type) {
    case 'name':  return { ...base, title: 'Qual é o seu nome?', placeholder: 'Seu nome completo' };
    case 'phone': return { ...base, title: 'Qual é o seu WhatsApp?', placeholder: '(00) 00000-0000' };
    case 'email': return { ...base, title: 'Qual é o seu e-mail?', placeholder: 'nome@empresa.com.br' };
    case 'short_text': return { ...base, title: 'Sua pergunta aqui', placeholder: 'Digite sua resposta' };
    case 'long_text':  return { ...base, title: 'Conte um pouco mais', placeholder: 'Digite sua resposta' };
    case 'number': return { ...base, title: 'Quantos?', placeholder: '0' };
    case 'date':   return { ...base, title: 'Qual a melhor data?' };
    case 'statement': return { ...base, title: 'Antes de continuar…', description: 'Escreva aqui uma mensagem para o visitante.' };
    default:
      return {
        ...base,
        title: 'Escolha uma opção',
        options: ['Opção A', 'Opção B', 'Opção C'].map(label => ({ id: uid(), label, action: 'continue' as const })),
      };
  }
};

export const defaultConfig = (agencyName = ''): FormConfig => ({
  version: 1,
  welcome: {
    enabled: true,
    title: 'Fale com um especialista',
    subtitle: 'Responda algumas perguntas rápidas. Leva menos de 1 minuto.',
    bullets: [],
    buttonText: 'Começar',
  },
  questions: [newQuestion('name'), newQuestion('phone')],
  endings: [
    { id: 'ok', kind: 'qualified', title: 'Recebemos suas respostas!', text: `Em breve a equipe${agencyName ? ` ${agencyName}` : ''} entra em contato.` },
    { id: 'dq', kind: 'disqualified', title: 'Obrigado pelo interesse!', text: 'No momento este atendimento não é para o seu perfil.' },
  ],
  theme: { primary: '#2563eb', background: '#ffffff', text: '#0f172a', font: 'system', buttonText: 'Continuar' },
  tracking: { submitEvent: 'Lead' },
  destination: { qualifiedTagIds: [], disqualifiedTagIds: [] },
  privacyText: 'Seus dados são usados apenas para entrarmos em contato, conforme a LGPD.',
});

/** Completa um config salvo com os campos novos (formulários antigos não quebram). */
export const normalizeConfig = (raw: unknown): FormConfig => {
  const d = defaultConfig();
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<FormConfig>;
  const endings = Array.isArray(c.endings) && c.endings.length ? c.endings : d.endings;
  return {
    version: 1,
    welcome: { ...d.welcome, ...(c.welcome ?? {}), bullets: c.welcome?.bullets ?? [] },
    questions: Array.isArray(c.questions) ? c.questions : d.questions,
    endings,
    theme: { ...d.theme, ...(c.theme ?? {}) },
    tracking: { ...d.tracking, ...(c.tracking ?? {}) },
    destination: { ...d.destination, ...(c.destination ?? {}) },
    privacyText: c.privacyText ?? d.privacyText,
  };
};

// ─── Validação de uma resposta ───────────────────────────────────────────────

export const onlyDigits = (v: string) => v.replace(/\D/g, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Devolve a mensagem de erro, ou null se a resposta é válida. */
export const validateAnswer = (q: Question, value: string | string[] | undefined): string | null => {
  if (q.type === 'statement') return null;
  const empty = value == null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '');
  if (empty) return q.required ? 'Esta resposta é obrigatória.' : null;

  if (isChoice(q.type)) {
    const ids = (q.options ?? []).map(o => o.id);
    const chosen = Array.isArray(value) ? value : [value];
    if (q.type !== 'multi_choice' && chosen.length !== 1) return 'Escolha uma opção.';
    if (!chosen.every(id => ids.includes(String(id)))) return 'Opção inválida.';
    return null;
  }
  const v = String(value).trim();
  if (v.length > (q.type === 'long_text' ? 4000 : 300)) return 'Resposta muito longa.';
  switch (q.type) {
    case 'email': return EMAIL_RE.test(v) ? null : 'Digite um e-mail válido.';
    case 'phone': {
      const d = onlyDigits(v);
      return d.length >= 10 && d.length <= 15 ? null : 'Digite o número com DDD.';
    }
    case 'number': return /^-?\d+([.,]\d+)?$/.test(v) ? null : 'Digite apenas números.';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Escolha uma data.';
    case 'name': return v.length >= 2 ? null : 'Digite seu nome.';
    default: return null;
  }
};

// ─── Resultado (qualificado / desqualificado) ────────────────────────────────

export interface Outcome {
  outcome: 'qualified' | 'disqualified';
  endingId: string;
  /** Índice da pergunta onde o formulário parou (desqualificação) ou questions.length */
  stopIndex: number;
  tagIds: string[];
  /** Opção que desqualificou (motivo) */
  reason?: string;
}

/** Primeira opção que desqualifica entre as escolhidas nesta pergunta. */
export const disqualifyingOption = (q: Question, value: string | string[] | undefined): ChoiceOption | null => {
  if (!isChoice(q.type) || value == null) return null;
  const chosen = Array.isArray(value) ? value : [value];
  return (q.options ?? []).find(o => o.action === 'disqualify' && chosen.includes(o.id)) ?? null;
};

export const computeOutcome = (config: FormConfig, answers: Answers): Outcome => {
  const qualifiedEnding = config.endings.find(e => e.kind === 'qualified') ?? config.endings[0];
  const dqEnding = config.endings.find(e => e.kind === 'disqualified') ?? qualifiedEnding;
  for (let i = 0; i < config.questions.length; i++) {
    const q = config.questions[i];
    const opt = disqualifyingOption(q, answers[q.id]);
    if (opt) {
      const ending = config.endings.find(e => e.id === opt.endingId) ?? dqEnding;
      return {
        outcome: 'disqualified',
        endingId: ending?.id ?? '',
        stopIndex: i,
        tagIds: [...(config.destination.disqualifiedTagIds ?? []), ...(opt.tagIds ?? [])],
        reason: opt.label,
      };
    }
  }
  return {
    outcome: 'qualified',
    endingId: qualifiedEnding?.id ?? '',
    stopIndex: config.questions.length,
    tagIds: config.destination.qualifiedTagIds ?? [],
  };
};

/** Texto legível de uma resposta (rótulos das opções em vez dos ids). */
export const answerLabel = (q: Question, value: string | string[] | undefined): string => {
  if (value == null) return '';
  if (isChoice(q.type)) {
    const chosen = Array.isArray(value) ? value : [value];
    return (q.options ?? []).filter(o => chosen.includes(o.id)).map(o => o.label).join(', ');
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
};

/** Máscara BR de telefone: (00) 00000-0000 */
export const maskPhoneBR = (raw: string): string => {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const COUNTRIES = [
  { code: '55', flag: '🇧🇷', label: 'Brasil' },
  { code: '351', flag: '🇵🇹', label: 'Portugal' },
  { code: '1', flag: '🇺🇸', label: 'EUA' },
  { code: '54', flag: '🇦🇷', label: 'Argentina' },
  { code: '598', flag: '🇺🇾', label: 'Uruguai' },
  { code: '595', flag: '🇵🇾', label: 'Paraguai' },
  { code: '56', flag: '🇨🇱', label: 'Chile' },
  { code: '34', flag: '🇪🇸', label: 'Espanha' },
];

export const FONTS: FormTheme['font'][] = ['system', 'Inter', 'Poppins', 'Montserrat', 'Lato'];

export const fontFamily = (f: FormTheme['font']) =>
  f === 'system' ? 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : `"${f}", ui-sans-serif, system-ui, sans-serif`;

/** URL https segura para imagens/links configurados pela agência. */
export const safeUrl = (u?: string): string | undefined => {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch { return undefined; }
};
