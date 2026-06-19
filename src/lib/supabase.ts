import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co';
// Public anon key — safe to hardcode in client-side code (Supabase design intent)
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5reHllY2R4Z2F4cG5lemZqa2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzgzMTEsImV4cCI6MjA5NTI1NDMxMX0.norNo8ksplzq99jXD27iOYrbVcZuaCJ2XCpEIO2TIr0';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EdgeResult = { data: any; error: any };

const edgeFn = async (action: string, body: Record<string, unknown> = {}): Promise<EdgeResult> => {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Edge Function não respondeu (timeout 20s). Verifique se o projeto Supabase está ativo.')), 20000)
  );
  try {
    return await Promise.race([
      supabaseAuth.functions.invoke('admin-users', { body: { action, ...body } }),
      timer,
    ]) as EdgeResult;
  } catch (e) {
    return { data: null, error: { message: String(e) } };
  }
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
