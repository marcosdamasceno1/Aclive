import { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X,
  User, Users, Flag, Edit2, Trash2, CalendarDays,
} from 'lucide-react';
import { useCalendarStore, CALENDAR_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '../store/calendarStore';
import { useAuthStore } from '../store/authStore';
import { canManageCalendar } from '../utils/permissions';
import type { CalendarEvent, Priority } from '../types';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(str: string): string {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: { date: Date; currentMonth: boolean }[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) {
    days.push({ date: new Date(year, month, 1 - (firstDay.getDay() - i)), currentMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), currentMonth: true });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), currentMonth: false });
  }
  return days;
}

function colorChip(color: string) {
  return CALENDAR_COLORS.find(c => c.id === color)?.chip ?? CALENDAR_COLORS[0].chip;
}

const emptyForm = {
  title: '', description: '', date: '', endDate: '',
  color: 'blue', assignedTo: 'all', assignedToName: 'Todos',
  priority: 'medium' as Priority,
};

export const Calendar = () => {
  const { events, addEvent, updateEvent, deleteEvent } = useCalendarStore();
  const { currentUser, users } = useAuthStore();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canManage = canManageCalendar(currentUser?.role ?? 'professional');

  const visibleEvents = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return events;
    return events.filter(e => e.assignedTo === 'all' || e.assignedTo === currentUser.id);
  }, [events, currentUser]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  function eventsForDay(date: Date) {
    const ds = toDateStr(date);
    return visibleEvents.filter(e => {
      const start = e.date;
      const end = e.endDate || e.date;
      return ds >= start && ds <= end;
    });
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  function openCreate(defaultDate = '') {
    setEditingId(null);
    setForm({ ...emptyForm, date: defaultDate });
    setShowModal(true);
  }
  function openEdit(ev: CalendarEvent) {
    setViewingEvent(null);
    setEditingId(ev.id);
    setForm({
      title: ev.title, description: ev.description || '',
      date: ev.date, endDate: ev.endDate || '',
      color: ev.color, assignedTo: ev.assignedTo,
      assignedToName: ev.assignedToName, priority: ev.priority,
    });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingId(null); setForm(emptyForm); }

  function handleAssignChange(userId: string) {
    if (userId === 'all') {
      setForm(f => ({ ...f, assignedTo: 'all', assignedToName: 'Todos' }));
    } else {
      const u = users.find(u => u.id === userId);
      setForm(f => ({ ...f, assignedTo: userId, assignedToName: u?.name ?? '' }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      endDate: form.endDate || undefined,
      color: form.color,
      assignedTo: form.assignedTo,
      assignedToName: form.assignedToName,
      priority: form.priority,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    };
    if (editingId) {
      updateEvent(editingId, payload);
      if (viewingEvent && viewingEvent.id === editingId) {
        setViewingEvent({ ...viewingEvent, ...payload });
      }
    } else {
      addEvent(payload);
    }
    closeModal();
  }

  function handleDelete() {
    if (!viewingEvent) return;
    deleteEvent(viewingEvent.id);
    setViewingEvent(null);
    setShowDeleteConfirm(false);
  }

  const todayStr = toDateStr(today);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Calendário</h1>
          <p className="text-sm text-slate-400 mt-0.5">Visualize e gerencie eventos da equipe.</p>
        </div>
        {canManage && (
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Evento
          </button>
        )}
      </div>

      {/* Calendar card */}
      <div className="bg-[#161b27] border border-white/[0.06] rounded-xl overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white font-semibold text-base w-36 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            Hoje
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, currentMonth }, idx) => {
            const ds = toDateStr(date);
            const isToday = ds === todayStr;
            const dayEvents = eventsForDay(date);
            const isLastRow = idx >= calendarDays.length - 7;

            return (
              <div
                key={ds}
                onClick={() => canManage && currentMonth ? openCreate(ds) : undefined}
                className={`min-h-[96px] p-1.5 border-b border-r border-white/[0.04] transition-colors
                  ${isLastRow ? 'border-b-0' : ''}
                  ${(idx + 1) % 7 === 0 ? 'border-r-0' : ''}
                  ${currentMonth && canManage ? 'cursor-pointer hover:bg-white/[0.02]' : ''}
                `}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1
                  ${isToday ? 'bg-blue-600 text-white' : currentMonth ? 'text-slate-300' : 'text-slate-600'}
                `}>
                  {date.getDate()}
                </span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map(ev => (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); setViewingEvent(ev); }}
                      className={`w-full text-left text-xs px-1.5 py-0.5 rounded border truncate font-medium transition-opacity hover:opacity-80 ${colorChip(ev.color)}`}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <button
                      onClick={e => { e.stopPropagation(); setViewingEvent(dayEvents[2]); }}
                      className="w-full text-left text-xs px-1.5 text-slate-500 hover:text-slate-400"
                    >
                      +{dayEvents.length - 2} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-slate-600 mr-2">Cores:</span>
        {CALENDAR_COLORS.map(c => (
          <span key={c.id} className={`text-xs px-2 py-0.5 rounded border ${c.chip}`}>{c.label}</span>
        ))}
      </div>

      {/* ── View Event Modal ── */}
      {viewingEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b27] border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${CALENDAR_COLORS.find(c => c.id === viewingEvent.color)?.dot ?? 'bg-blue-500'}`} />
                <h2 className="text-white font-bold text-base">{viewingEvent.title}</h2>
              </div>
              <button onClick={() => setViewingEvent(null)} className="text-slate-500 hover:text-slate-300 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {viewingEvent.description && (
                <p className="text-slate-400 text-sm">{viewingEvent.description}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Data</p>
                  <p className="text-white text-sm font-medium">
                    {formatDisplay(viewingEvent.date)}
                    {viewingEvent.endDate && viewingEvent.endDate !== viewingEvent.date
                      ? ` → ${formatDisplay(viewingEvent.endDate)}`
                      : ''}
                  </p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Prioridade</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_COLORS[viewingEvent.priority]}`}>
                    {PRIORITY_LABELS[viewingEvent.priority]}
                  </span>
                </div>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                {viewingEvent.assignedTo === 'all' ? (
                  <Users className="w-4 h-4 text-slate-500 flex-shrink-0" />
                ) : (
                  <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-xs text-slate-500">Para</p>
                  <p className="text-white text-sm font-medium">{viewingEvent.assignedToName}</p>
                </div>
              </div>
              <p className="text-xs text-slate-600">Criado por {viewingEvent.createdByName}</p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 px-5 pb-5">
                <button
                  onClick={() => openEdit(viewingEvent)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {showDeleteConfirm && viewingEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161b27] border border-white/[0.08] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-white font-bold mb-2">Excluir evento</h3>
            <p className="text-slate-400 text-sm mb-5">
              Tem certeza que deseja excluir <span className="text-white font-medium">"{viewingEvent.title}"</span>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b27] border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-400" />
                <h2 className="text-white font-bold">{editingId ? 'Editar Evento' : 'Novo Evento'}</h2>
              </div>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Título <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  placeholder="Ex: Reunião de planejamento"
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Descrição
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Detalhes do evento..."
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                    Data <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                    Data fim
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.date}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Para</span>
                </label>
                <select
                  value={form.assignedTo}
                  onChange={e => handleAssignChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todos os usuários</option>
                  {users.filter(u => u.active !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  <span className="flex items-center gap-1"><Flag className="w-3 h-3" /> Prioridade</span>
                </label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CALENDAR_COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.id }))}
                      title={c.label}
                      className={`w-7 h-7 rounded-full transition-all border-2 ${c.dot}
                        ${form.color === c.id ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}
                      `}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {editingId ? 'Salvar alterações' : 'Criar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
