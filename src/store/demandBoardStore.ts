import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { DemandCard } from '../types';
import {
  getCompanyId, companyRow, companyUpdate, companyDelete, companySelect, assertCompanyData,
} from '../lib/companyIsolation';

interface DemandBoardState {
  cards: DemandCard[];
  loading: boolean;
  dbError: string | null;
  init: () => Promise<void>;
  addCard: (c: Omit<DemandCard, 'id' | 'createdAt'>) => DemandCard;
  updateCard: (id: string, updates: Partial<DemandCard>) => void;
  moveCard: (id: string, columnId: string) => void;
  deleteCard: (id: string) => void;
}

export const useDemandBoardStore = create<DemandBoardState>()((set, get) => ({
  cards: [],
  loading: false,
  dbError: null,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ cards: [], loading: false }); return; }
    set({ loading: true });
    const { data, error } = await companySelect('demand_cards', cid).order('created_at');
    if (error) {
      console.error('[demand_board.init]', error.message);
      set({ loading: false, dbError: error.message });
      return;
    }
    const records = (data || []).map(r => fromDb<DemandCard>(r as Record<string, unknown>));
    set({ cards: assertCompanyData(records, cid, 'demand_cards'), loading: false, dbError: null });
  },

  addCard: (data) => {
    const cid = getCompanyId();
    const newCard: DemandCard = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    if (!cid) return newCard;
    set(state => ({ cards: [...state.cards, newCard] }));
    const dbRow = toDb({ ...newCard }) as Record<string, unknown>;
    supabase.from('demand_cards').insert(companyRow(dbRow, cid))
      .then(({ error }) => { if (error) console.error('[demand_board.insert]', error); });
    return newCard;
  },

  updateCard: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({
      cards: state.cards.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
    companyUpdate('demand_cards', id, toDb(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[demand_board.update]', error); });
  },

  moveCard: (id, columnId) => {
    const cid = getCompanyId();
    set(state => ({
      cards: state.cards.map(c => c.id === id ? { ...c, columnId } : c),
    }));
    companyUpdate('demand_cards', id, { column_id: columnId }, cid ?? '')
      .then(({ error }) => { if (error) console.error('[demand_board.move]', error); });
  },

  deleteCard: (id) => {
    const cid = getCompanyId();
    set(state => ({ cards: state.cards.filter(c => c.id !== id) }));
    companyDelete('demand_cards', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[demand_board.delete]', error); });
  },
}));
