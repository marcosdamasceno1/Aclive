import { useState, useMemo } from 'react';
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
import type { Demand, KanbanStatus } from '../types';
import { formatCurrency, getPriorityColor, isOverdue } from '../utils/formatters';
import { AlertTriangle, Calendar, DollarSign, ChevronDown } from 'lucide-react';
import { canMoveDemands } from '../utils/permissions';

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

// ─── Draggable card ────────────────────────────────────────────────────────────

interface CardProps {
  demand: Demand;
  clientName: string;
  professionalName: string;
}

const DraggableCard = ({ demand, clientName, professionalName }: CardProps) => {
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
    high: 'bg-orange-400',
    medium: 'bg-yellow-400',
    low: 'bg-slate-500',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group bg-[#161b22] border rounded-xl p-3 cursor-grab active:cursor-grabbing select-none transition-all hover:border-white/20 ${
        overdue ? 'border-red-500/30' : 'border-white/[0.06]'
      }`}
    >
      {/* Priority dot + title */}
      <div className="flex items-start gap-2 mb-2.5">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[demand.priority] || 'bg-slate-500'}`} />
        <p className="text-xs font-semibold text-slate-100 leading-tight flex-1 min-w-0">{demand.title}</p>
      </div>

      {/* Client */}
      <p className="text-xs text-slate-500 mb-2.5 truncate pl-3.5">{clientName}</p>

      {/* Footer */}
      <div className="flex items-center justify-between pl-3.5">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
            {professionalName.charAt(0)}
          </div>
          <span className="text-[11px] text-slate-600 truncate max-w-16">{professionalName.split(' ')[0]}</span>
        </div>
        <div className="flex items-center gap-2">
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
}

const KanbanColumn = ({ col, demands, clients, professionals, isLast }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div className={`flex flex-col flex-shrink-0 w-56 ${!isLast ? 'border-r border-white/[0.05]' : ''}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-3 transition-colors ${isOver ? 'bg-blue-500/5' : ''}`}>
        <span className="text-sm leading-none">{col.icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest ${col.accent}`}>
          {col.label}
        </span>
        <span className="ml-auto text-xs font-bold text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded-full min-w-5 text-center">
          {demands.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-3 space-y-2 overflow-y-auto transition-colors ${
          isOver ? 'bg-blue-500/[0.03]' : ''
        }`}
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
  const { demands, moveDemand } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();
  const { registerMovement } = useFinancialStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<'all' | string>('all');
  const [confirmMove, setConfirmMove] = useState<{
    demandId: string;
    newStatus: KanbanStatus;
    value: number;
    professionalName: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: string; status: KanbanStatus } | null>(null);

  const canMove = currentUser ? canMoveDemands(currentUser.role) : false;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Filter by role + client
  const filteredDemands = useMemo(() => {
    let list = demands;
    if (currentUser?.role === 'professional' && currentUser.professionalId) {
      list = list.filter(d => d.professionalId === currentUser.professionalId);
    }
    if (clientFilter !== 'all') {
      list = list.filter(d => d.clientId === clientFilter);
    }
    return list;
  }, [demands, currentUser, clientFilter]);

  const demandsByColumn = useMemo(() => {
    const byCol = {} as Record<KanbanStatus, Demand[]>;
    COLUMNS.forEach(col => { byCol[col.id] = []; });
    filteredDemands.forEach(d => { if (byCol[d.status]) byCol[d.status].push(d); });
    return byCol;
  }, [filteredDemands]);

  const activeDemand = activeId ? demands.find(d => d.id === activeId) : null;
  const activeClient = activeDemand ? clients.find(c => c.id === activeDemand.clientId) : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (!canMove) return;
    setActiveId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
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

  // Only show clients that have demands visible to this user
  const visibleClientIds = useMemo(() => {
    const ids = new Set<string>();
    filteredDemands.forEach(d => { if (d.clientId) ids.add(d.clientId); });
    // also add all if not professional
    if (currentUser?.role !== 'professional') {
      demands.forEach(d => { if (d.clientId) ids.add(d.clientId); });
    }
    return ids;
  }, [filteredDemands, demands, currentUser]);

  const visibleClients = useMemo(
    () => clients.filter(c => visibleClientIds.has(c.id)),
    [clients, visibleClientIds]
  );

  const selectedClientName = clientFilter === 'all'
    ? 'Todos os clientes'
    : clients.find(c => c.id === clientFilter)?.companyName || 'Cliente';

  return (
    <div className="flex flex-col h-full -mx-6 -mt-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.05] bg-[#0d1117] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">Esteira de Produção</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {filteredDemands.filter(d => !['completed', 'paid'].includes(d.status)).length} em aberto
            · {filteredDemands.filter(d => d.status === 'completed').length} concluída(s)
          </p>
        </div>

        <div className="flex-1" />

        {/* Client filter — dropdown style */}
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
                <button
                  key={c.id}
                  onClick={() => setClientFilter(c.id)}
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

      {/* Client pills (quick tabs) */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 overflow-x-auto flex-shrink-0 bg-[#0d1117] border-b border-white/[0.04]">
        <button
          onClick={() => setClientFilter('all')}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            clientFilter === 'all'
              ? 'bg-white/10 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
          }`}
        >
          Todos
        </button>
        {visibleClients.map(c => (
          <button
            key={c.id}
            onClick={() => setClientFilter(c.id)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              clientFilter === c.id
                ? 'bg-white/10 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            {c.companyName}
          </button>
        ))}
      </div>

      {/* Board */}
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
              />
            ))}
            <div className="w-6 flex-shrink-0" />
          </div>

          <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeDemand ? (
              <OverlayCard
                demand={activeDemand}
                clientName={activeClient?.companyName || '—'}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Confirm completion dialog */}
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
