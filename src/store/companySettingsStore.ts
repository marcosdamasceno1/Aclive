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

// ── localStorage cache helpers ─────────────────────────────────────────────────
// Persists settings locally so F5 never shows empty state while DB loads.

type CachedSettings = {
  googleClientId: string;
  whatsappProvider: WhatsAppProvider;
  metaAccessToken: string;
  metaPhoneNumberId: string;
  metaTemplateName: string;
  metaLeadsPageId: string;
  metaLeadsPageToken: string;
  metaLeadsVerifyToken: string;
  kanbanStages: KanbanStage[];
};

const cacheKey = (cid: string) => `aclive_cs_${cid}`;

function readCache(cid: string): CachedSettings | null {
  try {
    const raw = localStorage.getItem(cacheKey(cid));
    return raw ? (JSON.parse(raw) as CachedSettings) : null;
  } catch { return null; }
}

function writeCache(cid: string, s: CachedSettings) {
  try { localStorage.setItem(cacheKey(cid), JSON.stringify(s)); } catch {}
}

export function clearSettingsCache(cid: string) {
  try { localStorage.removeItem(cacheKey(cid)); } catch {}
}

// ──────────────────────────────────────────────────────────────────────────────

interface CompanySettingsState {
  // Google Drive
  googleClientId: string;
  googleAccessToken: string | null;
  googleTokenExpiry: string | null;
  // WhatsApp
  whatsappProvider: WhatsAppProvider;
  metaAccessToken: string;
  metaPhoneNumberId: string;
  metaTemplateName: string;
  // Meta Lead Ads
  metaLeadsPageId: string;
  metaLeadsPageToken: string;
  metaLeadsVerifyToken: string;
  // Kanban stages
  kanbanStages: KanbanStage[];
  // misc
  loading: boolean;

  init: () => Promise<void>;

  // Drive
  saveClientId: (clientId: string) => Promise<void>;
  saveToken: (token: string, expiresIn: number) => Promise<void>;
  clearToken: () => Promise<void>;
  isConnected: () => boolean;
  minutesUntilExpiry: () => number;
  tryAutoRefresh: () => Promise<boolean>;

  // WhatsApp
  saveWhatsappProvider: (provider: WhatsAppProvider) => Promise<void>;
  saveMetaConfig: (accessToken: string, phoneNumberId: string, templateName: string) => Promise<void>;
  clearMetaConfig: () => Promise<void>;

  // Meta Lead Ads
  saveMetaLeadsConfig: (pageId: string, pageToken: string, verifyToken: string) => Promise<void>;
  clearMetaLeadsConfig: () => Promise<void>;

  // Kanban
  saveKanbanStages: (stages: KanbanStage[]) => Promise<void>;
}

const companyId = () => useAuthStore.getState().currentUser?.companyId;

const upsert = (patch: Record<string, unknown>) =>
  supabaseData
    .from('company_settings')
    .upsert(
      { company_id: companyId(), ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'company_id' },
    );

