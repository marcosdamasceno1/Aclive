import { useState, useMemo, useEffect, useRef } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDemandsStore } from '../store/demandsStore';
import { useClientsStore } from '../store/clientsStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useFinancialStore } from '../store/financialStore';
import { useAuthStore } from '../store/authStore';
import type { Demand, KanbanStatus, Priority, TaskType } from '../types';
import {
  formatCurrency, formatDate, formatDateTime,
  getPriorityColor, getPriorityLabel, getStatusLabel, getStatusColor,
  getTaskTypeLabel, isOverdue,
} from '../utils/formatters';
import { canMoveDemands, canCreateDemands, canViewAllDemands } from '../utils/permissions';
import {
  AlertTriangle, Calendar, DollarSign, ChevronDown,
  Plus, X, Edit2, Trash2, MessageSquare, Send,
} from 'lucide-react';

// ─── Column config ─────────────────────────────────────────────────────────────

const COLUMNS: { id: KanbanStatus; label: string; icon: string; accent: string }[] = [
  { id: 'new',         label: 'Nova',       icon: '🚀', accent: 'text-slate-300' },
  { id: 'briefing',    label: 'Briefing',   icon: '📋', accent: 'text-blue-400' },
  { id: 'production',  label: 'Produção',   icon: '⚡', accent: 'text-indigo-400' },
  { id: 'review',      label: 'Revisão',    icon: '🔍', accent: 'text-purple-400' },
  { id: 'adjustments', label: 'Ajustes',    icon: '🔧', accent: 'text-orange-400' },
  { id: 'approved',    label: 'Aprovado',   icon: '✅', accent: 'text-green-400' },
  { id: 'completed',   label: 'Concluído',  icon: '🎯', accent: 'text-emerald-400' },
  { id: 'paid',        label: 'Pago',       icon: '💰', accent: 'text-slate-500' },
];

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

// ─── Draggable Card ────────────────────────────────────────────────────────────

interface CardProps {
  demand: Demand;
  clientName: string;
  professionalName: string;
  onOpen: (id: string) => void;
  didDrag: React.MutableRefObject<boolean>;
}

