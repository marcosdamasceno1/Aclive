import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Lead, LeadStatus } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companyFetchAll, assertCompanyData } from '../lib/companyIsolation';
import { scheduleInitRetry } from '../lib/initRetry';

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
  for (const col of ['email', 'phone', 'website', 'address', 'city', 'notes', 'category', 'converted_client_id']) {
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
    const { rows, error } = await companyFetchAll('leads', cid, 'created_at', false);
    if (rows === null) {
      // Falha mesmo após retries — MANTÉM os leads atuais e tenta de novo em 30s.
      set({ loading: false, dbError: `Não foi possível carregar os leads: ${error}` });
      scheduleInitRetry('leads', () => useLeadsStore.getState().init());
      return;
    }
    const records = rows.map(r => fromDb<Lead>(r));
    set({ leads: assertCompanyData(records, cid, 'leads'), loading: false, dbError: null });
  },

  addLead: (data) => {
    const cid = getCompanyId();
    const newLead: Lead = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    if (!cid) return;
    set(state => ({ leads: [newLead, ...state.leads] }));
    supabase.from('leads').insert(companyRow(toDbLead({ ...newLead } as Record<string, unknown>), cid)).then(({ error }) => {
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
    const cid = getCompanyId();
    set(state => ({ leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l) }));
    companyUpdate('leads', id, toDbLead(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[leads.update]', error); });
  },

  updateStatus: (id, status) => { get().updateLead(id, { status }); },

  deleteLead: (id) => {
    const cid = getCompanyId();
    set(state => ({ leads: state.leads.filter(l => l.id !== id) }));
    companyDelete('leads', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[leads.delete]', error); });
  },

  importLeads: (leadsData) => {
    const cid = getCompanyId();
    if (!cid) return;
    const now = new Date().toISOString();
    const newLeads = leadsData.map(l => ({ ...l, id: uuidv4(), createdAt: now }));
    set(state => ({ leads: [...newLeads, ...state.leads] }));
    supabase.from('leads').insert(
      newLeads.map(l => companyRow(toDbLead({ ...l } as Record<string, unknown>), cid))
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
