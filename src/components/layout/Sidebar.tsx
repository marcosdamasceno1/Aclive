import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users,
  Kanban, DollarSign, BarChart3, Settings, LogOut, Target,
  ChevronLeft, ChevronRight, CalendarDays, X, Camera,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPageAccess } from '../../utils/permissions';
import type { PageKey } from '../../utils/permissions';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    admin: 'Administrador', manager: 'Gestor',
    professional: 'Profissional', financial: 'Financeiro',
  };
  return labels[role] || role;
};

const getRoleBadgeColor = (role: string) => {
  const colors: Record<string, string> = {
    admin: 'bg-violet-500/20 text-violet-300',
    manager: 'bg-blue-500/20 text-blue-300',
    professional: 'bg-emerald-500/20 text-emerald-300',
    financial: 'bg-amber-500/20 text-amber-300',
  };
  return colors[role] || 'bg-slate-500/20 text-slate-400';
};

interface NavItemDef {
  to: string;
  icon: React.ElementType;
  label: string;
  pageKey: string;
}

export const Sidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const { currentUser, logout } = useAuthStore();

  const access = (key: string) => currentUser ? hasPageAccess(currentUser, key as PageKey) : false;

  const generalItems: NavItemDef[] = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',           pageKey: 'dashboard' },
    { to: '/kanban',    icon: Kanban,          label: 'Esteira de Produção',  pageKey: 'kanban' },
    { to: '/calendar',  icon: CalendarDays,    label: 'Calendário',           pageKey: 'calendar' },
    { to: '/leads',     icon: Target,          label: 'Leads',                pageKey: 'leads' },
    { to: '/social',   icon: Camera,       label: 'Editorial',            pageKey: 'social' },
  ].filter(i => access(i.pageKey));

  const adminItems: NavItemDef[] = [
    { to: '/clients',       icon: Building2,  label: 'Clientes',        pageKey: 'clients' },
    { to: '/professionals', icon: Users,      label: 'Profissionais',   pageKey: 'professionals' },
    { to: '/financial',     icon: DollarSign, label: 'Financeiro',      pageKey: 'financial' },
    { to: '/reports',       icon: BarChart3,  label: 'Relatórios',      pageKey: 'reports' },
    { to: '/settings',      icon: Settings,   label: 'Configurações',   pageKey: 'settings' },
  ].filter(i => access(i.pageKey));

  const NavItem = ({ to, icon: Icon, label }: NavItemDef) => (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={onMobileClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-100 border-l-2 ${
          collapsed ? 'lg:justify-center lg:px-2' : ''
        } ${
          isActive
            ? 'bg-blue-600/10 text-blue-400 border-blue-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
    </NavLink>
  );

  const NavGroup = ({ label, items }: { label: string; items: NavItemDef[] }) => (
    <div className="mb-6">
      <p className={`text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2 ${collapsed ? 'lg:hidden' : ''}`}>{label}</p>
      <div className="space-y-0.5">
        {items.map(item => <NavItem key={item.to} {...item} />)}
      </div>
    </div>
  );

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-[#0f172a] flex flex-col z-50 border-r border-white/5 transition-all duration-300
      w-60 ${collapsed ? 'lg:w-16' : 'lg:w-60'}
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>

      {/* Logo + mobile close button */}
      <div className={`flex items-center border-b border-white/5 transition-all ${collapsed ? 'lg:justify-center lg:px-2 px-4 py-5' : 'px-4 py-5'}`}>
        <img src="/logo.svg" alt="Growth Expert" className={`h-7 w-auto ${collapsed ? 'lg:hidden' : ''}`} />
        {collapsed && <img src="/logo-icon.svg" alt="Growth Expert" className="hidden lg:block w-8 h-8" />}
        <button
          onClick={onMobileClose}
          className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-4 px-3 ${collapsed ? 'lg:px-1' : ''}`}>
        {currentUser?.isSuperAdmin && (
          <div className="mb-6">
            <p className={`text-xs font-semibold text-violet-400 uppercase tracking-widest px-3 mb-2 ${collapsed ? 'lg:hidden' : ''}`}>Master</p>
            <div className="space-y-0.5">
              <NavLink
                to="/master"
                title={collapsed ? 'Painel Master' : undefined}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-100 border-l-2 ${
                    collapsed ? 'lg:justify-center lg:px-2' : ''
                  } ${
                    isActive
                      ? 'bg-violet-600/10 text-violet-400 border-violet-500'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
                  }`
                }
              >
                <Building2 className="w-4 h-4 flex-shrink-0" />
                <span className={collapsed ? 'lg:hidden' : ''}>Painel Master</span>
              </NavLink>
            </div>
          </div>
        )}
        {generalItems.length > 0 && <NavGroup label="Geral" items={generalItems} />}
        {adminItems.length > 0 && <NavGroup label="Administração" items={adminItems} />}
      </nav>

      {/* Toggle button — desktop only */}
      <div className={`hidden lg:flex px-3 pb-3 ${collapsed ? 'justify-center' : ''}`}>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* User */}
      <div className={`border-t border-white/5 px-4 py-4 ${collapsed ? 'lg:px-2 lg:flex lg:flex-col lg:items-center lg:gap-3' : ''}`}>
        {/* Collapsed desktop view */}
        <div className={`${collapsed ? 'hidden lg:flex flex-col items-center gap-3' : 'hidden'}`}>
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold" title={currentUser?.name}>
            {currentUser?.name.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={() => logout()}
            title="Sair"
            className="flex items-center justify-center w-7 h-7 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Expanded view (always on mobile, on desktop only when not collapsed) */}
        <div className={collapsed ? 'lg:hidden' : ''}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {currentUser?.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-tight">{currentUser?.name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block ${getRoleBadgeColor(currentUser?.role || '')}`}>
                {getRoleLabel(currentUser?.role || '')}
              </span>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
};
