import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { FinancialMovement, AuditLog } from '../types';
import { useAuthStore } from './authStore';

const getCompanyId = () => useAuthStore.getState().currentUser?.companyId ?? null;

const CATEGORY_KEY = 'financial_custom_categories';

const loadCustomCategories = (): { income: string[]; expense: string[] } => {
  try {
    const raw = localStorage.getItem(CATEGORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { income: [], expense: [] };
};

const saveCustomCategories = (cats: { income: string[]; expense: string[] }) => {
  localStorage.setItem(CATEGORY_KEY, JSON.stringify(cats));
};

interface ManualEntryInput {
  type: 'income' | 'expense';
  category: string;
  description: string;
  value: number;
  date: string;
  createdBy: string;
  notes?: string;
  clientId?: string;
  clientName?: string;
}

interface FinancialState {
  movements: FinancialMovement[];
  auditLog: AuditLog[];
  loading: boolean;
  customCategories: { income: string[]; expense: string[] };
  init: () => Promise<void>;
  registerMovement: (m: Omit<FinancialMovement, 'id'>) => void;
  markAsPaid: (movementId: string, paidBy: string, paidByName: string) => void;
  updateMovementValue: (movementId: string, newValue: number, updatedBy: string, updatedByName: string) => void;
  addManualEntry: (data: ManualEntryInput) => void;
  deleteMovement: (id: string) => void;
  getProfessionalBalance: (professionalId: string) => { pending: number; paid: number; total: number };
  getMovementsByProfessional: (professionalId: string) => FinancialMovement[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'createdAt'>) => void;
  addCustomCategory: (type: 'income' | 'expense', name: string) => void;
}

export const useFinancialStore = create<FinancialState>()((set, get) => ({
  movements: [],
  auditLog: [],
  loading: false,
  customCategories: loadCustomCategories(),

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ movements: [], auditLog: [], loading: false }); return; }
    set({ loading: true });
    const [movementsResult, auditResult] = await Promise.all([
      supabase.from('financial_movements').select('*').order('created_at').eq('company_id', cid),
      supabase.from('audit_logs').select('*').order('created_at').eq('company_id', cid),
    ]);
    set({
      movements: (movementsResult.data || []).map(r => fromDb<FinancialMovement>(r as Record<string, unknown>)),
      auditLog: (auditResult.data || []).map(r => fromDb<AuditLog>(r as Record<string, unknown>)),
      loading: false,
    });
  },

  registerMovement: (data) => {
    const cid = getCompanyId();
    const existing = get().movements.find(m => m.demandId === data.demandId && m.type === 'credit');
    if (existing) return;
    if (!cid) return;

    const newMovement: FinancialMovement = { ...data, id: uuidv4() };
    set(state => ({ movements: [...state.movements, newMovement] }));
    const dbRow = toDb({ ...newMovement }) as Record<string, unknown>;
    if (dbRow.completed_at === '') dbRow.completed_at = null;
    if (dbRow.paid_at === '') dbRow.paid_at = null;
    dbRow.company_id = cid;
    supabase.from('financial_movements').insert(dbRow)
      .then(({ error }) => { if (error) console.error('[financial.registerMovement]', error); });
  },

  markAsPaid: (movementId, paidBy, paidByName) => {
    const state = get();
    const movement = state.movements.find(m => m.id === movementId);
    if (!movement || movement.status === 'paid') return;

    const updates = { status: 'paid' as const, paidAt: new Date().toISOString(), paidBy };
    set(s => ({
      movements: s.movements.map(m => m.id === movementId ? { ...m, ...updates } : m),
    }));
    supabase.from('financial_movements').update(toDb(updates as Record<string, unknown>)).eq('id', movementId)
      .then(({ error }) => { if (error) console.error('[financial.markAsPaid]', error); });

    get().addAuditLog({
      entityType: 'financial',
      entityId: movementId,
      action: 'payment_marked',
      oldValue: 'pending',
      newValue: 'paid',
      userId: paidBy,
      userName: paidByName,
    });
  },

  updateMovementValue: (movementId, newValue, updatedBy, updatedByName) => {
    const state = get();
    const movement = state.movements.find(m => m.id === movementId);
    if (!movement) return;

    const oldValue = movement.value;
    set(s => ({
      movements: s.movements.map(m => m.id === movementId ? { ...m, value: newValue } : m),
    }));
    supabase.from('financial_movements').update({ value: newValue }).eq('id', movementId)
      .then(({ error }) => { if (error) console.error('[financial.updateValue]', error); });

    get().addAuditLog({
      entityType: 'financial',
      entityId: movementId,
      action: 'value_updated',
      oldValue: String(oldValue),
      newValue: String(newValue),
      userId: updatedBy,
      userName: updatedByName,
    });
  },

  addManualEntry: (data) => {
    const cid = getCompanyId();
    if (!cid) return;
    const newEntry: FinancialMovement = {
      id: uuidv4(),
      professionalId: '',
      demandId: '',
      demandTitle: data.description,
      clientId: data.clientId || '',
      clientName: data.clientName || '',
      value: data.value,
      type: data.type,
      status: 'paid',
      completedAt: data.date,
      paidAt: data.date,
      paidBy: data.createdBy,
      notes: data.notes || '',
      category: data.category,
    };
    set(state => ({ movements: [...state.movements, newEntry] }));
    supabase.from('financial_movements').insert({
      id: newEntry.id,
      demand_title: data.description,
      client_id: data.clientId || null,
      client_name: data.clientName || null,
      value: data.value,
      type: data.type,
      status: 'paid',
      completed_at: data.date || null,
      paid_at: data.date || null,
      paid_by: data.createdBy,
      notes: data.notes || null,
      category: data.category,
      company_id: cid,
    } as Record<string, unknown>)
      .then(({ error }) => { if (error) console.error('[financial.addManualEntry]', error); });
  },

  deleteMovement: (id) => {
    set(state => ({ movements: state.movements.filter(m => m.id !== id) }));
    supabase.from('financial_movements').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[financial.delete]', error); });
  },

  getProfessionalBalance: (professionalId) => {
    const movements = get().movements.filter(
      m => m.professionalId === professionalId && m.type === 'credit'
    );
    const pending = movements.filter(m => m.status === 'pending').reduce((sum, m) => sum + m.value, 0);
    const paid = movements.filter(m => m.status === 'paid').reduce((sum, m) => sum + m.value, 0);
    return { pending, paid, total: pending + paid };
  },

  getMovementsByProfessional: (professionalId) => {
    return get().movements.filter(m => m.professionalId === professionalId);
  },

  addAuditLog: (logData) => {
    const cid = getCompanyId();
    const newLog: AuditLog = {
      ...logData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    set(state => ({ auditLog: [...state.auditLog, newLog] }));
    const dbRow = toDb({ ...newLog }) as Record<string, unknown>;
    if (cid) dbRow.company_id = cid;
    supabase.from('audit_logs').insert(dbRow)
      .then(({ error }) => { if (error) console.error('[financial.auditLog]', error); });
  },

  addCustomCategory: (type, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = get().customCategories;
    if (current[type].includes(trimmed)) return;
    const updated = { ...current, [type]: [...current[type], trimmed] };
    saveCustomCategories(updated);
    set({ customCategories: updated });
  },
}));
