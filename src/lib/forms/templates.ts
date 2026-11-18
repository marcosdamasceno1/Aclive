import { defaultConfig, newQuestion, uid, type FormConfig, type Question } from './schema';

const choice = (title: string, labels: string[], dqIndexes: number[] = [], description?: string): Question => ({
  ...newQuestion('single_choice'),
  title,
  description,
  options: labels.map((label, i) => ({ id: uid(), label, action: dqIndexes.includes(i) ? 'disqualify' as const : 'continue' as const })),
});

export interface FormTemplate { key: string; name: string; description: string; build: () => FormConfig }

export const TEMPLATES: FormTemplate[] = [
  {
    key: 'blank',
    name: 'Em branco',
    description: 'Nome e WhatsApp para começar; monte o resto do seu jeito.',
    build: () => defaultConfig(),
  },
  {
    key: 'qualify',
    name: 'Qualificação de empresa',
    description: 'Nome, empresa, WhatsApp e faturamento. Faturamento baixo desqualifica.',
    build: () => {
      const c = defaultConfig();
      c.welcome = {
        enabled: true,
        title: 'Quer mais clientes chegando todo mês?',
        subtitle: 'Responda 5 perguntas rápidas e um especialista vai analisar o seu caso.',
        bullets: ['✅ Diagnóstico gratuito', '📈 Estratégia sob medida', '⏱ Leva menos de 1 minuto'],
        buttonText: 'Preciso de especialistas',
      };
      c.questions = [
        { ...newQuestion('name') },
        { ...newQuestion('short_text'), title: 'Qual é o nome da sua empresa?', description: 'Ex.: Drogaria Saúde Popular', placeholder: 'Nome da empresa' },
        { ...newQuestion('phone') },
        choice('Qual o faturamento mensal da empresa?', ['Até R$ 20 mil', 'De R$ 20 mil a R$ 50 mil', 'De R$ 50 mil a R$ 100 mil', 'Acima de R$ 100 mil'], [0], 'Usamos para indicar o plano certo.'),
        choice('Você já investe em anúncios?', ['Sim, todo mês', 'Já investi, mas parei', 'Nunca investi']),
      ];
      return c;
    },
  },
  {
    key: 'quote',
    name: 'Pedido de orçamento',
    description: 'Serviço desejado, prazo, contato e detalhes do projeto.',
    build: () => {
      const c = defaultConfig();
      c.welcome = { enabled: true, title: 'Peça seu orçamento', subtitle: 'Conte o que você precisa e retornamos em até 1 dia útil.', bullets: [], buttonText: 'Começar' };
      c.questions = [
        { ...newQuestion('multi_choice'), title: 'Quais serviços você procura?', options: ['Gestão de tráfego', 'Social media', 'Site / landing page', 'Identidade visual'].map(label => ({ id: uid(), label, action: 'continue' as const })) },
        choice('Para quando você precisa?', ['O quanto antes', 'Neste mês', 'Nos próximos 3 meses', 'Só pesquisando']),
        { ...newQuestion('long_text'), title: 'Conte um pouco sobre o projeto', required: false },
        { ...newQuestion('name') },
        { ...newQuestion('phone') },
        { ...newQuestion('email'), required: false },
      ];
      return c;
    },
  },
  {
    key: 'schedule',
    name: 'Agendamento',
    description: 'Contato, melhor data e período para a conversa.',
    build: () => {
      const c = defaultConfig();
      c.welcome = { enabled: true, title: 'Agende uma conversa', subtitle: 'Escolha o melhor dia e entramos em contato para confirmar.', bullets: [], buttonText: 'Agendar' };
      c.questions = [
        { ...newQuestion('name') },
        { ...newQuestion('phone') },
        { ...newQuestion('date'), title: 'Qual a melhor data?' },
        choice('Qual o melhor período?', ['Manhã', 'Tarde', 'Noite']),
      ];
      c.endings[0] = { ...c.endings[0], title: 'Pedido de agendamento recebido!', text: 'Vamos confirmar o horário pelo WhatsApp.' };
      return c;
    },
  },
];
