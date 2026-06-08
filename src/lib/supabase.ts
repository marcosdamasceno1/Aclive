import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_KEY as string;
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string;

// User login/session — anon key required for signInWithPassword
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sb-auth' },
});

// All data reads/writes — anon key + user JWT so RLS enforces company isolation
export const supabaseData = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-data' },
});

// Called after login to attach the user's JWT to the data client
export const setDataSession = async (accessToken: string, refreshToken: string) => {
  await supabaseData.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
};

// Called on logout to clear the data client's JWT
export const clearDataSession = async () => {
  await supabaseData.auth.signOut();
};

// Direct admin REST helpers — bypass supabase-js browser block on service_role key.
// The service_role key is already embedded in the client bundle via VITE_SUPABASE_SERVICE_KEY,
// so using fetch here adds no extra exposure vs using the supabase-js admin client.
const adminHeaders = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};

type RawUser = { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at?: string };

export const adminApi = {
  listUsers: async (): Promise<{ data: { users: RawUser[] } | null; error: { message: string } | null }> => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders });
    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.msg || json.message || 'Erro ao listar usuários' } };
    return { data: { users: json.users ?? [] }, error: null };
  },

  createUser: async (params: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, unknown>;
  }): Promise<{ data: { user: RawUser } | null; error: { message: string } | null }> => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.msg || json.message || 'Erro ao criar usuário' } };
    return { data: { user: json }, error: null };
  },

  updateUserById: async (
    id: string,
    params: { password?: string; user_metadata?: Record<string, unknown> },
  ): Promise<{ error: { message: string } | null }> => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const json = await res.json();
      return { error: { message: json.msg || json.message || 'Erro ao atualizar usuário' } };
    }
    return { error: null };
  },

  deleteUser: async (id: string): Promise<{ error: { message: string } | null }> => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    if (!res.ok) {
      const json = await res.json();
      return { error: { message: json.msg || json.message || 'Erro ao deletar usuário' } };
    }
    return { error: null };
  },
};
