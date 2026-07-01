import { useState, useMemo } from 'react';
import { useFinancialStore } from '../store/financialStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useClientsStore } from '../store/clientsStore';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import {
  CheckCircle2, X, History, Edit2, Search,
  TrendingUp, TrendingDown, Plus, Trash2, ArrowUpCircle, ArrowDownCircle,
  DollarSign, Users, BarChart3, Clock,
} from 'lucide-react';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const MONTHS = (() => {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    list.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    });
  }
  return list;
})();

const DEFAULT_INCOME_CATEGORIES = ['Pagamento de Cliente', 'Contrato', 'Projeto Pontual', 'Outros'];
const DEFAULT_EXPENSE_CATEGORIES = ['Ferramentas / Software', 'Infraestrutura', 'Marketing', 'Pessoal', 'Impostos', 'Outros'];

// ─── Professional View (simple) ──────────────────────────────────────────────

const ProfessionalView = () => {
  const { currentUser } = useAuthStore();
  const { movements } = useFinancialStore();
  const { clients } = useClientsStore();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  const myMovements = useMemo(() => {
    if (!currentUser?.professionalId) return [];
    return movements
      .filter(m =>
        m.professionalId === currentUser.professionalId &&
        m.type === 'credit' &&
        (m.completedAt || '').startsWith(selectedMonth)
      )
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [movements, currentUser, selectedMonth]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _clients = clients;

  const filtered = useMemo(() =>
    statusFilter === 'all' ? myMovements : myMovements.filter(m => m.status === statusFilter),
    [myMovements, statusFilter]
  );

  const totals = useMemo(() => {
    const pending = myMovements.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paid = myMovements.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    return { pending, paid, total: pending + paid };
  }, [myMovements]);

  if (!currentUser?.professionalId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Meu Financeiro</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Acompanhe seus ganhos</p>
        </div>
        <div className="bg-[#21262d] rounded-xl border border-white/[0.08] p-12 text-center">
          <DollarSign className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Sua conta ainda não está vinculada a um perfil profissional.</p>
          <p className="text-slate-500 text-xs mt-1">Fale com o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Meu Financeiro</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Acompanhe seus ganhos</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="border border-white/[0.08] rounded-lg px-3 py-2 text-sm bg-[#21262d] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-orange-500/[0.12] rounded-lg flex items-center justify-center">
              <ArrowDownCircle className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(totals.pending)}</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">A Receber</p>
          <p className="text-xs text-slate-500 mt-0.5">{myMovements.filter(m => m.status === 'pending').length} demanda(s)</p>
        </div>
        <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-500/[0.12] rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(totals.paid)}</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Recebido</p>
          <p className="text-xs text-slate-500 mt-0.5">{myMovements.filter(m => m.status === 'paid').length} pagamento(s)</p>
        </div>
        <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-500/[0.12] rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(totals.total)}</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Total do Mês</p>
          <p className="text-xs text-slate-500 mt-0.5">{myMovements.length} tarefa(s) concluída(s)</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'pending', 'paid'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-[#21262d] text-slate-400 hover:text-slate-200 border border-white/[0.08]'
            }`}
          >
            {s === 'all' ? 'Todos' : s === 'pending' ? 'A Receber' : 'Recebido'}
          </button>
        ))}
      </div>

      <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Demanda</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Conclusão</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Valor</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">
                  Nenhuma movimentação para este mês.
                </td>
              </tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-100">{m.demandTitle}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{m.clientName}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{formatDate(m.completedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-slate-100">{formatCurrency(m.value)}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {m.status === 'paid' ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/[0.1] text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Pago
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-orange-500/[0.1] text-orange-400">
                      Aguardando
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Admin View (complete) ────────────────────────────────────────────────────

const emptyEntry = {
  type: 'income' as 'income' | 'expense',
  category: '',
  description: '',
  value: '',
  date: new Date().toISOString().split('T')[0],
  notes: '',
  clientId: '',
  status: 'paid' as 'pending' | 'paid',
};

const AdminView = () => {
  const { currentUser } = useAuthStore();
  const { movements, markAsPaid, updateMovementValue, deleteMovement, addManualEntry, auditLog, customCategories, addCustomCategory } = useFinancialStore();
  const { professionals } = useProfessionalsStore();
  const { clients } = useClientsStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'professionals' | 'demands' | 'entries'>('overview');
  const [entriesSubTab, setEntriesSubTab] = useState<'income' | 'expense'>('income');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmPay, setConfirmPay] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<{ id: string; value: string } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [submitting, setSubmitting] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Demand movements (credits from professionals)
  const demandMovements = useMemo(() => {
    let list = movements.filter(m => m.type === 'credit');
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
  }, [movements, statusFilter, professionalFilter, search]);

  // Entries split by type: pending first (soonest due), then paid (most recent)
  const entriesByType = useMemo(() => {
    const sortFn = (a: typeof movements[number], b: typeof movements[number]) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      if (a.status === 'pending') return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      return new Date(b.paidAt || b.completedAt).getTime() - new Date(a.paidAt || a.completedAt).getTime();
    };
    return {
      income: movements.filter(m => m.type === 'income').sort(sortFn),
      expense: movements.filter(m => m.type === 'expense').sort(sortFn),
    };
  }, [movements]);

  // Professional balances
  const professionalsWithBalance = useMemo(() => {
    const allCredits = movements.filter(m => m.type === 'credit');
    return professionals
      .filter(p => p.status === 'active')
      .map(p => {
        const mine = allCredits.filter(m => m.professionalId === p.id);
        const pending = mine.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
        const paid = mine.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
        return { ...p, balance: { pending, paid, total: pending + paid } };
      })
      .filter(p => p.balance.total > 0)
      .sort((a, b) => b.balance.pending - a.balance.pending);
  }, [professionals, movements]);

  // Extended summary
  const summary = useMemo(() => {
    const credits = movements.filter(m => m.type === 'credit');
    const pendingPro = credits.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paidPro = credits.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    const incomes = movements.filter(m => m.type === 'income');
    const expenses = movements.filter(m => m.type === 'expense');
    const pendingIncome = incomes.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paidIncome = incomes.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    const pendingExpense = expenses.filter(m => m.status === 'pending').reduce((s, m) => s + m.value, 0);
    const paidExpense = expenses.filter(m => m.status === 'paid').reduce((s, m) => s + m.value, 0);
    return {
      pendingPro, paidPro,
      pendingIncome, paidIncome,
      pendingExpense, paidExpense,
      income: pendingIncome + paidIncome,
      expense: pendingExpense + paidExpense,
      balance: paidIncome - paidExpense - pendingPro,
    };
  }, [movements]);

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

  const handleAddEntry = () => {
    if (!entryForm.description.trim() || !entryForm.value || !currentUser) return;
    const val = parseFloat(entryForm.value);
    if (isNaN(val) || val <= 0) return;
    setSubmitting(true);
    const selectedClient = entryForm.clientId ? clients.find(c => c.id === entryForm.clientId) : undefined;
    addManualEntry({
      type: entryForm.type,
      category: entryForm.category || 'Outros',
      description: entryForm.description,
      value: val,
      date: entryForm.date,
      createdBy: currentUser.name,
      notes: entryForm.notes || undefined,
      clientId: entryForm.clientId || undefined,
      clientName: selectedClient?.companyName || undefined,
      status: entryForm.status,
    });
    setEntryForm({ ...emptyEntry, type: entryForm.type });
    setShowEntryModal(false);
    setSubmitting(false);
  };

  const availableCategories = entryForm.type === 'income'
    ? [...DEFAULT_INCOME_CATEGORIES, ...customCategories.income]
    : [...DEFAULT_EXPENSE_CATEGORIES, ...customCategories.expense];

  const handleAddCustomCategory = () => {
    if (!newCatName.trim()) return;
    addCustomCategory(entryForm.type, newCatName.trim());
    setEntryForm(f => ({ ...f, category: newCatName.trim() }));
    setNewCatName('');
    setShowNewCatInput(false);
  };

  const openEntryModal = (type: 'income' | 'expense') => {
    setEntryForm({ ...emptyEntry, type, status: 'paid' });
    setShowNewCatInput(false);
    setNewCatName('');
    setShowEntryModal(true);
  };

  const recentAudit = [...auditLog]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  // For context-aware confirm modal
  const confirmPayMovement = confirmPay ? movements.find(m => m.id === confirmPay) : null;

  const TABS = [
    { key: 'overview', label: 'Visão Geral', icon: BarChart3 },
    { key: 'professionals', label: 'Profissionais', icon: Users },
    { key: 'demands', label: 'Demandas', icon: DollarSign },
    { key: 'entries', label: 'Lançamentos', icon: TrendingUp },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Financeiro</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Gestão financeira completa</p>
        </div>
        <button
          onClick={() => setShowAuditLog(true)}
          className="flex items-center gap-2 border border-white/[0.08] text-slate-400 hover:bg-white/[0.04] px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <History className="w-4 h-4" />
          Histórico
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0d1117] p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
              <div className="w-8 h-8 bg-orange-500/[0.12] rounded-lg flex items-center justify-center mb-3">
                <DollarSign className="w-4 h-4 text-orange-400" />
              </div>
              <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(summary.pendingPro)}</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">A Pagar (Profissionais)</p>
            </div>
            <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
              <div className="w-8 h-8 bg-emerald-500/[0.12] rounded-lg flex items-center justify-center mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(summary.paidPro)}</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Pago (Profissionais)</p>
            </div>
            <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
              <div className="w-8 h-8 bg-blue-500/[0.12] rounded-lg flex items-center justify-center mb-3">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(summary.paidIncome)}</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Entradas Realizadas</p>
              {summary.pendingIncome > 0 && (
                <p className="text-xs text-orange-400 mt-0.5">+ {formatCurrency(summary.pendingIncome)} previsto</p>
              )}
            </div>
            <div className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08]">
              <div className="w-8 h-8 bg-red-500/[0.12] rounded-lg flex items-center justify-center mb-3">
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-2xl font-extrabold text-white tracking-tight">{formatCurrency(summary.paidExpense)}</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Saídas Realizadas</p>
              {summary.pendingExpense > 0 && (
                <p className="text-xs text-orange-400 mt-0.5">+ {formatCurrency(summary.pendingExpense)} previsto</p>
              )}
            </div>
          </div>

          {/* Saldo */}
          <div className={`rounded-xl p-5 border ${summary.balance >= 0 ? 'bg-emerald-500/[0.06] border-emerald-500/[0.2]' : 'bg-red-500/[0.06] border-red-500/[0.2]'}`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Saldo Operacional (Entradas − Saídas − A Pagar Prof.)</p>
            <p className={`text-3xl font-extrabold tracking-tight ${summary.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(summary.balance)}
            </p>
          </div>

          {/* Recent demand movements */}
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-bold text-slate-100">Últimas movimentações de demandas</h3>
            </div>
            {movements.filter(m => m.type === 'credit').length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">Nenhuma movimentação registrada</div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {movements.filter(m => m.type === 'credit')
                  .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                  .slice(0, 5)
                  .map(m => {
                    const prof = professionals.find(p => p.id === m.professionalId);
                    return (
                      <div key={m.id} className="px-6 py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{m.demandTitle}</p>
                          <p className="text-xs text-slate-500">{prof?.name || '—'} · {m.clientName}</p>
                        </div>
                        <span className="text-sm font-bold text-slate-100 flex-shrink-0">{formatCurrency(m.value)}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
                          m.status === 'paid' ? 'bg-emerald-500/[0.1] text-emerald-400' : 'bg-orange-500/[0.1] text-orange-400'
                        }`}>
                          {m.status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Professionals Tab ── */}
      {activeTab === 'professionals' && (
        <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.05]">
            <h3 className="text-base font-bold text-slate-100">Saldo por Profissional</h3>
          </div>
          {professionalsWithBalance.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">Nenhum profissional com saldo registrado</div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {professionalsWithBalance.map(pro => (
                <div key={pro.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {pro.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{pro.name}</p>
                    <p className="text-xs text-slate-500">Pix: {pro.pixKey || 'Não cadastrado'}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Pendente</p>
                      <p className="text-sm font-bold text-orange-400">{formatCurrency(pro.balance.pending)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pago</p>
                      <p className="text-sm font-bold text-emerald-400">{formatCurrency(pro.balance.paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="text-sm font-bold text-slate-100">{formatCurrency(pro.balance.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Demands Tab ── */}
      {activeTab === 'demands' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por demanda ou cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os status</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
            </select>
            <select
              value={professionalFilter}
              onChange={e => setProfessionalFilter(e.target.value)}
              className="border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os profissionais</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Demanda</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Profissional</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Conclusão</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Valor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {demandMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                        Nenhuma movimentação encontrada.
                      </td>
                    </tr>
                  ) : demandMovements.map(m => {
                    const prof = professionals.find(p => p.id === m.professionalId);
                    const client = clients.find(c => c.id === m.clientId);
                    return (
                      <tr key={m.id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-100">{m.demandTitle}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {(prof?.name || '?').charAt(0)}
                            </div>
                            <span className="text-sm text-slate-400">{prof?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">{client?.companyName || m.clientName}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{formatDate(m.completedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {editingValue?.id === m.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={editingValue.value}
                                onChange={e => setEditingValue({ ...editingValue, value: e.target.value })}
                                className="w-24 border border-blue-500/[0.4] rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateValue(); if (e.key === 'Escape') setEditingValue(null); }}
                              />
                              <button onClick={handleUpdateValue} className="text-emerald-400 hover:text-emerald-300"><CheckCircle2 className="w-4 h-4" /></button>
                              <button onClick={() => setEditingValue(null)} className="text-slate-400 hover:text-slate-300"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-bold text-slate-100">{formatCurrency(m.value)}</span>
                              {m.status === 'pending' && (
                                <button onClick={() => setEditingValue({ id: m.id, value: String(m.value) })} className="text-slate-500 hover:text-slate-300 transition-colors" title="Corrigir valor">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            m.status === 'paid' ? 'bg-emerald-500/[0.1] text-emerald-400' : 'bg-orange-500/[0.1] text-orange-400'
                          }`}>
                            {m.status === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.status === 'pending' ? (
                            <button
                              onClick={() => setConfirmPay(m.id)}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
                            >
                              Marcar Pago
                            </button>
                          ) : (
                            <div className="text-xs text-slate-500">
                              <p>Pago em</p>
                              <p className="font-medium">{m.paidAt ? formatDate(m.paidAt) : '—'}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Entries Tab ── */}
      {activeTab === 'entries' && (
        <div className="space-y-4">
          {/* Sub-tabs + action button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-[#0d1117] p-1 rounded-xl">
              <button
                onClick={() => setEntriesSubTab('income')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  entriesSubTab === 'income' ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4 text-blue-400" />
                Entradas
                {summary.pendingIncome > 0 && (
                  <span className="ml-1 text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">
                    {entriesByType.income.filter(m => m.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setEntriesSubTab('expense')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  entriesSubTab === 'expense' ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4 text-red-400" />
                Saídas
                {summary.pendingExpense > 0 && (
                  <span className="ml-1 text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">
                    {entriesByType.expense.filter(m => m.status === 'pending').length}
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={() => openEntryModal(entriesSubTab)}
              className={`flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                entriesSubTab === 'income' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              {entriesSubTab === 'income' ? 'Nova Entrada' : 'Nova Saída'}
            </button>
          </div>

          {/* Summary cards */}
          {entriesSubTab === 'income' ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#21262d] rounded-xl p-4 border border-orange-500/20">
                <div className="w-8 h-8 bg-orange-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                </div>
                <p className="text-lg font-bold text-orange-400">{formatCurrency(summary.pendingIncome)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">A Receber</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.income.filter(m => m.status === 'pending').length} lançamento(s)</p>
              </div>
              <div className="bg-[#21262d] rounded-xl p-4 border border-white/[0.08]">
                <div className="w-8 h-8 bg-blue-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-lg font-bold text-blue-400">{formatCurrency(summary.paidIncome)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">Recebido</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.income.filter(m => m.status === 'paid').length} lançamento(s)</p>
              </div>
              <div className="bg-[#21262d] rounded-xl p-4 border border-white/[0.08]">
                <div className="w-8 h-8 bg-slate-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-100">{formatCurrency(summary.income)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">Total</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.income.length} lançamento(s)</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#21262d] rounded-xl p-4 border border-orange-500/20">
                <div className="w-8 h-8 bg-orange-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                </div>
                <p className="text-lg font-bold text-orange-400">{formatCurrency(summary.pendingExpense)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">A Pagar</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.expense.filter(m => m.status === 'pending').length} lançamento(s)</p>
              </div>
              <div className="bg-[#21262d] rounded-xl p-4 border border-white/[0.08]">
                <div className="w-8 h-8 bg-red-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-lg font-bold text-red-400">{formatCurrency(summary.paidExpense)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">Pago</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.expense.filter(m => m.status === 'paid').length} lançamento(s)</p>
              </div>
              <div className="bg-[#21262d] rounded-xl p-4 border border-white/[0.08]">
                <div className="w-8 h-8 bg-slate-500/[0.12] rounded-lg flex items-center justify-center mb-2">
                  <TrendingDown className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-100">{formatCurrency(summary.expense)}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">Total</p>
                <p className="text-xs text-slate-600 mt-0.5">{entriesByType.expense.length} lançamento(s)</p>
              </div>
            </div>
          )}

          {/* Entries table */}
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Vencimento</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Valor</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {entriesByType[entriesSubTab].length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                      Nenhum lançamento. Clique em "{entriesSubTab === 'income' ? 'Nova Entrada' : 'Nova Saída'}" para começar.
                    </td>
                  </tr>
                ) : entriesByType[entriesSubTab].map(m => (
                  <tr key={m.id} className={`hover:bg-white/[0.04] transition-colors ${m.status === 'pending' ? 'border-l-2 border-orange-500/40' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-100">{m.demandTitle}</p>
                      {m.notes && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">{m.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{m.category || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{m.clientName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatDate(m.completedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${entriesSubTab === 'income' ? 'text-blue-400' : 'text-red-400'}`}>
                        {entriesSubTab === 'income' ? '+' : '-'}{formatCurrency(m.value)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.status === 'paid' ? (
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/[0.1] text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {entriesSubTab === 'income' ? 'Recebido' : 'Pago'}
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-orange-500/[0.1] text-orange-400 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {entriesSubTab === 'income' ? 'A Receber' : 'A Pagar'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {m.status === 'pending' && (
                          <button
                            onClick={() => setConfirmPay(m.id)}
                            className={`text-xs text-white px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                              entriesSubTab === 'income'
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {entriesSubTab === 'income' ? 'Receber' : 'Pagar'}
                          </button>
                        )}
                        {m.status === 'paid' && m.paidAt && (
                          <span className="text-xs text-slate-500">{formatDate(m.paidAt)}</span>
                        )}
                        <button
                          onClick={() => deleteMovement(m.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/[0.1] rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirm Pay Modal ── */}
      {confirmPay && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-500/[0.12] rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">
                {confirmPayMovement?.type === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
              </h3>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              {confirmPayMovement?.type === 'income'
                ? 'Confirmar que este recebimento foi realizado hoje? Esta ação ficará registrada no histórico.'
                : 'Confirmar que este pagamento foi realizado hoje? Esta ação ficará registrada no histórico.'
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPay(null)} className="flex-1 border border-white/[0.08] text-slate-400 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button onClick={() => handleMarkPaid(confirmPay)} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-bold">
                {confirmPayMovement?.type === 'income' ? 'Confirmar Recebimento' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Entry Modal ── */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100">
                {entryForm.type === 'income' ? 'Nova Entrada' : 'Nova Saída'}
              </h2>
              <button onClick={() => setShowEntryModal(false)} className="text-slate-400 hover:text-slate-300 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryForm(f => ({ ...f, type: 'income', category: '' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                      entryForm.type === 'income'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <ArrowUpCircle className="w-4 h-4" /> Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryForm(f => ({ ...f, type: 'expense', category: '' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                      entryForm.type === 'expense'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Saída
                  </button>
                </div>
              </div>

              {/* Status toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Status *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryForm(f => ({ ...f, status: 'paid' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                      entryForm.status === 'paid'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Já realizado
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryForm(f => ({ ...f, status: 'pending' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                      entryForm.status === 'pending'
                        ? 'bg-orange-600 border-orange-600 text-white'
                        : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Clock className="w-4 h-4" /> Previsão
                  </button>
                </div>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-300">Categoria *</label>
                  <button
                    type="button"
                    onClick={() => { setShowNewCatInput(v => !v); setNewCatName(''); }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Nova categoria
                  </button>
                </div>
                {showNewCatInput ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCategory(); } if (e.key === 'Escape') setShowNewCatInput(false); }}
                      autoFocus
                      className="flex-1 border border-blue-500/[0.4] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nome da nova categoria..."
                    />
                    <button type="button" onClick={handleAddCustomCategory} className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
                      Criar
                    </button>
                    <button type="button" onClick={() => setShowNewCatInput(false)} className="px-3 py-2.5 border border-white/[0.08] text-slate-400 rounded-lg text-sm hover:bg-white/[0.04]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={entryForm.category}
                    onChange={e => setEntryForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {availableCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Descrição *</label>
                <input
                  type="text"
                  value={entryForm.description}
                  onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Descreva o lançamento..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Cliente <span className="text-slate-500 font-normal">(opcional)</span></label>
                <select
                  value={entryForm.clientId}
                  onChange={e => setEntryForm(f => ({ ...f, clientId: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Nenhum</option>
                  {clients.filter(c => c.status === 'active').map(c => (
                    <option key={c.id} value={c.id}>{c.companyName}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Valor (R$) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entryForm.value}
                    onChange={e => setEntryForm(f => ({ ...f, value: e.target.value }))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    {entryForm.status === 'pending' ? 'Data de vencimento *' : 'Data *'}
                  </label>
                  <input
                    type="date"
                    value={entryForm.date}
                    onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Observações <span className="text-slate-500 font-normal">(opcional)</span></label>
                <textarea
                  value={entryForm.notes}
                  onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Anotações adicionais..."
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => { setShowEntryModal(false); setShowNewCatInput(false); }} className="flex-1 border border-white/[0.08] text-slate-400 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleAddEntry}
                disabled={submitting || !entryForm.description.trim() || !entryForm.value || !entryForm.category}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {submitting ? 'Salvando...' : 'Salvar Lançamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Log Modal ── */}
      {showAuditLog && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100">Histórico de Alterações</h2>
              <button onClick={() => setShowAuditLog(false)} className="text-slate-400 hover:text-slate-300 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {recentAudit.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Nenhuma alteração registrada</div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {recentAudit.map(log => (
                    <div key={log.id} className="px-6 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-slate-100">
                          {log.action === 'payment_marked' ? 'Pagamento confirmado' : 'Valor atualizado'}
                        </p>
                        <span className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500">Por: <span className="font-medium text-slate-400">{log.userName}</span></p>
                      {log.oldValue && log.newValue && (
                        <p className="text-xs text-slate-500 mt-0.5">{log.oldValue} → {log.newValue}</p>
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

// ─── Main export ─────────────────────────────────────────────────────────────

export const Financial = () => {
  const { currentUser } = useAuthStore();
  if (currentUser?.role === 'professional') return <ProfessionalView />;
  return <AdminView />;
};
