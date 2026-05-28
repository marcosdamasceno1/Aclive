import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Demand, KanbanStatus, Comment } from '../types';

interface DemandsState {
  demands: Demand[];
  loading: boolean;
  init: () => Promise<void>;
  addDemand: (d: Omit<Demand, 'id' | 'createdAt' | 'financialRegistered' | 'comments'>) => Demand;
  updateDemand: (id: string, updates: Partial<Demand>) => void;
  moveDemand: (id: string, newStatus: KanbanStatus) => void;
  deleteDemand: (id: string) => void;
  addComment: (demandId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => void;
  getDemand: (id: string) => Demand | undefined;
}

export const useDemandsStore = create<DemandsState>()((set, get) => ({
  demands: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const { data } = await supabase.from('demands').select('*').order('created_at');
    set({ demands: (data || []).map(r => fromDb<Demand>(r as Record<string, unknown>)), loading: false });
  },

  addDemand: (data) => {
    const newDemand: Demand = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      financialRegistered: false,
      comments: [],
    };
    set(state => ({ demands: [...state.demands, newDemand] }));
    supabase.from('demands').insert(toDb({ ...newDemand }) as Record<string, unknown>)
      .then(({ error }) => { if (error) console.error('[demands.insert]', error); });
    return newDemand;
  },

  updateDemand: (id, updates) => {
    set(state => ({
      demands: state.demands.map(d => d.id === id ? { ...d, ...updates } : d),
    }));
    supabase.from('demands').update(toDb(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[demands.update]', error); });
  },

  moveDemand: (id, newStatus) => {
    const demands = get().demands;
    const demand = demands.find(d => d.id === id);
    if (!demand) return;

    const updates: Partial<Demand> = { status: newStatus };
    if (newStatus === 'completed' && !demand.completedAt) {
      updates.completedAt = new Date().toISOString();
      updates.financialRegistered = true;
    }

    set(state => ({
      demands: state.demands.map(d => d.id === id ? { ...d, ...updates } : d),
    }));
    supabase.from('demands').update(toDb(updates as Record<string, unknown>)).eq('id', id)
      .then(({ error }) => { if (error) console.error('[demands.move]', error); });
  },

  deleteDemand: (id) => {
    set(state => ({ demands: state.demands.filter(d => d.id !== id) }));
    supabase.from('demands').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[demands.delete]', error); });
  },

  addComment: (demandId, commentData) => {
    const newComment: Comment = {
      ...commentData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    const demands = get().demands;
    const demand = demands.find(d => d.id === demandId);
    if (!demand) return;

    const updatedComments = [...demand.comments, newComment];
    set(state => ({
      demands: state.demands.map(d =>
        d.id === demandId ? { ...d, comments: updatedComments } : d
      ),
    }));
    supabase.from('demands').update({ comments: updatedComments }).eq('id', demandId)
      .then(({ error }) => { if (error) console.error('[demands.comment]', error); });
  },

  getDemand: (id) => get().demands.find(d => d.id === id),
}));
