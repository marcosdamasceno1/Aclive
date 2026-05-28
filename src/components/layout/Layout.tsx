import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = () => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('sidebar_collapsed', String(!c));
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main
        className={`flex-1 min-h-screen transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}
      >
        <div className="max-w-screen-xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
