import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Lead, LeadStatus } from '../types';

interface LeadsState {
  leads: Lead[];
  loading: boolean;
  dbError: string | null;
  init: () => Promise<void>;
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  updateStatus: (id: string, status: LeadStatus) => void;
  deleteLead: (id: string) => void;
  importLeads: (leads: Omit<Lead, 'id' | 'createdAt'>[]) => Promise<void>;
}

const toDbLead = (lead: Record<string, unknown>): Record<string, unknown> => {
  const row = toDb(lead);
  for (const col of ['phone', 'website', 'address', 'city', 'notes', 'category', 'converted_client_id']) {
    if (row[col] === '' || row[col] === undefined) row[col] = null;
  }
  for (const col of ['rating', 'review_count']) {
    if (row[col] === undefined) row[col] = null;
  }
  return row;
};

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  loading: false,
  dbError: null,

  init: async () => {
    set({ loading: true, dbError: null });
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[leads.init]', error);
      // Do NOT wipe in-memory leads on error — preserve what's already there
      set({ loading: false, dbError: error.message });
      return;
    }

    set({
      leads: data.map(r => fromDb<Lead>(r as Record<string, unknown>)),
      loading: false,
      dbError: null,
    });
  },

  addLead: async (data) => {
    const newLead: Lead = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ leads: [newLead, ...state.leads] }));

    const { error } = await supabase
      .from('leads')
      .insert(toDbLead({ ...newLead } as Record<string, unknown>));

    if (error) {
      console.error('[leads.insert]', error);
      // Roll back optimistic update and expose error
      set(state => ({
        leads: state.leads.filter(l => l.id !== newLead.id),
        dbError: error.message,
      }));
    }
  },

  updateLead: (id, updates) => {
    set(state => ({
      leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l),
    }));
    supabase
      .from('leads')
      .update(toDbLead(updates as Record<string, unknown>))
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[leads.update]', error);
      });
  },

  updateStatus: (id, status) => {
    get().updateLead(id, { status });
  },

  deleteLead: (id) => {
    set(state => ({ leads: state.leads.filter(l => l.id !== id) }));
    supabase
      .from('leads')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[leads.delete]', error);
      });
  },

  importLeads: async (leadsData) => {
    const now = new Date().toISOString();
    const newLeads = leadsData.map(l => ({ ...l, id: uuidv4(), createdAt: now }));
    set(state => ({ leads: [...newLeads, ...state.leads] }));

    const { error } = await supabase
      .from('leads')
      .insert(newLeads.map(l => toDbLead({ ...l } as Record<string, unknown>)));

    if (error) {
      console.error('[leads.importLeads]', error);
      const ids = new Set(newLeads.map(l => l.id));
      set(state => ({
        leads: state.leads.filter(l => !ids.has(l.id)),
        dbError: error.message,
      }));
    }
  },
}));
