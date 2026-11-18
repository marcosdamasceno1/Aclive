import { useState, useMemo } from 'react';
import { useFinancialStore } from '../store/financialStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useClientsStore } from '../store/clientsStore';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import type { FinancialMovement } from '../types';
import {
  CheckCircle2, X, History, Search, Plus, Trash2, ArrowDownCircle, BarChart3, Clock, DollarSign,
  ArrowUpRight, ArrowDownRight, UserRound, ChevronLeft, ChevronRight, Copy, Check, Pencil, Repeat,
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
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Meu Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Acompanhe seus ganhos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <DollarSign className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Sua conta ainda não está vinculada a um perfil profissional.</p>
          <p className="text-slate-500 text-xs mt-1">Fale com o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Meu Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Acompanhe seus ganhos</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-8 h-8 bg-orange-500/[0.12] rounded-lg flex items-center justify-center">
              <ArrowDownCircle className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{formatCurrency(totals.pending)}</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">A Receber</p>
          <p className="text-xs text-slate-500 mt-0.5">{myMovements.filter(m => m.status === 'pending').length} demanda(s)</p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-8 h-8 bg-emerald-500/[0.12] rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{formatCurrency(totals.paid)}</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 uppercase tracking-wide">Recebido</p>
          <p className="text-xs text-slate-500 mt-0.5">{myMovements.filter(m => m.status === 'paid').length} pagamento(s)</p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-8 h-8 bg-blue-500/[0.12] rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{formatCurrency(totals.total)}</p>
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
                : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200'
            }`}
          >
            {s === 'all' ? 'Todos' : s === 'pending' ? 'A Receber' : 'Recebido'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide">Demanda</th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide">Cliente</th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide">Conclusão</th>
              <th className="text-right px-3 sm:px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide">Valor</th>
              <th className="text-center px-3 sm:px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">
                  Nenhuma movimentação para este mês.
                </td>
              </tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="hover:bg-slate-100 transition-colors">
                <td className="px-3 sm:px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{m.demandTitle}</p>
                  <p className="sm:hidden text-xs text-slate-500 mt-0.5">{m.clientName} · {formatDate(m.completedAt)}</p>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-500">{m.clientName}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-500">{formatDate(m.completedAt)}</td>
                <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(m.value)}</span>
                </td>
                <td className="px-3 sm:px-4 py-3 text-center">
                  {m.status === 'paid' ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/[0.1] text-emerald-600 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Pago
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-orange-500/[0.1] text-orange-600">
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

type Kind = 'income' | 'expense' | 'provider';
type Movement = FinancialMovement;

const kindOf = (m: Movement): Kind => m.type === 'credit' ? 'provider' : m.type === 'income' ? 'income' : 'expense';
const day = (s?: string) => (s || '').slice(0, 10);
// Data que posiciona o lançamento no mês: quando pago, a data do pagamento; senão, o vencimento.
const refDate = (m: Movement) => m.status === 'paid' ? day(m.paidAt || m.completedAt) : day(m.completedAt);
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayStr().slice(0, 7);
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
};
const addMonths = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const r = new Date(y, m - 1 + n, Math.min(d, last));
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
};
const sum = (list: Movement[]) => list.reduce((s, m) => s + m.value, 0);

const emptyEntry = {
  type: 'income' as 'income' | 'expense',
  category: '',
  description: '',
  value: '',
  date: todayStr(),
  notes: '',
  clientId: '',
  status: 'paid' as 'pending' | 'paid',
  repeat: 1,
};

const Stat = ({ label, value, sub, tone = 'text-slate-900' }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className="bg-white rounded-xl px-4 py-3.5 border border-slate-200">
    <p className="text-sm text-slate-500">{label}</p>
    <p className={`text-xl sm:text-2xl font-semibold tracking-tight mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

