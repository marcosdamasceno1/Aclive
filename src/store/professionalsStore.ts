import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Professional } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companySelect, assertCompanyData } from '../lib/companyIsolation';

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
    const cid = getCompanyId();
    if (!cid) { set({ professionals: [], loading: false }); return; }
    set({ loading: true });
    const { data } = await companySelect('professionals', cid).order('created_at');
    const records = (data || []).map(r => fromDb<Professional>(r as Record<string, unknown>));
    set({ professionals: assertCompanyData(records, cid, 'professionals'), loading: false });
  },

  addProfessional: (data) => {
    const cid = getCompanyId();
    const newPro: Professional = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    if (!cid) return newPro;
    set(state => ({ professionals: [...state.professionals, newPro] }));
    supabase.from('professionals').insert(companyRow(toDb({ ...newPro }) as Record<string, unknown>, cid))
      .then(({ error }) => { if (error) console.error('[professionals.insert]', error); });
    return newPro;
  },

  updateProfessional: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({ professionals: state.professionals.map(p => p.id === id ? { ...p, ...updates } : p) }));
    companyUpdate('professionals', id, toDb(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[professionals.update]', error); });
  },

  deleteProfessional: (id) => {
    const cid = getCompanyId();
    set(state => ({ professionals: state.professionals.filter(p => p.id !== id) }));
    companyDelete('professionals', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[professionals.delete]', error); });
  },

  getProfessional: (id) => get().professionals.find(p => p.id === id),
}));
