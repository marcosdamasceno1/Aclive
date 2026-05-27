import { useState, useMemo } from 'react';
import { useClientsStore } from '../store/clientsStore';
import { useDemandsStore } from '../store/demandsStore';
import type { Client, ClientStatus } from '../types';
import {
  Plus, Search, Edit2, Trash2, Eye, X,
  Phone, Mail, Building2, FileText
} from 'lucide-react';
import { formatDate, getStatusLabel } from '../utils/formatters';

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  prospect: 'Prospect',
};

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: 'bg-green-500/[0.1] text-green-400',
  inactive: 'bg-white/[0.08] text-slate-400',
  prospect: 'bg-blue-500/[0.1] text-blue-400',
};

const emptyForm = {
  companyName: '',
  contactName: '',
  phone: '',
  email: '',
  plan: '',
  notes: '',
  status: 'active' as ClientStatus,
};

export const Clients = () => {
  const { clients, addClient, updateClient, deleteClient } = useClientsStore();
  const { demands } = useDemandsStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return clients
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .filter(c =>
        c.companyName.toLowerCase().includes(search.toLowerCase()) ||
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase())
      );
  }, [clients, search, statusFilter]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (c: Client) => {
    setForm({
      companyName: c.companyName,
      contactName: c.contactName,
      phone: c.phone,
      email: c.email,
      plan: c.plan,
      notes: c.notes,
      status: c.status,
    });
    setEditingId(c.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.companyName.trim()) return;
    if (editingId) {
      updateClient(editingId, form);
    } else {
      addClient(form);
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteClient(deleteId);
      setDeleteId(null);
    }
  };

  const viewingClient = clients.find(c => c.id === viewingId);
  const viewingDemands = viewingId ? demands.filter(d => d.clientId === viewingId) : [];
  const openDemands = viewingDemands.filter(d => !['completed', 'paid'].includes(d.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Clientes</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">
            {clients.filter(c => c.status === 'active').length} ativo(s) · {clients.length} total
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, responsável ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="prospect">Prospects</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#21262d] rounded-xl p-16 text-center border border-white/[0.08]">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-500" />
          <p className="text-slate-500 text-sm font-medium">Nenhum cliente encontrado</p>
          <p className="text-slate-400 text-xs mt-1">Clique em "Novo Cliente" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => {
            const clientDemands = demands.filter(d => d.clientId === client.id);
            const openCount = clientDemands.filter(d => !['completed', 'paid'].includes(d.status)).length;
            return (
              <div key={client.id} className="bg-[#21262d] rounded-xl p-5 border border-white/[0.08] hover:border-blue-600/50 hover:shadow-black/40 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                      {client.companyName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">{client.companyName}</p>
                      <p className="text-xs text-slate-500">{client.contactName || '—'}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[client.status]}`}>
                    {STATUS_LABELS[client.status]}
                  </span>
                </div>

                <div className="space-y-1.5 mb-4">
                  {client.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {client.phone}
                    </div>
                  )}
                  {client.plan && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">Plano: {client.plan}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-[#161b22] rounded-xl">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Demandas abertas</p>
                    <p className="text-sm font-bold text-blue-600">{openCount}</p>
                  </div>
                  <div className="text-center border-l border-white/[0.08]">
                    <p className="text-xs text-slate-400">Total</p>
                    <p className="text-sm font-bold text-slate-200">{clientDemands.length}</p>
                  </div>
                </div>

                {client.notes && (
                  <p className="text-xs text-slate-400 italic mb-4 line-clamp-2">{client.notes}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setViewingId(client.id); setShowViewModal(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] transition-colors text-slate-500 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Detalhes
                  </button>
                  <button
                    onClick={() => openEdit(client)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-blue-500/[0.3] rounded-lg hover:bg-blue-600/[0.12] transition-colors text-blue-600 font-medium"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(client.id)}
                    className="p-2 border border-red-500/[0.3] rounded-lg hover:bg-red-600/[0.12] transition-colors text-red-500"
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
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#21262d] flex items-center justify-between px-6 py-4 border-b border-white/[0.05] z-10">
              <h2 className="text-lg font-bold text-slate-100">
                {editingId ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Nome da empresa *</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={e => setForm({ ...form, companyName: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Empresa XYZ Ltda."
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Responsável</label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={e => setForm({ ...form, contactName: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="João Silva"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="contato@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as ClientStatus })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Plano contratado</label>
                <input
                  type="text"
                  value={form.plan}
                  onChange={e => setForm({ ...form, plan: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Plano Social Media Completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Informações adicionais sobre o cliente..."
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.companyName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {editingId ? 'Salvar' : 'Cadastrar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewingClient && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#21262d] flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100">Detalhes do Cliente</h2>
              <button onClick={() => setShowViewModal(false)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                  {viewingClient.companyName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">{viewingClient.companyName}</h3>
                  <p className="text-slate-500 text-sm">{viewingClient.plan || 'Sem plano definido'}</p>
                  <span className={`mt-1 inline-flex text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[viewingClient.status]}`}>
                    {STATUS_LABELS[viewingClient.status]}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-500"><Building2 className="w-4 h-4 text-slate-400" />{viewingClient.contactName || '—'}</div>
                <div className="flex items-center gap-2 text-sm text-slate-500"><Mail className="w-4 h-4 text-slate-400" />{viewingClient.email || '—'}</div>
                <div className="flex items-center gap-2 text-sm text-slate-500"><Phone className="w-4 h-4 text-slate-400" />{viewingClient.phone || '—'}</div>
              </div>

              {viewingClient.notes && (
                <div className="p-3 bg-[#161b22] rounded-xl">
                  <p className="text-xs font-medium text-slate-500 mb-1">Observações</p>
                  <p className="text-sm text-slate-500">{viewingClient.notes}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-200">Demandas ({viewingDemands.length})</h4>
                  <span className="text-xs text-blue-600 font-medium">{openDemands} em aberto</span>
                </div>
                {viewingDemands.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma demanda para este cliente.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {viewingDemands.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-2.5 bg-[#161b22] rounded-lg">
                        <span className="font-medium text-slate-200 truncate flex-1 mr-2">{d.title}</span>
                        <span className="text-slate-500 flex-shrink-0">{getStatusLabel(d.status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400">Cliente desde {formatDate(viewingClient.createdAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">Tem certeza que deseja excluir este cliente? As demandas associadas não serão excluídas.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
