import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

// Single client for auth + data — session JWT is automatically included in all
// PostgREST requests, so RLS policies receive the correct auth.jwt() claims.
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sb-auth' },
});

// Alias — all data stores import this; using the same client means no manual
// session sync is needed and the JWT is always current.
export const supabaseData = supabaseAuth;

// Kept for API compatibility — no-ops because the single client manages the
// session automatically.
export const setDataSession = async (_a: string, _r: string): Promise<void> => {};
export const clearDataSession = async (): Promise<void> => {};

// Admin operations via Edge Function (server-side, uses service_role safely)
type RawUser = { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at?: string };

const edgeFn = async (action: string, body: Record<string, unknown> = {}) => {
  const { data, error } = await supabaseAuth.functions.invoke('admin-users', {
    body: { action, ...body },
  });
  return { data, error };
};

export const adminApi = {
  listUsers: async (): Promise<{ data: { users: RawUser[] } | null; error: { message: string } | null }> => {
    const { data, error } = await edgeFn('list');
    if (error) return { data: null, error: { message: error.message } };
    return { data: { users: data?.users ?? [] }, error: data?.error ?? null };
  },

  createUser: async (params: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, unknown>;
  }): Promise<{ data: { user: RawUser } | null; error: { message: string } | null }> => {
    const { data, error } = await edgeFn('create', params as unknown as Record<string, unknown>);
    if (error) return { data: null, error: { message: error.message } };
    if (!data?.user) return { data: null, error: data?.error ?? { message: 'Falha ao criar usuário' } };
    return { data: { user: data.user }, error: null };
  },

  updateUserById: async (
    id: string,
    params: { password?: string; user_metadata?: Record<string, unknown> },
  ): Promise<{ error: { message: string } | null }> => {
    const { data, error } = await edgeFn('update', { id, ...params });
    if (error) return { error: { message: error.message } };
    return { error: data?.error ?? null };
  },

  deleteUser: async (id: string): Promise<{ error: { message: string } | null }> => {
    const { data, error } = await edgeFn('delete', { id });
    if (error) return { error: { message: error.message } };
    return { error: data?.error ?? null };
  },
};
