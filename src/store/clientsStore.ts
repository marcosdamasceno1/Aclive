import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Client } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ClientsState {
  clients: Client[];
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Client;
  updateClient: (id: string, updates: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  getClient: (id: string) => Client | undefined;
}

export const useClientsStore = create<ClientsState>()(
  persist(
    (set, get) => ({
      clients: [],

      addClient: (data) => {
        const newClient: Client = {
          ...data,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ clients: [...state.clients, newClient] }));
        return newClient;
      },

      updateClient: (id, updates) => {
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
      },

      deleteClient: (id) => {
        set((state) => ({
          clients: state.clients.filter((c) => c.id !== id),
        }));
      },

      getClient: (id) => get().clients.find((c) => c.id === id),
    }),
    { name: 'clients-store' }
  )
);
