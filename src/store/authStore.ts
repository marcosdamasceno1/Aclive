import { create } from 'zustand';
import { supabase, supabaseAuth } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { User, UserRole } from '../types';

interface AuthState {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'createdAt'>, password: string) => Promise<User>;
  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>, newPassword?: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  initAuth: () => Promise<void>;
  loadUsers: () => Promise<void>;
}

// Suppress unused import warning
void (undefined as unknown as UserRole);

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  loading: true,
  initialized: false,

  initAuth: async () => {
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata || {};
        set({
          currentUser: {
            id: u.id,
            name: (meta.name as string) || u.email?.split('@')[0] || 'Usuário',
            email: u.email || '',
            role: ((meta.role as string) || 'admin') as import('../types').UserRole,
            createdAt: u.created_at || new Date().toISOString(),
            active: true,
          },
        });
      }
    } catch (e) {
      console.error('initAuth error:', e);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  loadUsers: async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    if (data) {
      set({ users: data.map(r => fromDb<User>(r as Record<string, unknown>)) });
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
      if (error || !data.user) return false;

      const meta = data.user.user_metadata || {};
      const currentUser: User = {
        id: data.user.id,
        name: (meta.name as string) || data.user.email?.split('@')[0] || 'Usuário',
        email: data.user.email || email,
        role: ((meta.role as string) || 'admin') as import('../types').UserRole,
        createdAt: data.user.created_at || new Date().toISOString(),
        active: true,
      };
      console.log('[login] currentUser:', currentUser);
      set({ currentUser });
      return true;
    } catch (e) {
      console.error('[login] erro:', e);
      return false;
    }
  },

  logout: async () => {
    await supabaseAuth.auth.signOut();
    set({ currentUser: null });
  },

  addUser: async (userData, password) => {
    const { data: authData, error } = await supabase.auth.admin.createUser({
      email: userData.email,
      password,
      email_confirm: true,
    });
    if (error || !authData.user) throw new Error(error?.message || 'Failed to create user');

    const profile = {
      id: authData.user.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      professional_id: userData.professionalId || null,
      active: userData.active ?? true,
      created_at: new Date().toISOString(),
    };
    await supabase.from('profiles').insert(profile);
    const newUser = fromDb<User>(profile as unknown as Record<string, unknown>);
    set(state => ({ users: [...state.users, newUser] }));
    return newUser;
  },

  updateUser: async (id, updates, newPassword) => {
    if (newPassword) {
      await supabase.auth.admin.updateUserById(id, { password: newPassword });
    }
    const dbUpdates = toDb(updates as Record<string, unknown>);
    await supabase.from('profiles').update(dbUpdates).eq('id', id);
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...updates } : state.currentUser,
    }));
  },

  deleteUser: async (id) => {
    await supabase.auth.admin.deleteUser(id);
    await supabase.from('profiles').delete().eq('id', id);
    set(state => ({ users: state.users.filter(u => u.id !== id) }));
  },
}));

// Re-export for convenience
export type { AuthState };
export const { getState: getAuthState } = useAuthStore;
