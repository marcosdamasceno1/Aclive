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
import { useCompanySettingsStore, DEFAULT_KANBAN_STAGES } from '../store/companySettingsStore';
import type { Demand, KanbanStatus, KanbanStage, Priority, TaskType } from '../types';
import {
  formatCurrency, formatDate, formatDateTime,
  getPriorityColor, getPriorityLabel, getTaskTypeLabel, isOverdue, parseLocalDate,
} from '../utils/formatters';
import { canMoveDemands, canCreateDemands, canViewAllDemands } from '../utils/permissions';
import {
  AlertTriangle, Calendar, DollarSign, ChevronDown,
  Plus, X, Edit2, Trash2, MessageSquare, Send, MessageCircle, CheckCircle,
  Settings2, ChevronUp, Pencil, Save, GripVertical,
} from 'lucide-react';
import { sendWhatsAppNotification, getZApiConfig } from '../utils/whatsapp';

// ─── Stage color presets ───────────────────────────────────────────────────────

const STAGE_COLORS: { cls: string; dot: string; label: string }[] = [
  { cls: 'text-slate-300',  dot: 'bg-slate-300',  label: 'Cinza'    },
  { cls: 'text-blue-400',   dot: 'bg-blue-400',   label: 'Azul'     },
  { cls: 'text-indigo-400', dot: 'bg-indigo-400', label: 'Índigo'   },
  { cls: 'text-purple-400', dot: 'bg-purple-400', label: 'Roxo'     },
  { cls: 'text-orange-400', dot: 'bg-orange-400', label: 'Laranja'  },
  { cls: 'text-green-400',  dot: 'bg-green-400',  label: 'Verde'    },
  { cls: 'text-emerald-400',dot: 'bg-emerald-400',label: 'Esmeralda'},
  { cls: 'text-red-400',    dot: 'bg-red-400',    label: 'Vermelho' },
  { cls: 'text-pink-400',   dot: 'bg-pink-400',   label: 'Rosa'     },
  { cls: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Amarelo'  },
  { cls: 'text-cyan-400',   dot: 'bg-cyan-400',   label: 'Ciano'    },
  { cls: 'text-teal-400',   dot: 'bg-teal-400',   label: 'Teal'     },
  { cls: 'text-slate-500',  dot: 'bg-slate-500',  label: 'Escuro'   },
];

const dotFor = (color: string) =>
  STAGE_COLORS.find(c => c.cls === color)?.dot ?? 'bg-slate-400';

// ─── Consts ────────────────────────────────────────────────────────────────────

const TASK_TYPES: TaskType[] = [
  'video', 'art', 'copy', 'traffic', 'meeting', 'planning', 'editing', 'review', 'posting', 'other',
];
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

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
  notifyWhatsapp: false,
};

// ─── Draggable Card ────────────────────────────────────────────────────────────

