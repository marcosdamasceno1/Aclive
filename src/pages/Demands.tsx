import { useState, useMemo, useEffect } from 'react';
import { useDemandsStore } from '../store/demandsStore';
import { useClientsStore } from '../store/clientsStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useAuthStore } from '../store/authStore';
import type { Demand, KanbanStatus, Priority, TaskType } from '../types';
import {
  Plus, Search, Edit2, Trash2, Eye, X, MessageSquare, Send,
  AlertTriangle, Calendar, Filter
} from 'lucide-react';
import {
  formatCurrency, formatDate, formatDateTime,
  getStatusLabel, getStatusColor, getPriorityLabel, getPriorityColor,
  getTaskTypeLabel, isOverdue
} from '../utils/formatters';
import { canCreateDemands, canViewAllDemands } from '../utils/permissions';

const TASK_TYPES: TaskType[] = [
  'video', 'art', 'copy', 'traffic', 'meeting', 'planning', 'editing', 'review', 'posting', 'other',
];

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

const STATUSES: KanbanStatus[] = [
  'new', 'briefing', 'production', 'review', 'adjustments', 'approved', 'completed', 'paid',
];

const emptyForm = {
  clientId: '',
  title: '',
  description: '',
  taskType: 'art' as TaskType,
  professionalId: '',
  deadline: '',
  priority: 'medium' as Priority,
  value: 0,
  status: 'new' as KanbanStatus,
};

