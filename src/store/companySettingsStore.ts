import { create } from 'zustand';
import { supabaseData } from '../lib/supabase';
import { useAuthStore } from './authStore';
import { requestGoogleTokenSilent } from '../lib/googleDrive';
import type { WhatsAppProvider } from '../utils/whatsapp';
import type { KanbanStage } from '../types';

export const DEFAULT_KANBAN_STAGES: KanbanStage[] = [
  { id: 'new',         label: 'Nova',      icon: '🚀', color: 'text-slate-300' },
  { id: 'briefing',    label: 'Briefing',  icon: '📋', color: 'text-blue-400' },
  { id: 'production',  label: 'Produção',  icon: '⚡', color: 'text-indigo-400' },
  { id: 'review',      label: 'Revisão',   icon: '🔍', color: 'text-purple-400' },
  { id: 'adjustments', label: 'Ajustes',   icon: '🔧', color: 'text-orange-400' },
  { id: 'approved',    label: 'Aprovado',  icon: '✅', color: 'text-green-400' },
  { id: 'completed',   label: 'Concluído', icon: '🎯', color: 'text-emerald-400', triggersFinancial: true, isTerminal: true },
  { id: 'paid',        label: 'Pago',      icon: '💰', color: 'text-slate-500', isTerminal: true },
];

// Colunas padrão do quadro de Demandas (organização de gargalos).
export const DEFAULT_BOARD_STAGES: KanbanStage[] = [
  { id: 'backlog',  label: 'Backlog',      icon: '📥', color: 'text-slate-300' },
  { id: 'todo',     label: 'A Fazer',      icon: '📌', color: 'text-blue-400' },
  { id: 'doing',    label: 'Em Andamento', icon: '⚡', color: 'text-indigo-400' },
  { id: 'blocked',  label: 'Bloqueado',    icon: '🚧', color: 'text-red-400' },
  { id: 'done',     label: 'Concluído',    icon: '✅', color: 'text-green-400' },
];

interface CompanySettingsState {
  googleClientId: string;
  googleAccessToken: string | null;
  googleTokenExpiry: string | null;
  whatsappProvider: WhatsAppProvider;
  metaAccessToken: string;
  metaPhoneNumberId: string;
  metaTemplateName: string;
  metaLeadsPageId: string;
  metaLeadsPageToken: string;
  metaLeadsVerifyToken: string;
  kanbanStages: KanbanStage[];
  demandBoardStages: KanbanStage[];
  loading: boolean;

  init: () => Promise<void>;
  saveClientId: (clientId: string) => Promise<void>;
  saveToken: (token: string, expiresIn: number) => Promise<void>;
  clearToken: () => Promise<void>;
  isConnected: () => boolean;
  minutesUntilExpiry: () => number;
  tryAutoRefresh: () => Promise<boolean>;
  saveWhatsappProvider: (provider: WhatsAppProvider) => Promise<void>;
  saveMetaConfig: (accessToken: string, phoneNumberId: string, templateName: string) => Promise<void>;
  clearMetaConfig: () => Promise<void>;
  saveMetaLeadsConfig: (pageId: string, pageToken: string, verifyToken: string) => Promise<void>;
  clearMetaLeadsConfig: () => Promise<void>;
  saveKanbanStages: (stages: KanbanStage[]) => Promise<string | null>;
  saveDemandBoardStages: (stages: KanbanStage[]) => Promise<string | null>;
}

const companyId = () => useAuthStore.getState().currentUser?.companyId;

type UpsertResult = { error: { message: string } | null };

/**
 * Grava em company_settings de forma que NUNCA trava a UI:
 * - resolve sempre (converte rejeições de rede em { error })
 * - tem timeout de 7s — se o banco não responder, devolve erro em vez de
 *   deixar o await pendente para sempre (causa raiz do "Salvando..." infinito)
 * - se não houver company_id, não tenta gravar
 */
const upsert = (patch: Record<string, unknown>): Promise<UpsertResult> => {
  const cid = companyId();
  if (!cid) return Promise.resolve({ error: { message: 'sem company_id' } });

  const query = supabaseData
    .from('company_settings')
    .upsert(
      { company_id: cid, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'company_id' },
    );

  return Promise.race<UpsertResult>([
    Promise.resolve(query)
      .then(({ error }) => ({ error: error ? { message: error.message } : null }))
      .catch((e) => ({ error: { message: String(e) } })),
    new Promise<UpsertResult>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'timeout ao gravar configurações' } }), 7000),
    ),
  ]);
};

