import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = () => {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
