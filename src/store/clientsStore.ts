import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Client } from '../types';
import { useAuthStore } from './authStore';

const getCompanyId = () => useAuthStore.getState().currentUser?.companyId ?? null;

interface ClientsState {
  clients: Client[];
  loading: boolean;
  init: () => Promise<void>;
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Client;
  updateClient: (id: string, updates: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  getClient: (id: string) => Client | undefined;
}

export const useClientsStore = create<ClientsState>()((set, get) => ({
  clients: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const cid = getCompanyId();
    const q = supabase.from('clients').select('*').order('created_at');
    const { data } = await (cid ? q.eq('company_id', cid) : q);
    set({ clients: (data || []).map(r => fromDb<Client>(r as Record<string, unknown>)), loading: false });
  },

  addClient: (data) => {
    const newClient: Client = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ clients: [...state.clients, newClient] }));
    const dbRow = toDb({ ...newClient }) as Record<string, unknown>;
    const cid = getCompanyId();
    if (cid) dbRow.company_id = cid;
    supabase.from('clients').insert(dbRow)
      .then(({ error }) => { if (error) console.error('[clients.insert]', error); });
    return newClient;
  },

  updateClient: (id, updates) => {
    set(state => ({ clients: state.clients.map(c => c.id === id ? { ...c, ...updates } : c) }));
    supabase.from('clients').update(toDb(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[clients.update]', error); });
  },

  deleteClient: (id) => {
    set(state => ({ clients: state.clients.filter(c => c.id !== id) }));
    supabase.from('clients').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[clients.delete]', error); });
  },

  getClient: (id) => get().clients.find(c => c.id === id),
}));