export const Demands = () => {
  const { currentUser } = useAuthStore();
  const { demands, addDemand, updateDemand, deleteDemand, addComment } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KanbanStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const canCreate = currentUser ? canCreateDemands(currentUser.role) : false;
  const canViewAll = currentUser ? canViewAllDemands(currentUser.role) : false;

  const filtered = useMemo(() => {
    let list = demands;
    if (!canViewAll && currentUser?.professionalId) {
      list = list.filter(d => d.professionalId === currentUser.professionalId);
    }
    if (statusFilter !== 'all') list = list.filter(d => d.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter(d => d.priority === priorityFilter);
    if (professionalFilter !== 'all') list = list.filter(d => d.professionalId === professionalFilter);
    if (clientFilter !== 'all') list = list.filter(d => d.clientId === clientFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(d => d.title.toLowerCase().includes(s) || d.description.toLowerCase().includes(s));
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [demands, canViewAll, currentUser, statusFilter, priorityFilter, professionalFilter, clientFilter, search]);

  // Auto-fill value when professional + task type changes
  useEffect(() => {
    if (form.professionalId && form.taskType) {
      const prof = professionals.find(p => p.id === form.professionalId);
      const defaultVal = prof?.defaultValues?.[form.taskType];
      if (defaultVal !== undefined) {
        setForm(prev => ({ ...prev, value: defaultVal }));
      }
    }
  }, [form.professionalId, form.taskType, professionals]);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (d: Demand) => {
    setForm({
      clientId: d.clientId,
      title: d.title,
      description: d.description,
      taskType: d.taskType,
      professionalId: d.professionalId,
      deadline: d.deadline,
      priority: d.priority,
      value: d.value,
      status: d.status,
    });
    setEditingId(d.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.professionalId || !form.clientId) return;
    if (editingId) {
      updateDemand(editingId, form);
    } else {
      addDemand({ ...form, createdBy: currentUser?.id || '' });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteId) { deleteDemand(deleteId); setDeleteId(null); }
  };

  const handleAddComment = () => {
    if (!commentText.trim() || !viewingId || !currentUser) return;
    addComment(viewingId, {
      authorId: currentUser.id,
      authorName: currentUser.name,
      text: commentText.trim(),
    });
    setCommentText('');
  };

  const viewingDemand = demands.find(d => d.id === viewingId);
  const viewingClient = clients.find(c => c.id === viewingDemand?.clientId);
  const viewingProfessional = professionals.find(p => p.id === viewingDemand?.professionalId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Demandas</h1>
          <p className="text-slate-500 text-sm mt-1">{filtered.length} demanda(s) encontrada(s)</p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Demanda
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Todos os status</option>
            {STATUSES.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Todas as prioridades</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{getPriorityLabel(p)}</option>)}
          </select>
          {canViewAll && (
            <>
              <select value={professionalFilter} onChange={e => setProfessionalFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Todos os profissionais</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Todos os clientes</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Nenhuma demanda encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tarefa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Profissional</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prioridade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prazo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(demand => {
                  const client = clients.find(c => c.id === demand.clientId);
                  const prof = professionals.find(p => p.id === demand.professionalId);
                  const overdue = isOverdue(demand.deadline, demand.status);
                  return (
                    <tr key={demand.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {overdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{demand.title}</p>
                            {demand.comments.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                <MessageSquare className="w-3 h-3" />
                                {demand.comments.length}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{client?.companyName || '—'}</td>
                      <td className="px-4 py-3">
                        {prof ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {prof.name.charAt(0)}
                            </div>
                            <span className="text-sm text-slate-600">{prof.name}</span>
                          </div>
                        ) : <span className="text-sm text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">
                          {getTaskTypeLabel(demand.taskType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPriorityColor(demand.priority)}`}>
                          {getPriorityLabel(demand.priority)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(demand.deadline)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(demand.value)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(demand.status)}`}>
                          {getStatusLabel(demand.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setViewingId(demand.id); setShowViewModal(true); }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canCreate && (
                            <>
                              <button
                                onClick={() => openEdit(demand)}
                                className="p-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteId(demand.id)}
                                className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? 'Editar Demanda' : 'Nova Demanda'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Título da tarefa *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Criação de post para Instagram"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cliente *</label>
                  <select
                    value={form.clientId}
                    onChange={e => setForm({ ...form, clientId: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Selecionar cliente</option>
                    {clients.filter(c => c.status === 'active').map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de tarefa</label>
                  <select
                    value={form.taskType}
                    onChange={e => setForm({ ...form, taskType: e.target.value as TaskType })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {TASK_TYPES.map(t => <option key={t} value={t}>{getTaskTypeLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Profissional responsável *</label>
                  <select
                    value={form.professionalId}
                    onChange={e => setForm({ ...form, professionalId: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Selecionar profissional</option>
                    {professionals.filter(p => p.status === 'active').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Valor (R$)
                    {form.professionalId && form.taskType && (
                      <span className="text-xs text-blue-500 ml-1 font-normal">(preenchido automaticamente)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Prazo</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as Priority })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{getPriorityLabel(p)}</option>)}
                  </select>
                </div>
                {editingId && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as KanbanStatus })}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição detalhada</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Descreva detalhes da tarefa, requisitos, referências..."
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || !form.clientId || !form.professionalId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-xl text-sm font-semibold"
              >
                {editingId ? 'Salvar alterações' : 'Criar demanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Comment Modal */}
      {showViewModal && viewingDemand && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
              <h2 className="text-lg font-bold text-slate-800 truncate flex-1 mr-4">{viewingDemand.title}</h2>
              <button onClick={() => { setShowViewModal(false); setCommentText(''); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusColor(viewingDemand.status)}`}>
                  {getStatusLabel(viewingDemand.status)}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getPriorityColor(viewingDemand.priority)}`}>
                  {getPriorityLabel(viewingDemand.priority)}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                  {getTaskTypeLabel(viewingDemand.taskType)}
                </span>
                {isOverdue(viewingDemand.deadline, viewingDemand.status) && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Atrasada
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Cliente</p>
                  <p className="text-slate-700 font-semibold">{viewingClient?.companyName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Profissional</p>
                  <p className="text-slate-700 font-semibold">{viewingProfessional?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Prazo</p>
                  <p className="text-slate-700 font-semibold">{formatDate(viewingDemand.deadline)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Valor</p>
                  <p className="text-green-600 font-bold text-base">{formatCurrency(viewingDemand.value)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Criada em</p>
                  <p className="text-slate-700">{formatDate(viewingDemand.createdAt)}</p>
                </div>
                {viewingDemand.completedAt && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Concluída em</p>
                    <p className="text-slate-700">{formatDate(viewingDemand.completedAt)}</p>
                  </div>
                )}
              </div>

              {viewingDemand.description && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Descrição</p>
                  <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {viewingDemand.description}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-700">Comentários ({viewingDemand.comments.length})</p>
                </div>
                {viewingDemand.comments.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhum comentário ainda.</p>
                ) : (
                  <div className="space-y-3 max-h-48 overflow-y-auto mb-3">
                    {viewingDemand.comments.map(comment => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {comment.authorName.charAt(0)}
                        </div>
                        <div className="flex-1 bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                            <span className="text-xs text-slate-400">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-600">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                    placeholder="Adicionar comentário interno..."
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white rounded-xl transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">Esta ação não pode ser desfeita. Deseja excluir esta demanda?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
