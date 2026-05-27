import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import type { FinancialMovement, AuditLog } from '../types';

interface ManualEntryInput {
  type: 'income' | 'expense';
  category: string;
  description: string;
  value: number;
  date: string;
  createdBy: string;
}

interface FinancialState {
  movements: FinancialMovement[];
  auditLog: AuditLog[];
  loading: boolean;
  init: () => Promise<void>;
  registerMovement: (m: Omit<FinancialMovement, 'id'>) => void;
  markAsPaid: (movementId: string, paidBy: string, paidByName: string) => void;
  updateMovementValue: (movementId: string, newValue: number, updatedBy: string, updatedByName: string) => void;
  addManualEntry: (data: ManualEntryInput) => void;
  deleteMovement: (id: string) => void;
  getProfessionalBalance: (professionalId: string) => { pending: number; paid: number; total: number };
  getMovementsByProfessional: (professionalId: string) => FinancialMovement[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'createdAt'>) => void;
}

export const useFinancialStore = create<FinancialState>()((set, get) => ({
  movements: [],
  auditLog: [],
  loading: false,

  init: async () => {
    set({ loading: true });
    const [movementsResult, auditResult] = await Promise.all([
      supabase.from('financial_movements').select('*').order('created_at'),
      supabase.from('audit_logs').select('*').order('created_at'),
    ]);
    set({
      movements: (movementsResult.data || []).map(r => fromDb<FinancialMovement>(r as Record<string, unknown>)),
      auditLog: (auditResult.data || []).map(r => fromDb<AuditLog>(r as Record<string, unknown>)),
      loading: false,
    });
  },

  registerMovement: (data) => {
    // Deduplication: check local state first
    const existing = get().movements.find(m => m.demandId === data.demandId && m.type === 'credit');
    if (existing) return;

    const newMovement: FinancialMovement = { ...data, id: uuidv4() };
    set(state => ({ movements: [...state.movements, newMovement] }));
    supabase.from('financial_movements').insert(toDb({ ...newMovement }) as Record<string, unknown>);
  },

  markAsPaid: (movementId, paidBy, paidByName) => {
    const state = get();
    const movement = state.movements.find(m => m.id === movementId);
    if (!movement || movement.status === 'paid') return;

    const updates = { status: 'paid' as const, paidAt: new Date().toISOString(), paidBy };
    set(s => ({
      movements: s.movements.map(m => m.id === movementId ? { ...m, ...updates } : m),
    }));
    supabase.from('financial_movements').update(toDb(updates as Record<string, unknown>)).eq('id', movementId);

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
    const updates = { value: newValue };
    set(s => ({
      movements: s.movements.map(m => m.id === movementId ? { ...m, ...updates } : m),
    }));
    supabase.from('financial_movements').update(updates).eq('id', movementId);

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
    const newEntry: FinancialMovement = {
      id: uuidv4(),
      professionalId: '',
      demandId: '',
      demandTitle: data.description,
      clientId: '',
      clientName: data.category,
      value: data.value,
      type: data.type,
      status: 'paid',
      completedAt: data.date,
      paidAt: data.date,
      paidBy: data.createdBy,
      category: data.category,
    };
    set(state => ({ movements: [...state.movements, newEntry] }));
    supabase.from('financial_movements').insert({
      id: newEntry.id,
      demand_title: data.description,
      client_name: data.category,
      category: data.category,
      value: data.value,
      type: data.type,
      status: 'paid',
      completed_at: data.date,
      paid_at: data.date,
      paid_by: data.createdBy,
    } as Record<string, unknown>);
  },

  deleteMovement: (id) => {
    set(state => ({ movements: state.movements.filter(m => m.id !== id) }));
    supabase.from('financial_movements').delete().eq('id', id);
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
    const newLog: AuditLog = {
      ...logData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    set(state => ({ auditLog: [...state.auditLog, newLog] }));
    supabase.from('audit_logs').insert(toDb({ ...newLog }) as Record<string, unknown>);
  },
}));
