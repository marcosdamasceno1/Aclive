import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface AuthState {
  currentUser: User | null;
  users: User[];
  passwords: Record<string, string>;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>, password: string) => User;
  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>, newPassword?: string) => void;
  deleteUser: (id: string) => void;
}

const DEFAULT_USERS: User[] = [
  {
    id: 'admin-1',
    name: 'Administrador',
    email: 'admin@agencia.com',
    role: 'admin' as UserRole,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'financial-1',
    name: 'Setor Financeiro',
    email: 'financeiro@agencia.com',
    role: 'financial' as UserRole,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'manager-1',
    name: 'Gestor de Projetos',
    email: 'gestor@agencia.com',
    role: 'manager' as UserRole,
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_PASSWORDS: Record<string, string> = {
  'admin-1': 'admin123',
  'financial-1': 'fin123',
  'manager-1': 'gestor123',
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: DEFAULT_USERS,
      passwords: DEFAULT_PASSWORDS,

      login: (email: string, password: string) => {
        const state = get();
        const user = state.users.find((u) => u.email === email);
        if (!user) return false;
        if (state.passwords[user.id] !== password) return false;
        set({ currentUser: user });
        return true;
      },

      logout: () => {
        set({ currentUser: null });
      },

      addUser: (userData, password) => {
        const newUser: User = {
          ...userData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          users: [...state.users, newUser],
          passwords: { ...state.passwords, [newUser.id]: password },
        }));
        return newUser;
      },

      updateUser: (id, updates, newPassword) => {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
          passwords: newPassword
            ? { ...state.passwords, [id]: newPassword }
            : state.passwords,
        }));
      },

      deleteUser: (id) => {
        set((state) => {
          const newPasswords = { ...state.passwords };
          delete newPasswords[id];
          return {
            users: state.users.filter((u) => u.id !== id),
            passwords: newPasswords,
          };
        });
      },
    }),
    { name: 'auth-store' }
  )
);