export const useCompanySettingsStore = create<CompanySettingsState>()((set, get) => ({
  googleClientId: '',
  googleAccessToken: null,
  googleTokenExpiry: null,
  whatsappProvider: 'waha',
  metaAccessToken: '',
  metaPhoneNumberId: '',
  metaTemplateName: 'nova_demanda',
  metaLeadsPageId: '',
  metaLeadsPageToken: '',
  metaLeadsVerifyToken: '',
  kanbanStages: DEFAULT_KANBAN_STAGES,
  demandBoardStages: DEFAULT_BOARD_STAGES,
  loading: false,

  init: async () => {
    const cid = companyId();
    if (!cid) return;
    set({ loading: true });
    const { data, error } = await supabaseData
      .from('company_settings')
      .select('*')
      .eq('company_id', cid)
      .maybeSingle();
    if (error) {
      console.error('[company-settings.init]', error.message);
      set({ loading: false });
      return;
    }
    const row = data as Record<string, unknown> | null;
    set({
      googleClientId:       (row?.google_client_id        as string) || '',
      googleAccessToken:    (row?.google_access_token     as string) || null,
      googleTokenExpiry:    (row?.google_token_expiry     as string) || null,
      // Valor legado 'zapi' no banco vira 'waha' (Z-API foi descontinuada)
      whatsappProvider:     (row?.whatsapp_provider === 'meta' ? 'meta' : 'waha') as WhatsAppProvider,
      metaAccessToken:      (row?.meta_access_token       as string) || '',
      metaPhoneNumberId:    (row?.meta_phone_number_id    as string) || '',
      metaTemplateName:     (row?.meta_template_name      as string) || 'nova_demanda',
      metaLeadsPageId:      (row?.meta_leads_page_id      as string) || '',
      metaLeadsPageToken:   (row?.meta_leads_page_token   as string) || '',
      metaLeadsVerifyToken: (row?.meta_leads_verify_token as string) || '',
      kanbanStages:         (row?.kanban_stages           as KanbanStage[]) || DEFAULT_KANBAN_STAGES,
      demandBoardStages:    (row?.demand_board_stages     as KanbanStage[]) || DEFAULT_BOARD_STAGES,
      loading: false,
    });
  },

  saveClientId: async (clientId) => {
    set({ googleClientId: clientId });
    await upsert({ google_client_id: clientId });
  },

  saveToken: async (token, expiresIn) => {
    const expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
    set({ googleAccessToken: token, googleTokenExpiry: expiry });
    await upsert({ google_access_token: token, google_token_expiry: expiry });
  },

  clearToken: async () => {
    set({ googleAccessToken: null, googleTokenExpiry: null });
    await upsert({ google_access_token: null, google_token_expiry: null });
  },

  isConnected: () => {
    const { googleAccessToken, googleTokenExpiry } = get();
    if (!googleAccessToken || !googleTokenExpiry) return false;
    return new Date(googleTokenExpiry) > new Date();
  },

  minutesUntilExpiry: () => {
    const { googleTokenExpiry } = get();
    if (!googleTokenExpiry) return -1;
    return Math.floor((new Date(googleTokenExpiry).getTime() - Date.now()) / 60000);
  },

  tryAutoRefresh: () => new Promise<boolean>((resolve) => {
    const { googleClientId, saveToken } = get();
    if (!googleClientId) { resolve(false); return; }
    requestGoogleTokenSilent(
      googleClientId,
      async (token, expiresIn) => { await saveToken(token, expiresIn); resolve(true); },
      () => resolve(false),
    );
    setTimeout(() => resolve(false), 5000);
  }),

  saveWhatsappProvider: async (provider) => {
    set({ whatsappProvider: provider });
    await upsert({ whatsapp_provider: provider });
  },

  saveMetaConfig: async (accessToken, phoneNumberId, templateName) => {
    set({ metaAccessToken: accessToken, metaPhoneNumberId: phoneNumberId, metaTemplateName: templateName });
    await upsert({
      meta_access_token:    accessToken,
      meta_phone_number_id: phoneNumberId,
      meta_template_name:   templateName || 'nova_demanda',
    });
  },

  clearMetaConfig: async () => {
    set({ metaAccessToken: '', metaPhoneNumberId: '', metaTemplateName: 'nova_demanda' });
    await upsert({ meta_access_token: null, meta_phone_number_id: null, meta_template_name: null });
  },

  saveMetaLeadsConfig: async (pageId, pageToken, verifyToken) => {
    set({ metaLeadsPageId: pageId, metaLeadsPageToken: pageToken, metaLeadsVerifyToken: verifyToken });
    await upsert({
      meta_leads_page_id:      pageId,
      meta_leads_page_token:   pageToken,
      meta_leads_verify_token: verifyToken,
    });
  },

  clearMetaLeadsConfig: async () => {
    set({ metaLeadsPageId: '', metaLeadsPageToken: '', metaLeadsVerifyToken: '' });
    await upsert({ meta_leads_page_id: null, meta_leads_page_token: null, meta_leads_verify_token: null });
  },

  saveKanbanStages: async (stages) => {
    set({ kanbanStages: stages }); // otimista — a tela reflete na hora
    const { error } = await upsert({ kanban_stages: stages });
    if (error) console.error('[company-settings.saveKanbanStages]', error.message);
    return error?.message ?? null;
  },

  saveDemandBoardStages: async (stages) => {
    set({ demandBoardStages: stages }); // otimista — a tela reflete na hora
    const { error } = await upsert({ demand_board_stages: stages });
    if (error) console.error('[company-settings.saveDemandBoardStages]', error.message);
    return error?.message ?? null;
  },
}));
