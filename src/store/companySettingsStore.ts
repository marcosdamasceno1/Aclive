import { create } from 'zustand';
import { supabaseData } from '../lib/supabase';
import { useAuthStore } from './authStore';
import { requestGoogleTokenSilent } from '../lib/googleDrive';

interface CompanySettingsState {
  googleClientId: string;
  googleAccessToken: string | null;
  googleTokenExpiry: string | null;
  loading: boolean;
  init: () => Promise<void>;
  saveClientId: (clientId: string) => Promise<void>;
  saveToken: (token: string, expiresIn: number) => Promise<void>;
  clearToken: () => Promise<void>;
  isConnected: () => boolean;
  minutesUntilExpiry: () => number;
  tryAutoRefresh: () => Promise<boolean>;
}

const companyId = () => useAuthStore.getState().currentUser?.companyId;

const upsert = (patch: Record<string, unknown>) =>
  supabaseData
    .from('company_settings')
    .upsert({ company_id: companyId(), ...patch, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });

export const useCompanySettingsStore = create<CompanySettingsState>()((set, get) => ({
  googleClientId: '',
  googleAccessToken: null,
  googleTokenExpiry: null,
  loading: false,

  init: async () => {
    const cid = companyId();
    if (!cid) return;
    set({ loading: true });
    const { data } = await supabaseData
      .from('company_settings')
      .select('google_client_id, google_access_token, google_token_expiry')
      .eq('company_id', cid)
      .maybeSingle();
    set({
      googleClientId: (data?.google_client_id as string) || '',
      googleAccessToken: (data?.google_access_token as string) || null,
      googleTokenExpiry: (data?.google_token_expiry as string) || null,
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
      async (token, expiresIn) => {
        await saveToken(token, expiresIn);
        resolve(true);
      },
      () => resolve(false),
    );
    // Timeout de segurança: GIS às vezes não chama callback em caso de falha silenciosa
    setTimeout(() => resolve(false), 5000);
  }),
}));
