import { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Check } from 'lucide-react';
import {
  useLeadBoardsStore, COLORS, colorOf, SOURCE_LABELS, type LeadBoard, type StageKind,
} from '../../store/leadBoardsStore';

const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const ColorDots = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
  <div className="flex flex-wrap gap-1">
    {COLORS.map(c => (
      <button key={c.key} type="button" onClick={() => onChange(c.key)} aria-label={c.key}
        className={`w-5 h-5 rounded-full ${c.dot} flex items-center justify-center ${value === c.key ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`}>
        {value === c.key && <Check className="w-3 h-3 text-white" />}
      </button>
    ))}
  </div>
);

const Shell = ({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) => (
  <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
    <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[90dvh] flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 overflow-y-auto space-y-4">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-slate-200">{footer}</div>}
    </div>
  </div>
);

/** Criar janela (board = null) ou editar a janela atual e suas etapas. */
export const BoardSettingsModal = ({ board, onClose }: { board: LeadBoard | null; onClose: (selectId?: string) => void }) => {
  const { boards, boardStages, addBoard, updateBoard, deleteBoard, addStage, updateStage, deleteStage } = useLeadBoardsStore();
  const [name, setName] = useState(board?.name ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newStage, setNewStage] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const stages = board ? boardStages(board.id) : [];

  const run = async (fn: () => Promise<string | null>) => {
    setErr(''); setBusy(true);
    const e = await fn();
    setBusy(false);
    if (e) setErr(e);
    return !e;
  };

  if (!board) {
    return (
      <Shell title="Nova janela" onClose={() => onClose()}
        footer={
          <button disabled={!name.trim() || busy} onClick={async () => {
            setBusy(true); const e = await addBoard(name); setBusy(false);
            if (e) { setErr(e); return; }
            const created = useLeadBoardsStore.getState().boards.at(-1);
            onClose(created?.id);
          }} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">Criar janela</button>
        }>
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1.5">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus className={inp} placeholder="Ex.: Leads do Google, Leads de formulário" maxLength={60} />
          <p className="text-xs text-slate-500 mt-1">Vem com as etapas Novo, Em contato, Fechado e Perdido. Dá para mudar tudo depois.</p>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </Shell>
    );
  }

  const move = async (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= stages.length) return;
    await run(async () => (await updateStage(stages[i].id, { position: j })) ?? (await updateStage(stages[j].id, { position: i })));
  };

  return (
    <Shell title="Editar janela" onClose={() => onClose()}>
      <div>
        <label className="block text-sm font-medium text-slate-800 mb-1.5">Nome da janela</label>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} className={inp} maxLength={60} />
          <button disabled={!name.trim() || name === board.name || busy} onClick={() => run(() => updateBoard(board.id, { name: name.trim() }))}
            className="px-3 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">Salvar</button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-800 mb-1">Origens que caem nesta janela</p>
        <p className="text-xs text-slate-500 mb-2">Leads sem janela definida (busca no Google, Meta, site, manual) vão para a primeira janela que tiver a origem marcada.</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SOURCE_LABELS).map(([key, label]) => {
            const on = board.sources.includes(key);
            return (
              <button key={key} onClick={() => run(() => updateBoard(board.id, { sources: on ? board.sources.filter(x => x !== key) : [...board.sources, key] }))}
                className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                {on ? '✓ ' : ''}{label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">Etapas</p>
        {stages.map((st, i) => (
          <div key={st.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <input defaultValue={st.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== st.name) void run(() => updateStage(st.id, { name: v })); }}
                className={`${inp} py-1.5`} maxLength={40} />
              <button onClick={() => void move(i, -1)} disabled={i === 0 || busy} className="p-1 text-slate-400 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button onClick={() => void move(i, 1)} disabled={i === stages.length - 1 || busy} className="p-1 text-slate-400 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button onClick={() => void run(() => deleteStage(st.id))} disabled={stages.length <= 1 || busy} className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <ColorDots value={st.color} onChange={c => void run(() => updateStage(st.id, { color: c }))} />
              <select value={st.kind} onChange={e => void run(() => updateStage(st.id, { kind: e.target.value as StageKind }))}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                <option value="open">Em andamento</option>
                <option value="won">Ganho / fechado</option>
                <option value="lost">Perdido</option>
              </select>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={newStage} onChange={e => setNewStage(e.target.value)} placeholder="Nova etapa" className={inp} maxLength={40} />
          <button disabled={!newStage.trim() || busy} onClick={async () => { if (await run(() => addStage(board.id, newStage, 'blue', 'open'))) setNewStage(''); }}
            className="px-3 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1"><Plus className="w-4 h-4" />Adicionar</button>
        </div>
        <p className="text-xs text-slate-500">"Perdido" recebe os desqualificados dos formulários; "Ganho" é usado ao converter em cliente.</p>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {boards.length > 1 && (
        <div className="border-t border-slate-100 pt-4">
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="text-sm text-red-600 flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Excluir esta janela</button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-700">Os leads voltam para a janela padrão. Confirmar?</span>
              <button onClick={async () => { if (await run(() => deleteBoard(board.id))) onClose(boards.find(b => b.id !== board.id)?.id); }}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold">Excluir</button>
              <button onClick={() => setConfirmDel(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">Cancelar</button>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
};

export const TagsModal = ({ onClose }: { onClose: () => void }) => {
  const { tags, addTag, updateTag, deleteTag } = useLeadBoardsStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<string | null>) => { setErr(''); const e = await fn(); if (e) setErr(e); return !e; };

  return (
    <Shell title="Tags" onClose={onClose}>
      <p className="text-sm text-slate-500">Use tags para ver onde o lead parou (ex.: Qualificado, Desqualificado, Faturamento baixo). Os formulários aplicam tags sozinhos.</p>
      <div className="space-y-2">
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-xl p-2.5">
            <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${colorOf(t.color).chip}`}>{t.name}</span>
            <input defaultValue={t.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) void run(() => updateTag(t.id, { name: v })); }}
              className={`${inp} py-1.5`} maxLength={40} />
            <div className="hidden sm:block"><ColorDots value={t.color} onChange={c => void run(() => updateTag(t.id, { color: c }))} /></div>
            <button onClick={() => void run(() => deleteTag(t.id))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-slate-400">Nenhuma tag ainda.</p>}
      </div>
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-slate-800">Nova tag</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Faturamento baixo" className={inp} maxLength={40} />
        <ColorDots value={color} onChange={setColor} />
        <button disabled={!name.trim()} onClick={async () => { if (await run(() => addTag(name, color))) setName(''); }}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-semibold">Criar tag</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Shell>
  );
};
