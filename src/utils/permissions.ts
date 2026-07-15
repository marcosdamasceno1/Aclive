import type { User, UserRole } from '../types';

export const PAGE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clients', label: 'Clientes' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'demands', label: 'Demandas' },
  { key: 'kanban', label: 'Esteira de Produção' },
  { key: 'leads', label: 'Leads' },
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'drive', label: 'Drive' },
  { key: 'financial', label: 'Financeiro' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
  { key: 'calendar', label: 'Calendário' },
] as const;

export type PageKey = (typeof PAGE_PERMISSIONS)[number]['key'];

const ROLE_DEFAULTS: Record<UserRole, PageKey[]> = {
  admin: ['dashboard', 'clients', 'professionals', 'demands', 'kanban', 'leads', 'atendimento', 'drive', 'financial', 'reports', 'settings', 'calendar'],
  manager: ['dashboard', 'clients', 'demands', 'kanban', 'leads', 'atendimento', 'calendar'],
  professional: ['dashboard', 'demands', 'kanban', 'calendar'],
  financial: ['dashboard', 'financial', 'reports', 'calendar'],
};

export const hasPageAccess = (user: User | null, pageKey: PageKey): boolean => {
  if (!user) return false;
  // Super admin manages agencies only — standard pages have no company_id context
  if (user.isSuperAdmin) return false;
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

export const canManageCalendar = (role: UserRole): boolean =>
  role === 'admin' || role === 'manager';
