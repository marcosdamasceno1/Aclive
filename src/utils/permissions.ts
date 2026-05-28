import type { User, UserRole } from '../types';

export const PAGE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clients', label: 'Clientes' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'demands', label: 'Demandas' },
  { key: 'kanban', label: 'Esteira de Produção' },
  { key: 'financial', label: 'Financeiro' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
] as const;

export type PageKey = (typeof PAGE_PERMISSIONS)[number]['key'];

const ROLE_DEFAULTS: Record<UserRole, PageKey[]> = {
  admin: ['dashboard', 'clients', 'professionals', 'demands', 'kanban', 'financial', 'reports', 'settings'],
  manager: ['dashboard', 'clients', 'demands', 'kanban'],
  professional: ['dashboard', 'demands', 'kanban'],
  financial: ['dashboard', 'financial', 'reports'],
};

export const hasPageAccess = (user: User | null, pageKey: PageKey): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.permissions !== undefined) return user.permissions.includes(pageKey);
  return ROLE_DEFAULTS[user.role]?.includes(pageKey) ?? false;
};

export const canManagePayments = (role: UserRole): boolean =>
  role === 'admin' || role === 'financial';

export const canManageProfessionals = (role: UserRole): boolean =>
  role === 'admin';

export const canManageClients = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager';

export const canCreateDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager' || role === 'professional';

export const canViewAllDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager' || role === 'financial';

export const canViewFinancial = (role: UserRole): boolean =>
  role === 'admin' || role === 'financial';

export const canMoveDemands = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager' || role === 'professional';
