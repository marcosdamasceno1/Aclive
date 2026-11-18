import { useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, MoreHorizontal, Plus, Trash2, Copy, ArrowUp, ArrowDown, X, Ban, ChevronRight, Home,
  Type, AlignLeft, User, Mail, Phone, CircleDot, CheckSquare, Image as ImageIcon, Hash, Calendar, MessageSquare,
} from 'lucide-react';
import {
  QUESTION_TYPES, isChoice, newQuestion, uid,
  type ChoiceOption, type FormConfig, type Question, type QuestionType,
} from '../../lib/forms/schema';
import { colorOf, type LeadTag } from '../../store/leadBoardsStore';

export const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
export const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide';

const ICONS: Record<QuestionType, React.ElementType> = {
  short_text: Type, long_text: AlignLeft, name: User, email: Mail, phone: Phone,
  single_choice: CircleDot, multi_choice: CheckSquare, image_choice: ImageIcon,
  number: Hash, date: Calendar, statement: MessageSquare,
};
const typeLabel = (t: QuestionType) => QUESTION_TYPES.find(x => x.type === t)?.label ?? t;

interface Props {
  config: FormConfig;
  onChange: (c: FormConfig) => void;
  tags: LeadTag[];
  selected: string | null; // 'welcome' | question id
  onSelect: (id: string | null) => void;
}

// ─── Paleta ──────────────────────────────────────────────────────────────────
const PaletteItem = ({ type, onAdd }: { type: QuestionType; onAdd: (t: QuestionType) => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}` });
  const Icon = ICONS[type];
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd(type)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-left text-sm hover:border-blue-300 hover:bg-blue-50/40 transition-colors cursor-grab ${isDragging ? 'opacity-40' : ''}`}>
      <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
      <span className="text-slate-700">{typeLabel(type)}</span>
    </button>
  );
};