interface CardProps {
  demand: Demand;
  clientName: string;
  professionalName: string;
  stageLabel: string;
  stageColor: string;
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
              ? parseLocalDate(demand.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
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
  stage: KanbanStage;
  demands: Demand[];
  clients: { id: string; companyName: string }[];
  professionals: { id: string; name: string }[];
  isLast: boolean;
  onOpen: (id: string) => void;
  didDrag: React.MutableRefObject<boolean>;
}

const KanbanColumn = ({ stage, demands, clients, professionals, isLast, onOpen, didDrag }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className={`flex flex-col flex-shrink-0 w-56 ${!isLast ? 'border-r border-white/[0.05]' : ''}`}>
      <div className={`flex items-center gap-2 px-3 py-3 transition-colors ${isOver ? 'bg-blue-500/5' : ''}`}>
        <span className="text-sm leading-none">{stage.icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest ${stage.color}`}>{stage.label}</span>
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
                stageLabel={stage.label}
                stageColor={stage.color}
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
  const { kanbanStages, saveKanbanStages } = useCompanySettingsStore();

  const columns: KanbanStage[] = kanbanStages?.length ? kanbanStages : DEFAULT_KANBAN_STAGES;

  const stageMap = useMemo(
    () => Object.fromEntries(columns.map(s => [s.id, s])),
    [columns],
  );

  // DnD
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    demandId: string; newStatus: string; value: number; professionalName: string; stageLabel: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: string; status: string } | null>(null);
  const didDrag = useRef(false);

  // Filters
  const [clientFilter, setClientFilter] = useState<'all' | string>('all');

  // Modals
  const [showModal, setShowModal]           = useState(false);
  const [showViewModal, setShowViewModal]   = useState(false);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [viewingId, setViewingId]           = useState<string | null>(null);
  const [deleteId, setDeleteId]             = useState<string | null>(null);
  const [form, setForm]                     = useState(emptyForm);
  const [commentText, setCommentText]       = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [whatsappMsg, setWhatsappMsg]       = useState('');
  const zapiConfigured = !!getZApiConfig();

  // Stage management state
  const [editingStages, setEditingStages]   = useState<KanbanStage[]>([]);
  const [stageEditId, setStageEditId]       = useState<string | null>(null);
  const [stageForm, setStageForm]           = useState({ label: '', icon: '', color: '' });
  const [newStageForm, setNewStageForm]     = useState({ label: '', icon: '📌', color: 'text-blue-400' });
  const [stageSaving, setStageSaving]       = useState(false);
  const [stageDeleteWarn, setStageDeleteWarn] = useState<string | null>(null);

  const canCreate  = currentUser ? canCreateDemands(currentUser.role) : false;
  const canViewAll = currentUser ? canViewAllDemands(currentUser.role) : false;
  const canMove    = currentUser ? canMoveDemands(currentUser.role) : false;
  const isAdmin    = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const canEditDemand = (demand: Demand) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    return currentUser.role === 'professional' && demand.createdBy === currentUser.id;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Auto-fill value
  useEffect(() => {
    if (form.professionalId && form.taskType) {
      const prof = professionals.find(p => p.id === form.professionalId);
      const defaultVal = prof?.defaultValues?.[form.taskType];
      if (defaultVal !== undefined) setForm(prev => ({ ...prev, value: defaultVal }));
    }
  }, [form.professionalId, form.taskType, professionals]);

  // Filtered demands
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
    const byCol: Record<string, Demand[]> = {};
    columns.forEach(col => { byCol[col.id] = []; });
    filteredDemands.forEach(d => {
      if (byCol[d.status] !== undefined) {
        byCol[d.status].push(d);
      } else {
        // Demand with unknown status → put in first column
        const firstId = columns[0]?.id;
        if (firstId) byCol[firstId].push(d);
      }
    });
    return byCol;
  }, [filteredDemands, columns]);

  const activeDemand = activeId ? demands.find(d => d.id === activeId) : null;
  const activeClient = activeDemand ? clients.find(c => c.id === activeDemand.clientId) : null;

  const visibleClientIds = useMemo(() => {
    const ids = new Set<string>();
    let source = demands;
    if (!canViewAll && currentUser?.role === 'professional') {
      source = demands.filter(d =>
        d.professionalId === currentUser.professionalId || d.createdBy === currentUser.id
      );
    }
    source.forEach(d => { if (d.clientId) ids.add(d.clientId); });
    return ids;
  }, [demands, currentUser, canViewAll]);

  const visibleClients = useMemo(
    () => clients.filter(c => visibleClientIds.has(c.id)),
    [clients, visibleClientIds],
  );

  const openCount = filteredDemands.filter(d => !stageMap[d.status]?.isTerminal).length;
  const completedCount = filteredDemands.filter(d => stageMap[d.status]?.triggersFinancial).length;

  // ── DnD handlers ──────────────────────────────────────────────────────────

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

    const columnIds = columns.map(c => c.id);
    let targetStatus: string | null = null;

    if (columnIds.includes(over.id as string)) {
      targetStatus = over.id as string;
    } else {
      for (const col of columns) {
        if ((demandsByColumn[col.id] || []).some(d => d.id === over.id)) {
          targetStatus = col.id;
          break;
        }
      }
    }

    if (!targetStatus || targetStatus === draggedDemand.status) return;

    const targetStage = stageMap[targetStatus];
    if (targetStage?.triggersFinancial && !draggedDemand.financialRegistered) {
      const prof = professionals.find(p => p.id === draggedDemand.professionalId);
      setConfirmMove({
        demandId: draggedDemand.id,
        newStatus: targetStatus,
        value: draggedDemand.value,
        professionalName: prof?.name || 'profissional',
        stageLabel: targetStage.label,
      });
      setPendingMove({ id: draggedDemand.id, status: targetStatus });
    } else {
      executeMove(draggedDemand.id, targetStatus, draggedDemand);
    }
  };

  const executeMove = (demandId: string, newStatus: string, demand: Demand) => {
    const stage = stageMap[newStatus];
    if (stage?.triggersFinancial && !demand.financialRegistered) {
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

  // ── Demand CRUD ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm({ ...emptyForm, status: columns[0]?.id || 'new' });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (d: Demand) => {
    setForm({
      clientId: d.clientId, title: d.title, description: d.description,
      taskType: d.taskType, professionalId: d.professionalId, deadline: d.deadline,
      priority: d.priority, value: d.value, status: d.status,
      notifyWhatsapp: false,
    });
    setEditingId(d.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.professionalId || !form.clientId) return;
    const { notifyWhatsapp, ...demandFields } = form;
    if (editingId) {
      updateDemand(editingId, demandFields);
    } else {
      const newDemand = addDemand({ ...demandFields, createdBy: currentUser?.id || '' });
      if (notifyWhatsapp) {
        const prof   = professionals.find(p => p.id === form.professionalId);
        const client = clients.find(c => c.id === form.clientId);
        if (prof?.phone) {
          setWhatsappStatus('sending');
          const err = await sendWhatsAppNotification({
            phone:            prof.phone,
            professionalName: prof.name,
            demandTitle:      newDemand.title,
            clientName:       client?.companyName || '—',
            deadline:         form.deadline,
            priority:         form.priority,
            taskType:         form.taskType,
            value:            form.value,
          });
          if (err) { setWhatsappStatus('error'); setWhatsappMsg(err); }
          else     { setWhatsappStatus('ok');    setWhatsappMsg('WhatsApp enviado!'); }
          setTimeout(() => setWhatsappStatus('idle'), 4000);
        }
      }
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteId) { deleteDemand(deleteId); setDeleteId(null); setShowViewModal(false); }
  };

  const handleAddComment = () => {
    if (!commentText.trim() || !viewingId || !currentUser) return;
    addComment(viewingId, { authorId: currentUser.id, authorName: currentUser.name, text: commentText.trim() });
    setCommentText('');
  };

  const openView = (id: string) => { setViewingId(id); setShowViewModal(true); };

  const viewingDemand      = demands.find(d => d.id === viewingId);
  const viewingClient      = clients.find(c => c.id === viewingDemand?.clientId);
  const viewingProfessional = professionals.find(p => p.id === viewingDemand?.professionalId);

  const selectedClientName = clientFilter === 'all'
    ? 'Todos os clientes'
    : clients.find(c => c.id === clientFilter)?.companyName || 'Cliente';

  // ── Stage management ──────────────────────────────────────────────────────

  const openStagesModal = () => {
    setEditingStages(columns.map(s => ({ ...s })));
    setStageEditId(null);
    setStageDeleteWarn(null);
    setNewStageForm({ label: '', icon: '📌', color: 'text-blue-400' });
    setShowStagesModal(true);
  };

  const moveStageUp = (idx: number) => {
    if (idx === 0) return;
    const arr = [...editingStages];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setEditingStages(arr);
  };

  const moveStageDown = (idx: number) => {
    if (idx === editingStages.length - 1) return;
    const arr = [...editingStages];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    setEditingStages(arr);
  };

  const startEditStage = (stage: KanbanStage) => {
    setStageEditId(stage.id);
    setStageForm({ label: stage.label, icon: stage.icon, color: stage.color });
  };

  const saveStageEdit = () => {
    if (!stageForm.label.trim()) return;
    setEditingStages(prev => prev.map(s =>
      s.id === stageEditId ? { ...s, label: stageForm.label.trim(), icon: stageForm.icon || s.icon, color: stageForm.color } : s
    ));
    setStageEditId(null);
  };

  const tryDeleteStage = (id: string) => {
    const hasDemandsInStage = demands.some(d => d.status === id);
    if (hasDemandsInStage) { setStageDeleteWarn(id); return; }
    setEditingStages(prev => prev.filter(s => s.id !== id));
    setStageDeleteWarn(null);
  };

  const addNewStage = () => {
    if (!newStageForm.label.trim()) return;
    const id = `stage_${Date.now()}`;
    setEditingStages(prev => [...prev, {
      id,
      label: newStageForm.label.trim(),
      icon:  newStageForm.icon || '📌',
      color: newStageForm.color,
    }]);
    setNewStageForm({ label: '', icon: '📌', color: 'text-blue-400' });
  };

  const saveStages = async () => {
    if (stageEditId) saveStageEdit();
    setStageSaving(true);
    await saveKanbanStages(editingStages);
    setStageSaving(false);
    setShowStagesModal(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full -mx-6 -mt-6">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.05] bg-[#0d1117] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">Esteira de Produção</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {openCount} em aberto · {completedCount} concluída(s)
          </p>
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <button
            onClick={openStagesModal}
            className="flex items-center gap-1.5 border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            title="Gerenciar etapas"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Etapas
          </button>
        )}

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
          <div className="flex h-full" style={{ minWidth: `${columns.length * 224 + 48}px` }}>
            <div className="w-6 flex-shrink-0" />
            {columns.map((stage, i) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                demands={demandsByColumn[stage.id] || []}
                clients={clients}
                professionals={professionals}
                isLast={i === columns.length - 1}
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

      {/* ── WhatsApp toast ── */}
      {whatsappStatus !== 'idle' && (
        <div className={`fixed bottom-6 right-6 z-[70] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-semibold transition-all ${
          whatsappStatus === 'sending' ? 'bg-[#21262d] border-white/10 text-slate-300' :
          whatsappStatus === 'ok'     ? 'bg-green-500/15 border-green-500/30 text-green-300' :
                                        'bg-red-500/15 border-red-500/30 text-red-300'
        }`}>
          {whatsappStatus === 'sending' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
          {whatsappStatus === 'ok'      && <CheckCircle className="w-4 h-4" />}
          {whatsappStatus === 'error'   && <AlertTriangle className="w-4 h-4" />}
          {whatsappStatus === 'sending' ? 'Enviando WhatsApp…' : whatsappMsg}
        </div>
      )}

      {/* ── Stages Management Modal ── */}
      {showStagesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-100">Gerenciar Etapas</h2>
                <p className="text-xs text-slate-500 mt-0.5">Arranje, renomeie ou crie novas etapas para sua esteira</p>
              </div>
              <button onClick={() => setShowStagesModal(false)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {editingStages.map((stage, idx) => (
                <div key={stage.id}>
                  {stageEditId === stage.id ? (
                    /* ── Inline edit form ── */
                    <div className="bg-[#161b22] border border-blue-500/30 rounded-xl p-3 space-y-3">
                      <div className="grid grid-cols-[3rem_1fr] gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Ícone</label>
                          <input
                            type="text"
                            value={stageForm.icon}
                            onChange={e => setStageForm(f => ({ ...f, icon: e.target.value }))}
                            maxLength={4}
                            className="w-full bg-[#0d1117] border border-white/[0.08] rounded-lg px-2 py-2 text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Nome *</label>
                          <input
                            type="text"
                            value={stageForm.label}
                            onChange={e => setStageForm(f => ({ ...f, label: e.target.value }))}
                            autoFocus
                            className="w-full bg-[#0d1117] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Nome da etapa"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wide">Cor</label>
                        <div className="flex flex-wrap gap-1.5">
                          {STAGE_COLORS.map(c => (
                            <button
                              key={c.cls}
                              onClick={() => setStageForm(f => ({ ...f, color: c.cls }))}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${c.dot} ${
                                stageForm.color === c.cls ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                              }`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setStageEditId(null)}
                          className="flex-1 border border-white/[0.08] text-slate-500 py-1.5 rounded-lg text-xs font-medium hover:bg-white/[0.04]"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={saveStageEdit}
                          disabled={!stageForm.label.trim()}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Stage row ── */
                    <div className="flex items-center gap-2 bg-[#161b22] border border-white/[0.06] rounded-xl px-3 py-2.5 group hover:border-white/[0.12] transition-colors">
                      <GripVertical className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />
                      <span className="text-base leading-none flex-shrink-0">{stage.icon}</span>
                      <span className={`text-sm font-semibold flex-1 ${stage.color}`}>{stage.label}</span>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {stage.triggersFinancial && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold mr-1">Financeiro</span>
                        )}
                        {stage.isTerminal && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 font-semibold mr-1">Terminal</span>
                        )}
                        <button
                          onClick={() => moveStageUp(idx)}
                          disabled={idx === 0}
                          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 rounded transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveStageDown(idx)}
                          disabled={idx === editingStages.length - 1}
                          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 rounded transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => startEditStage(stage)}
                          className="p-1 text-slate-600 hover:text-blue-400 rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => tryDeleteStage(stage.id)}
                          className="p-1 text-slate-600 hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete warning */}
                  {stageDeleteWarn === stage.id && (
                    <div className="mt-1 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 text-xs text-orange-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1">Esta etapa tem demandas. Mova-as primeiro.</span>
                      <button onClick={() => setStageDeleteWarn(null)} className="text-orange-300 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* ── Add new stage ── */}
              <div className="border-t border-white/[0.05] pt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nova etapa</p>
                <div className="grid grid-cols-[3rem_1fr] gap-2">
                  <input
                    type="text"
                    value={newStageForm.icon}
                    onChange={e => setNewStageForm(f => ({ ...f, icon: e.target.value }))}
                    maxLength={4}
                    className="bg-[#161b22] border border-white/[0.08] rounded-lg px-2 py-2 text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={newStageForm.label}
                    onChange={e => setNewStageForm(f => ({ ...f, label: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addNewStage()}
                    className="bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome da etapa"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STAGE_COLORS.map(c => (
                    <button
                      key={c.cls}
                      onClick={() => setNewStageForm(f => ({ ...f, color: c.cls }))}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${c.dot} ${
                        newStageForm.color === c.cls ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
                <button
                  onClick={addNewStage}
                  disabled={!newStageForm.label.trim()}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-white/[0.1] text-slate-500 hover:text-slate-300 hover:border-white/20 disabled:opacity-30 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar etapa
                </button>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05] flex-shrink-0">
              <button
                onClick={() => setShowStagesModal(false)}
                className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
              <button
                onClick={saveStages}
                disabled={stageSaving || editingStages.length === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                {stageSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {stageSaving ? 'Salvando...' : 'Salvar etapas'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    type="number" min="0" step="0.01" value={form.value}
                    onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Prazo</label>
                  <input
                    type="date" value={form.deadline}
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
                      onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#21262d]"
                    >
                      {columns.map(s => (
                        <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                      ))}
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

              {!editingId && (
                <div
                  className={`flex items-start gap-3 rounded-xl px-4 py-3 border transition-colors cursor-pointer ${
                    form.notifyWhatsapp
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20'
                  }`}
                  onClick={() => setForm(f => ({ ...f, notifyWhatsapp: !f.notifyWhatsapp }))}
                >
                  <input
                    type="checkbox"
                    checked={form.notifyWhatsapp}
                    onChange={e => setForm(f => ({ ...f, notifyWhatsapp: e.target.checked }))}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-100">Notificar profissional via WhatsApp</span>
                    </div>
                    {!zapiConfigured ? (
                      <p className="text-xs text-amber-400 mt-0.5">Z-API não configurada — configure em Configurações → Integrações</p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {form.professionalId
                          ? `Mensagem enviada para ${professionals.find(p => p.id === form.professionalId)?.name || '...'}`
                          : 'Selecione um profissional para enviar a notificação'}
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(viewingDemand.id)}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                {/* Stage badge from dynamic stages */}
                {(() => {
                  const stage = stageMap[viewingDemand.status];
                  return stage ? (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold bg-white/[0.06] ${stage.color}`}>
                      {stage.icon} {stage.label}
                    </span>
                  ) : null;
                })()}
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
                    type="text" value={commentText}
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
                Mover para <strong>{confirmMove.stageLabel}</strong> vai registrar{' '}
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
