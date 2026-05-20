import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Demand, KanbanStatus, Comment } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DemandsState {
  demands: Demand[];
  addDemand: (d: Omit<Demand, 'id' | 'createdAt' | 'financialRegistered' | 'comments'>) => Demand;
  updateDemand: (id: string, updates: Partial<Demand>) => void;
  moveDemand: (id: string, newStatus: KanbanStatus) => void;
  deleteDemand: (id: string) => void;
  addComment: (demandId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => void;
  getDemand: (id: string) => Demand | undefined;
}

export const useDemandsStore = create<DemandsState>()(
  persist(
    (set, get) => ({
      demands: [],

      addDemand: (data) => {
        const newDemand: Demand = {
          ...data,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          financialRegistered: false,
          comments: [],
        };
        set((state) => ({ demands: [...state.demands, newDemand] }));
        return newDemand;
      },

      updateDemand: (id, updates) => {
        set((state) => ({
          demands: state.demands.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        }));
      },

      moveDemand: (id, newStatus) => {
        set((state) => ({
          demands: state.demands.map((d) => {
            if (d.id !== id) return d;
            const updates: Partial<Demand> = { status: newStatus };
            if (newStatus === 'completed' && !d.completedAt) {
              updates.completedAt = new Date().toISOString();
              updates.financialRegistered = true;
            }
            return { ...d, ...updates };
          }),
        }));
      },

      deleteDemand: (id) => {
        set((state) => ({
          demands: state.demands.filter((d) => d.id !== id),
        }));
      },

      addComment: (demandId, commentData) => {
        const newComment: Comment = {
          ...commentData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          demands: state.demands.map((d) =>
            d.id === demandId
              ? { ...d, comments: [...d.comments, newComment] }
              : d
          ),
        }));
      },

      getDemand: (id) => get().demands.find((d) => d.id === id),
    }),
    { name: 'demands-store' }
  )
);
