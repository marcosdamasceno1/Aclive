import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set, get) => ({
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
          // Keep localStorage data intact — do not overwrite on error
          set({ loading: false, dbError: error.message });
          return;
        }

        const fromSupabase = data.map(r => fromDb<Lead>(r as Record<string, unknown>));
        const supabaseIds  = new Set(fromSupabase.map(l => l.id));

        // Leads that exist in localStorage but never made it to Supabase
        const orphaned = get().leads.filter(l => !supabaseIds.has(l.id));

        // Merge: Supabase is authoritative + recover any orphaned local leads
        set({
          leads: [...fromSupabase, ...orphaned],
          loading: false,
          dbError: null,
        });

        // Re-sync orphaned leads to Supabase (fire and forget)
        if (orphaned.length > 0) {
          console.warn(`[leads.init] ${orphaned.length} lead(s) orphaned — re-syncing to Supabase`);
          supabase
            .from('leads')
            .upsert(orphaned.map(l => toDbLead({ ...l } as Record<string, unknown>)))
            .then(({ error: syncErr }) => {
              if (syncErr) {
                console.error('[leads.sync]', syncErr);
                set({ dbError: syncErr.message });
              } else {
                console.log('[leads.sync] orphaned leads re-synced');
              }
            });
        }
      },

      addLead: async (data) => {
        const newLead: Lead = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
        // Optimistic update — persist middleware saves to localStorage immediately
        set(state => ({ leads: [newLead, ...state.leads] }));

        const { error } = await supabase
          .from('leads')
          .upsert(toDbLead({ ...newLead } as Record<string, unknown>));

        if (error) {
          console.error('[leads.insert]', error);
          // Keep in localStorage even if Supabase fails — init() will re-sync later
          set({ dbError: error.message });
        }
      },

      updateLead: (id, updates) => {
        set(state => ({ leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l) }));
        supabase
          .from('leads')
          .update(toDbLead(updates as Record<string, unknown>))
          .eq('id', id)
          .then(({ error }) => { if (error) console.error('[leads.update]', error); });
      },

      updateStatus: (id, status) => { get().updateLead(id, { status }); },

      deleteLead: (id) => {
        set(state => ({ leads: state.leads.filter(l => l.id !== id) }));
        supabase
          .from('leads')
          .delete()
          .eq('id', id)
          .then(({ error }) => { if (error) console.error('[leads.delete]', error); });
      },

      importLeads: async (leadsData) => {
        const now = new Date().toISOString();
        const newLeads = leadsData.map(l => ({ ...l, id: uuidv4(), createdAt: now }));
        set(state => ({ leads: [...newLeads, ...state.leads] }));

        const { error } = await supabase
          .from('leads')
          .upsert(newLeads.map(l => toDbLead({ ...l } as Record<string, unknown>)));

        if (error) {
          console.error('[leads.importLeads]', error);
          set({ dbError: error.message });
        }
      },
    }),
    {
      name: 'ge_leads',
      partialize: (state) => ({ leads: state.leads }),
    }
  )
);
