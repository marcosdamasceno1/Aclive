import { useState, useMemo } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDemandsStore } from '../store/demandsStore';
import { useClientsStore } from '../store/clientsStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useFinancialStore } from '../store/financialStore';
import { useAuthStore } from '../store/authStore';
import type { Demand, KanbanStatus } from '../types';
import {
  formatCurrency, getPriorityColor, getPriorityLabel, isOverdue
} from '../utils/formatters';
import { AlertTriangle, Calendar, DollarSign } from 'lucide-react';
import { canMoveDemands } from '../utils/permissions';

const COLUMNS: { id: KanbanStatus; label: string; headerColor: string; bgColor: string; textColor: string }[] = [
  { id: 'new', label: 'Nova Demanda', headerColor: 'bg-[#161b22]0', bgColor: 'bg-[#161b22]', textColor: 'text-slate-200' },
  { id: 'briefing', label: 'Em Briefing', headerColor: 'bg-blue-500/[0.1]0', bgColor: 'bg-blue-500/[0.1]', textColor: 'text-blue-400' },
  { id: 'production', label: 'Em Produção', headerColor: 'bg-indigo-500', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700' },
  { id: 'review', label: 'Em Revisão', headerColor: 'bg-purple-500/[0.1]0', bgColor: 'bg-purple-500/[0.1]', textColor: 'text-purple-400' },
  { id: 'adjustments', label: 'Ajustes', headerColor: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-400' },
  { id: 'approved', label: 'Aprovado', headerColor: 'bg-green-500/[0.1]0', bgColor: 'bg-green-500/[0.1]', textColor: 'text-green-400' },
  { id: 'completed', label: 'Concluído', headerColor: 'bg-emerald-600', bgColor: 'bg-emerald-500/[0.1]', textColor: 'text-emerald-400' },
  { id: 'paid', label: 'Pago', headerColor: 'bg-gray-500', bgColor: 'bg-gray-50', textColor: 'text-slate-400' },
];

interface CardProps {
  demand: Demand;
  clientName: string;
  professionalName: string;
}

const DraggableCard = ({ demand, clientName, professionalName }: CardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: demand.id });
  const overdue = isOverdue(demand.deadline, demand.status);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-[#21262d] rounded-xl p-3 border cursor-grab active:cursor-grabbing hover:shadow-black/40 transition-all select-none ${
        overdue ? 'border-red-500/[0.3]' : 'border-white/[0.08]'
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between mb-2 gap-1">
        <p className="text-xs font-semibold text-slate-100 leading-tight flex-1">{demand.title}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${getPriorityColor(demand.priority)}`}>
          {getPriorityLabel(demand.priority).charAt(0)}
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-2 truncate">{clientName}</p>

      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {professionalName.charAt(0)}
        </div>
        <span className="text-xs text-slate-500 truncate">{professionalName}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
          {overdue && <AlertTriangle className="w-3 h-3" />}
          <Calendar className="w-3 h-3" />
          {demand.deadline ? new Date(demand.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
        </div>
        <span className="text-xs font-bold text-slate-200">{formatCurrency(demand.value)}</span>
      </div>
    </div>
  );
};

const StaticCard = ({ demand, clientName }: CardProps) => {
  const overdue = isOverdue(demand.deadline, demand.status);
  return (
    <div className={`bg-[#21262d] rounded-xl p-3 shadow-md border-2 rotate-1 ${overdue ? 'border-red-300' : 'border-blue-500/[0.4]'}`}>
      <p className="text-xs font-semibold text-slate-100 truncate">{demand.title}</p>
      <p className="text-xs text-slate-500 mt-1">{clientName}</p>
      <p className="text-xs font-bold text-slate-200 mt-1">{formatCurrency(demand.value)}</p>
    </div>
  );
};

interface Client {
  id: string;
  companyName: string;
}

interface Professional {
  id: string;
  name: string;
}

interface ColumnProps {
  id: KanbanStatus;
  label: string;
  headerColor: string;
  bgColor: string;
  textColor?: string;
  demands: Demand[];
  clients: Client[];
  professionals: Professional[];
}

const KanbanColumn = ({ id, label, headerColor, bgColor, demands, clients, professionals }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={`flex-shrink-0 w-64 rounded-2xl flex flex-col transition-all ${bgColor} ${isOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      style={{ minHeight: 120 }}
    >
      <div className={`${headerColor} rounded-t-2xl px-3 py-2.5 flex items-center justify-between`}>
        <h3 className="text-xs font-bold text-white">{label}</h3>
        <span className="bg-[#21262d]/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
          {demands.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ minHeight: 80, maxHeight: '65vh' }}>
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
          <div className="h-12 border-2 border-dashed border-white/[0.08] rounded-xl flex items-center justify-center">
            <p className="text-xs text-slate-500">Soltar aqui</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const Kanban = () => {
  const { currentUser } = useAuthStore();
  const { demands, moveDemand } = useDemandsStore();
  const { clients } = useClientsStore();
  const { professionals } = useProfessionalsStore();
  const { registerMovement } = useFinancialStore();

  const [activeId, setActiveId] = useState<string | null>(null);
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

  const filteredDemands = useMemo(() => {
    if (currentUser?.role === 'professional' && currentUser.professionalId) {
      return demands.filter(d => d.professionalId === currentUser.professionalId);
    }
    return demands;
  }, [demands, currentUser]);

  const demandsByColumn = useMemo(() => {
    const byCol = {} as Record<KanbanStatus, Demand[]>;
    COLUMNS.forEach(col => { byCol[col.id] = []; });
    filteredDemands.forEach(d => {
      if (byCol[d.status]) byCol[d.status].push(d);
    });
    return byCol;
  }, [filteredDemands]);

  const activeDemand = activeId ? demands.find(d => d.id === activeId) : null;
  const activeClient = activeDemand ? clients.find(c => c.id === activeDemand.clientId) : null;
  const activeProfessional = activeDemand ? professionals.find(p => p.id === activeDemand.professionalId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    if (!canMove) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!canMove) return;

    const { active, over } = event;
    if (!over) return;

    const draggedDemand = demands.find(d => d.id === active.id);
    if (!draggedDemand) return;

    // Determine target column
    let targetStatus: KanbanStatus | null = null;

    // Check if dropped on a column header (droppable zone)
    const columnIds = COLUMNS.map(c => c.id);
    if (columnIds.includes(over.id as KanbanStatus)) {
      targetStatus = over.id as KanbanStatus;
    } else {
      // Dropped on a card — find which column that card is in
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

  const handleCancelMove = () => {
    setConfirmMove(null);
    setPendingMove(null);
  };

  const totals = useMemo(() => ({
    open: filteredDemands.filter(d => !['completed', 'paid'].includes(d.status)).length,
    completed: filteredDemands.filter(d => d.status === 'completed').length,
    paid: filteredDemands.filter(d => d.status === 'paid').length,
  }), [filteredDemands]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Esteira de Produção</h1>
          <p className="text-slate-500 text-sm mt-1">
            {totals.open} em aberto · {totals.completed} concluída(s) · {totals.paid} paga(s)
          </p>
        </div>
        {!canMove && (
          <div className="text-xs text-slate-400 bg-[#0d1117] px-3 py-2 rounded-lg">
            Somente visualização
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{ minHeight: '72vh' }}
        >
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              {...col}
              demands={demandsByColumn[col.id] || []}
              clients={clients}
              professionals={professionals}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeDemand && activeClient && activeProfessional ? (
            <div className="w-64">
              <StaticCard
                demand={activeDemand}
                clientName={activeClient.companyName}
                professionalName={activeProfessional.name}
              />
            </div>
          ) : activeDemand ? (
            <div className="w-64 bg-[#21262d] rounded-xl p-3 shadow-xl border-2 border-blue-500/[0.4]">
              <p className="text-xs font-semibold text-slate-100">{activeDemand.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Confirm completion dialog */}
      {confirmMove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-500/[0.12] rounded-2xl flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Registrar conclusão</h3>
                <p className="text-xs text-slate-400">Esta ação gera uma movimentação financeira</p>
              </div>
            </div>
            <div className="bg-emerald-500/[0.1] rounded-xl p-4 mb-5 border border-emerald-500/[0.2]">
              <p className="text-sm text-slate-200 leading-relaxed">
                Mover para <strong>Concluído</strong> vai registrar automaticamente{' '}
                <span className="text-emerald-400 font-bold text-base">{formatCurrency(confirmMove.value)}</span>{' '}
                no saldo de <strong>{confirmMove.professionalName}</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-2">Esta ação só pode ser feita uma vez por tarefa.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancelMove}
                className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-xl text-sm font-medium hover:bg-white/[0.04] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmMove}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                Confirmar e registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
