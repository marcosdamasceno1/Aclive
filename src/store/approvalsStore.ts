import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { Approval } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companyFetchAll, assertCompanyData } from '../lib/companyIsolation';
import { scheduleInitRetry } from '../lib/initRetry';

interface ApprovalsState {
  approvals: Approval[];
  loading: boolean;
  init: () => Promise<void>;
  createApproval: (input: {
    demandId: string;
    title: string;
    videoUrl: string;
    captions: { id: string; text: string }[];
    agencyName?: string;
    notifyPhone?: string;
  }) => Approval | null;
  updateApproval: (id: string, updates: Partial<Approval>) => void;
  deleteApproval: (id: string) => void;
  forDemand: (demandId: string) => Approval | undefined;
}

export const useApprovalsStore = create<ApprovalsState>()((set, get) => ({
  approvals: [],
  loading: false,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ approvals: [], loading: false }); return; }
    set({ loading: true });
    const { rows } = await companyFetchAll('approvals', cid, 'created_at', false);
    if (rows === null) {
      set({ loading: false });
      scheduleInitRetry('approvals', () => useApprovalsStore.getState().init());
      return;
    }
    const records = rows.map(r => fromDb<Approval>(r));
    set({ approvals: assertCompanyData(records, cid, 'approvals'), loading: false });
  },

  createApproval: (input) => {
    const cid = getCompanyId();
    if (!cid) return null;
    const approval: Approval = {
      id: uuidv4(),
      demandId: input.demandId,
      token: (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ''),
      title: input.title,
      agencyName: input.agencyName || undefined,
      videoUrl: input.videoUrl || undefined,
      notifyPhone: input.notifyPhone || undefined,
      videoStatus: 'pending',
      captions: input.captions,
      captionStatus: 'pending',
      createdAt: new Date().toISOString(),
    };
    set(state => ({ approvals: [approval, ...state.approvals] }));
    const dbRow = toDb({ ...approval }) as Record<string, unknown>;
    supabase.from('approvals').insert(companyRow(dbRow, cid))
      .then(({ error }) => { if (error) console.error('[approvals.insert]', error.message); });
    return approval;
  },

  updateApproval: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({ approvals: state.approvals.map(a => a.id === id ? { ...a, ...updates } : a) }));
    companyUpdate('approvals', id, toDb(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[approvals.update]', error.message); });
  },

  deleteApproval: (id) => {
    const cid = getCompanyId();
    set(state => ({ approvals: state.approvals.filter(a => a.id !== id) }));
    companyDelete('approvals', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[approvals.delete]', error.message); });
  },

  forDemand: (demandId) => get().approvals.find(a => a.demandId === demandId),
}));
