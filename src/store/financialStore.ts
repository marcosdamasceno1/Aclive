import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FinancialMovement, AuditLog } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface FinancialState {
  movements: FinancialMovement[];
  auditLog: AuditLog[];
  registerMovement: (m: Omit<FinancialMovement, 'id'>) => void;
  markAsPaid: (movementId: string, paidBy: string, paidByName: string) => void;
  updateMovementValue: (movementId: string, newValue: number, updatedBy: string, updatedByName: string) => void;
  getProfessionalBalance: (professionalId: string) => { pending: number; paid: number; total: number };
  getMovementsByProfessional: (professionalId: string) => FinancialMovement[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'createdAt'>) => void;
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set, get) => ({
      movements: [],
      auditLog: [],

      registerMovement: (data) => {
        const state = get();
        const existing = state.movements.find(
          (m) => m.demandId === data.demandId && m.type === 'credit'
        );
        if (existing) return;

        const newMovement: FinancialMovement = { ...data, id: uuidv4() };
        set((state) => ({ movements: [...state.movements, newMovement] }));
      },

      markAsPaid: (movementId, paidBy, paidByName) => {
        const state = get();
        const movement = state.movements.find((m) => m.id === movementId);
        if (!movement || movement.status === 'paid') return;

        set((state) => ({
          movements: state.movements.map((m) =>
            m.id === movementId
              ? { ...m, status: 'paid', paidAt: new Date().toISOString(), paidBy }
              : m
          ),
        }));

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
        const movement = state.movements.find((m) => m.id === movementId);
        if (!movement) return;

        const oldValue = movement.value;
        set((state) => ({
          movements: state.movements.map((m) =>
            m.id === movementId ? { ...m, value: newValue } : m
          ),
        }));

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

      getProfessionalBalance: (professionalId) => {
        const movements = get().movements.filter(
          (m) => m.professionalId === professionalId && m.type === 'credit'
        );
        const pending = movements
          .filter((m) => m.status === 'pending')
          .reduce((sum, m) => sum + m.value, 0);
        const paid = movements
          .filter((m) => m.status === 'paid')
          .reduce((sum, m) => sum + m.value, 0);
        return { pending, paid, total: pending + paid };
      },

      getMovementsByProfessional: (professionalId) => {
        return get().movements.filter((m) => m.professionalId === professionalId);
      },

      addAuditLog: (logData) => {
        const newLog: AuditLog = {
          ...logData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ auditLog: [...state.auditLog, newLog] }));
      },
    }),
    { name: 'financial-store' }
  )
);
