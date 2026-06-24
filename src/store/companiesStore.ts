import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Company } from '../types';

interface CompaniesState {
  companies: Company[];
  loading: boolean;
  setupNeeded: boolean;
  loadError: string | null;
  init: () => Promise<void>;
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => Promise<Company>;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  deleteCompany: (id: string) => Promise<void>;
}

const withTimeout = <T>(promise: PromiseLike<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);

export const useCompaniesStore = create<CompaniesState>()((set) => ({
  companies: [],
  loading: false,
  setupNeeded: false,
  loadError: null,

  init: async () => {
    set({ loading: true, loadError: null });
    try {
      const { data, error } = await withTimeout(
        supabase.from('companies').select('*').order('created_at', { ascending: false }),
        10000,
        'Timeout ao carregar agências — verifique se o Supabase está ativo.'
      );
      if (error) {
        // Only show "setup needed" if the table literally doesn't exist
        const tableNotFound = error.message?.includes('does not exist') || (error as { code?: string }).code === '42P01';
        console.warn('[companies.init]', error.message);
        set({ loading: false, setupNeeded: tableNotFound, loadError: tableNotFound ? null : error.message });
        return;
      }
      set({ companies: (data || []).map(r => fromDb<Company>(r as Record<string, unknown>)), loading: false, setupNeeded: false, loadError: null });
    } catch (e) {
      // Timeout or network error — table may exist; don't show SQL setup instructions
      console.warn('[companies.init timeout]', e);
      set({ loading: false, setupNeeded: false, loadError: String(e) });
    }
  },

  addCompany: async (data) => {
    const newCompany: Company = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    const { data: inserted, error } = await withTimeout(
      supabase.from('companies').insert(toDb({ ...newCompany }) as Record<string, unknown>).select().single(),
      10000,
      'Timeout ao criar agência.'
    );
    if (error) throw new Error(error.message);
    const saved = inserted ? fromDb<Company>(inserted as Record<string, unknown>) : newCompany;
    set(state => ({ companies: [saved, ...state.companies] }));
    return saved;
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
