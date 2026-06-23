import { create } from 'zustand';
import { supabaseAuth, supabaseData, setDataSession, adminApi } from '../lib/supabase';
import type { User, UserRole } from '../types';

interface AuthState {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  initialized: boolean;
  usersError: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'createdAt'>, password: string) => Promise<User>;
  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>, newPassword?: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  initAuth: () => Promise<void>;
  loadUsers: () => Promise<void>;
  syncSession: (rawUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at?: string }) => void;
}

const metaToUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at?: string }): User => {
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    name: (meta.name as string) || u.email?.split('@')[0] || 'Usuário',
    email: u.email || '',
    role: ((meta.role as string) || 'admin') as UserRole,
    permissions: meta.permissions !== undefined ? (meta.permissions as string[]) : undefined,
    professionalId: meta.professionalId as string | undefined,
    active: true,
    createdAt: u.created_at || new Date().toISOString(),
    companyId: (meta.company_id as string) || undefined,
    isSuperAdmin: meta.super_admin === true,
  };
};

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  users: [],
  loading: true,
  initialized: false,
  usersError: null,

  initAuth: async () => {
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (session?.user) {
        set({ currentUser: metaToUser(session.user) });
      }
      if (session) {
        await setDataSession(session.access_token, session.refresh_token);
      }
    } catch (e) {
      console.error('initAuth error:', e);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  // Queries the user_profiles table directly — no Edge Function needed for listing.
  // RLS on user_profiles filters by company_id automatically.
  loadUsers: async () => {
    const me = useAuthStore.getState().currentUser;
    if (me?.isSuperAdmin) { set({ users: [], usersError: null }); return; }
    if (!me?.companyId) { set({ users: [], usersError: null }); return; }

    const { data, error } = await supabaseData
      .from('user_profiles')
      .select('*')
      .eq('company_id', me.companyId)
      .order('created_at');

    if (error) {
      set({ usersError: error.message });
      return;
    }

    const users: User[] = (data || []).map(row => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      role: row.role as UserRole,
      permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : undefined,
      professionalId: row.professional_id as string | undefined,
      active: (row.active as boolean) ?? true,
      createdAt: row.created_at as string,
      companyId: row.company_id as string,
    }));
    set({ users, usersError: null });
  },

  login: async (email, password) => {
    const timeout = <T>(ms: number): Promise<T> =>
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms));

    try {
      const { data, error } = await Promise.race([
        supabaseAuth.auth.signInWithPassword({ email, password }),
        timeout<never>(10000),
      ]);
      if (error || !data.user) return error?.message || 'Credenciais inválidas';

      if (data.session) {
        await setDataSession(data.session.access_token, data.session.refresh_token);
      }

      const currentUser = metaToUser(data.user);
      set({ currentUser });
      return null;
    } catch (e) {
      console.error('[login] erro:', e);
      return String(e);
    }
  },

  logout: async () => {
    set({ currentUser: null, users: [] });
    await supabaseAuth.auth.signOut();
  },

  addUser: async (userData, password) => {
    const me = useAuthStore.getState().currentUser;
    const companyId = userData.companyId || me?.companyId;

    const { data: authData, error } = await adminApi.createUser({
      email: userData.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: userData.name,
        role: userData.role,
        ...(companyId ? { company_id: companyId } : {}),
        ...(userData.role !== 'admin' && { permissions: userData.permissions || [] }),
      },
    });
    if (error || !authData?.user) throw new Error(error?.message || 'Failed to create user');

    const newUser: User = {
      id: authData.user.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      active: userData.active ?? true,
      permissions: userData.role !== 'admin' ? (userData.permissions || []) : undefined,
      createdAt: authData.user.created_at || new Date().toISOString(),
      companyId,
    };

    // Fire-and-forget insert into user_profiles — does not block user creation
    if (companyId) {
      supabaseData.from('user_profiles').insert({
        id: newUser.id,
        company_id: companyId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions ?? null,
        active: newUser.active,
      }).then(({ error }) => { if (error) console.error('[addUser.profile]', error); });
    }

    set(state => ({ users: [...state.users, newUser] }));
    return newUser;
  },

  updateUser: async (id, updates, newPassword) => {
    const meta: Record<string, unknown> = {};
    if (updates.name !== undefined) meta.name = updates.name;
    if (updates.role !== undefined) meta.role = updates.role;
    if (updates.permissions !== undefined) meta.permissions = updates.permissions;
    if (updates.professionalId !== undefined) meta.professionalId = updates.professionalId;

    await adminApi.updateUserById(id, {
      ...(newPassword ? { password: newPassword } : {}),
      ...(Object.keys(meta).length > 0 ? { user_metadata: meta } : {}),
    });

    // Keep user_profiles in sync
    const profileUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) profileUpdates.name = updates.name;
    if (updates.role !== undefined) profileUpdates.role = updates.role;
    if (updates.permissions !== undefined) profileUpdates.permissions = updates.permissions;
    if (updates.professionalId !== undefined) profileUpdates.professional_id = updates.professionalId;
    if (Object.keys(profileUpdates).length > 0) {
      supabaseData.from('user_profiles').update(profileUpdates).eq('id', id)
        .then(({ error }) => { if (error) console.error('[updateUser.profile]', error); });
    }

    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...updates } : state.currentUser,
    }));
  },

  deleteUser: async (id) => {
    await adminApi.deleteUser(id);
    supabaseData.from('user_profiles').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[deleteUser.profile]', error); });
    set(state => ({ users: state.users.filter(u => u.id !== id) }));
  },

  syncSession: (rawUser) => {
    set({ currentUser: metaToUser(rawUser) });
  },
}));

export type { AuthState };
export const { getState: getAuthState } = useAuthStore;
