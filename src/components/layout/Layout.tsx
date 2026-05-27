import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = () => (
  <div className="flex min-h-screen bg-[#0d1117]">
    <Sidebar />
    <main className="flex-1 ml-60 min-h-screen">
      <div className="max-w-screen-xl mx-auto p-6">
        <Outlet />
      </div>
    </main>
  </div>
);
