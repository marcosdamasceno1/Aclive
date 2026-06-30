import { create } from 'zustand';
import { supabaseData } from '../lib/supabase';
import { useAuthStore } from './authStore';
import { requestGoogleTokenSilent } from '../lib/googleDrive';
import type { WhatsAppProvider } from '../utils/whatsapp';

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
  loading: false,

  init: async () => {
    const cid = companyId();
    if (!cid) return;
    set({ loading: true });
    const { data } = await supabaseData
      .from('company_settings')
      .select(
        'google_client_id, google_access_token, google_token_expiry, ' +
        'whatsapp_provider, meta_access_token, meta_phone_number_id, meta_template_name',
      )
      .eq('company_id', cid)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    set({
      googleClientId:    (row?.google_client_id    as string) || '',
      googleAccessToken: (row?.google_access_token as string) || null,
      googleTokenExpiry: (row?.google_token_expiry as string) || null,
      whatsappProvider:  ((row?.whatsapp_provider  as WhatsAppProvider) || 'zapi'),
      metaAccessToken:   (row?.meta_access_token   as string) || '',
      metaPhoneNumberId: (row?.meta_phone_number_id as string) || '',
      metaTemplateName:  (row?.meta_template_name  as string) || 'nova_demanda',
      loading: false,
    });
  },

  // ── Drive ──────────────────────────────────────────────────────────────────

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

  // ── WhatsApp ───────────────────────────────────────────────────────────────

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
}));
