import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Demand, KanbanStatus, Comment } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companySelect, assertCompanyData } from '../lib/companyIsolation';

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
    const cid = getCompanyId();
    if (!cid) { set({ demands: [], loading: false }); return; }
    set({ loading: true });
    const { data } = await companySelect('demands', cid).order('created_at');
    const records = (data || []).map(r => fromDb<Demand>(r as Record<string, unknown>));
    set({ demands: assertCompanyData(records, cid, 'demands'), loading: false });
  },

  addDemand: (data) => {
    const cid = getCompanyId();
    const newDemand: Demand = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      financialRegistered: false,
      comments: [],
    };
    if (!cid) return newDemand;
    set(state => ({ demands: [...state.demands, newDemand] }));
    const dbRow = toDb({ ...newDemand }) as Record<string, unknown>;
    if (dbRow.deadline === '') dbRow.deadline = null;
    if (dbRow.completed_at === '') dbRow.completed_at = null;
    supabase.from('demands').insert(companyRow(dbRow, cid))
      .then(({ error }) => { if (error) console.error('[demands.insert]', error); });
    return newDemand;
  },

  updateDemand: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({
      demands: state.demands.map(d => d.id === id ? { ...d, ...updates } : d),
    }));
    const dbRow = toDb(updates as Record<string, unknown>) as Record<string, unknown>;
    if (dbRow.deadline === '') dbRow.deadline = null;
    if (dbRow.completed_at === '') dbRow.completed_at = null;
    companyUpdate('demands', id, dbRow, cid ?? '')
      .then(({ error }) => { if (error) console.error('[demands.update]', error); });
  },

  moveDemand: (id, newStatus) => {
    const cid = getCompanyId();
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
    companyUpdate('demands', id, toDb(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[demands.move]', error); });
  },

  deleteDemand: (id) => {
    const cid = getCompanyId();
    set(state => ({ demands: state.demands.filter(d => d.id !== id) }));
    companyDelete('demands', id, cid ?? '')
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
