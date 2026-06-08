import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_KEY as string;
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string;

// Auth admin only — createUser, deleteUser, listUsers (needs service_role)
export const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Login / session management
export const supabaseAuth = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// All data reads/writes — uses anon key so Supabase RLS enforces company isolation
export const supabaseData = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Called after login to attach the user's JWT to the data client
export const setDataSession = async (accessToken: string, refreshToken: string) => {
  await supabaseData.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
};

// Called on logout to clear the data client's JWT
export const clearDataSession = async () => {
  await supabaseData.auth.signOut();
};
