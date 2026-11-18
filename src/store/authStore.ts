import { create } from 'zustand';
import { supabaseAuth, supabaseData, setDataSession, adminApi } from '../lib/supabase';
import type { RawUser } from '../lib/supabase';
import { performLogout, getValidSession, resumeAutoRefresh } from '../lib/authSession';
import { scheduleInitRetry } from '../lib/initRetry';
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
  syncSession: (rawUser: RawUser) => void;
}

// Agência, papel e permissões vêm do app_metadata, que só o servidor grava.
// O user_metadata pode ser alterado pelo próprio usuário: dele só o nome.
const metaToUser = (u: RawUser): User => {
  const meta = u.user_metadata || {};
  const app = u.app_metadata || {};
  return {
    id: u.id,
    name: (meta.name as string) || u.email?.split('@')[0] || 'Usuário',
    email: u.email || '',
    role: ((app.role as string) || 'professional') as UserRole,
    permissions: Array.isArray(app.permissions) ? (app.permissions as string[]) : undefined,
    professionalId: (app.professional_id as string) || undefined,
    active: true,
    createdAt: u.created_at || new Date().toISOString(),
    companyId: (app.company_id as string) || undefined,
    isSuperAdmin: app.super_admin === true,
  };
};

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  users: [],
  loading: true,
  initialized: false,
  usersError: null,

  // ── Inicialização ────────────────────────────────────────────────────────
  // Toda a lógica de validação de sessão está em src/lib/authSession.ts.
  initAuth: async () => {
    try {
      const user = await getValidSession();
      if (user) set({ currentUser: metaToUser(user) });
    } catch (e) {
      console.error('initAuth error:', e);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  // ── Logout ───────────────────────────────────────────────────────────────
  // Toda a lógica de limpeza de sessão está em src/lib/authSession.ts.
  logout: async () => {
    await performLogout();
    set({ currentUser: null, users: [] });
  },

  // ── Login ────────────────────────────────────────────────────────────────
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

      resumeAutoRefresh(); // religa o timer desligado pelo performLogout()
      set({ currentUser: metaToUser(data.user) });
      return null;
    } catch (e) {
      console.error('[login] erro:', e);
      return String(e);
    }
  },

  // ── Usuários ─────────────────────────────────────────────────────────────
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
      // Falha — MANTÉM a lista atual de usuários e tenta de novo em 30s.
      set({ usersError: error.message });
      scheduleInitRetry('users', () => useAuthStore.getState().loadUsers());
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

  addUser: async (userData, password) => {
    const me = useAuthStore.getState().currentUser;
    const companyId = userData.companyId || me?.companyId;

    // A Edge Function cria a conta e o perfil; para quem não é super admin,
    // ela ignora o companyId enviado e usa a agência de quem está criando.
    const { data: authData, error } = await adminApi.createUser({
      email: userData.email,
      password,
      name: userData.name,
      role: userData.role,
      permissions: userData.role !== 'admin' ? (userData.permissions || []) : undefined,
      companyId,
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

    set(state => ({ users: [...state.users, newUser] }));
    return newUser;
  },

  updateUser: async (id, updates, newPassword) => {
    const { error } = await adminApi.updateUser(id, {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.permissions !== undefined ? { permissions: updates.permissions } : {}),
      ...(updates.professionalId !== undefined ? { professionalId: updates.professionalId } : {}),
      ...(newPassword ? { password: newPassword } : {}),
    });
    if (error) throw new Error(error.message);

    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...updates } : state.currentUser,
    }));
  },

  deleteUser: async (id) => {
    const { error } = await adminApi.deleteUser(id);
    if (error) throw new Error(error.message);
    set(state => ({ users: state.users.filter(u => u.id !== id) }));
  },

  syncSession: (rawUser) => {
    set({ currentUser: metaToUser(rawUser) });
  },
}));

export type { AuthState };
export const { getState: getAuthState } = useAuthStore;
