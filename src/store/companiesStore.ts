import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Company } from '../types';

interface CompaniesState {
  companies: Company[];
  loading: boolean;
  init: () => Promise<void>;
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => Promise<Company>;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  deleteCompany: (id: string) => Promise<void>;
}

export const useCompaniesStore = create<CompaniesState>()((set) => ({
  companies: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    set({ companies: (data || []).map(r => fromDb<Company>(r as Record<string, unknown>)), loading: false });
  },

  addCompany: async (data) => {
    const newCompany: Company = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    const { error } = await supabase.from('companies').insert(toDb({ ...newCompany }) as Record<string, unknown>);
    if (error) throw new Error(error.message);
    set(state => ({ companies: [newCompany, ...state.companies] }));
    return newCompany;
  },

  updateCompany: (id, updates) => {
    set(state => ({ companies: state.companies.map(c => c.id === id ? { ...c, ...updates } : c) }));
    supabase.from('companies').update(toDb(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[companies.update]', error); });
  },

  deleteCompany: async (id) => {
    set(state => ({ companies: state.companies.filter(c => c.id !== id) }));
    await supabase.from('companies').delete().eq('id', id);
  },
}));
