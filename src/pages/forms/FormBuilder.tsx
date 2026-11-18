import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Copy, CheckCircle, ExternalLink, Smartphone, Save, Play, Pause, Loader2, Plus, Trash2, X, Eye, EyeOff, Info,
} from 'lucide-react';
import { useFormsStore } from '../../store/formsStore';
import { useLeadBoardsStore } from '../../store/leadBoardsStore';
import { useAuthStore } from '../../store/authStore';
import { FormRunner } from '../../components/forms/FormRunner';
import { FONTS, uid, type Ending, type FormConfig } from '../../lib/forms/schema';
import { QuestionsTab, TagPicker, inp, lbl } from './QuestionsTab';
import { FormResults } from './FormResults';
import { formUrl } from '../../lib/forms/url';

type Tab = 'questions' | 'visual' | 'endings' | 'tracking' | 'destination' | 'results';
const TABS: { key: Tab; label: string }[] = [
  { key: 'questions', label: 'Perguntas' },
  { key: 'visual', label: 'Visual' },
  { key: 'endings', label: 'Telas de obrigado' },
  { key: 'tracking', label: 'Rastreamento' },
  { key: 'destination', label: 'Tags e destino' },
  { key: 'results', label: 'Resultados' },
];

const Phone = ({ config, target }: { config: FormConfig; target?: number | string }) => (
  <div className="mx-auto w-[300px] h-[600px] rounded-[2.4rem] border-[10px] border-slate-900 bg-slate-900 shadow-xl overflow-hidden">
    <div className="w-full h-full rounded-[1.7rem] overflow-y-auto bg-white">
      <FormRunner config={config} mode="preview" previewTarget={target} embedded />
    </div>
  </div>
);

