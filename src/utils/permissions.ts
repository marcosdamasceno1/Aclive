import type { UserRole } from '../types';

export const canManagePayments = (role: UserRole): boolean =>
  role === 'admin' || role === 'financial';

export const canManageProfessionals = (role: UserRole): boolean =>
  role === 'admin';

export const canManageClients = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager';

export const canCreateDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager';

export const canViewAllDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager' || role === 'financial';

export const canViewFinancial = (role: UserRole): boolean =>
  role === 'admin' || role === 'financial';

export const canMoveDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager' || role === 'professional';
