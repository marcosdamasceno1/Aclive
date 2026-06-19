import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Lead, LeadStatus } from '../types';
import { useAuthStore } from './authStore';

const getCompanyId = () => useAuthStore.getState().currentUser?.companyId ?? null;

interface LeadsState {
  leads: Lead[];
  loading: boolean;
  dbError: string | null;
  init: () => Promise<void>;
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  updateStatus: (id: string, status: LeadStatus) => void;
  deleteLead: (id: string) => void;
  importLeads: (leads: Omit<Lead, 'id' | 'createdAt'>[]) => void;
}

const toDbLead = (lead: Record<string, unknown>): Record<string, unknown> => {
  const row = toDb(lead);
  for (const col of ['phone', 'website', 'address', 'city', 'notes', 'category', 'converted_client_id']) {
    if (row[col] === '' || row[col] === undefined) row[col] = null;
  }
  if (row['rating']       === undefined) row['rating']       = null;
  if (row['review_count'] === undefined) row['review_count'] = null;
  return row;
};

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  loading: false,
  dbError: null,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ leads: [], loading: false, dbError: null }); return; }
    set({ loading: true, dbError: null });
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .eq('company_id', cid);

    if (error) {
      console.error('[leads.init]', error);
      set({ loading: false, dbError: `Tabela não encontrada ou inacessível: ${error.message}` });
      return;
    }

    set({
      leads: (data || []).map(r => fromDb<Lead>(r as Record<string, unknown>)),
      loading: false,
      dbError: null,
    });
  },

  addLead: (data) => {
    const cid = getCompanyId();
    const newLead: Lead = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    if (!cid) return;
    set(state => ({ leads: [newLead, ...state.leads] }));
    const dbRow = toDbLead({ ...newLead } as Record<string, unknown>);
    dbRow.company_id = cid;
    supabase.from('leads').insert(dbRow).then(({ error }) => {
      if (error) {
        console.error('[leads.insert]', error);
        set(state => ({
          leads: state.leads.filter(l => l.id !== newLead.id),
          dbError: `Erro ao salvar lead: ${error.message}`,
        }));
      }
    });
  },

  updateLead: (id, updates) => {
    set(state => ({ leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l) }));
    supabase.from('leads').update(toDbLead(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[leads.update]', error); });
  },

  updateStatus: (id, status) => { get().updateLead(id, { status }); },

  deleteLead: (id) => {
    set(state => ({ leads: state.leads.filter(l => l.id !== id) }));
    supabase.from('leads').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[leads.delete]', error); });
  },

  importLeads: (leadsData) => {
    const cid = getCompanyId();
    if (!cid) return;
    const now = new Date().toISOString();
    const newLeads = leadsData.map(l => ({ ...l, id: uuidv4(), createdAt: now }));
    set(state => ({ leads: [...newLeads, ...state.leads] }));
    supabase.from('leads').insert(
      newLeads.map(l => { const row = toDbLead({ ...l } as Record<string, unknown>); row.company_id = cid; return row; })
    ).then(({ error }) => {
      if (error) {
        console.error('[leads.import]', error);
        const ids = new Set(newLeads.map(l => l.id));
        set(state => ({
          leads: state.leads.filter(l => !ids.has(l.id)),
          dbError: `Erro ao importar leads: ${error.message}`,
        }));
      }
    });
  },
}));
