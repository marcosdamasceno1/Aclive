import { create } from 'zustand';
import { supabaseAuth, setDataSession, adminApi } from '../lib/supabase';
import type { User, UserRole } from '../types';

interface AuthState {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  initialized: boolean;
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

  loadUsers: async () => {
    const { data, error } = await adminApi.listUsers();
    if (!error && data?.users) {
      const me = useAuthStore.getState().currentUser;
      const all = data.users.map(u => metaToUser(u));
      // Super admin sees no users in Settings (agency users only visible in Master panel)
      if (me?.isSuperAdmin) {
        set({ users: [] });
      } else {
        set({ users: all.filter(u => u.companyId === me?.companyId) });
      }
    }
  },

  login: async (email, password) => {
    const timeout = <T>(ms: number): Promise<T> =>
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms));

    try {
      console.log('[login] chamando signInWithPassword...');
      const { data, error } = await Promise.race([
        supabaseAuth.auth.signInWithPassword({ email, password }),
        timeout<never>(10000),
      ]);
      console.log('[login] auth result:', { userId: data?.user?.id, error: error?.message });
      if (error || !data.user) return error?.message || 'Credenciais inválidas';

      if (data.session) {
        await setDataSession(data.session.access_token, data.session.refresh_token);
      }

      const currentUser = metaToUser(data.user);
      console.log('[login] currentUser:', currentUser);
      set({ currentUser });
      return null;
    } catch (e) {
      console.error('[login] erro:', e);
      return String(e);
    }
  },

  logout: async () => {
    await supabaseAuth.auth.signOut();
    set({ currentUser: null });
  },

  addUser: async (userData, password) => {
    const me = useAuthStore.getState().currentUser;
    const { data: authData, error } = await adminApi.createUser({
      email: userData.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: userData.name,
        role: userData.role,
        ...(userData.companyId ? { company_id: userData.companyId } : me?.companyId ? { company_id: me.companyId } : {}),
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
      companyId: userData.companyId || me?.companyId,
    };
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
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...updates } : state.currentUser,
    }));
  },

  deleteUser: async (id) => {
    await adminApi.deleteUser(id);
    set(state => ({ users: state.users.filter(u => u.id !== id) }));
  },

  syncSession: (rawUser) => {
    set({ currentUser: metaToUser(rawUser) });
  },
}));

export type { AuthState };
export const { getState: getAuthState } = useAuthStore;
