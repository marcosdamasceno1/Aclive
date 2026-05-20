import { useState, useMemo } from 'react';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useFinancialStore } from '../store/financialStore';
import { useDemandsStore } from '../store/demandsStore';
import type { Professional, ProfessionType, TaskType } from '../types';
import {
  Plus, Search, Edit2, Trash2, Eye, X,
  Phone, Mail, Key, User, ToggleLeft, ToggleRight
} from 'lucide-react';
import { formatCurrency, formatDate, getProfessionLabel, getTaskTypeLabel } from '../utils/formatters';

const PROFESSIONS: ProfessionType[] = [
  'editor_video', 'designer', 'social_media', 'traffic_manager',
  'copywriter', 'account_manager', 'financial', 'manager', 'other',
];

const TASK_TYPES: TaskType[] = [
  'video', 'art', 'copy', 'traffic', 'meeting', 'planning', 'editing', 'review', 'posting', 'other',
];

const emptyForm = {
  name: '',
  profession: 'designer' as ProfessionType,
  email: '',
  phone: '',
  pixKey: '',
  status: 'active' as 'active' | 'inactive',
  defaultValues: {} as Partial<Record<TaskType, number>>,
  userId: undefined as string | undefined,
};

export const Professionals = () => {
  const { professionals, addProfessional, updateProfessional, deleteProfessional } = useProfessionalsStore();
  const { getProfessionalBalance, getMovementsByProfessional } = useFinancialStore();
  const { demands } = useDemandsStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return professionals
      .filter(p => statusFilter === 'all' || p.status === statusFilter)
      .filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        getProfessionLabel(p.profession).toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase())
      );
  }, [professionals, search, statusFilter]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (p: Professional) => {
    setForm({
      name: p.name,
      profession: p.profession,
      email: p.email,
      phone: p.phone,
      pixKey: p.pixKey,
      status: p.status,
      defaultValues: p.defaultValues || {},
      userId: p.userId,
    });
    setEditingId(p.id);
    setShowModal(true);
  };

  const openView = (p: Professional) => {
    setViewingId(p.id);
    setShowViewModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (editingId) {
      updateProfessional(editingId, form);
    } else {
      addProfessional(form);
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteProfessional(deleteId);
      setDeleteId(null);
    }
  };

  const handleDefaultValueChange = (type: TaskType, value: string) => {
    const num = parseFloat(value);
    setForm(prev => ({
      ...prev,
      defaultValues: { ...prev.defaultValues, [type]: isNaN(num) ? undefined : num },
    }));
  };

  const viewingPro = professionals.find(p => p.id === viewingId);
  const viewingBalance = viewingId ? getProfessionalBalance(viewingId) : { pending: 0, paid: 0, total: 0 };
  const viewingMovements = viewingId ? getMovementsByProfessional(viewingId).slice().reverse().slice(0, 10) : [];
  const viewingDemands = viewingId ? demands.filter(d => d.professionalId === viewingId) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Profissionais</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{professionals.length} profissional(is) cadastrado(s)</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Profissional
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, função ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center border border-slate-200">
          <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 text-sm font-medium">Nenhum profissional encontrado</p>
          <p className="text-slate-400 text-xs mt-1">Clique em "Novo Profissional" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(pro => {
            const balance = getProfessionalBalance(pro.id);
            const taskCount = demands.filter(d => d.professionalId === pro.id).length;
            return (
              <div key={pro.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                      {pro.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{pro.name}</p>
                      <p className="text-xs text-slate-500">{getProfessionLabel(pro.profession)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateProfessional(pro.id, { status: pro.status === 'active' ? 'inactive' : 'active' })}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                      pro.status === 'active'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {pro.status === 'active' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {pro.status === 'active' ? 'Ativo' : 'Inativo'}
                  </button>
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{pro.email}</span>
                  </div>
                  {pro.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {pro.phone}
                    </div>
                  )}
                  {pro.pixKey && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{pro.pixKey}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-slate-50 rounded-xl">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Tarefas</p>
                    <p className="text-sm font-bold text-slate-700">{taskCount}</p>
                  </div>
                  <div className="text-center border-x border-slate-200">
                    <p className="text-xs text-slate-400">Pendente</p>
                    <p className="text-sm font-bold text-orange-600">{formatCurrency(balance.pending)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Pago</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(balance.paid)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openView(pro)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver perfil
                  </button>
                  <button
                    onClick={() => openEdit(pro)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-blue-600 font-medium"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(pro.id)}
                    className="p-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? 'Editar Profissional' : 'Novo Profissional'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome completo *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome do profissional"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Função *</label>
                  <select
                    value={form.profession}
                    onChange={e => setForm({ ...form, profession: e.target.value as ProfessionType })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {PROFESSIONS.map(p => (
                      <option key={p} value={p}>{getProfessionLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Chave Pix</label>
                  <input
                    type="text"
                    value={form.pixKey}
                    onChange={e => setForm({ ...form, pixKey: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Valores padrão por tipo de tarefa (R$)
                </label>
                <p className="text-xs text-slate-400 mb-3">Estes valores serão preenchidos automaticamente ao criar demandas.</p>
                <div className="grid grid-cols-2 gap-2">
                  {TASK_TYPES.map(type => (
                    <div key={type} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <label className="text-xs text-slate-600 w-24 flex-shrink-0 font-medium">{getTaskTypeLabel(type)}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.defaultValues[type] !== undefined ? form.defaultValues[type] : ''}
                        onChange={e => handleDefaultValueChange(type, e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="0,00"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.email.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {editingId ? 'Salvar alterações' : 'Cadastrar profissional'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewingPro && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
              <h2 className="text-lg font-bold text-slate-800">Perfil do Profissional</h2>
              <button onClick={() => setShowViewModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl">
                  {viewingPro.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{viewingPro.name}</h3>
                  <p className="text-slate-500 text-sm">{getProfessionLabel(viewingPro.profession)}</p>
                  <span className={`mt-1 inline-flex text-xs px-2.5 py-1 rounded-full font-semibold ${
                    viewingPro.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {viewingPro.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-orange-50 rounded-xl p-4 text-center border border-orange-100">
                  <p className="text-xs text-slate-500 mb-1">Pendente</p>
                  <p className="text-lg font-bold text-orange-600">{formatCurrency(viewingBalance.pending)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                  <p className="text-xs text-slate-500 mb-1">Pago</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(viewingBalance.paid)}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(viewingBalance.total)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Informações de contato</h4>
                <div className="flex items-center gap-2 text-sm text-slate-600"><Mail className="w-4 h-4 text-slate-400" />{viewingPro.email}</div>
                <div className="flex items-center gap-2 text-sm text-slate-600"><Phone className="w-4 h-4 text-slate-400" />{viewingPro.phone || 'Não informado'}</div>
                <div className="flex items-center gap-2 text-sm text-slate-600"><Key className="w-4 h-4 text-slate-400" />{viewingPro.pixKey || 'Chave Pix não cadastrada'}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">Tarefas ({viewingDemands.length})</h4>
                </div>
                {viewingDemands.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma tarefa atribuída.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {viewingDemands.slice(0, 8).map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                        <span className="font-medium text-slate-700 truncate flex-1 mr-2">{d.title}</span>
                        <span className="text-green-600 font-bold flex-shrink-0">{formatCurrency(d.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Histórico financeiro</h4>
                {viewingMovements.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma movimentação registrada.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {viewingMovements.map(m => (
                      <div key={m.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{m.demandTitle}</p>
                          <p className="text-xs text-slate-400">{formatDate(m.completedAt)} · {m.clientName}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-bold text-slate-800">{formatCurrency(m.value)}</p>
                          <span className={`text-xs font-medium ${m.status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}>
                            {m.status === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">
              Tem certeza que deseja excluir este profissional? O histórico financeiro será mantido, mas o profissional não poderá receber novas tarefas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
