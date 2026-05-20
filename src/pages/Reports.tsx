import { useState, useMemo } from 'react';
import { useDemandsStore } from '../store/demandsStore';
import { useClientsStore } from '../store/clientsStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useFinancialStore } from '../store/financialStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Download, TrendingUp, Users, Building2, AlertTriangle, DollarSign } from 'lucide-react';
import { formatCurrency, formatDate, isOverdue } from '../utils/formatters';

export const Reports = () => {
  const { demands } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();
  const { movements } = useFinancialStore();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const filteredDemands = useMemo(() => {
    let list = demands;
    if (startDate) list = list.filter(d => new Date(d.createdAt) >= new Date(startDate));
    if (endDate) list = list.filter(d => new Date(d.createdAt) <= new Date(endDate + 'T23:59:59'));
    if (professionalFilter !== 'all') list = list.filter(d => d.professionalId === professionalFilter);
    if (clientFilter !== 'all') list = list.filter(d => d.clientId === clientFilter);
    return list;
  }, [demands, startDate, endDate, professionalFilter, clientFilter]);

  // Produção por profissional
  const productionByProfessional = useMemo(() => {
    const map: Record<string, { name: string; completed: number; total: number; value: number }> = {};
    filteredDemands.forEach(d => {
      const prof = professionals.find(p => p.id === d.professionalId);
      if (!map[d.professionalId]) {
        map[d.professionalId] = { name: prof?.name || 'Desconhecido', completed: 0, total: 0, value: 0 };
      }
      map[d.professionalId].total++;
      if (['completed', 'paid'].includes(d.status)) {
        map[d.professionalId].completed++;
        map[d.professionalId].value += d.value;
      }
    });
    return Object.values(map).sort((a, b) => b.completed - a.completed);
  }, [filteredDemands, professionals]);

  // Custo por cliente
  const costByClient = useMemo(() => {
    const map: Record<string, { name: string; value: number; count: number }> = {};
    filteredDemands.forEach(d => {
      const client = clients.find(c => c.id === d.clientId);
      if (!map[d.clientId]) {
        map[d.clientId] = { name: client?.companyName || 'Desconhecido', value: 0, count: 0 };
      }
      map[d.clientId].value += d.value;
      map[d.clientId].count++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [filteredDemands, clients]);

  // Financial summary
  const financialSummary = useMemo(() => {
    const filteredMovements = movements.filter(m => {
      if (startDate && new Date(m.completedAt) < new Date(startDate)) return false;
      if (endDate && new Date(m.completedAt) > new Date(endDate + 'T23:59:59')) return false;
      if (professionalFilter !== 'all' && m.professionalId !== professionalFilter) return false;
      return m.type === 'credit';
    });
    const pending = filteredMovements.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paid = filteredMovements.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    return [
      { name: 'Pendente', value: pending },
      { name: 'Pago', value: paid },
    ];
  }, [movements, startDate, endDate, professionalFilter]);

  // Overdue demands
  const overdueDemands = useMemo(() =>
    filteredDemands.filter(d => isOverdue(d.deadline, d.status))
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()),
    [filteredDemands]
  );

  // Stats
  const stats = useMemo(() => ({
    totalDemands: filteredDemands.length,
    completedDemands: filteredDemands.filter(d => ['completed', 'paid'].includes(d.status)).length,
    totalValue: filteredDemands.reduce((s, d) => s + d.value, 0),
    overdueCount: overdueDemands.length,
  }), [filteredDemands, overdueDemands]);

  const exportCSV = () => {
    const rows = [
      ['Título', 'Cliente', 'Profissional', 'Tipo', 'Status', 'Prazo', 'Valor', 'Criada em'],
      ...filteredDemands.map(d => {
        const client = clients.find(c => c.id === d.clientId);
        const prof = professionals.find(p => p.id === d.professionalId);
        return [
          d.title,
          client?.companyName || '',
          prof?.name || '',
          d.taskType,
          d.status,
          formatDate(d.deadline),
          d.value.toFixed(2),
          formatDate(d.createdAt),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-agencia-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relatórios</h1>
          <p className="text-slate-500 text-sm mt-1">Análise de produção e financeiro</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <p className="text-sm font-semibold text-slate-600 mb-3">Filtros do relatório</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data final</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Profissional</label>
            <select
              value={professionalFilter}
              onChange={e => setProfessionalFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cliente</label>
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </div>
          {(startDate || endDate || professionalFilter !== 'all' || clientFilter !== 'all') && (
            <div className="flex items-end">
              <button
                onClick={() => { setStartDate(''); setEndDate(''); setProfessionalFilter('all'); setClientFilter('all'); }}
                className="border border-slate-200 text-slate-500 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de demandas', value: stats.totalDemands, icon: Users, color: 'bg-blue-500' },
          { label: 'Concluídas', value: stats.completedDemands, icon: TrendingUp, color: 'bg-emerald-500' },
          { label: 'Valor total', value: formatCurrency(stats.totalValue), icon: DollarSign, color: 'bg-violet-500' },
          { label: 'Atrasadas', value: stats.overdueCount, icon: AlertTriangle, color: 'bg-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-slate-400" />
            <h3 className="text-base font-bold text-slate-800">Ranking de Produtividade</h3>
          </div>
          {productionByProfessional.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={productionByProfessional} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [value, name === 'completed' ? 'Concluídas' : 'Total'] as [number | string, string]}
                />
                <Bar dataKey="completed" name="Concluídas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-400 text-sm">Sem dados no período</div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-slate-400" />
            <h3 className="text-base font-bold text-slate-800">Custo Operacional por Cliente</h3>
          </div>
          {costByClient.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={costByClient.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Valor'] as [string, string]}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-400 text-sm">Sem dados no período</div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <h3 className="text-base font-bold text-slate-800">Resumo Financeiro</h3>
          </div>
          {financialSummary.some(f => f.value > 0) ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={financialSummary} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                    <Cell fill="#f97316" />
                    <Cell fill="#22c55e" />
                  </Pie>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Pendente</p>
                    <p className="text-sm font-bold text-orange-600">{formatCurrency(financialSummary[0].value)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Pago</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(financialSummary[1].value)}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-base font-bold text-slate-800">
                    {formatCurrency(financialSummary[0].value + financialSummary[1].value)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">Sem dados financeiros</div>
          )}
        </div>

        {/* Overdue demands */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-base font-bold text-slate-800">Demandas Atrasadas ({overdueDemands.length})</h3>
          </div>
          {overdueDemands.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Nenhuma demanda atrasada 🎉
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {overdueDemands.slice(0, 10).map(d => {
                const client = clients.find(c => c.id === d.clientId);
                const prof = professionals.find(p => p.id === d.professionalId);
                const daysOverdue = Math.floor((Date.now() - new Date(d.deadline).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold text-slate-800 truncate">{d.title}</p>
                      <p className="text-xs text-slate-500">{client?.companyName} · {prof?.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-red-600">{daysOverdue}d atrasado</p>
                      <p className="text-xs text-slate-400">{formatDate(d.deadline)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Professional productivity table */}
      {productionByProfessional.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Produção Detalhada por Profissional</h3>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Profissional</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Concluídas</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxa</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor gerado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productionByProfessional.map((row, idx) => {
                const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
                return (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{row.total}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{row.completed}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex-1 max-w-20 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600">{rate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-800">{formatCurrency(row.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
