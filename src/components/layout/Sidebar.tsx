import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, ClipboardList,
  Kanban, DollarSign, BarChart3, Settings, LogOut,
  ChevronRight, Briefcase
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { canManageClients, canManageProfessionals, canViewFinancial } from '../../utils/permissions';

export const Sidebar = () => {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    {
      to: '/clients', icon: Building2, label: 'Clientes',
      show: currentUser ? canManageClients(currentUser.role) : false
    },
    {
      to: '/professionals', icon: Users, label: 'Profissionais',
      show: currentUser ? canManageProfessionals(currentUser.role) : false
    },
    { to: '/demands', icon: ClipboardList, label: 'Demandas', show: true },
    { to: '/kanban', icon: Kanban, label: 'Esteira de Produção', show: true },
    {
      to: '/financial', icon: DollarSign, label: 'Financeiro',
      show: currentUser ? canViewFinancial(currentUser.role) : false
    },
    {
      to: '/reports', icon: BarChart3, label: 'Relatórios',
      show: currentUser ? canViewFinancial(currentUser.role) : false
    },
    {
      to: '/settings', icon: Settings, label: 'Configurações',
      show: currentUser?.role === 'admin'
    },
  ].filter(item => item.show);

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      manager: 'Gestor',
      professional: 'Profissional',
      financial: 'Financeiro',
    };
    return labels[role] || role;
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 flex flex-col z-50 shadow-2xl">
      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <Briefcase className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">Gestão Operacional</h1>
            <p className="text-slate-400 text-xs">Agência de Marketing</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {currentUser?.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{currentUser?.name}</p>
            <p className="text-slate-400 text-xs truncate">{currentUser ? getRoleLabel(currentUser.role) : ''}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair do sistema
        </button>
      </div>
    </aside>
  );
};
