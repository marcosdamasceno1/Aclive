import { useState, useMemo, useRef } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDemandBoardStore } from '../store/demandBoardStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useAuthStore } from '../store/authStore';
import { useCompanySettingsStore, DEFAULT_BOARD_STAGES } from '../store/companySettingsStore';
import type { DemandCard, KanbanStage, Priority } from '../types';
import { formatDateTime } from '../utils/formatters';
import {
  Plus, X, Trash2, Settings2, ChevronUp, ChevronDown, Pencil, Save, User, AlertTriangle,
} from 'lucide-react';

// ─── Presets ────────────────────────────────────────────────────────────────────

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

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-slate-500',
};

const emptyForm = {
  title: '',
  description: '',
  assignedTo: '',
  priority: 'medium' as Priority,
  columnId: '',
};

// ─── Draggable Card ────────────────────────────────────────────────────────────

interface CardProps {
  card: DemandCard;
  professionalName: string;
  onOpen: (id: string) => void;
  didDrag: React.MutableRefObject<boolean>;
}

const DraggableCard = ({ card, professionalName, onOpen, didDrag }: CardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!didDrag.current) onOpen(card.id); }}
      className="group bg-[#161b22] border border-white/[0.06] rounded-xl p-3 cursor-grab active:cursor-grabbing select-none transition-all hover:border-white/20"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[card.priority] || 'bg-slate-500'}`} />
        <p className="text-xs font-semibold text-slate-100 leading-tight flex-1 min-w-0">{card.title}</p>
      </div>
      {card.description && (
        <p className="text-[11px] text-slate-500 mb-2.5 pl-3.5 line-clamp-2">{card.description}</p>
      )}
      <div className="flex items-center justify-between pl-3.5">
        {professionalName ? (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
              {professionalName.charAt(0)}
            </div>
            <span className="text-[11px] text-slate-600 truncate max-w-20">{professionalName.split(' ')[0]}</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-700">Sem responsável</span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500 font-medium flex-shrink-0">
          {PRIORITY_LABEL[card.priority]}
        </span>
      </div>
    </div>
  );
};

const OverlayCard = ({ card }: { card: DemandCard }) => (
  <div className="bg-[#161b22] border border-indigo-500/40 rounded-xl p-3 shadow-2xl rotate-2 w-56">
    <p className="text-xs font-semibold text-slate-100 truncate">{card.title}</p>
    {card.description && <p className="text-[11px] text-slate-500 mt-1 truncate">{card.description}</p>}
  </div>
);

// ─── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  stage: KanbanStage;
  cards: DemandCard[];
  professionals: { id: string; name: string }[];
  isLast: boolean;
  onOpen: (id: string) => void;
  didDrag: React.MutableRefObject<boolean>;
}

const BoardColumn = ({ stage, cards, professionals, isLast, onOpen, didDrag }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className={`flex flex-col flex-shrink-0 w-60 ${!isLast ? 'border-r border-white/[0.05]' : ''}`}>
      <div className={`flex items-center gap-2 px-3 py-3 transition-colors ${isOver ? 'bg-indigo-500/5' : ''}`}>
        <span className="text-sm leading-none">{stage.icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest ${stage.color}`}>{stage.label}</span>
        <span className="ml-auto text-xs font-bold text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded-full min-w-5 text-center">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-3 space-y-2 overflow-y-auto transition-colors ${isOver ? 'bg-indigo-500/[0.03]' : ''}`}
        style={{ maxHeight: 'calc(100vh - 160px)' }}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <DraggableCard
              key={card.id}
              card={card}
              professionalName={professionals.find(p => p.id === card.assignedTo)?.name || ''}
              onOpen={onOpen}
              didDrag={didDrag}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className={`h-16 rounded-xl border border-dashed flex items-center justify-center transition-colors ${
            isOver ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-white/[0.04]'
          }`}>
            <p className="text-xs text-slate-700">solte aqui</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export const Demandas = () => {
  const { currentUser } = useAuthStore();
  const { cards, addCard, updateCard, moveCard, deleteCard, dbError } = useDemandBoardStore();
  const { professionals } = useProfessionalsStore();
  const { demandBoardStages, saveDemandBoardStages } = useCompanySettingsStore();

  const columns: KanbanStage[] = demandBoardStages?.length ? demandBoardStages : DEFAULT_BOARD_STAGES;

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // DnD
  const [activeId, setActiveId] = useState<string | null>(null);
  const didDrag = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Modals
  const [showModal, setShowModal]         = useState(false);
  const [showView, setShowView]           = useState(false);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [viewingId, setViewingId]         = useState<string | null>(null);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [form, setForm]                   = useState(emptyForm);

  // Stage management state
  const [editingStages, setEditingStages] = useState<KanbanStage[]>([]);
  const [stageEditId, setStageEditId]     = useState<string | null>(null);
  const [stageForm, setStageForm]         = useState({ label: '', icon: '', color: '' });
  const [newStageForm, setNewStageForm]   = useState({ label: '', icon: '📌', color: 'text-blue-400' });
  const [stageSaving, setStageSaving]     = useState(false);
  const [stageDeleteWarn, setStageDeleteWarn] = useState<string | null>(null);

  const cardsByColumn = useMemo(() => {
    const byCol: Record<string, DemandCard[]> = {};
    columns.forEach(col => { byCol[col.id] = []; });
    cards.forEach(c => {
      if (byCol[c.columnId] !== undefined) byCol[c.columnId].push(c);
      else { const first = columns[0]?.id; if (first) byCol[first].push(c); }
    });
    return byCol;
  }, [cards, columns]);

  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;

  const canDeleteCard = (card: DemandCard) =>
    isAdmin || card.createdBy === currentUser?.id;

  // ── DnD handlers ──────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => {
    didDrag.current = true;
    setActiveId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setTimeout(() => { didDrag.current = false; }, 100);
    if (!over) return;

    const dragged = cards.find(c => c.id === active.id);
    if (!dragged) return;

    const columnIds = columns.map(c => c.id);
    let targetCol: string | null = null;
    if (columnIds.includes(over.id as string)) {
      targetCol = over.id as string;
    } else {
      for (const col of columns) {
        if ((cardsByColumn[col.id] || []).some(c => c.id === over.id)) { targetCol = col.id; break; }
      }
    }
    if (!targetCol || targetCol === dragged.columnId) return;
    moveCard(dragged.id, targetCol);
  };

  // ── Card CRUD ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm({ ...emptyForm, columnId: columns[0]?.id || 'backlog' });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (c: DemandCard) => {
    setForm({
      title: c.title, description: c.description || '',
      assignedTo: c.assignedTo || '', priority: c.priority, columnId: c.columnId,
    });
    setEditingId(c.id);
    setShowView(false);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (editingId) {
      updateCard(editingId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assignedTo: form.assignedTo || undefined,
        priority: form.priority,
        columnId: form.columnId,
      });
    } else {
      addCard({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assignedTo: form.assignedTo || undefined,
        priority: form.priority,
        columnId: form.columnId || columns[0]?.id || 'backlog',
        createdBy: currentUser?.id || '',
        createdByName: currentUser?.name || '',
      });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteId) { deleteCard(deleteId); setDeleteId(null); setShowView(false); }
  };

  const openView = (id: string) => { setViewingId(id); setShowView(true); };
  const viewingCard = cards.find(c => c.id === viewingId);
  const viewingProf = professionals.find(p => p.id === viewingCard?.assignedTo);
  const viewingStage = columns.find(s => s.id === viewingCard?.columnId);

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
    if (editingStages.length <= 1) return; // sempre ao menos uma coluna
    const hasCards = cards.some(c => c.columnId === id);
    if (hasCards) { setStageDeleteWarn(id); return; }
    setEditingStages(prev => prev.filter(s => s.id !== id));
    setStageDeleteWarn(null);
  };

  const addNewStage = () => {
    if (!newStageForm.label.trim()) return;
    const id = `col_${Date.now()}`;
    setEditingStages(prev => [...prev, {
      id, label: newStageForm.label.trim(), icon: newStageForm.icon || '📌', color: newStageForm.color,
    }]);
    setNewStageForm({ label: '', icon: '📌', color: 'text-blue-400' });
  };

  const saveStages = async () => {
    if (stageEditId) saveStageEdit();
    setStageSaving(true);
    await saveDemandBoardStages(editingStages);
    setStageSaving(false);
    setShowStagesModal(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const totalOpen = cards.length;

  return (
    <div className="flex flex-col h-full -mx-6 -mt-6">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.05] bg-[#0d1117] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">Demandas</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {totalOpen} demanda(s) · quadro compartilhado da equipe
          </p>
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <button
            onClick={openStagesModal}
            className="flex items-center gap-1.5 border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            title="Gerenciar colunas"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Colunas
          </button>
        )}

        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Demanda
        </button>
      </div>

      {dbError && (
        <div className="mx-6 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Não foi possível carregar as demandas. Verifique se a tabela <strong>demand_cards</strong> foi criada no banco (rode a migração SQL).
          </p>
        </div>
      )}

      {/* ── Board ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex h-full min-w-max">
            {columns.map((stage, i) => (
              <BoardColumn
                key={stage.id}
                stage={stage}
                cards={cardsByColumn[stage.id] || []}
                professionals={professionals}
                isLast={i === columns.length - 1}
                onOpen={openView}
                didDrag={didDrag}
              />
            ))}
          </div>
        </div>
        <DragOverlay>{activeCard ? <OverlayCard card={activeCard} /> : null}</DragOverlay>
      </DndContext>

      {/* ── Add/Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[#21262d] rounded-2xl w-full max-w-lg border border-white/[0.08] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-sm font-bold text-slate-100">{editingId ? 'Editar Demanda' : 'Nova Demanda'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Título</label>
                <input
                  autoFocus
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Aprovar arte com o cliente X"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Detalhes do gargalo, contexto, bloqueio…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Responsável</label>
                  <select
                    value={form.assignedTo}
                    onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#161b22]"
                  >
                    <option value="">Sem responsável</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#161b22]"
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Coluna</label>
                <select
                  value={form.columnId}
                  onChange={e => setForm(f => ({ ...f, columnId: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#161b22]"
                >
                  {columns.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {editingId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View modal ── */}
      {showView && viewingCard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowView(false)}>
          <div className="bg-[#21262d] rounded-2xl w-full max-w-lg border border-white/[0.08] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[viewingCard.priority]}`} />
                <h2 className="text-sm font-bold text-slate-100 truncate">{viewingCard.title}</h2>
              </div>
              <button onClick={() => setShowView(false)} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {viewingCard.description && (
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{viewingCard.description}</p>
              )}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 uppercase tracking-wide font-semibold mb-1">Coluna</p>
                  <p className={`font-semibold ${viewingStage?.color || 'text-slate-300'}`}>{viewingStage?.icon} {viewingStage?.label || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide font-semibold mb-1">Prioridade</p>
                  <p className="text-slate-300 font-semibold">{PRIORITY_LABEL[viewingCard.priority]}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide font-semibold mb-1">Responsável</p>
                  <p className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {viewingProf?.name || 'Sem responsável'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide font-semibold mb-1">Criada por</p>
                  <p className="text-slate-300 font-semibold">{viewingCard.createdByName || '—'}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">{formatDateTime(viewingCard.createdAt)}</p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              {canDeleteCard(viewingCard) && (
                <button onClick={() => setDeleteId(viewingCard.id)} className="flex items-center gap-1.5 border border-red-500/20 text-red-400 hover:bg-red-500/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => openEdit(viewingCard)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                <Pencil className="w-4 h-4" /> Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-[#21262d] rounded-2xl w-full max-w-sm border border-white/[0.08] p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-100 mb-2">Excluir demanda?</h2>
            <p className="text-xs text-slate-500 mb-5">Essa ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stages modal ── */}
      {showStagesModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowStagesModal(false)}>
          <div className="bg-[#21262d] rounded-2xl w-full max-w-lg border border-white/[0.08] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] sticky top-0 bg-[#21262d]">
              <h2 className="text-sm font-bold text-slate-100">Gerenciar Colunas</h2>
              <button onClick={() => setShowStagesModal(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-2">
              {editingStages.map((stage, idx) => (
                <div key={stage.id} className="border border-white/[0.06] rounded-xl p-3">
                  {stageEditId === stage.id ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={stageForm.icon}
                          onChange={e => setStageForm(f => ({ ...f, icon: e.target.value }))}
                          className="w-14 border border-white/[0.08] rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="📌"
                          maxLength={2}
                        />
                        <input
                          type="text"
                          value={stageForm.label}
                          onChange={e => setStageForm(f => ({ ...f, label: e.target.value }))}
                          className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Nome da coluna"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STAGE_COLORS.map(c => (
                          <button
                            key={c.cls}
                            onClick={() => setStageForm(f => ({ ...f, color: c.cls }))}
                            className={`w-6 h-6 rounded-full ${c.dot} transition-all ${stageForm.color === c.cls ? 'ring-2 ring-white ring-offset-2 ring-offset-[#21262d]' : 'opacity-60 hover:opacity-100'}`}
                            title={c.label}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveStageEdit} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </button>
                        <button onClick={() => setStageEditId(null)} className="text-xs text-slate-500 hover:text-slate-300 px-2">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-base">{stage.icon}</span>
                      <span className={`text-sm font-semibold flex-1 ${stage.color}`}>{stage.label}</span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => moveStageUp(idx)} disabled={idx === 0} className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => moveStageDown(idx)} disabled={idx === editingStages.length - 1} className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => startEditStage(stage)} className="p-1 text-slate-500 hover:text-indigo-400"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => tryDeleteStage(stage.id)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )}
                  {stageDeleteWarn === stage.id && (
                    <p className="text-[11px] text-amber-400 mt-2">Há demandas nesta coluna. Mova-as antes de excluir.</p>
                  )}
                </div>
              ))}

              {/* Add new stage */}
              <div className="border border-dashed border-white/[0.1] rounded-xl p-3 mt-4">
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Nova coluna</p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newStageForm.icon}
                    onChange={e => setNewStageForm(f => ({ ...f, icon: e.target.value }))}
                    className="w-14 border border-white/[0.08] rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="📌"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    value={newStageForm.label}
                    onChange={e => setNewStageForm(f => ({ ...f, label: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addNewStage(); }}
                    className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Nome da coluna"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {STAGE_COLORS.map(c => (
                    <button
                      key={c.cls}
                      onClick={() => setNewStageForm(f => ({ ...f, color: c.cls }))}
                      className={`w-6 h-6 rounded-full ${c.dot} transition-all ${newStageForm.color === c.cls ? 'ring-2 ring-white ring-offset-2 ring-offset-[#21262d]' : 'opacity-60 hover:opacity-100'}`}
                      title={c.label}
                    />
                  ))}
                </div>
                <button onClick={addNewStage} disabled={!newStageForm.label.trim()} className="flex items-center gap-1.5 border border-white/[0.08] text-slate-300 hover:border-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" /> Adicionar coluna
                </button>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05] sticky bottom-0 bg-[#21262d]">
              <button onClick={() => setShowStagesModal(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={saveStages} disabled={stageSaving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
                {stageSaving ? 'Salvando...' : 'Salvar colunas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
