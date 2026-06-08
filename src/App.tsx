import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabaseAuth } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { useProfessionalsStore } from './store/professionalsStore';
import { useClientsStore } from './store/clientsStore';
import { useDemandsStore } from './store/demandsStore';
import { useFinancialStore } from './store/financialStore';
import { useLeadsStore } from './store/leadsStore';
import { useCalendarStore } from './store/calendarStore';
import { useCompaniesStore } from './store/companiesStore';
import { useSocialStore } from './store/socialStore';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Professionals } from './pages/Professionals';
import { Clients } from './pages/Clients';
import { Demands } from './pages/Demands';
import { Kanban } from './pages/Kanban';
import { Financial } from './pages/Financial';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Leads } from './pages/Leads';
import { Calendar } from './pages/Calendar';
import { Master } from './pages/Master';
import { Social } from './pages/Social';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const MasterRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser?.isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  const { currentUser, initialized, initAuth } = useAuthStore();
  const { init: initProfessionals } = useProfessionalsStore();
  const { init: initClients } = useClientsStore();
  const { init: initDemands } = useDemandsStore();
  const { init: initFinancial } = useFinancialStore();
  const { init: initLeads } = useLeadsStore();
  const { init: initCalendar } = useCalendarStore();
  const { init: initCompanies } = useCompaniesStore();
  const { init: initSocial } = useSocialStore();

  useEffect(() => {
    // Timeout fallback: never stay stuck loading more than 6s
    const timeout = setTimeout(() => {
      useAuthStore.setState({ initialized: true, loading: false });
    }, 6000);

    const initAllStores = async () => {
      const me = useAuthStore.getState().currentUser;
      const storeInits = [initProfessionals(), initClients(), initDemands(), initFinancial(), initLeads(), initCalendar(), initSocial()];
      if (me?.isSuperAdmin) storeInits.push(initCompanies());
      await Promise.all(storeInits);
      useAuthStore.getState().loadUsers();
    };

    initAuth().then(() => {
      // If initAuth found an existing session, load all stores immediately
      if (useAuthStore.getState().currentUser) initAllStores();
    }).finally(() => clearTimeout(timeout));

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        // Sync currentUser from the session BEFORE loading stores so getCompanyId() returns
        // the correct company for the user who just logged in (not null from previous state).
        if (session?.user) useAuthStore.getState().syncSession(session.user);
        await initAllStores();
      }
      if (event === 'SIGNED_OUT') {
        // Clear all store data so the next login starts fresh
        useLeadsStore.setState({ leads: [], dbError: null });
        useProfessionalsStore.setState({ professionals: [] });
        useClientsStore.setState({ clients: [] });
        useDemandsStore.setState({ demands: [] });
        useFinancialStore.setState({ movements: [] });
        useCalendarStore.setState({ events: [] });
        useSocialStore.setState({ accounts: [], posts: [] });
        useAuthStore.setState({ currentUser: null, users: [] });
      }
    });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="professionals" element={<Professionals />} />
          <Route path="demands" element={<Navigate to="/kanban" replace />} />
          <Route path="kanban" element={<Kanban />} />
          <Route path="financial" element={<Financial />} />
          <Route path="leads" element={<Leads />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="social" element={<Social />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="master" element={<MasterRoute><Master /></MasterRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
