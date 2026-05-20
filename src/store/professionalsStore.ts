import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Professional } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ProfessionalsState {
  professionals: Professional[];
  addProfessional: (p: Omit<Professional, 'id' | 'createdAt'>) => Professional;
  updateProfessional: (id: string, updates: Partial<Professional>) => void;
  deleteProfessional: (id: string) => void;
  getProfessional: (id: string) => Professional | undefined;
}

export const useProfessionalsStore = create<ProfessionalsState>()(
  persist(
    (set, get) => ({
      professionals: [],

      addProfessional: (data) => {
        const newPro: Professional = {
          ...data,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ professionals: [...state.professionals, newPro] }));
        return newPro;
      },

      updateProfessional: (id, updates) => {
        set((state) => ({
          professionals: state.professionals.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      deleteProfessional: (id) => {
        set((state) => ({
          professionals: state.professionals.filter((p) => p.id !== id),
        }));
      },

      getProfessional: (id) => {
        return get().professionals.find((p) => p.id === id);
      },
    }),
    { name: 'professionals-store' }
  )
);