export const FormBuilder = ({ formId, onBack }: { formId: string; onBack: () => void }) => {
  const { forms, companySlug, loaded, saveForm, setStatus, setCapiSecret } = useFormsStore();
  const { boards, tags, boardStages } = useLeadBoardsStore();
  const role = useAuthStore(s => s.currentUser?.role);
  const canEdit = role === 'admin' || role === 'manager';
  const form = forms.find(f => f.id === formId);

  const [tab, setTab] = useState<Tab>('questions');
  const [config, setConfig] = useState<FormConfig | null>(form?.config ?? null);
  const [name, setName] = useState(form?.name ?? '');
  const [slug, setSlug] = useState(form?.slug ?? '');
  const [pixelId, setPixelId] = useState(form?.pixelId ?? '');
  const [boardId, setBoardId] = useState<string | null>(form?.boardId ?? null);
  const [stageId, setStageId] = useState<string | null>(form?.stageId ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [capiToken, setCapiToken] = useState('');
  const [capiTest, setCapiTest] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [endingSel, setEndingSel] = useState<string | null>(null);

  // Carrega quando o formulário chega do banco (abrir direto pela URL)
  useEffect(() => {
    if (form && !config) {
      setConfig(form.config); setName(form.name); setSlug(form.slug); setPixelId(form.pixelId ?? '');
      setBoardId(form.boardId); setStageId(form.stageId);
    }
  }, [form, config]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const change = (c: FormConfig) => { setConfig(c); setDirty(true); };
  const stages = useMemo(() => (boardId ? boardStages(boardId) : []), [boardId, boardStages]);

  const previewTarget = useMemo(() => {
    if (tab === 'endings' && endingSel) return `end:${endingSel}`;
    if (selected === 'welcome') return -1;
    const i = config?.questions.findIndex(q => q.id === selected) ?? -1;
    return i >= 0 ? i : -1;
  }, [selected, config, tab, endingSel]);

  if (!loaded) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (!form || !config) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-700 font-semibold">Formulário não encontrado.</p>
        <button onClick={onBack} className="mt-3 text-blue-600 text-sm">Voltar para a lista</button>
      </div>
    );
  }

  const url = formUrl(companySlug, form.slug);

  const save = async (): Promise<boolean> => {
    setSaving(true); setMsg(null);
    const e = await saveForm(form.id, { name, slug, config, pixelId, boardId, stageId });
    setSaving(false);
    if (e) { setMsg({ ok: false, text: e }); return false; }
    setDirty(false); setMsg({ ok: true, text: 'Salvo' });
    setTimeout(() => setMsg(null), 2000);
    return true;
  };

  const publish = async () => {
    if (config.questions.length === 0) { setMsg({ ok: false, text: 'Adicione pelo menos uma pergunta.' }); return; }
    if (!companySlug) { setMsg({ ok: false, text: 'Defina o apelido da agência na lista de formulários antes de publicar.' }); return; }
    if (dirty && !(await save())) return;
    const e = await setStatus(form.id, form.status === 'published' ? 'paused' : 'published');
    if (e) setMsg({ ok: false, text: e });
  };

  const saveCapi = async () => {
    setMsg(null);
    const e = await setCapiSecret(form.id, capiToken, capiTest);
    if (e) { setMsg({ ok: false, text: e.replace(/^.*?:\s*/, '') }); return; }
    setCapiToken(''); setMsg({ ok: true, text: 'Token salvo com segurança' });
    setTimeout(() => setMsg(null), 2500);
  };

  const setTheme = (patch: Partial<FormConfig['theme']>) => change({ ...config, theme: { ...config.theme, ...patch } });
  const setEnding = (id: string, patch: Partial<Ending>) => change({ ...config, endings: config.endings.map(e => e.id === id ? { ...e, ...patch } : e) });
  const setDest = (patch: Partial<FormConfig['destination']>) => change({ ...config, destination: { ...config.destination, ...patch } });
  const showSidePreview = tab !== 'questions' && tab !== 'results';

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { if (!dirty || confirm('Sair sem salvar as alterações?')) onBack(); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowLeft className="w-4 h-4" /></button>
          <input value={name} onChange={e => { setName(e.target.value); setDirty(true); }} disabled={!canEdit}
            className="flex-1 min-w-[160px] text-lg font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none px-1" />
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${form.status === 'published' ? 'bg-emerald-50 text-emerald-700' : form.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            {form.status === 'published' ? 'Publicado' : form.status === 'paused' ? 'Pausado' : 'Rascunho'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
            <button onClick={() => setPreviewOpen(true)} className={`${tab === 'questions' ? '2xl:hidden' : 'xl:hidden'} flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700`}><Smartphone className="w-4 h-4" /><span className="hidden sm:inline">Ver no celular</span><span className="sm:hidden">Prévia</span></button>
            {canEdit && (
              <>
                <button onClick={() => void save()} disabled={!dirty || saving} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Salvar
                </button>
                <button onClick={() => void publish()} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white ${form.status === 'published' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {form.status === 'published' ? <><Pause className="w-4 h-4" />Pausar</> : <><Play className="w-4 h-4" />Publicar</>}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Link:</span>
          <span className="font-mono text-xs text-slate-500">growthexpert.com.br/f/{companySlug ?? '<apelido>'}/</span>
          <input value={slug} onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setDirty(true); }} disabled={!canEdit}
            className="font-mono text-xs border border-slate-200 rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {url && form.slug === slug && (
            <>
              <button onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><ExternalLink className="w-4 h-4" /></a>
            </>
          )}
          {form.status !== 'published' && <span className="text-xs text-amber-700">O link só funciona depois de publicar.</span>}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto bg-slate-100 rounded-xl p-1 w-full sm:w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={`grid gap-5 ${tab === 'questions' ? '2xl:grid-cols-[minmax(0,1fr)_320px]' : showSidePreview ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="min-w-0">
          {!canEdit && tab !== 'results' && (
            <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Somente administradores e gestores editam formulários.</p>
          )}

          {tab === 'questions' && (
            <div className={canEdit ? '' : 'pointer-events-none opacity-70'}>
              <QuestionsTab config={config} onChange={change} tags={tags} selected={selected} onSelect={setSelected} />
            </div>
          )}

          {tab === 'visual' && (
            <div className={`bg-white border border-slate-200 rounded-xl p-5 space-y-4 ${canEdit ? '' : 'pointer-events-none opacity-70'}`}>
              <div className="grid sm:grid-cols-3 gap-4">
                {([['primary', 'Cor principal'], ['background', 'Cor de fundo'], ['text', 'Cor do texto']] as const).map(([k, l]) => (
                  <div key={k}>
                    <label className={lbl}>{l}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={config.theme[k]} onChange={e => setTheme({ [k]: e.target.value })} className="w-10 h-10 rounded border border-slate-200 p-0.5 bg-white" />
                      <input value={config.theme[k]} onChange={e => setTheme({ [k]: e.target.value })} className={`${inp} font-mono`} maxLength={9} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className={lbl}>Logo (link https)</label><input value={config.theme.logoUrl ?? ''} onChange={e => setTheme({ logoUrl: e.target.value })} className={inp} placeholder="https://…/logo.png" /></div>
                <div><label className={lbl}>Imagem de fundo (opcional)</label><input value={config.theme.backgroundImage ?? ''} onChange={e => setTheme({ backgroundImage: e.target.value })} className={inp} placeholder="https://…" /></div>
                <div>
                  <label className={lbl}>Fonte</label>
                  <select value={config.theme.font} onChange={e => setTheme({ font: e.target.value as FormConfig['theme']['font'] })} className={inp}>
                    {FONTS.map(f => <option key={f} value={f}>{f === 'system' ? 'Padrão do aparelho' : f}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Texto do botão</label><input value={config.theme.buttonText} onChange={e => setTheme({ buttonText: e.target.value })} className={inp} maxLength={30} /></div>
              </div>
              <div>
                <label className={lbl}>Aviso de privacidade (LGPD), mostrado na última pergunta</label>
                <textarea value={config.privacyText ?? ''} onChange={e => change({ ...config, privacyText: e.target.value })} rows={2} className={`${inp} resize-none`} />
              </div>
            </div>
          )}

          {tab === 'endings' && (
            <div className={`space-y-3 ${canEdit ? '' : 'pointer-events-none opacity-70'}`}>
              <p className="text-sm text-slate-500">Crie quantas telas quiser. A tela de <b>qualificados</b> aparece para quem conclui; a de <b>desqualificados</b> é o padrão das opções que desqualificam (cada opção pode escolher outra).</p>
              {config.endings.map(e => (
                <div key={e.id} onClick={() => setEndingSel(e.id)} className={`bg-white border-2 rounded-xl p-4 space-y-3 ${endingSel === e.id ? 'border-blue-500' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <select value={e.kind} onChange={ev => setEnding(e.id, { kind: ev.target.value as Ending['kind'] })} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="qualified">Para quem conclui (qualificado)</option>
                      <option value="disqualified">Para desqualificados</option>
                    </select>
                    <button onClick={() => change({ ...config, endings: config.endings.filter(x => x.id !== e.id) })} disabled={config.endings.length <= 1}
                      className="ml-auto p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div><label className={lbl}>Título</label><input value={e.title} onChange={ev => setEnding(e.id, { title: ev.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Texto</label><textarea value={e.text ?? ''} onChange={ev => setEnding(e.id, { text: ev.target.value })} rows={2} className={`${inp} resize-none`} /></div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className={lbl}>Imagem (link https)</label><input value={e.imageUrl ?? ''} onChange={ev => setEnding(e.id, { imageUrl: ev.target.value })} className={inp} /></div>
                    <div><label className={lbl}>Texto do botão</label><input value={e.buttonText ?? ''} onChange={ev => setEnding(e.id, { buttonText: ev.target.value })} className={inp} placeholder="Ex.: Conheça nosso site" /></div>
                    <div><label className={lbl}>Link do botão (https)</label><input value={e.buttonUrl ?? ''} onChange={ev => setEnding(e.id, { buttonUrl: ev.target.value })} className={inp} placeholder="https://…" /></div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 pt-5">
                      <input type="checkbox" checked={!!e.autoRedirect} onChange={ev => setEnding(e.id, { autoRedirect: ev.target.checked })} className="accent-blue-600" />
                      Redirecionar sozinho para o link em 3s
                    </label>
                    <div><label className={lbl}>WhatsApp (botão "Falar no WhatsApp")</label><input value={e.whatsappNumber ?? ''} onChange={ev => setEnding(e.id, { whatsappNumber: ev.target.value })} className={inp} placeholder="55 11 99999-9999" /></div>
                    <div><label className={lbl}>Mensagem pronta</label><input value={e.whatsappMessage ?? ''} onChange={ev => setEnding(e.id, { whatsappMessage: ev.target.value })} className={inp} placeholder="Olá! Acabei de preencher o formulário." /></div>
                  </div>
                </div>
              ))}
              <button onClick={() => { const id = uid(); change({ ...config, endings: [...config.endings, { id, kind: 'disqualified', title: 'Obrigado!' }] }); setEndingSel(id); }}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 border border-dashed border-blue-300 rounded-xl py-3 hover:bg-blue-50">
                <Plus className="w-4 h-4" />Nova tela de obrigado
              </button>
            </div>
          )}

          {tab === 'tracking' && (
            <div className={`bg-white border border-slate-200 rounded-xl p-5 space-y-5 ${canEdit ? '' : 'pointer-events-none opacity-70'}`}>
              <div className="flex items-start gap-2 text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p>Cada evento sai pelo navegador (Pixel) e pelo servidor (API de Conversões) com o mesmo ID, e a Meta conta uma vez só. Eventos: PageView, ViewContent, FormStart, FormStep e, no envio, {config.tracking.submitEvent} (qualificados) ou LeadDisqualified. UTMs, fbclid e gclid ficam gravados em cada lead.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>ID do Pixel</label>
                  <input value={pixelId} onChange={e => { setPixelId(e.target.value.replace(/\D/g, '')); setDirty(true); }} className={`${inp} font-mono`} placeholder="Ex.: 123456789012345" maxLength={20} />
                  <p className="text-xs text-slate-500 mt-1">Gerenciador de Eventos da Meta → seu Pixel → ID.</p>
                </div>
                <div>
                  <label className={lbl}>Evento no envio</label>
                  <select value={config.tracking.submitEvent} onChange={e => change({ ...config, tracking: { submitEvent: e.target.value as FormConfig['tracking']['submitEvent'] } })} className={inp}>
                    <option value="Lead">Lead</option>
                    <option value="CompleteRegistration">CompleteRegistration</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">API de Conversões</p>
                  {form.capiConfigured
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Token configurado</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">Sem token</span>}
                </div>
                <p className="text-xs text-slate-500">Gerenciador de Eventos → Configurações → API de Conversões → Gerar token de acesso. O token fica guardado no servidor e não aparece mais aqui depois de salvo.</p>
                <div className="grid sm:grid-cols-[1fr_180px_auto] gap-2">
                  <div className="relative">
                    <input type={showToken ? 'text' : 'password'} value={capiToken} onChange={e => setCapiToken(e.target.value)} className={`${inp} pr-9`}
                      placeholder={form.capiConfigured ? 'Novo token (deixe vazio para remover)' : 'Token da API de Conversões'} autoComplete="off" />
                    <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">{showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  <input value={capiTest} onChange={e => setCapiTest(e.target.value)} className={inp} placeholder="Código de teste (opcional)" maxLength={40} />
                  <button onClick={() => void saveCapi()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Salvar token</button>
                </div>
                <p className="text-xs text-slate-500">Use o código de teste só enquanto confere os eventos em "Eventos de teste" na Meta; depois salve o token de novo sem ele.</p>
              </div>
              <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">Para os eventos contarem na otimização, o domínio <b>growthexpert.com.br</b> precisa estar verificado no Gerenciador de Negócios do cliente (ou ser liberado na lista de domínios permitidos do Pixel).</p>
            </div>
          )}

          {tab === 'destination' && (
            <div className={`bg-white border border-slate-200 rounded-xl p-5 space-y-5 ${canEdit ? '' : 'pointer-events-none opacity-70'}`}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Janela em Leads</label>
                  <select value={boardId ?? ''} onChange={e => { setBoardId(e.target.value || null); setStageId(null); setDirty(true); }} className={inp}>
                    <option value="">Padrão (janela que recebe "Formulários")</option>
                    {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Etapa dos qualificados</label>
                  <select value={stageId ?? ''} onChange={e => { setStageId(e.target.value || null); setDirty(true); }} disabled={!boardId} className={inp}>
                    <option value="">Primeira etapa</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">Desqualificados vão para a etapa do tipo "Perdido" da janela.</p>
                </div>
              </div>
              <div>
                <label className={lbl}>Tags de quem conclui</label>
                <TagPicker tags={tags} value={config.destination.qualifiedTagIds} onChange={v => setDest({ qualifiedTagIds: v })} />
              </div>
              <div>
                <label className={lbl}>Tags de quem é desqualificado</label>
                <TagPicker tags={tags} value={config.destination.disqualifiedTagIds} onChange={v => setDest({ disqualifiedTagIds: v })} />
                <p className="text-xs text-slate-500 mt-1">Somam com as tags de motivo definidas em cada opção.</p>
              </div>
              <div>
                <label className={lbl}>Avisar novo lead no WhatsApp (pelo Acta)</label>
                <input value={config.destination.notifyPhone ?? ''} onChange={e => setDest({ notifyPhone: e.target.value })} className={inp} placeholder="Ex.: 11 99999-9999 (deixe vazio para não avisar)" />
                <p className="text-xs text-slate-500 mt-1">Só para leads qualificados. Usa o Acta configurado em Configurações → Integrações.</p>
              </div>
            </div>
          )}

          {tab === 'results' && <FormResults form={form} />}
        </div>

        {/* Prévia lateral (telas grandes) */}
        {(tab === 'questions' || showSidePreview) && (
          <div className={tab === 'questions' ? 'hidden 2xl:block' : 'hidden xl:block'}>
            <div className="sticky top-4 space-y-2">
              <p className="text-xs text-center text-slate-500">Prévia no celular</p>
              <Phone config={config} target={previewTarget} />
            </div>
          </div>
        )}
      </div>

      {/* Prévia (telas pequenas) */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="max-h-full overflow-auto">
            <Phone config={config} target={previewTarget} />
          </div>
          <button onClick={() => setPreviewOpen(false)} className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-sm font-semibold"><X className="w-4 h-4" />Fechar</button>
        </div>
      )}
    </div>
  );
};
