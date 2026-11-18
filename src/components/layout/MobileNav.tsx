import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Kanban, CalendarDays, Target, DollarSign, Menu } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPageAccess } from '../../utils/permissions';
import type { PageKey } from '../../utils/permissions';

const CANDIDATES: { to: string; icon: React.ElementType; label: string; pageKey: PageKey }[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Início',     pageKey: 'dashboard' },
  { to: '/kanban',    icon: Kanban,          label: 'Esteira',    pageKey: 'kanban' },
  { to: '/calendar',  icon: CalendarDays,    label: 'Agenda',     pageKey: 'calendar' },
  { to: '/leads',     icon: Target,          label: 'Leads',      pageKey: 'leads' },
  { to: '/financial', icon: DollarSign,      label: 'Financeiro', pageKey: 'financial' },
];

export const MobileNav = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser || currentUser.isSuperAdmin) return null;

  const items = CANDIDATES.filter(i => hasPageAccess(currentUser, i.pageKey)).slice(0, 4);

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0f172a]/95 backdrop-blur border-t border-white/[0.06] pb-safe">
      <div className="flex">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-blue-400' : 'text-slate-500 active:text-slate-300'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
        <button
          onClick={onOpenMenu}
          className="flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium text-slate-500 active:text-slate-300"
        >
          <Menu className="w-5 h-5" />
          Menu
        </button>
      </div>
    </nav>
  );
};
