import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Client } from '../types';

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
    const { data } = await supabase.from('clients').select('*').order('created_at');
    set({ clients: (data || []).map(r => fromDb<Client>(r as Record<string, unknown>)), loading: false });
  },

  addClient: (data) => {
    const newClient: Client = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ clients: [...state.clients, newClient] }));
    supabase.from('clients').insert(toDb({ ...newClient }) as Record<string, unknown>)
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
