import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Copy, CheckCircle, ExternalLink, MoreVertical, Pause, Play, Trash2, CopyPlus,
  FileText, Link2, AlertTriangle, Loader2, X,
} from 'lucide-react';
import { useFormsStore, type FormRecord } from '../store/formsStore';
import { useLeadBoardsStore } from '../store/leadBoardsStore';
import { useAuthStore } from '../store/authStore';
import { TEMPLATES } from '../lib/forms/templates';
import { FormBuilder } from './forms/FormBuilder';
import { PUBLIC_BASE, formUrl } from '../lib/forms/url';


const STATUS: Record<FormRecord['status'], { label: string; cls: string }> = {
  draft:     { label: 'Rascunho',  cls: 'bg-slate-100 text-slate-600' },
  published: { label: 'Publicado', cls: 'bg-emerald-50 text-emerald-700' },
  paused:    { label: 'Pausado',   cls: 'bg-amber-50 text-amber-700' },
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export const Forms = () => {
  const { id } = useParams();
  const { forms, stats, companySlug, loaded, error, init, setCompanySlug, createForm, setStatus, duplicate, remove } = useFormsStore();
  const initBoards = useLeadBoardsStore(s => s.init);
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isAdmin = currentUser?.role === 'admin';

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [template, setTemplate] = useState('qualify');
  const [creating, setCreating] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [slugInput, setSlugInput] = useState('');
  const [slugErr, setSlugErr] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);

  useEffect(() => { void init(); void initBoards(); }, [init, initBoards]);

  if (id) return <FormBuilder formId={id} onBack={() => navigate('/forms')} />;

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleCreate = async () => {
    setCreating(true); setActionErr('');
    const tpl = TEMPLATES.find(t => t.key === template) ?? TEMPLATES[0];
    const res = await createForm(newName.trim() || tpl.name, tpl.build());
    setCreating(false);
    if (res.error) { setActionErr(res.error); return; }
    setShowNew(false); setNewName('');
    navigate(`/forms/${res.id}`);
  };

  const saveSlug = async () => {
    setSavingSlug(true); setSlugErr('');
    const e = await setCompanySlug(slugInput);
    setSavingSlug(false);
    if (e) setSlugErr(e.replace(/^.*?:\s*/, ''));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Formulários</h1>
          <p className="text-sm text-slate-500 mt-0.5">Formulários de uma pergunta por tela, com Pixel, API de Conversões e funil.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            <Plus className="w-4 h-4" /> Novo formulário
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Apelido da agência no link */}
      {loaded && !error && !companySlug && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Defina o apelido da agência no link</h2>
          </div>
          <p className="text-sm text-slate-500">
            Os formulários ficam em <span className="font-mono text-slate-700">{PUBLIC_BASE}/<b>apelido</b>/formulario</span>.
            Escolha uma vez (letras minúsculas, números e hífen).
          </p>
          {isAdmin ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <span className="px-3 text-xs text-slate-400 bg-slate-50 py-2.5 border-r border-slate-200 whitespace-nowrap">/f/</span>
                <input value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="minha-agencia" maxLength={40} className="flex-1 px-3 py-2.5 text-sm focus:outline-none" />
              </div>
              <button onClick={saveSlug} disabled={slugInput.length < 3 || savingSlug}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                {savingSlug ? 'Salvando…' : 'Salvar apelido'}
              </button>
            </div>
          ) : <p className="text-sm text-amber-700">Peça ao administrador da agência para definir o apelido.</p>}
          {slugErr && <p className="text-sm text-red-600">{slugErr}</p>}
        </div>
      )}

      {!loaded ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : forms.length === 0 && !error ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl py-14 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-slate-700 font-semibold mt-3">Nenhum formulário ainda</p>
          <p className="text-sm text-slate-500 mt-1">Comece por um modelo pronto e ajuste em poucos minutos.</p>
          {canEdit && (
            <button onClick={() => setShowNew(true)} className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              <Plus className="w-4 h-4" /> Criar formulário
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {forms.map(f => {
            const st = stats[f.id] ?? { visits: 0, started: 0, completed: 0, qualified: 0, disqualified: 0 };
            const url = formUrl(companySlug, f.slug);
            return (
              <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-4 hover:border-slate-300 transition-colors">
                <button onClick={() => navigate(`/forms/${f.id}`)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">{f.name}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span>
                    {f.pixelId && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">Pixel{f.capiConfigured ? ' + API' : ''}</span>}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1 truncate">{url || `/f/<apelido>/${f.slug}`}</p>
                </button>
                <div className="grid grid-cols-4 gap-4 text-center lg:w-[340px]">
                  <div><p className="text-lg font-bold text-slate-900">{st.visits}</p><p className="text-[11px] text-slate-500">Visitas</p></div>
                  <div><p className="text-lg font-bold text-slate-900">{st.qualified + st.disqualified}</p><p className="text-[11px] text-slate-500">Leads</p></div>
                  <div><p className="text-lg font-bold text-emerald-600">{st.qualified}</p><p className="text-[11px] text-slate-500">Qualificados</p></div>
                  <div><p className="text-lg font-bold text-slate-900">{pct(st.completed, st.visits)}</p><p className="text-[11px] text-slate-500">Conclusão</p></div>
                </div>
                <div className="flex items-center gap-1.5 relative">
                  {url && (
                    <>
                      <button onClick={() => copy(url, f.id)} title="Copiar link" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                        {copied === f.id ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ExternalLink className="w-4 h-4" /></a>
                    </>
                  )}
                  {canEdit && (
                    <button onClick={() => setMenuId(menuId === f.id ? null : f.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><MoreVertical className="w-4 h-4" /></button>
                  )}
                  {menuId === f.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                        {f.status !== 'published'
                          ? <button onClick={async () => { setMenuId(null); const e = await setStatus(f.id, 'published'); if (e) setActionErr(e); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><Play className="w-4 h-4" />Publicar</button>
                          : <button onClick={async () => { setMenuId(null); const e = await setStatus(f.id, 'paused'); if (e) setActionErr(e); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><Pause className="w-4 h-4" />Pausar</button>}
                        <button onClick={async () => { setMenuId(null); const r = await duplicate(f.id); if (r.error) setActionErr(r.error); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><CopyPlus className="w-4 h-4" />Duplicar</button>
                        <button onClick={() => { setMenuId(null); setDeleteId(f.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" />Excluir</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {actionErr && <p className="text-sm text-red-600">{actionErr}</p>}

      {/* Novo formulário */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Novo formulário</h2>
              <button onClick={() => setShowNew(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">Nome do formulário</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus placeholder="Ex.: Qualificação Farmácias"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-slate-500 mt-1">O link é criado a partir do nome; dá para mudar depois.</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 mb-2">Comece por um modelo</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {TEMPLATES.map(t => (
                    <button key={t.key} onClick={() => setTemplate(t.key)}
                      className={`text-left p-3 rounded-xl border-2 transition-colors ${template === t.key ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">
                {creating ? 'Criando…' : 'Criar e editar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir formulário?</h3>
            <p className="text-sm text-slate-500 mb-6">O link para de funcionar na hora. Os leads que já chegaram continuam na aba Leads.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={async () => { const e = await remove(deleteId); setDeleteId(null); if (e) setActionErr(e); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
