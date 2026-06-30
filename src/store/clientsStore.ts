import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Client } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companySelect, assertCompanyData } from '../lib/companyIsolation';

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
    const cid = getCompanyId();
    if (!cid) { set({ clients: [], loading: false }); return; }
    set({ loading: true });
    const { data } = await companySelect('clients', cid).order('created_at');
    const records = (data || []).map(r => fromDb<Client>(r as Record<string, unknown>));
    set({ clients: assertCompanyData(records, cid, 'clients'), loading: false });
  },

  addClient: (data) => {
    const cid = getCompanyId();
    const newClient: Client = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    if (!cid) return newClient;
    set(state => ({ clients: [...state.clients, newClient] }));
    supabase.from('clients').insert(companyRow(toDb({ ...newClient }) as Record<string, unknown>, cid))
      .then(({ error }) => { if (error) console.error('[clients.insert]', error); });
    return newClient;
  },

  updateClient: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({ clients: state.clients.map(c => c.id === id ? { ...c, ...updates } : c) }));
    companyUpdate('clients', id, toDb(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[clients.update]', error); });
  },

  deleteClient: (id) => {
    const cid = getCompanyId();
    set(state => ({ clients: state.clients.filter(c => c.id !== id) }));
    companyDelete('clients', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[clients.delete]', error); });
  },

  getClient: (id) => get().clients.find(c => c.id === id),
}));
