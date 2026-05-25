import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Professional } from '../types';

interface ProfessionalsState {
  professionals: Professional[];
  loading: boolean;
  init: () => Promise<void>;
  addProfessional: (p: Omit<Professional, 'id' | 'createdAt'>) => Professional;
  updateProfessional: (id: string, updates: Partial<Professional>) => void;
  deleteProfessional: (id: string) => void;
  getProfessional: (id: string) => Professional | undefined;
}

export const useProfessionalsStore = create<ProfessionalsState>()((set, get) => ({
  professionals: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const { data } = await supabase.from('professionals').select('*').order('created_at');
    set({ professionals: (data || []).map(r => fromDb<Professional>(r as Record<string, unknown>)), loading: false });
  },

  addProfessional: (data) => {
    const newPro: Professional = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ professionals: [...state.professionals, newPro] }));
    supabase.from('professionals').insert(toDb({ ...newPro }) as Record<string, unknown>);
    return newPro;
  },

  updateProfessional: (id, updates) => {
    set(state => ({ professionals: state.professionals.map(p => p.id === id ? { ...p, ...updates } : p) }));
    supabase.from('professionals').update(toDb(updates as Record<string, unknown>)).eq('id', id);
  },

  deleteProfessional: (id) => {
    set(state => ({ professionals: state.professionals.filter(p => p.id !== id) }));
    supabase.from('professionals').delete().eq('id', id);
  },

  getProfessional: (id) => get().professionals.find(p => p.id === id),
}));
