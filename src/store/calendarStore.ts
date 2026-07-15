import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { CalendarEvent, Priority } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyDelete, companyFetchAll, assertCompanyData } from '../lib/companyIsolation';
import { scheduleInitRetry } from '../lib/initRetry';

interface CalendarState {
  events: CalendarEvent[];
  loading: boolean;
  init: () => Promise<void>;
  addEvent: (d: Omit<CalendarEvent, 'id' | 'createdAt'>) => CalendarEvent;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  getEvent: (id: string) => CalendarEvent | undefined;
}

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  events: [],
  loading: false,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ events: [], loading: false }); return; }
    set({ loading: true });
    const { rows } = await companyFetchAll('calendar_events', cid, 'date');
    if (rows === null) {
      // Falha mesmo após retries — MANTÉM os dados atuais e tenta de novo em 30s.
      set({ loading: false });
      scheduleInitRetry('calendar', () => useCalendarStore.getState().init());
      return;
    }
    const records = rows.map(r => fromDb<CalendarEvent>(r));
    set({ events: assertCompanyData(records, cid, 'calendar_events'), loading: false });
  },

  addEvent: (data) => {
    const cid = getCompanyId();
    const newEvent: CalendarEvent = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    if (!cid) return newEvent;
    set(state => ({ events: [...state.events, newEvent] }));
    const dbRow = toDb({ ...newEvent } as unknown as Record<string, unknown>);
    if (!dbRow.end_date) dbRow.end_date = null;
    supabase.from('calendar_events').insert(companyRow(dbRow, cid))
      .then(({ error }) => { if (error) console.error('[calendar.insert]', error); });
    return newEvent;
  },

  updateEvent: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({
      events: state.events.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
    companyUpdate('calendar_events', id, toDb(updates as unknown as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[calendar.update]', error); });
  },

  deleteEvent: (id) => {
    const cid = getCompanyId();
    set(state => ({ events: state.events.filter(e => e.id !== id) }));
    companyDelete('calendar_events', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[calendar.delete]', error); });
  },

  getEvent: (id) => get().events.find(e => e.id === id),
}));

export const CALENDAR_COLORS = [
  { id: 'blue',   label: 'Azul',     dot: 'bg-blue-500',    chip: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { id: 'green',  label: 'Verde',    dot: 'bg-emerald-500', chip: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'orange', label: 'Laranja',  dot: 'bg-orange-500',  chip: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { id: 'red',    label: 'Vermelho', dot: 'bg-red-500',     chip: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { id: 'purple', label: 'Roxo',     dot: 'bg-violet-500',  chip: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  { id: 'pink',   label: 'Rosa',     dot: 'bg-pink-500',    chip: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
] as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-slate-500/20 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-300',
  high: 'bg-orange-500/20 text-orange-300',
  urgent: 'bg-red-500/20 text-red-300',
};
