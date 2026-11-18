import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export const Layout = () => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('sidebar_collapsed', String(!c));
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile backdrop — tap anywhere to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className={`flex-1 min-w-0 min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo-dark.svg" alt="Growth Expert" className="h-6 w-auto" />
        </div>

        <div className="max-w-screen-xl mx-auto p-4 sm:p-6 pb-24 lg:pb-6">
          <Outlet />
        </div>
      </main>

      <MobileNav onOpenMenu={() => setMobileOpen(true)} />
    </div>
  );
};
