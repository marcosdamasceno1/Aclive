import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabaseAuth, setDataSession, clearDataSession } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { useProfessionalsStore } from './store/professionalsStore';
import { useClientsStore } from './store/clientsStore';
import { useDemandsStore } from './store/demandsStore';
import { useFinancialStore } from './store/financialStore';
import { useLeadsStore } from './store/leadsStore';
import { useCalendarStore } from './store/calendarStore';
import { useCompaniesStore } from './store/companiesStore';
import { useDemandBoardStore } from './store/demandBoardStore';
import { useCompanySettingsStore, DEFAULT_KANBAN_STAGES, DEFAULT_BOARD_STAGES } from './store/companySettingsStore';
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
import { Demandas } from './pages/Demandas';
import { Drive } from './pages/Drive';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Agency routes: super admin has no company_id and should not see agency pages
const AgencyRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.isSuperAdmin) return <Navigate to="/master" replace />;
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
  const { init: initDemandBoard } = useDemandBoardStore();
  const { init: initCompanySettings } = useCompanySettingsStore();

  useEffect(() => {
    // Timeout fallback: never stay stuck loading more than 6s
    const timeout = setTimeout(() => {
      useAuthStore.setState({ initialized: true, loading: false });
    }, 6000);

    const initAllStores = async () => {
      const me = useAuthStore.getState().currentUser;
      // Super admin only needs the companies store — they have no company_id so
      // data stores would fail RLS and show error banners unnecessarily.
      if (me?.isSuperAdmin) {
        await initCompanies();
      } else {
        await Promise.all([initProfessionals(), initClients(), initDemands(), initFinancial(), initLeads(), initCalendar(), initDemandBoard(), initCompanySettings()]);
      }
      useAuthStore.getState().loadUsers();
    };

    // Tracks whether stores are loaded for the current session.
    // Reset to false on every SIGNED_OUT so the next SIGNED_IN reloads fresh.
    let storesLoaded = false;

    const doInitAllStores = async () => {
      if (storesLoaded) return;
      storesLoaded = true;
      await initAllStores();
    };

    initAuth().then(() => {
      // If initAuth found an existing session, load all stores immediately
      if (useAuthStore.getState().currentUser) doInitAllStores();
    }).finally(() => clearTimeout(timeout));

    const clearAllStores = () => {
      useLeadsStore.setState({ leads: [], dbError: null });
      useProfessionalsStore.setState({ professionals: [] });
      useClientsStore.setState({ clients: [] });
      useDemandsStore.setState({ demands: [] });
      useFinancialStore.setState({ movements: [] });
      useCalendarStore.setState({ events: [] });
      useDemandBoardStore.setState({ cards: [], dbError: null });
      useAuthStore.setState({ users: [] });
      useCompanySettingsStore.setState({
        googleClientId: '', googleAccessToken: null, googleTokenExpiry: null,
        whatsappProvider: 'waha',
        metaAccessToken: '', metaPhoneNumberId: '', metaTemplateName: 'nova_demanda',
        metaLeadsPageId: '', metaLeadsPageToken: '', metaLeadsVerifyToken: '',
        kanbanStages: DEFAULT_KANBAN_STAGES,
        demandBoardStages: DEFAULT_BOARD_STAGES,
      });
    };

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        // Ignore events with no session (malformed / teardown edge cases).
        if (!session?.user) return;

        // Capture previous user BEFORE syncing — detects account switches even when
        // SIGNED_OUT didn't fire (Supabase v2 fires SIGNED_IN directly on signInWithPassword
        // without a preceding SIGNED_OUT when the user switches accounts).
        const prevUserId = useAuthStore.getState().currentUser?.id ?? null;
        const newUserId = session.user.id;
        const userChanged = prevUserId !== null && prevUserId !== newUserId;

        useAuthStore.getState().syncSession(session.user);
        if (session) await setDataSession(session.access_token, session.refresh_token);

        if (!storesLoaded || userChanged) {
          // Clear previous user's data immediately when switching accounts
          if (userChanged) clearAllStores();
          storesLoaded = true;
          await initAllStores();
        }
      }
      if (event === 'TOKEN_REFRESHED') {
        // Only sync the new token — stores are already loaded, no need to reinitialize.
        // Skip when no user is logged in: a late refresh racing with logout must
        // not resurrect the session.
        if (session?.user && useAuthStore.getState().currentUser) {
          useAuthStore.getState().syncSession(session.user);
          await setDataSession(session.access_token, session.refresh_token);
        }
      }
      if (event === 'SIGNED_OUT') {
        storesLoaded = false;
        await clearDataSession();
        clearAllStores();
        useAuthStore.setState({ currentUser: null });
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
        <Route path="/login" element={currentUser ? (currentUser.isSuperAdmin ? <Navigate to="/master" replace /> : <Navigate to="/dashboard" replace />) : <Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={currentUser?.isSuperAdmin ? <Navigate to="/master" replace /> : <Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<AgencyRoute><Dashboard /></AgencyRoute>} />
          <Route path="clients"      element={<AgencyRoute><Clients /></AgencyRoute>} />
          <Route path="professionals" element={<AgencyRoute><Professionals /></AgencyRoute>} />
          <Route path="demands"      element={<AgencyRoute><Demandas /></AgencyRoute>} />
          <Route path="kanban"       element={<AgencyRoute><Kanban /></AgencyRoute>} />
          <Route path="financial"    element={<AgencyRoute><Financial /></AgencyRoute>} />
          <Route path="leads"        element={<AgencyRoute><Leads /></AgencyRoute>} />
          <Route path="calendar"     element={<AgencyRoute><Calendar /></AgencyRoute>} />
          <Route path="social"       element={<Navigate to="/demands" replace />} />
          <Route path="drive"        element={<AgencyRoute><Drive /></AgencyRoute>} />
          <Route path="reports"      element={<AgencyRoute><Reports /></AgencyRoute>} />
          <Route path="settings"     element={<AgencyRoute><Settings /></AgencyRoute>} />
          <Route path="master"       element={<MasterRoute><Master /></MasterRoute>} />
        </Route>
        <Route path="*" element={currentUser?.isSuperAdmin ? <Navigate to="/master" replace /> : <Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