export const useCompanySettingsStore = create<CompanySettingsState>()((set, get) => ({
  googleClientId: '',
  googleAccessToken: null,
  googleTokenExpiry: null,
  whatsappProvider: 'zapi',
  metaAccessToken: '',
  metaPhoneNumberId: '',
  metaTemplateName: 'nova_demanda',
  metaLeadsPageId: '',
  metaLeadsPageToken: '',
  metaLeadsVerifyToken: '',
  kanbanStages: DEFAULT_KANBAN_STAGES,
  loading: false,

  init: async () => {
    const cid = companyId();
    if (!cid) return;

    // ── Apply cached settings instantly so UI is never empty on F5 ──────────
    const cached = readCache(cid);
    if (cached) {
      set({
        googleClientId:    cached.googleClientId    || '',
        whatsappProvider:  cached.whatsappProvider  || 'zapi',
        metaAccessToken:   cached.metaAccessToken   || '',
        metaPhoneNumberId: cached.metaPhoneNumberId || '',
        metaTemplateName:  cached.metaTemplateName  || 'nova_demanda',
        metaLeadsPageId:   cached.metaLeadsPageId   || '',
        metaLeadsPageToken: cached.metaLeadsPageToken || '',
        metaLeadsVerifyToken: cached.metaLeadsVerifyToken || '',
        kanbanStages:      cached.kanbanStages?.length ? cached.kanbanStages : DEFAULT_KANBAN_STAGES,
      });
    }

    set({ loading: true });

    // ── Fetch fresh from DB (overwrites cache values if successful) ──────────
    const { data, error } = await supabaseData
      .from('company_settings')
      .select('*')
      .eq('company_id', cid)
      .maybeSingle();

    if (error) {
      console.error('[company-settings.init]', error);
      set({ loading: false });
      return; // keep whatever we loaded from cache above
    }

    const row = data as Record<string, unknown> | null;

    const fresh: CachedSettings = {
      googleClientId:       (row?.google_client_id       as string) || '',
      whatsappProvider:     ((row?.whatsapp_provider     as WhatsAppProvider) || 'zapi'),
      metaAccessToken:      (row?.meta_access_token      as string) || '',
      metaPhoneNumberId:    (row?.meta_phone_number_id   as string) || '',
      metaTemplateName:     (row?.meta_template_name     as string) || 'nova_demanda',
      metaLeadsPageId:      (row?.meta_leads_page_id     as string) || '',
      metaLeadsPageToken:   (row?.meta_leads_page_token  as string) || '',
      metaLeadsVerifyToken: (row?.meta_leads_verify_token as string) || '',
      kanbanStages:         (row?.kanban_stages as KanbanStage[]) || DEFAULT_KANBAN_STAGES,
    };

    set({
      ...fresh,
      googleAccessToken:  (row?.google_access_token  as string) || null,
      googleTokenExpiry:  (row?.google_token_expiry  as string) || null,
      loading: false,
    });

    // Persist to localStorage for the next F5
    writeCache(cid, fresh);
  },

  // ── Drive ──────────────────────────────────────────────────────────────────

  saveClientId: async (clientId) => {
    set({ googleClientId: clientId });
    await upsert({ google_client_id: clientId });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), googleClientId: clientId });
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

  // ── WhatsApp ───────────────────────────────────────────────────────────────

  saveWhatsappProvider: async (provider) => {
    set({ whatsappProvider: provider });
    await upsert({ whatsapp_provider: provider });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), whatsappProvider: provider });
  },

  saveMetaConfig: async (accessToken, phoneNumberId, templateName) => {
    set({ metaAccessToken: accessToken, metaPhoneNumberId: phoneNumberId, metaTemplateName: templateName });
    await upsert({
      meta_access_token:    accessToken,
      meta_phone_number_id: phoneNumberId,
      meta_template_name:   templateName || 'nova_demanda',
    });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), metaAccessToken: accessToken, metaPhoneNumberId: phoneNumberId, metaTemplateName: templateName });
  },

  clearMetaConfig: async () => {
    set({ metaAccessToken: '', metaPhoneNumberId: '', metaTemplateName: 'nova_demanda' });
    await upsert({ meta_access_token: null, meta_phone_number_id: null, meta_template_name: null });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), metaAccessToken: '', metaPhoneNumberId: '', metaTemplateName: 'nova_demanda' });
  },

  // ── Meta Lead Ads ──────────────────────────────────────────────────────────

  saveMetaLeadsConfig: async (pageId, pageToken, verifyToken) => {
    set({ metaLeadsPageId: pageId, metaLeadsPageToken: pageToken, metaLeadsVerifyToken: verifyToken });
    await upsert({
      meta_leads_page_id:      pageId,
      meta_leads_page_token:   pageToken,
      meta_leads_verify_token: verifyToken,
    });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), metaLeadsPageId: pageId, metaLeadsPageToken: pageToken, metaLeadsVerifyToken: verifyToken });
  },

  clearMetaLeadsConfig: async () => {
    set({ metaLeadsPageId: '', metaLeadsPageToken: '', metaLeadsVerifyToken: '' });
    await upsert({ meta_leads_page_id: null, meta_leads_page_token: null, meta_leads_verify_token: null });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), metaLeadsPageId: '', metaLeadsPageToken: '', metaLeadsVerifyToken: '' });
  },

  // ── Kanban stages ──────────────────────────────────────────────────────────

  saveKanbanStages: async (stages) => {
    set({ kanbanStages: stages });
    await upsert({ kanban_stages: stages });
    const cid = companyId();
    if (cid) writeCache(cid, { ...buildCache(get()), kanbanStages: stages });
  },
}));

// Helper: snapshot current state into the cacheable shape
function buildCache(s: CompanySettingsState): CachedSettings {
  return {
    googleClientId:       s.googleClientId,
    whatsappProvider:     s.whatsappProvider,
    metaAccessToken:      s.metaAccessToken,
    metaPhoneNumberId:    s.metaPhoneNumberId,
    metaTemplateName:     s.metaTemplateName,
    metaLeadsPageId:      s.metaLeadsPageId,
    metaLeadsPageToken:   s.metaLeadsPageToken,
    metaLeadsVerifyToken: s.metaLeadsVerifyToken,
    kanbanStages:         s.kanbanStages,
  };
}