// ─── Card de pergunta ────────────────────────────────────────────────────────
const QuestionCard = ({ q, index, total, active, onSelect, onAction }: {
  q: Question; index: number; total: number; active: boolean;
  onSelect: () => void; onAction: (a: 'dup' | 'up' | 'down' | 'del' | `type:${QuestionType}`) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const [menu, setMenu] = useState(false);
  const Icon = ICONS[q.type];
  const dq = (q.options ?? []).some(o => o.action === 'disqualify');
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`group relative flex items-start gap-2 bg-white rounded-xl border-2 p-3 transition-colors ${active ? 'border-blue-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
      <button {...attributes} {...listeners} aria-label="Arrastar" className="p-1 -ml-1 text-slate-300 hover:text-slate-500 cursor-grab touch-none">
        <GripVertical className="w-4 h-4" />
      </button>
      <button onClick={onSelect} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-bold text-slate-400">{index + 1}</span>
          <Icon className="w-3.5 h-3.5" />{typeLabel(q.type)}
          {q.required && q.type !== 'statement' && <span className="text-red-500">obrigatória</span>}
          {dq && <span className="inline-flex items-center gap-0.5 text-red-600"><Ban className="w-3 h-3" />desqualifica</span>}
        </div>
        <p className="text-sm font-medium text-slate-900 mt-0.5 line-clamp-2">{q.title || <span className="text-slate-400">Sem título</span>}</p>
        {isChoice(q.type) && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{(q.options ?? []).map(o => o.label).join(' · ')}</p>
        )}
      </button>
      <button onClick={() => setMenu(m => !m)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><MoreHorizontal className="w-4 h-4" /></button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-9 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-52 text-sm">
            <button onClick={() => { setMenu(false); onAction('dup'); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50"><Copy className="w-4 h-4" />Duplicar</button>
            {index > 0 && <button onClick={() => { setMenu(false); onAction('up'); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50"><ArrowUp className="w-4 h-4" />Mover para cima</button>}
            {index < total - 1 && <button onClick={() => { setMenu(false); onAction('down'); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50"><ArrowDown className="w-4 h-4" />Mover para baixo</button>}
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase">Trocar tipo</div>
            <select value={q.type} onChange={e => { setMenu(false); onAction(`type:${e.target.value as QuestionType}`); }}
              className="mx-3 mb-2 w-[calc(100%-1.5rem)] border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              {QUESTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <button onClick={() => { setMenu(false); onAction('del'); }} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" />Excluir</button>
          </div>
        </>
      )}
    </div>
  );
};

const EndDrop = () => {
  const { setNodeRef, isOver } = useDroppable({ id: 'list-end' });
  return (
    <div ref={setNodeRef} className={`h-14 rounded-xl border-2 border-dashed flex items-center justify-center text-xs transition-colors ${isOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
      Arraste um tipo de pergunta para cá
    </div>
  );
};

// ─── Editor de pergunta ──────────────────────────────────────────────────────
export const TagPicker = ({ tags, value, onChange }: { tags: LeadTag[]; value: string[]; onChange: (v: string[]) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {tags.length === 0 && <span className="text-xs text-slate-400">Crie tags na aba Leads.</span>}
    {tags.map(t => {
      const on = value.includes(t.id);
      return (
        <button key={t.id} type="button" onClick={() => onChange(on ? value.filter(x => x !== t.id) : [...value, t.id])}
          className={`text-xs px-2 py-1 rounded-full border transition-all ${on ? colorOf(t.color).chip + ' ring-1 ring-offset-1 ring-blue-400' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          {t.name}
        </button>
      );
    })}
  </div>
);

const QuestionEditor = ({ q, config, tags, onChange }: { q: Question; config: FormConfig; tags: LeadTag[]; onChange: (q: Question) => void }) => {
  const setOpt = (id: string, patch: Partial<ChoiceOption>) =>
    onChange({ ...q, options: (q.options ?? []).map(o => o.id === id ? { ...o, ...patch } : o) });
  const moveOpt = (i: number, d: -1 | 1) => {
    const opts = [...(q.options ?? [])];
    const j = i + d; if (j < 0 || j >= opts.length) return;
    [opts[i], opts[j]] = [opts[j], opts[i]];
    onChange({ ...q, options: opts });
  };
  const dqEndings = config.endings;
  return (
    <div className="space-y-4">
      <div>
        <label className={lbl}>Pergunta</label>
        <textarea value={q.title} onChange={e => onChange({ ...q, title: e.target.value })} rows={2} className={`${inp} resize-none`} placeholder="Digite a pergunta" />
      </div>
      <div>
        <label className={lbl}>{q.type === 'statement' ? 'Texto' : 'Texto de ajuda / exemplo'}</label>
        <textarea value={q.description ?? ''} onChange={e => onChange({ ...q, description: e.target.value })} rows={2} className={`${inp} resize-none`}
          placeholder={q.type === 'statement' ? 'Mensagem para o visitante' : 'Ex.: Drogaria Saúde Popular'} />
      </div>
      {['short_text', 'long_text', 'name', 'email', 'phone', 'number'].includes(q.type) && (
        <div>
          <label className={lbl}>Texto dentro do campo</label>
          <input value={q.placeholder ?? ''} onChange={e => onChange({ ...q, placeholder: e.target.value })} className={inp} />
        </div>
      )}
      {q.type !== 'statement' && (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm text-slate-700">Resposta obrigatória</span>
          <input type="checkbox" checked={q.required} onChange={e => onChange({ ...q, required: e.target.checked })} className="w-4 h-4 accent-blue-600" />
        </label>
      )}
      {(q.type === 'name' || q.type === 'email' || q.type === 'phone') && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
          A primeira pergunta deste tipo vira o {q.type === 'name' ? 'nome' : q.type === 'email' ? 'e-mail' : 'WhatsApp'} do lead em Leads.
        </p>
      )}

      {isChoice(q.type) && (
        <div className="space-y-2">
          <label className={lbl}>Opções</label>
          {(q.options ?? []).map((o, i) => (
            <div key={o.id} className={`rounded-xl border p-2.5 space-y-2 ${o.action === 'disqualify' ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400 w-4">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]}</span>
                <input value={o.label} onChange={e => setOpt(o.id, { label: e.target.value })} className={`${inp} py-1.5`} placeholder="Texto da opção" />
                <button onClick={() => moveOpt(i, -1)} disabled={i === 0} className="p-1 text-slate-400 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveOpt(i, 1)} disabled={i === (q.options?.length ?? 0) - 1} className="p-1 text-slate-400 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => onChange({ ...q, options: (q.options ?? []).filter(x => x.id !== o.id) })} disabled={(q.options?.length ?? 0) <= 1}
                  className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><X className="w-3.5 h-3.5" /></button>
              </div>
              {q.type === 'image_choice' && (
                <input value={o.imageUrl ?? ''} onChange={e => setOpt(o.id, { imageUrl: e.target.value })} className={`${inp} py-1.5 text-xs`} placeholder="Link da imagem (https://…)" />
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Ao escolher:</span>
                <select value={o.action} onChange={e => setOpt(o.id, { action: e.target.value as ChoiceOption['action'] })}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                  <option value="continue">Continuar</option>
                  <option value="disqualify">Desqualificar e encerrar</option>
                </select>
              </div>
              {o.action === 'disqualify' && (
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">Tela final:</span>
                    <select value={o.endingId ?? ''} onChange={e => setOpt(o.id, { endingId: e.target.value || undefined })}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">Padrão de desqualificados</option>
                      {dqEndings.map(e => <option key={e.id} value={e.id}>{e.title || 'Sem título'}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Tags do motivo:</p>
                    <TagPicker tags={tags} value={o.tagIds ?? []} onChange={v => setOpt(o.id, { tagIds: v })} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => onChange({ ...q, options: [...(q.options ?? []), { id: uid(), label: `Opção ${String.fromCharCode(65 + (q.options?.length ?? 0))}`, action: 'continue' }] })}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 border border-dashed border-blue-300 rounded-lg py-2 hover:bg-blue-50">
            <Plus className="w-4 h-4" />Adicionar opção
          </button>
        </div>
      )}
    </div>
  );
};

const WelcomeEditor = ({ config, onChange }: { config: FormConfig; onChange: (c: FormConfig) => void }) => {
  const w = config.welcome;
  const set = (patch: Partial<FormConfig['welcome']>) => onChange({ ...config, welcome: { ...w, ...patch } });
  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm text-slate-700">Mostrar tela de abertura</span>
        <input type="checkbox" checked={w.enabled} onChange={e => set({ enabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
      </label>
      {w.enabled && (
        <>
          <div><label className={lbl}>Título</label><textarea value={w.title} onChange={e => set({ title: e.target.value })} rows={2} className={`${inp} resize-none`} /></div>
          <div><label className={lbl}>Subtítulo</label><textarea value={w.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} rows={2} className={`${inp} resize-none`} /></div>
          <div>
            <label className={lbl}>Benefícios (um por linha, aceita emoji)</label>
            <textarea value={w.bullets.join('\n')} onChange={e => set({ bullets: e.target.value.split('\n').slice(0, 8) })} rows={3} className={`${inp} resize-none`} placeholder={'✅ Diagnóstico gratuito\n📈 Estratégia sob medida'} />
          </div>
          <div><label className={lbl}>Imagem (link https)</label><input value={w.imageUrl ?? ''} onChange={e => set({ imageUrl: e.target.value })} className={inp} placeholder="https://…" /></div>
          <div><label className={lbl}>Texto do botão</label><input value={w.buttonText} onChange={e => set({ buttonText: e.target.value })} className={inp} maxLength={40} /></div>
        </>
      )}
    </div>
  );
};

// ─── Aba Perguntas ───────────────────────────────────────────────────────────
export const QuestionsTab = ({ config, onChange, tags, selected, onSelect }: Props) => {
  const [dragType, setDragType] = useState<QuestionType | null>(null);
  const [addSheet, setAddSheet] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const qs = config.questions;
  const setQuestions = (questions: Question[]) => onChange({ ...config, questions });

  const add = (type: QuestionType, at = qs.length) => {
    const q = newQuestion(type);
    const next = [...qs]; next.splice(at, 0, q);
    setQuestions(next);
    onSelect(q.id);
    setAddSheet(false);
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith('palette:')) setDragType(id.slice(8) as QuestionType);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragType(null);
    if (!over) return;
    const a = String(active.id); const o = String(over.id);
    if (a.startsWith('palette:')) {
      const idx = o === 'list-end' ? qs.length : qs.findIndex(q => q.id === o);
      add(a.slice(8) as QuestionType, idx < 0 ? qs.length : idx);
      return;
    }
    if (a === o || o === 'list-end') return;
    const from = qs.findIndex(q => q.id === a); const to = qs.findIndex(q => q.id === o);
    if (from >= 0 && to >= 0) setQuestions(arrayMove(qs, from, to));
  };

  const action = (i: number, act: string) => {
    const q = qs[i];
    if (act === 'dup') { const c = { ...q, id: uid(), options: q.options?.map(o => ({ ...o, id: uid() })) }; const n = [...qs]; n.splice(i + 1, 0, c); setQuestions(n); onSelect(c.id); }
    if (act === 'up' && i > 0) setQuestions(arrayMove(qs, i, i - 1));
    if (act === 'down' && i < qs.length - 1) setQuestions(arrayMove(qs, i, i + 1));
    if (act === 'del') { setQuestions(qs.filter(x => x.id !== q.id)); if (selected === q.id) onSelect(null); }
    if (act.startsWith('type:')) {
      const t = act.slice(5) as QuestionType;
      const fresh = newQuestion(t);
      setQuestions(qs.map(x => x.id === q.id ? { ...fresh, id: q.id, title: q.title || fresh.title, description: q.description, options: isChoice(t) ? (q.options?.length ? q.options : fresh.options) : undefined } : x));
    }
  };

  const selectedQ = qs.find(q => q.id === selected) ?? null;
  const editor = selected === 'welcome'
    ? <WelcomeEditor config={config} onChange={onChange} />
    : selectedQ
      ? <QuestionEditor q={selectedQ} config={config} tags={tags} onChange={nq => setQuestions(qs.map(x => x.id === nq.id ? nq : x))} />
      : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_320px] gap-4 items-start">
        {/* Paleta */}
        <div className="hidden lg:block space-y-1.5 lg:sticky lg:top-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">Arraste ou clique</p>
          {QUESTION_TYPES.map(t => <PaletteItem key={t.type} type={t.type} onAdd={type => add(type)} />)}
        </div>

        {/* Cards */}
        <div className="space-y-2 min-w-0">
          <button onClick={() => onSelect('welcome')}
            className={`w-full flex items-center gap-3 bg-white rounded-xl border-2 p-3 text-left ${selected === 'welcome' ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'}`}>
            <Home className="w-4 h-4 text-slate-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-500">Tela de abertura {config.welcome.enabled ? '' : '(desligada)'}</p>
              <p className="text-sm font-medium text-slate-900 truncate">{config.welcome.title}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          <SortableContext items={qs.map(q => q.id)} strategy={verticalListSortingStrategy}>
            {qs.map((q, i) => (
              <QuestionCard key={q.id} q={q} index={i} total={qs.length} active={selected === q.id}
                onSelect={() => onSelect(q.id)} onAction={a => action(i, a)} />
            ))}
          </SortableContext>
          <div className="hidden lg:block"><EndDrop /></div>
          <button onClick={() => setAddSheet(true)} className="lg:hidden w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold">
            <Plus className="w-4 h-4" />Pergunta
          </button>
        </div>

        {/* Painel (desktop) */}
        <div className="hidden lg:block bg-white border border-slate-200 rounded-xl p-4 lg:sticky lg:top-4 max-h-[calc(100dvh-140px)] overflow-y-auto">
          {editor ?? <p className="text-sm text-slate-400 text-center py-10">Clique em uma pergunta para editar</p>}
        </div>
      </div>

      {/* Painel no celular: folha de baixo para cima */}
      {editor && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => onSelect(null)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-900">Editar</p>
              <button onClick={() => onSelect(null)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold">Pronto</button>
            </div>
            {editor}
          </div>
        </div>
      )}
      {addSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setAddSheet(false)}>
          <div className="bg-white w-full rounded-t-2xl p-5 pb-8 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
            {QUESTION_TYPES.map(t => {
              const Icon = ICONS[t.type];
              return (
                <button key={t.type} onClick={() => add(t.type)} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 text-sm text-left">
                  <Icon className="w-4 h-4 text-slate-500" />{t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <DragOverlay>
        {dragType ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-400 bg-white shadow-xl text-sm">
            {(() => { const I = ICONS[dragType]; return <I className="w-4 h-4 text-blue-600" />; })()}{typeLabel(dragType)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
