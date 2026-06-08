import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Professional } from '../types';
import { useAuthStore } from './authStore';

const getCompanyId = () => useAuthStore.getState().currentUser?.companyId ?? null;

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
    const cid = getCompanyId();
    const q = supabase.from('professionals').select('*').order('created_at');
    const { data } = await (cid ? q.eq('company_id', cid) : q);
    set({ professionals: (data || []).map(r => fromDb<Professional>(r as Record<string, unknown>)), loading: false });
  },

  addProfessional: (data) => {
    const newPro: Professional = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ professionals: [...state.professionals, newPro] }));
    const dbRow = toDb({ ...newPro }) as Record<string, unknown>;
    const cid = getCompanyId();
    if (cid) dbRow.company_id = cid;
    supabase.from('professionals').insert(dbRow)
      .then(({ error }) => { if (error) console.error('[professionals.insert]', error); });
    return newPro;
  },

  updateProfessional: (id, updates) => {
    set(state => ({ professionals: state.professionals.map(p => p.id === id ? { ...p, ...updates } : p) }));
    supabase.from('professionals').update(toDb(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[professionals.update]', error); });
  },

  deleteProfessional: (id) => {
    set(state => ({ professionals: state.professionals.filter(p => p.id !== id) }));
    supabase.from('professionals').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[professionals.delete]', error); });
  },

  getProfessional: (id) => get().professionals.find(p => p.id === id),
}));
