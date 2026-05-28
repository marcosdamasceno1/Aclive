import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users,
  Kanban, DollarSign, BarChart3, Settings, LogOut, Target,
  ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPageAccess } from '../../utils/permissions';
import type { PageKey } from '../../utils/permissions';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
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

export const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const access = (key: string) => currentUser ? hasPageAccess(currentUser, key as PageKey) : false;

  const generalItems: NavItemDef[] = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',           pageKey: 'dashboard' },
    { to: '/kanban',    icon: Kanban,          label: 'Esteira de Produção',  pageKey: 'kanban' },
    { to: '/calendar',  icon: CalendarDays,    label: 'Calendário',           pageKey: 'calendar' },
    { to: '/leads',     icon: Target,          label: 'Leads',                pageKey: 'leads' },
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
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-100 border-l-2 ${
          collapsed ? 'justify-center px-2' : ''
        } ${
          isActive
            ? 'bg-blue-600/10 text-blue-400 border-blue-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && label}
    </NavLink>
  );

  const NavGroup = ({ label, items }: { label: string; items: NavItemDef[] }) => (
    <div className="mb-6">
      {!collapsed && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">{label}</p>
      )}
      <div className="space-y-0.5">
        {items.map(item => <NavItem key={item.to} {...item} />)}
      </div>
    </div>
  );

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-[#0f172a] flex flex-col z-50 border-r border-white/5 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>

      {/* Logo */}
      <div className={`flex items-center border-b border-white/5 transition-all ${collapsed ? 'justify-center px-2 py-5' : 'px-4 py-5'}`}>
        {collapsed ? (
          <img
            src="/logo-icon.svg"
            alt="Aclive"
            className="w-8 h-8 brightness-0 invert"
          />
        ) : (
          <img
            src="/logo.svg"
            alt="Aclive"
            className="h-8 w-auto brightness-0 invert"
          />
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-1' : 'px-3'}`}>
        {generalItems.length > 0 && <NavGroup label="Geral" items={generalItems} />}
        {adminItems.length > 0 && <NavGroup label="Administração" items={adminItems} />}
      </nav>

      {/* Toggle button */}
      <div className={`px-3 pb-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* User */}
      <div className={`border-t border-white/5 ${collapsed ? 'px-2 py-4 flex flex-col items-center gap-3' : 'px-4 py-4'}`}>
        {collapsed ? (
          <>
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold" title={currentUser?.name}>
              {currentUser?.name.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              title="Sair"
              className="flex items-center justify-center w-7 h-7 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
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
              onClick={() => { logout(); navigate('/login'); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
