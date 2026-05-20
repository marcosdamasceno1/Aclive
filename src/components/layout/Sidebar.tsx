import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, ClipboardList,
  Kanban, DollarSign, BarChart3, Settings, LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { canManageClients, canManageProfessionals, canViewFinancial } from '../../utils/permissions';

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    manager: 'Gestor',
    professional: 'Profissional',
    financial: 'Financeiro',
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
  show: boolean;
}

export const Sidebar = () => {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const generalItems: NavItemDef[] = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/demands', icon: ClipboardList, label: 'Demandas', show: true },
    { to: '/kanban', icon: Kanban, label: 'Esteira de Produção', show: true },
  ];

  const adminItems: NavItemDef[] = [
    { to: '/clients', icon: Building2, label: 'Clientes', show: currentUser ? canManageClients(currentUser.role) : false },
    { to: '/professionals', icon: Users, label: 'Profissionais', show: currentUser ? canManageProfessionals(currentUser.role) : false },
    { to: '/financial', icon: DollarSign, label: 'Financeiro', show: currentUser ? canViewFinancial(currentUser.role) : false },
    { to: '/reports', icon: BarChart3, label: 'Relatórios', show: currentUser ? canViewFinancial(currentUser.role) : false },
    { to: '/settings', icon: Settings, label: 'Configurações', show: currentUser?.role === 'admin' },
  ].filter(i => i.show);

  const NavGroup = ({ label, items }: { label: string; items: NavItemDef[] }) => (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">{label}</p>
      <div className="space-y-0.5">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-100 border-l-2 ${
                isActive
                  ? 'bg-blue-600/10 text-blue-400 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#0f172a] flex flex-col z-50 border-r border-white/5">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-black">A</span>
          </div>
          <div>
            <span className="text-white font-bold text-base tracking-tight">Aclive</span>
            <p className="text-slate-500 text-xs leading-none mt-0.5">Gestão de Agência</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavGroup label="Geral" items={generalItems.filter(i => i.show)} />
        {adminItems.length > 0 && <NavGroup label="Administração" items={adminItems} />}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/5">
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
      </div>
    </aside>
  );
};
