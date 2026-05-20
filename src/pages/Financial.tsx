import { useState, useMemo } from 'react';
import { useFinancialStore } from '../store/financialStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useClientsStore } from '../store/clientsStore';
import { useAuthStore } from '../store/authStore';
import { canManagePayments } from '../utils/permissions';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import {
  CheckCircle2, Clock, DollarSign, Search, Edit2, X, History
} from 'lucide-react';

export const Financial = () => {
  const { currentUser } = useAuthStore();
  const { movements, markAsPaid, updateMovementValue, auditLog, getProfessionalBalance } = useFinancialStore();
  const { professionals } = useProfessionalsStore();
  const { clients } = useClientsStore();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmPay, setConfirmPay] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<{ id: string; value: string } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [activeTab, setActiveTab] = useState<'movements' | 'balances'>('movements');

  const canPay = currentUser ? canManagePayments(currentUser.role) : false;

  const filteredMovements = useMemo(() => {
    let list = movements.filter(m => m.type === 'credit');

    if (currentUser?.role === 'professional' && currentUser.professionalId) {
      list = list.filter(m => m.professionalId === currentUser.professionalId);
    }

    if (statusFilter !== 'all') list = list.filter(m => m.status === statusFilter);
    if (professionalFilter !== 'all') list = list.filter(m => m.professionalId === professionalFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(m =>
        m.demandTitle.toLowerCase().includes(s) ||
        m.clientName.toLowerCase().includes(s)
      );
    }

    return list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [movements, statusFilter, professionalFilter, search, currentUser]);

  const totals = useMemo(() => {
    const pending = filteredMovements.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paid = filteredMovements.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    return { pending, paid, total: pending + paid, count: filteredMovements.length };
  }, [filteredMovements]);

  const professionalsWithBalance = useMemo(() => {
    return professionals
      .filter(p => p.status === 'active')
      .map(p => ({ ...p, balance: getProfessionalBalance(p.id) }))
      .filter(p => p.balance.total > 0)
      .sort((a, b) => b.balance.pending - a.balance.pending);
  }, [professionals, getProfessionalBalance]);

  const handleMarkPaid = (movementId: string) => {
    if (!currentUser) return;
    markAsPaid(movementId, currentUser.id, currentUser.name);
    setConfirmPay(null);
  };

  const handleUpdateValue = () => {
    if (!editingValue || !currentUser) return;
    const newVal = parseFloat(editingValue.value);
    if (isNaN(newVal) || newVal < 0) return;
    updateMovementValue(editingValue.id, newVal, currentUser.id, currentUser.name);
    setEditingValue(null);
  };

  const recentAudit = [...auditLog]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const getAuditActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      payment_marked: 'Pagamento marcado como realizado',
      value_updated: 'Valor atualizado manualmente',
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Financeiro</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Controle de pagamentos e saldos</p>
        </div>
        {canPay && (
          <button
            onClick={() => setShowAuditLog(true)}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <History className="w-4 h-4" />
            Log de alterações
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="inline-block w-1 h-6 rounded-full mb-3 bg-orange-500" />
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{formatCurrency(totals.pending)}</p>
          <p className="text-xs font-medium text-slate-500 mt-2 uppercase tracking-wide">Pendente</p>
          <p className="text-xs text-slate-400 mt-0.5">{filteredMovements.filter(m => m.status === 'pending').length} pagamento(s)</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="inline-block w-1 h-6 rounded-full mb-3 bg-emerald-500" />
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{formatCurrency(totals.paid)}</p>
          <p className="text-xs font-medium text-slate-500 mt-2 uppercase tracking-wide">Pago</p>
          <p className="text-xs text-slate-400 mt-0.5">{filteredMovements.filter(m => m.status === 'paid').length} pagamento(s)</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="inline-block w-1 h-6 rounded-full mb-3 bg-blue-600" />
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{formatCurrency(totals.total)}</p>
          <p className="text-xs font-medium text-slate-500 mt-2 uppercase tracking-wide">Total</p>
          <p className="text-xs text-slate-400 mt-0.5">{totals.count} registro(s)</p>
        </div>
      </div>

      {/* Tabs */}
      {canPay && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'movements' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Movimentações
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'balances' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Saldo por Profissional
          </button>
        </div>
      )}

      {(activeTab === 'balances' && canPay) && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Saldo por Profissional</h3>
          </div>
          {professionalsWithBalance.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Nenhum profissional com saldo</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {professionalsWithBalance.map(pro => (
                <div key={pro.id} className="px-6 py-4 flex items-center gap-4 hover:bg-blue-50/50 transition-colors">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {pro.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{pro.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Pix: {pro.pixKey || 'Não cadastrado'}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right flex-shrink-0">
                    <div>
                      <p className="text-xs text-slate-400">Pendente</p>
                      <p className="text-sm font-bold text-orange-600">{formatCurrency(pro.balance.pending)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Pago</p>
                      <p className="text-sm font-bold text-green-600">{formatCurrency(pro.balance.paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(pro.balance.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(activeTab === 'movements' || !canPay) && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por demanda ou cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
            </select>
            {canPay && (
              <select
                value={professionalFilter}
                onChange={e => setProfessionalFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos os profissionais</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>

          {/* Movements table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Demanda</th>
                    {canPay && <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Profissional</th>}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Conclusão</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Valor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Status</th>
                    {canPay && <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={canPay ? 7 : 5} className="px-4 py-12 text-center text-slate-400 text-sm">
                        Nenhuma movimentação encontrada.
                      </td>
                    </tr>
                  ) : filteredMovements.map(m => {
                    const prof = professionals.find(p => p.id === m.professionalId);
                    const client = clients.find(c => c.id === m.clientId);
                    return (
                      <tr key={m.id} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{m.demandTitle}</p>
                        </td>
                        {canPay && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(prof?.name || '?').charAt(0)}
                              </div>
                              <span className="text-sm text-slate-600">{prof?.name || '—'}</span>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-slate-600">{client?.companyName || m.clientName}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{formatDate(m.completedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {editingValue?.id === m.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={editingValue.value}
                                onChange={e => setEditingValue({ ...editingValue, value: e.target.value })}
                                className="w-24 border border-blue-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateValue(); if (e.key === 'Escape') setEditingValue(null); }}
                              />
                              <button onClick={handleUpdateValue} className="text-green-600 hover:text-green-800"><CheckCircle2 className="w-4 h-4" /></button>
                              <button onClick={() => setEditingValue(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-bold text-slate-800">{formatCurrency(m.value)}</span>
                              {canPay && m.status === 'pending' && (
                                <button
                                  onClick={() => setEditingValue({ id: m.id, value: String(m.value) })}
                                  className="text-slate-300 hover:text-slate-500 transition-colors"
                                  title="Corrigir valor"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            m.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {m.status === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                        </td>
                        {canPay && (
                          <td className="px-4 py-3 text-center">
                            {m.status === 'pending' ? (
                              <button
                                onClick={() => setConfirmPay(m.id)}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
                              >
                                Marcar Pago
                              </button>
                            ) : (
                              <div className="text-xs text-slate-400">
                                <p>Pago em</p>
                                <p className="font-medium">{m.paidAt ? formatDate(m.paidAt) : '—'}</p>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Confirm pay dialog */}
      {confirmPay && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Confirmar pagamento</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              Confirmar que este pagamento foi realizado? Esta ação ficará registrada no histórico.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPay(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={() => handleMarkPaid(confirmPay)} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-bold">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit log modal */}
      {showAuditLog && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Log de Alterações</h2>
              <button onClick={() => setShowAuditLog(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {recentAudit.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Nenhuma alteração registrada</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentAudit.map(log => (
                    <div key={log.id} className="px-6 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-slate-800">{getAuditActionLabel(log.action)}</p>
                        <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500">Por: <span className="font-medium">{log.userName}</span></p>
                      {log.oldValue && log.newValue && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {log.oldValue} → {log.newValue}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
