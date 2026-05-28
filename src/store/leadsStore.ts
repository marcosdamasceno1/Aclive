import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Lead, LeadStatus } from '../types';

interface LeadsState {
  leads: Lead[];
  loading: boolean;
  init: () => Promise<void>;
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  updateStatus: (id: string, status: LeadStatus) => void;
  deleteLead: (id: string) => void;
  importLeads: (leads: Omit<Lead, 'id' | 'createdAt'>[]) => void;
}

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    set({
      leads: (data || []).map(r => fromDb<Lead>(r as Record<string, unknown>)),
      loading: false,
    });
  },

  addLead: (data) => {
    const newLead: Lead = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ leads: [newLead, ...state.leads] }));
    supabase.from('leads').insert(toDb({ ...newLead }) as Record<string, unknown>);
  },

  updateLead: (id, updates) => {
    set(state => ({
      leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l),
    }));
    supabase.from('leads').update(toDb(updates as Record<string, unknown>)).eq('id', id);
  },

  updateStatus: (id, status) => {
    get().updateLead(id, { status });
  },

  deleteLead: (id) => {
    set(state => ({ leads: state.leads.filter(l => l.id !== id) }));
    supabase.from('leads').delete().eq('id', id);
  },

  importLeads: (leadsData) => {
    const now = new Date().toISOString();
    const newLeads = leadsData.map(l => ({ ...l, id: uuidv4(), createdAt: now }));
    set(state => ({ leads: [...newLeads, ...state.leads] }));
    supabase.from('leads').insert(newLeads.map(l => toDb({ ...l }) as Record<string, unknown>));
  },
}));