const KIND_STYLE: Record<Kind, { icon: React.ElementType; bubble: string; sign: string; value: string }> = {
  income:   { icon: ArrowUpRight,   bubble: 'bg-emerald-50 text-emerald-600', sign: '+', value: 'text-emerald-600' },
  expense:  { icon: ArrowDownRight, bubble: 'bg-red-50 text-red-600',         sign: '−', value: 'text-slate-900' },
  provider: { icon: UserRound,      bubble: 'bg-violet-50 text-violet-600',   sign: '−', value: 'text-slate-900' },
};

const CopyButton = ({ text }: { text: string }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'Copiado' : 'Copiar Pix'}
    </button>
  );
};

const AdminView = () => {
  const { currentUser } = useAuthStore();
  const { movements, markAsPaid, updateMovementValue, updateEntry, deleteMovement, addManualEntry, auditLog, customCategories, addCustomCategory } = useFinancialStore();
  const { professionals } = useProfessionalsStore();
  const { clients } = useClientsStore();

  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState<'summary' | 'entries' | 'providers'>('summary');
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [search, setSearch] = useState('');

  const [confirmPay, setConfirmPay] = useState<Movement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Movement | null>(null);
  const [valueEdit, setValueEdit] = useState<{ m: Movement; value: string } | null>(null);
  const [payProvider, setPayProvider] = useState<{ id: string; selected: Set<string> } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const [entryModal, setEntryModal] = useState<{ editing: Movement | null } | null>(null);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const today = todayStr();
  const isCurrentMonth = month === thisMonth();
  const monthStart = `${month}-01`;
  const profName = (id: string) => professionals.find(p => p.id === id)?.name || 'Prestador';
  const isOverdue = (m: Movement) => m.status === 'pending' && day(m.completedAt) < today;

  // Lançamentos do mês + pendências vencidas de meses anteriores (só no mês atual).
  const monthMovements = useMemo(() => movements.filter(m =>
    refDate(m).startsWith(month) ||
    (isCurrentMonth && m.status === 'pending' && kindOf(m) !== 'provider' && refDate(m) < monthStart),
  ), [movements, month, isCurrentMonth, monthStart]);

  const summary = useMemo(() => {
    const of = (k: Kind, status: 'paid' | 'pending') => monthMovements.filter(m => kindOf(m) === k && m.status === status);
    const providersPending = movements.filter(m => kindOf(m) === 'provider' && m.status === 'pending');
    const received = sum(of('income', 'paid'));
    const paidOut = sum(of('expense', 'paid')) + sum(of('provider', 'paid'));
    const toReceive = sum(of('income', 'pending'));
    const toPay = sum(of('expense', 'pending'));
    const providersTotal = sum(providersPending);
    return {
      received, paidOut, toReceive, toPay, providersTotal,
      providersCount: providersPending.length,
      balance: received - paidOut,
      forecast: received - paidOut + toReceive - toPay - providersTotal,
    };
  }, [monthMovements, movements]);

  const sortForList = (a: Movement, b: Movement) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    if (a.status === 'pending') return refDate(a).localeCompare(refDate(b));
    return refDate(b).localeCompare(refDate(a));
  };

  const entries = useMemo(() => {
    const s = search.trim().toLowerCase();
    return monthMovements
      .filter(m => kindFilter === 'all' || kindOf(m) === kindFilter)
      .filter(m => statusFilter === 'all' || m.status === statusFilter)
      .filter(m => !s || [m.demandTitle, m.clientName, m.category, kindOf(m) === 'provider' ? professionals.find(p => p.id === m.professionalId)?.name : '']
        .some(v => (v || '').toLowerCase().includes(s)))
      .sort(sortForList);
  }, [monthMovements, kindFilter, statusFilter, search, professionals]);

  const pendingBills = useMemo(() =>
    monthMovements.filter(m => kindOf(m) !== 'provider' && m.status === 'pending').sort(sortForList),
  [monthMovements]);

  const providers = useMemo(() => {
    const credits = movements.filter(m => kindOf(m) === 'provider');
    return professionals
      .map(p => {
        const mine = credits.filter(m => m.professionalId === p.id);
        const pending = mine.filter(m => m.status === 'pending').sort((a, b) => refDate(a).localeCompare(refDate(b)));
        const paidMonth = mine.filter(m => m.status === 'paid' && refDate(m).startsWith(month));
        return { ...p, pending, pendingTotal: sum(pending), paidMonthTotal: sum(paidMonth), hasHistory: mine.length > 0 };
      })
      .filter(p => p.hasHistory || p.status === 'active')
      .sort((a, b) => b.pendingTotal - a.pendingTotal || a.name.localeCompare(b.name));
  }, [professionals, movements, month]);

  // ── Ações ──
  const confirmMarkPaid = () => {
    if (!confirmPay || !currentUser) return;
    markAsPaid(confirmPay.id, currentUser.id, currentUser.name);
    setConfirmPay(null);
  };

  const confirmProviderPayment = () => {
    if (!payProvider || !currentUser) return;
    payProvider.selected.forEach(id => markAsPaid(id, currentUser.id, currentUser.name));
    setPayProvider(null);
  };

  const saveValueEdit = () => {
    if (!valueEdit || !currentUser) return;
    const v = parseFloat(valueEdit.value.replace(',', '.'));
    if (isNaN(v) || v < 0) return;
    updateMovementValue(valueEdit.m.id, v, currentUser.id, currentUser.name);
    setValueEdit(null);
  };

  const openNewEntry = (type: 'income' | 'expense' = 'income') => {
    setEntryForm({ ...emptyEntry, type, date: todayStr() });
    setShowNewCatInput(false);
    setEntryModal({ editing: null });
  };

  const openEditEntry = (m: Movement) => {
    setEntryForm({
      type: m.type === 'income' ? 'income' : 'expense',
      category: m.category || '',
      description: m.demandTitle,
      value: String(m.value),
      date: day(m.completedAt) || todayStr(),
      notes: m.notes || '',
      clientId: m.clientId || '',
      status: m.status,
      repeat: 1,
    });
    setShowNewCatInput(false);
    setEntryModal({ editing: m });
  };

  const entryValue = parseFloat(entryForm.value.replace(',', '.'));
  const entryValid = !!entryForm.description.trim() && !isNaN(entryValue) && entryValue > 0 && !!entryForm.date;

  const saveEntry = () => {
    if (!entryModal || !entryValid || !currentUser) return;
    const client = entryForm.clientId ? clients.find(c => c.id === entryForm.clientId) : undefined;
    const base = {
      type: entryForm.type,
      category: entryForm.category || 'Outros',
      description: entryForm.description.trim(),
      value: entryValue,
      date: entryForm.date,
      notes: entryForm.notes || undefined,
      clientId: entryForm.clientId || undefined,
      clientName: client?.companyName,
      status: entryForm.status,
    };
    if (entryModal.editing) {
      updateEntry(entryModal.editing.id, base, currentUser.id, currentUser.name);
    } else {
      const n = Math.max(1, Math.min(36, Math.floor(entryForm.repeat) || 1));
      for (let i = 0; i < n; i++) {
        addManualEntry({
          ...base,
          description: n > 1 ? `${base.description} (${i + 1}/${n})` : base.description,
          date: addMonths(entryForm.date, i),
          status: i === 0 ? base.status : 'pending',
          createdBy: currentUser.name,
        });
      }
    }
    setEntryModal(null);
  };

  const baseCategories = entryForm.type === 'income'
    ? [...DEFAULT_INCOME_CATEGORIES, ...customCategories.income]
    : [...DEFAULT_EXPENSE_CATEGORIES, ...customCategories.expense];
  // Categoria salva que não está mais na lista (ex.: criada em outro aparelho) continua selecionável.
  const availableCategories = entryForm.category && !baseCategories.includes(entryForm.category)
    ? [...baseCategories, entryForm.category]
    : baseCategories;

  const handleAddCustomCategory = () => {
    if (!newCatName.trim()) return;
    addCustomCategory(entryForm.type, newCatName.trim());
    setEntryForm(f => ({ ...f, category: newCatName.trim() }));
    setNewCatName('');
    setShowNewCatInput(false);
  };

  const recentAudit = [...auditLog]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  const payingProvider = payProvider ? providers.find(p => p.id === payProvider.id) : null;
  const payingTotal = payingProvider ? sum(payingProvider.pending.filter(m => payProvider!.selected.has(m.id))) : 0;
  const openPayProvider = (id: string) => {
    const p = providers.find(x => x.id === id);
    if (p) setPayProvider({ id, selected: new Set(p.pending.map(m => m.id)) });
  };

  // ── Linha do extrato ──
  const renderRow = (m: Movement) => {
    const k = kindOf(m);
    const st = KIND_STYLE[k];
    const Icon = st.icon;
    const overdue = isOverdue(m);
    const dateText = m.status === 'paid'
      ? `${k === 'income' ? 'Recebido' : 'Pago'} ${formatDate(refDate(m))}`
      : `${overdue ? 'Venceu' : 'Vence'} ${formatDate(day(m.completedAt))}`;
    const meta = [
      k === 'provider' ? profName(m.professionalId) : m.category,
      m.clientName,
    ].filter(Boolean).join(' · ');
    return (
      <div
        key={m.id}
        onClick={() => k === 'provider' ? (m.status === 'pending' && setValueEdit({ m, value: String(m.value) })) : openEditEntry(m)}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${st.bubble}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{m.demandTitle}</p>
          <p className="text-xs text-slate-500 truncate">
            {meta && <>{meta} · </>}
            <span className={overdue ? 'text-red-600 font-medium' : ''}>{dateText}</span>
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-semibold ${m.status === 'pending' ? 'text-slate-400' : st.value}`}>
            {st.sign} {formatCurrency(m.value)}
          </p>
          {m.status === 'pending' && (
            <p className={`text-xs ${overdue ? 'text-red-600' : 'text-orange-600'}`}>
              {k === 'income' ? 'A receber' : 'A pagar'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {m.status === 'pending' && (
            <button
              onClick={() => k === 'provider' ? openPayProvider(m.professionalId) : setConfirmPay(m)}
              title={k === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}
              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          {k === 'provider' ? (
            m.status === 'pending' && (
              <button onClick={() => setValueEdit({ m, value: String(m.value) })} title="Corrigir valor" className="hidden sm:inline-flex p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <Pencil className="w-4 h-4" />
              </button>
            )
          ) : (
            <>
              <button onClick={() => openEditEntry(m)} title="Editar" className="hidden sm:inline-flex p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setConfirmDelete(m)} title="Excluir" className="hidden sm:inline-flex p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const providersToPay = providers.filter(p => p.pendingTotal > 0).length;

  const TABS = [
    { key: 'summary', label: 'Resumo' },
    { key: 'entries', label: 'Lançamentos' },
    { key: 'providers', label: 'Prestadores', badge: providersToPay },
  ] as const;

  const KIND_FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'income', label: 'Entradas' },
    { key: 'expense', label: 'Saídas' },
    { key: 'provider', label: 'Prestadores' },
  ] as const;

  const card = 'bg-white rounded-xl border border-slate-200';
  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const toggle = (active: boolean, color: string) =>
    `flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
      active ? `${color} text-white border-transparent` : 'border-slate-200 text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Entradas, saídas e pagamento de prestadores</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex flex-1 sm:flex-none items-center justify-between bg-white border border-slate-200 rounded-lg">
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mês anterior" className="p-2 text-slate-500 hover:text-slate-900">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-900 sm:w-36 text-center whitespace-nowrap">{monthLabel(month)}</span>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Próximo mês" className="p-2 text-slate-500 hover:text-slate-900">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowAuditLog(true)} title="Histórico de alterações" className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900">
            <History className="w-4 h-4" />
          </button>
          <button onClick={() => openNewEntry()} aria-label="Novo lançamento" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Lançamento</span>
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 pb-2.5 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
            {'badge' in t && t.badge > 0 && (
              <span className="text-[11px] bg-orange-100 text-orange-700 px-1.5 rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Resumo ── */}
      {tab === 'summary' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Recebido no mês" value={formatCurrency(summary.received)} tone="text-emerald-600"
              sub={summary.toReceive > 0 ? `+ ${formatCurrency(summary.toReceive)} a receber` : undefined} />
            <Stat label="Pago no mês" value={formatCurrency(summary.paidOut)}
              sub={summary.toPay > 0 ? `+ ${formatCurrency(summary.toPay)} em contas a pagar` : 'inclui prestadores pagos'} />
            <Stat label="Prestadores a pagar" value={formatCurrency(summary.providersTotal)} tone={summary.providersTotal > 0 ? 'text-orange-600' : 'text-slate-900'}
              sub={`${providersToPay} prestador(es) · ${summary.providersCount} demanda(s)`} />
            <Stat label="Saldo do mês" value={formatCurrency(summary.balance)} tone={summary.balance >= 0 ? 'text-slate-900' : 'text-red-600'}
              sub={`Previsto: ${formatCurrency(summary.forecast)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Contas a receber e a pagar</h3>
                <button onClick={() => { setTab('entries'); setStatusFilter('pending'); setKindFilter('all'); }} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Ver todas
                </button>
              </div>
              {pendingBills.length === 0 ? (
                <p className="px-4 py-8 text-sm text-slate-500 text-center">Nenhuma conta pendente neste mês.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendingBills.slice(0, 6).map(renderRow)}
                </div>
              )}
            </div>

            <div className={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Prestadores a pagar</h3>
                <button onClick={() => setTab('providers')} className="text-xs font-medium text-blue-600 hover:text-blue-700">Ver todos</button>
              </div>
              {providers.filter(p => p.pendingTotal > 0).length === 0 ? (
                <p className="px-4 py-8 text-sm text-slate-500 text-center">Todos os prestadores estão em dia.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {providers.filter(p => p.pendingTotal > 0).slice(0, 6).map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.pending.length} demanda(s)</p>
                      </div>
                      <p className="text-sm font-semibold text-orange-600">{formatCurrency(p.pendingTotal)}</p>
                      <button onClick={() => openPayProvider(p.id)} className="text-xs font-medium bg-slate-900 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg">
                        Pagar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lançamentos (extrato único) ── */}
      {tab === 'entries' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar descrição, cliente, categoria ou prestador"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Todos os status</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos / recebidos</option>
            </select>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {KIND_FILTERS.map(f => (
              <button key={f.key} onClick={() => setKindFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  kindFilter === f.key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className={card}>
            {entries.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-slate-500">Nenhum lançamento em {monthLabel(month).toLowerCase()} com esses filtros.</p>
                <button onClick={() => openNewEntry()} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">+ Novo lançamento</button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.map(renderRow)}
              </div>
            )}
          </div>
          {entries.length > 0 && (
            <p className="text-xs text-slate-500 text-right">
              {entries.length} lançamento(s) · Entradas {formatCurrency(sum(entries.filter(m => kindOf(m) === 'income')))} ·
              Saídas {formatCurrency(sum(entries.filter(m => kindOf(m) !== 'income')))}
            </p>
          )}
        </div>
      )}

      {/* ── Prestadores ── */}
      {tab === 'providers' && (
        <div className={card}>
          {providers.length === 0 ? (
            <p className="px-4 py-12 text-sm text-slate-500 text-center">Nenhum prestador cadastrado.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {providers.map(p => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center font-semibold flex-shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-[10rem]">
                    <p className="text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      {p.pixKey ? <>Pix: {p.pixKey} <CopyButton text={p.pixKey} /></> : <span className="text-orange-600">Sem chave Pix cadastrada</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    {p.pendingTotal > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-orange-600">{formatCurrency(p.pendingTotal)}</p>
                        <p className="text-xs text-slate-500">{p.pending.length} demanda(s) a pagar</p>
                      </>
                    ) : (
                      <p className="text-sm text-emerald-600 font-medium">Em dia</p>
                    )}
                    {p.paidMonthTotal > 0 && (
                      <p className="text-xs text-slate-500">Pago no mês: {formatCurrency(p.paidMonthTotal)}</p>
                    )}
                  </div>
                  {p.pendingTotal > 0 && (
                    <button onClick={() => openPayProvider(p.id)} className="text-sm font-medium bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-lg">
                      Pagar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pagar prestador ── */}
      {payProvider && payingProvider && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Pagar {payingProvider.name}</h2>
                <p className="text-xs text-slate-500">Selecione as demandas incluídas neste pagamento</p>
              </div>
              <button onClick={() => setPayProvider(null)} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {payingProvider.pending.map(m => {
                const checked = payProvider.selected.has(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPayProvider(pp => {
                        if (!pp) return pp;
                        const next = new Set(pp.selected);
                        if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                        return { ...pp, selected: next };
                      })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-900 truncate">{m.demandTitle}</span>
                      <span className="block text-xs text-slate-500">{[m.clientName, `concluída ${formatDate(day(m.completedAt))}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-sm font-medium text-slate-900">{formatCurrency(m.value)}</span>
                  </label>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {payingProvider.pixKey ? <>Pix: <span className="text-slate-900">{payingProvider.pixKey}</span> <CopyButton text={payingProvider.pixKey} /></> : 'Prestador sem chave Pix'}
                </span>
              </div>
              <button
                onClick={confirmProviderPayment}
                disabled={payProvider.selected.size === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                Confirmar pagamento de {formatCurrency(payingTotal)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar recebimento/pagamento ── */}
      {confirmPay && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-slate-900">
              {confirmPay.type === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {confirmPay.demandTitle} · {formatCurrency(confirmPay.value)}. Fica registrado com a data de hoje no histórico.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmPay(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmMarkPaid} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-semibold">
                {confirmPay.type === 'income' ? 'Recebido' : 'Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar exclusão ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-slate-900">Excluir lançamento?</h3>
            <p className="text-sm text-slate-500 mt-1">{confirmDelete.demandTitle} · {formatCurrency(confirmDelete.value)}. Não dá para desfazer.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { deleteMovement(confirmDelete.id); setConfirmDelete(null); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Corrigir valor (prestador) ── */}
      {valueEdit && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-slate-900">Corrigir valor</h3>
            <p className="text-sm text-slate-500 mt-1">{valueEdit.m.demandTitle} · {profName(valueEdit.m.professionalId)}</p>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={valueEdit.value}
              onChange={e => setValueEdit(v => v && { ...v, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveValueEdit(); }}
              className={`${input} mt-4`}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setValueEdit(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={saveValueEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Novo / editar lançamento ── */}
      {entryModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-md max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">{entryModal.editing ? 'Editar lançamento' : 'Novo lançamento'}</h2>
              <button onClick={() => setEntryModal(null)} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, type: 'income', category: '' }))} className={toggle(entryForm.type === 'income', 'bg-emerald-600')}>
                  <ArrowUpRight className="w-4 h-4" /> Entrada
                </button>
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, type: 'expense', category: '' }))} className={toggle(entryForm.type === 'expense', 'bg-red-600')}>
                  <ArrowDownRight className="w-4 h-4" /> Saída
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição</label>
                <input type="text" autoFocus={!entryModal.editing} value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  className={input} placeholder={entryForm.type === 'income' ? 'Ex.: Mensalidade Brito Advocacia' : 'Ex.: Assinatura Adobe'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor (R$)</label>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={entryForm.value}
                    onChange={e => setEntryForm(f => ({ ...f, value: e.target.value }))} className={input} placeholder="0,00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{entryForm.status === 'pending' ? 'Vencimento' : 'Data'}</label>
                  <input type="date" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} className={input} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, status: 'paid' }))} className={toggle(entryForm.status === 'paid', 'bg-slate-900')}>
                  <CheckCircle2 className="w-4 h-4" /> {entryForm.type === 'income' ? 'Já recebido' : 'Já pago'}
                </button>
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, status: 'pending' }))} className={toggle(entryForm.status === 'pending', 'bg-orange-500')}>
                  <Clock className="w-4 h-4" /> {entryForm.type === 'income' ? 'A receber' : 'A pagar'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700">Categoria</label>
                  <button type="button" onClick={() => { setShowNewCatInput(v => !v); setNewCatName(''); }} className="text-xs text-blue-600 hover:text-blue-700">
                    + Nova categoria
                  </button>
                </div>
                {showNewCatInput ? (
                  <div className="flex gap-2">
                    <input type="text" autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCategory(); } if (e.key === 'Escape') setShowNewCatInput(false); }}
                      className={input} placeholder="Nome da categoria" />
                    <button type="button" onClick={handleAddCustomCategory} className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Criar</button>
                  </div>
                ) : (
                  <select value={entryForm.category} onChange={e => setEntryForm(f => ({ ...f, category: e.target.value }))} className={input}>
                    <option value="">Outros</option>
                    {availableCategories.filter(c => c !== 'Outros').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Cliente <span className="text-slate-400 font-normal">(opcional)</span></label>
                <select value={entryForm.clientId} onChange={e => setEntryForm(f => ({ ...f, clientId: e.target.value }))} className={input}>
                  <option value="">Nenhum</option>
                  {clients.filter(c => c.status === 'active' || c.id === entryForm.clientId).map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
              </div>

              {!entryModal.editing && (
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                    <Repeat className="w-4 h-4 text-slate-400" /> Repetir todo mês
                  </label>
                  <select value={entryForm.repeat} onChange={e => setEntryForm(f => ({ ...f, repeat: Number(e.target.value) }))} className={input}>
                    <option value={1}>Não repetir</option>
                    {[2, 3, 6, 12, 24].map(n => <option key={n} value={n}>Por {n} meses</option>)}
                  </select>
                  {entryForm.repeat > 1 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cria {entryForm.repeat} lançamentos, um por mês, até {formatDate(addMonths(entryForm.date, entryForm.repeat - 1))}. Os meses seguintes ficam como {entryForm.type === 'income' ? 'a receber' : 'a pagar'}.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Observações <span className="text-slate-400 font-normal">(opcional)</span></label>
                <textarea rows={2} value={entryForm.notes} onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))} className={`${input} resize-none`} />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-200">
              {entryModal.editing && (
                <button
                  onClick={() => { setConfirmDelete(entryModal.editing); setEntryModal(null); }}
                  aria-label="Excluir lançamento"
                  className="px-3 border border-slate-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setEntryModal(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={saveEntry} disabled={!entryValid} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold">
                {entryModal.editing ? 'Salvar alterações' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Histórico ── */}
      {showAuditLog && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80dvh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Histórico de alterações</h2>
              <button onClick={() => setShowAuditLog(false)} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {recentAudit.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Nenhuma alteração registrada</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentAudit.map(log => {
                    const target = movements.find(m => m.id === log.entityId);
                    const money = (v?: string) => (v && !isNaN(Number(v)) ? formatCurrency(Number(v)) : v);
                    return (
                      <div key={log.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">
                            {log.action === 'payment_marked' ? 'Pagamento confirmado' : 'Valor alterado'}
                            {target && <span className="font-normal text-slate-500"> · {target.demandTitle}</span>}
                          </p>
                          <span className="text-xs text-slate-500 flex-shrink-0">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Por {log.userName}
                          {log.action === 'value_updated' && log.oldValue && log.newValue && <> · {money(log.oldValue)} → {money(log.newValue)}</>}
                        </p>
                      </div>
                    );
                  })}
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
