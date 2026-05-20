import { useMemo } from 'react';
import { useDemandsStore } from '../store/demandsStore';
import { useClientsStore } from '../store/clientsStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useFinancialStore } from '../store/financialStore';
import { useAuthStore } from '../store/authStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { ClipboardList, AlertTriangle, MessageSquare } from 'lucide-react';
import { formatCurrency, getStatusLabel, isOverdue, getPriorityColor, getPriorityLabel } from '../utils/formatters';

const COLORS = ['#1d4ed8', '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#14b8a6', '#64748b'];

const StatCard = ({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) => (
  <div className="bg-white rounded-xl p-5 border border-slate-200">
    <div className={`inline-block w-1 h-6 rounded-full mb-3 ${accent}`} />
    <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{value}</p>
    <p className="text-xs font-medium text-slate-500 mt-2 uppercase tracking-wide">{label}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

export const Dashboard = () => {
  const { currentUser } = useAuthStore();
  const { demands } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();
  const { movements } = useFinancialStore();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredDemands = useMemo(() => {
    if (currentUser?.role === 'professional' && currentUser.professionalId) {
      return demands.filter(d => d.professionalId === currentUser.professionalId);
    }
    return demands;
  }, [demands, currentUser]);

  const stats = useMemo(() => {
    const open = filteredDemands.filter(d => !['completed', 'paid'].includes(d.status)).length;
    const overdue = filteredDemands.filter(d => isOverdue(d.deadline, d.status)).length;
    const completedThisMonth = filteredDemands.filter(d =>
      d.completedAt && new Date(d.completedAt) >= startOfMonth
    ).length;
    const activeClients = clients.filter(c => c.status === 'active').length;

    const pendingPayment = movements
      .filter(m => m.status === 'pending' && m.type === 'credit')
      .reduce((sum, m) => sum + m.value, 0);
    const paidThisMonth = movements
      .filter(m => m.status === 'paid' && m.paidAt && new Date(m.paidAt) >= startOfMonth)
      .reduce((sum, m) => sum + m.value, 0);

    return { open, overdue, completedThisMonth, activeClients, pendingPayment, paidThisMonth };
  }, [filteredDemands, clients, movements, startOfMonth]);

  const demandsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredDemands.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: getStatusLabel(status),
      total: count,
    }));
  }, [filteredDemands]);

  const demandsByProfessional = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredDemands.forEach(d => { counts[d.professionalId] = (counts[d.professionalId] || 0) + 1; });
    return Object.entries(counts).map(([profId, count]) => {
      const prof = professionals.find(p => p.id === profId);
      return { name: prof?.name || 'Desconhecido', value: count };
    }).sort((a, b) => b.value - a.value);
  }, [filteredDemands, professionals]);

  const recentDemands = useMemo(() =>
    [...filteredDemands]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8),
    [filteredDemands]
  );

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'financial';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Demandas abertas" value={stats.open} accent="bg-blue-600" />
        <StatCard label="Atrasadas" value={stats.overdue} accent="bg-red-500" />
        <StatCard label="Concluídas este mês" value={stats.completedThisMonth} accent="bg-emerald-500" />
        <StatCard label="Clientes ativos" value={stats.activeClients} accent="bg-violet-500" />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Valores a pagar" value={formatCurrency(stats.pendingPayment)} accent="bg-orange-500" />
          <StatCard label="Pagamentos este mês" value={formatCurrency(stats.paidThisMonth)} accent="bg-green-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Demandas por Status</h3>
          {demandsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={demandsByStatus} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="total" fill="#1d4ed8" radius={[4, 4, 0, 0]} name="Demandas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              Nenhuma demanda cadastrada ainda
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Demandas por Profissional</h3>
          {demandsByProfessional.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={demandsByProfessional}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                >
                  {demandsByProfessional.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              Nenhuma demanda cadastrada ainda
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Demandas Recentes</h3>
          <span className="text-xs text-slate-400">{recentDemands.length} demanda(s)</span>
        </div>
        {recentDemands.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhuma demanda cadastrada ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDemands.map(demand => {
              const prof = professionals.find(p => p.id === demand.professionalId);
              const client = clients.find(c => c.id === demand.clientId);
              const overdue = isOverdue(demand.deadline, demand.status);
              return (
                <div key={demand.id} className="px-6 py-3 flex items-center gap-4 hover:bg-blue-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{demand.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      {client?.companyName || '—'} · {prof?.name || '—'}
                      {demand.comments.length > 0 && (
                        <span className="flex items-center gap-0.5 text-slate-400 ml-1">
                          <MessageSquare className="w-3 h-3" />
                          {demand.comments.length}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${getPriorityColor(demand.priority)}`}>
                    {getPriorityLabel(demand.priority)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {overdue ? 'Atrasada' : getStatusLabel(demand.status)}
                  </span>
                  <div className="text-sm font-bold text-slate-700 flex-shrink-0">{formatCurrency(demand.value)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