const DraggableCard = ({ demand, clientName, professionalName, onOpen, didDrag }: CardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: demand.id });
  const overdue = isOverdue(demand.deadline, demand.status);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const priorityDot: Record<string, string> = {
    urgent: 'bg-red-500',
    high:   'bg-orange-400',
    medium: 'bg-yellow-400',
    low:    'bg-slate-500',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!didDrag.current) onOpen(demand.id); }}
      className={`group bg-[#161b22] border rounded-xl p-3 cursor-grab active:cursor-grabbing select-none transition-all hover:border-white/20 ${
        overdue ? 'border-red-500/30' : 'border-white/[0.06]'
      }`}
    >
      <div className="flex items-start gap-2 mb-2.5">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[demand.priority] || 'bg-slate-500'}`} />
        <p className="text-xs font-semibold text-slate-100 leading-tight flex-1 min-w-0">{demand.title}</p>
      </div>
      <p className="text-xs text-slate-500 mb-2.5 truncate pl-3.5">{clientName}</p>
      <div className="flex items-center justify-between pl-3.5">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
            {professionalName.charAt(0)}
          </div>
          <span className="text-[11px] text-slate-600 truncate max-w-16">{professionalName.split(' ')[0]}</span>
        </div>
        <div className="flex items-center gap-2">
          {(demand.comments?.length ?? 0) > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] text-slate-600">
              <MessageSquare className="w-3 h-3" />
              {demand.comments.length}
            </div>
          )}
          {overdue && <AlertTriangle className="w-3 h-3 text-red-500" />}
          <div className={`flex items-center gap-0.5 text-[11px] ${overdue ? 'text-red-400' : 'text-slate-600'}`}>
            <Calendar className="w-3 h-3" />
            {demand.deadline
              ? new Date(demand.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
};

const OverlayCard = ({ demand, clientName }: { demand: Demand; clientName: string }) => (
  <div className="bg-[#161b22] border border-blue-500/40 rounded-xl p-3 shadow-2xl rotate-2 w-56">
    <p className="text-xs font-semibold text-slate-100 truncate">{demand.title}</p>
    <p className="text-xs text-slate-500 mt-1 truncate">{clientName}</p>
    <p className="text-xs font-bold text-slate-300 mt-1.5">{formatCurrency(demand.value)}</p>
  </div>
);

// ─── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  col: typeof COLUMNS[number];
  demands: Demand[];
  clients: { id: string; companyName: string }[];
  professionals: { id: string; name: string }[];
  isLast: boolean;
  onOpen: (id: string) => void;
  didDrag: React.MutableRefObject<boolean>;
}

const KanbanColumn = ({ col, demands, clients, professionals, isLast, onOpen, didDrag }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div className={`flex flex-col flex-shrink-0 w-56 ${!isLast ? 'border-r border-white/[0.05]' : ''}`}>
      <div className={`flex items-center gap-2 px-3 py-3 transition-colors ${isOver ? 'bg-blue-500/5' : ''}`}>
        <span className="text-sm leading-none">{col.icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest ${col.accent}`}>{col.label}</span>
        <span className="ml-auto text-xs font-bold text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded-full min-w-5 text-center">
          {demands.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-3 space-y-2 overflow-y-auto transition-colors ${isOver ? 'bg-blue-500/[0.03]' : ''}`}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <SortableContext items={demands.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {demands.map(demand => {
            const client = clients.find(c => c.id === demand.clientId);
            const prof = professionals.find(p => p.id === demand.professionalId);
            return (
              <DraggableCard
                key={demand.id}
                demand={demand}
                clientName={client?.companyName || '—'}
                professionalName={prof?.name || '—'}
                onOpen={onOpen}
                didDrag={didDrag}
              />
            );
          })}
        </SortableContext>
        {demands.length === 0 && (
          <div className={`h-16 rounded-xl border border-dashed flex items-center justify-center transition-colors ${
            isOver ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/[0.04]'
          }`}>
            <p className="text-xs text-slate-700">solte aqui</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export const Kanban = () => {
  const { currentUser } = useAuthStore();
  const { demands, addDemand, updateDemand, deleteDemand, addComment, moveDemand } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();
  const { registerMovement } = useFinancialStore();

  // DnD
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    demandId: string; newStatus: KanbanStatus; value: number; professionalName: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: string; status: KanbanStatus } | null>(null);
  const didDrag = useRef(false);

  // Filters
  const [clientFilter, setClientFilter] = useState<'all' | string>('all');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [commentText, setCommentText] = useState('');

  const canCreate = currentUser ? canCreateDemands(currentUser.role) : false;
  const canViewAll = currentUser ? canViewAllDemands(currentUser.role) : false;
  const canMove = currentUser ? canMoveDemands(currentUser.role) : false;

  const canEditDemand = (demand: Demand) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    if (currentUser.role === 'professional') return demand.createdBy === currentUser.id;
    return false;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Auto-fill value when professional + task type changes
  useEffect(() => {
    if (form.professionalId && form.taskType) {
      const prof = professionals.find(p => p.id === form.professionalId);
      const defaultVal = prof?.defaultValues?.[form.taskType];
      if (defaultVal !== undefined) setForm(prev => ({ ...prev, value: defaultVal }));
    }
  }, [form.professionalId, form.taskType, professionals]);

  // Filtered demands for board
  const filteredDemands = useMemo(() => {
    let list = demands;
    if (!canViewAll && currentUser?.role === 'professional') {
      list = list.filter(d =>
        d.professionalId === currentUser.professionalId || d.createdBy === currentUser.id
      );
    }
    if (clientFilter !== 'all') list = list.filter(d => d.clientId === clientFilter);
    return list;
  }, [demands, currentUser, canViewAll, clientFilter]);

  const demandsByColumn = useMemo(() => {
    const byCol = {} as Record<KanbanStatus, Demand[]>;
    COLUMNS.forEach(col => { byCol[col.id] = []; });
    filteredDemands.forEach(d => { if (byCol[d.status]) byCol[d.status].push(d); });
    return byCol;
  }, [filteredDemands]);

  const activeDemand = activeId ? demands.find(d => d.id === activeId) : null;
  const activeClient = activeDemand ? clients.find(c => c.id === activeDemand.clientId) : null;

  const visibleClientIds = useMemo(() => {
    const ids = new Set<string>();
    (canViewAll ? demands : filteredDemands).forEach(d => { if (d.clientId) ids.add(d.clientId); });
    return ids;
  }, [filteredDemands, demands, canViewAll]);

  const visibleClients = useMemo(
    () => clients.filter(c => visibleClientIds.has(c.id)),
    [clients, visibleClientIds]
  );

  // ── DnD handlers
  const handleDragStart = ({ active }: DragStartEvent) => {
    if (!canMove) return;
    didDrag.current = true;
    setActiveId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setTimeout(() => { didDrag.current = false; }, 100);
    if (!canMove || !over) return;

    const draggedDemand = demands.find(d => d.id === active.id);
    if (!draggedDemand) return;

    let targetStatus: KanbanStatus | null = null;
    const columnIds = COLUMNS.map(c => c.id);
    if (columnIds.includes(over.id as KanbanStatus)) {
      targetStatus = over.id as KanbanStatus;
    } else {
      for (const col of COLUMNS) {
        if (demandsByColumn[col.id].some(d => d.id === over.id)) {
          targetStatus = col.id;
          break;
        }
      }
    }

    if (!targetStatus || targetStatus === draggedDemand.status) return;

    if (targetStatus === 'completed' && !draggedDemand.financialRegistered) {
      const prof = professionals.find(p => p.id === draggedDemand.professionalId);
      setConfirmMove({
        demandId: draggedDemand.id,
        newStatus: targetStatus,
        value: draggedDemand.value,
        professionalName: prof?.name || 'profissional',
      });
      setPendingMove({ id: draggedDemand.id, status: targetStatus });
    } else {
      executeMove(draggedDemand.id, targetStatus, draggedDemand);
    }
  };

  const executeMove = (demandId: string, newStatus: KanbanStatus, demand: Demand) => {
    if (newStatus === 'completed' && !demand.financialRegistered) {
      const client = clients.find(c => c.id === demand.clientId);
      registerMovement({
        professionalId: demand.professionalId,
        demandId: demand.id,
        demandTitle: demand.title,
        clientId: demand.clientId,
        clientName: client?.companyName || '',
        value: demand.value,
        type: 'credit',
        status: 'pending',
        completedAt: new Date().toISOString(),
      });
    }
    moveDemand(demandId, newStatus);
  };

  const handleConfirmMove = () => {
    if (!confirmMove || !pendingMove) return;
    const demand = demands.find(d => d.id === pendingMove.id);
    if (demand) executeMove(pendingMove.id, pendingMove.status, demand);
    setConfirmMove(null);
    setPendingMove(null);
  };

  // ── Demand CRUD
  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (d: Demand) => {
    setForm({
      clientId: d.clientId, title: d.title, description: d.description,
      taskType: d.taskType, professionalId: d.professionalId, deadline: d.deadline,
      priority: d.priority, value: d.value, status: d.status,
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
    if (deleteId) {
      deleteDemand(deleteId);
      setDeleteId(null);
      setShowViewModal(false);
    }
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

  const openView = (id: string) => {
    setViewingId(id);
    setShowViewModal(true);
  };

  const viewingDemand = demands.find(d => d.id === viewingId);
  const viewingClient = clients.find(c => c.id === viewingDemand?.clientId);
  const viewingProfessional = professionals.find(p => p.id === viewingDemand?.professionalId);

  const selectedClientName = clientFilter === 'all'
    ? 'Todos os clientes'
    : clients.find(c => c.id === clientFilter)?.companyName || 'Cliente';

  return (
    <div className="flex flex-col h-full -mx-6 -mt-6">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.05] bg-[#0d1117] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">Esteira de Produção</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {filteredDemands.filter(d => !['completed', 'paid'].includes(d.status)).length} em aberto
            · {filteredDemands.filter(d => d.status === 'completed').length} concluída(s)
          </p>
        </div>

        <div className="flex-1" />

        {canCreate && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Demanda
          </button>
        )}

        {/* Client filter dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-2 bg-[#21262d] border border-white/[0.08] text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold hover:border-white/20 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            {selectedClientName}
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <div className="absolute right-0 top-full mt-1.5 bg-[#21262d] border border-white/[0.08] rounded-xl shadow-2xl z-20 min-w-48 overflow-hidden opacity-0 pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto transition-all">
            <div className="py-1.5">
              <button
                onClick={() => setClientFilter('all')}
                className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${
                  clientFilter === 'all' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                Todos os clientes
              </button>
              {visibleClients.map(c => (
                <button key={c.id} onClick={() => setClientFilter(c.id)}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${
                    clientFilter === c.id ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  {c.companyName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!canMove && (
          <span className="text-xs text-slate-600 border border-white/[0.05] px-3 py-1.5 rounded-lg">
            Somente visualização
          </span>
        )}
      </div>

      {/* ── Client pills ── */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 overflow-x-auto flex-shrink-0 bg-[#0d1117] border-b border-white/[0.04]">
        <button
          onClick={() => setClientFilter('all')}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            clientFilter === 'all' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
          }`}
        >
          Todos
        </button>
        {visibleClients.map(c => (
          <button key={c.id} onClick={() => setClientFilter(c.id)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              clientFilter === c.id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            {c.companyName}
          </button>
        ))}
      </div>

      {/* ── Board ── */}
      <div className="flex-1 overflow-x-auto bg-[#0d1117]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full" style={{ minWidth: `${COLUMNS.length * 224 + 48}px` }}>
            <div className="w-6 flex-shrink-0" />
            {COLUMNS.map((col, i) => (
              <KanbanColumn
                key={col.id}
                col={col}
                demands={demandsByColumn[col.id] || []}
                clients={clients}
                professionals={professionals}
                isLast={i === COLUMNS.length - 1}
                onOpen={openView}
                didDrag={didDrag}
              />
            ))}
            <div className="w-6 flex-shrink-0" />
          </div>

          <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeDemand ? (
              <OverlayCard demand={activeDemand} clientName={activeClient?.companyName || '—'} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#21262d] flex items-center justify-between px-6 py-4 border-b border-white/[0.05] z-10">
              <h2 className="text-lg font-bold text-slate-100">{editingId ? 'Editar Demanda' : 'Nova Demanda'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-300 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Título da tarefa *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Criação de post para Instagram"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Cliente *</label>
                  <select
                    value={form.clientId}
                    onChange={e => setForm({ ...form, clientId: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                  >
                    <option value="">Selecionar cliente</option>
                    {clients.filter(c => c.status === 'active').map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Tipo de tarefa</label>
                  <select
                    value={form.taskType}
                    onChange={e => setForm({ ...form, taskType: e.target.value as TaskType })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                  >
                    {TASK_TYPES.map(t => <option key={t} value={t}>{getTaskTypeLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Profissional responsável *</label>
                  <select
                    value={form.professionalId}
                    onChange={e => setForm({ ...form, professionalId: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                  >
                    <option value="">Selecionar profissional</option>
                    {professionals.filter(p => p.status === 'active').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Valor (R$){' '}
                    {form.professionalId && form.taskType && (
                      <span className="text-xs text-blue-500 font-normal">(auto)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Prazo</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as Priority })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{getPriorityLabel(p)}</option>)}
                  </select>
                </div>
                {editingId && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-200 mb-1.5">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as KanbanStatus })}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Descreva os detalhes da tarefa..."
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-[#21262d] flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || !form.clientId || !form.professionalId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {editingId ? 'Salvar' : 'Criar demanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View / Comment Modal ── */}
      {showViewModal && viewingDemand && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#21262d] flex items-center justify-between px-6 py-4 border-b border-white/[0.05] z-10">
              <h2 className="text-base font-bold text-slate-100 truncate flex-1 mr-4">{viewingDemand.title}</h2>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canEditDemand(viewingDemand) && (
                  <>
                    <button
                      onClick={() => { setShowViewModal(false); openEdit(viewingDemand); }}
                      className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(viewingDemand.id)}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setShowViewModal(false); setCommentText(''); }}
                  className="p-1.5 text-slate-400 hover:text-slate-300 rounded-lg hover:bg-white/[0.06]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusColor(viewingDemand.status)}`}>
                  {getStatusLabel(viewingDemand.status)}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getPriorityColor(viewingDemand.priority)}`}>
                  {getPriorityLabel(viewingDemand.priority)}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#0d1117] text-slate-500 font-semibold">
                  {getTaskTypeLabel(viewingDemand.taskType)}
                </span>
                {isOverdue(viewingDemand.deadline, viewingDemand.status) && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Atrasada
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Cliente</p>
                  <p className="text-slate-200 font-semibold">{viewingClient?.companyName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Profissional</p>
                  <p className="text-slate-200 font-semibold">{viewingProfessional?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Prazo</p>
                  <p className="text-slate-200 font-semibold">{formatDate(viewingDemand.deadline)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Valor</p>
                  <p className="text-emerald-400 font-bold text-base">{formatCurrency(viewingDemand.value)}</p>
                </div>
              </div>
              {viewingDemand.description && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Descrição</p>
                  <div className="p-3 bg-[#161b22] rounded-xl text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {viewingDemand.description}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-200">Comentários ({viewingDemand.comments.length})</p>
                </div>
                {viewingDemand.comments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Nenhum comentário ainda.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                    {viewingDemand.comments.map(comment => (
                      <div key={comment.id} className="flex gap-2.5">
                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {comment.authorName.charAt(0)}
                        </div>
                        <div className="flex-1 bg-[#161b22] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-200">{comment.authorName}</span>
                            <span className="text-xs text-slate-500">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-slate-400">{comment.text}</p>
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
                    placeholder="Adicionar comentário..."
                    className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#21262d] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-100 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-xl text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-semibold">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm completion (financial) Modal ── */}
      {confirmMove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Registrar conclusão</h3>
                <p className="text-xs text-slate-500">Gera movimentação financeira automática</p>
              </div>
            </div>
            <div className="bg-emerald-500/[0.07] rounded-xl p-4 mb-5 border border-emerald-500/20">
              <p className="text-sm text-slate-200 leading-relaxed">
                Mover para <strong>Concluído</strong> vai registrar{' '}
                <span className="text-emerald-400 font-bold">{formatCurrency(confirmMove.value)}</span>{' '}
                no saldo de <strong>{confirmMove.professionalName}</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-2">Esta ação só pode ser feita uma vez por tarefa.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmMove(null); setPendingMove(null); }}
                className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-xl text-sm font-medium hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmMove}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-bold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
