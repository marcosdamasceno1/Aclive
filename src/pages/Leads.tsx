import { useState, useMemo } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLeadsStore } from '../store/leadsStore';
import { useClientsStore } from '../store/clientsStore';
import type { Lead, LeadStatus } from '../types';
import {
  Plus, Search, Trash2, X, ExternalLink, Phone, MapPin,
  Star, Globe, Target, Loader2, CheckSquare, Square, Key,
  Building2, ArrowRight,
} from 'lucide-react';

// ─── Pipeline config ───────────────────────────────────────────────────────────

const PIPELINE: {
  status: LeadStatus;
  label: string;
  headerBorder: string;
  headerText: string;
  dot: string;
  badge: string;
}[] = [
  {
    status: 'new',
    label: 'Novo',
    headerBorder: 'border-blue-500/50',
    headerText: 'text-blue-400',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    status: 'contacted',
    label: 'Contatado',
    headerBorder: 'border-yellow-500/50',
    headerText: 'text-yellow-400',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  {
    status: 'proposal',
    label: 'Proposta',
    headerBorder: 'border-orange-500/50',
    headerText: 'text-orange-400',
    dot: 'bg-orange-400',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
  {
    status: 'client',
    label: 'Fechado',
    headerBorder: 'border-green-500/50',
    headerText: 'text-green-400',
    dot: 'bg-green-400',
    badge: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  {
    status: 'lost',
    label: 'Perdido',
    headerBorder: 'border-slate-600',
    headerText: 'text-slate-400',
    dot: 'bg-slate-500',
    badge: 'bg-slate-500/10 text-slate-400 border-slate-600',
  },
];

const getStage = (s: LeadStatus) => PIPELINE.find(p => p.status === s) || PIPELINE[0];

// ─── Apify ─────────────────────────────────────────────────────────────────────

const APIFY_ACTOR = 'compass~crawler-google-places';
const LS_KEY = 'apify_token';

interface ApifyItem {
  title?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  totalScore?: number;
  reviewsCount?: number;
  categoryName?: string;
}

// ─── Draggable card ────────────────────────────────────────────────────────────

const DraggableLeadCard = ({
  lead,
  onOpen,
  onDelete,
}: {
  lead: Lead;
  onOpen: (l: Lead) => void;
  onDelete: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[#0d1117] border border-white/[0.07] rounded-xl p-3 cursor-grab active:cursor-grabbing select-none group hover:border-white/20 transition-colors"
    >
      {/* drag handle area */}
      <div {...attributes} {...listeners} className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100 leading-tight">{lead.name}</p>
          {lead.source === 'apify' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex-shrink-0 font-medium">
              Maps
            </span>
          )}
        </div>
        {lead.category && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{lead.category}</p>
        )}
      </div>

      <div className="space-y-1 mb-3">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
        {lead.city && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{lead.city}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 text-xs text-blue-400">
            <Globe className="w-3 h-3 flex-shrink-0" />
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="truncate hover:underline"
            >
              {lead.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {lead.rating != null && (
          <div className="flex items-center gap-1 text-xs text-yellow-400">
            <Star className="w-3 h-3 fill-yellow-400" />
            <span className="font-semibold">{lead.rating.toFixed(1)}</span>
            {lead.reviewCount && (
              <span className="text-slate-500">({lead.reviewCount})</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 pt-2 border-t border-white/[0.05]">
        <button
          onClick={e => { e.stopPropagation(); onOpen(lead); }}
          className="flex-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] py-1 rounded-lg transition-colors font-medium"
        >
          Ver detalhes
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(lead.id); }}
          className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// Snapshot card used in DragOverlay
const LeadCardSnapshot = ({ lead }: { lead: Lead }) => (
  <div className="bg-[#0d1117] border border-blue-500/40 rounded-xl p-3 shadow-2xl w-64 rotate-2 opacity-90">
    <p className="text-sm font-semibold text-slate-100">{lead.name}</p>
    {lead.category && <p className="text-xs text-slate-500 mt-0.5">{lead.category}</p>}
    {lead.city && (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
        <MapPin className="w-3 h-3" />{lead.city}
      </div>
    )}
  </div>
);

// ─── Column ─────────────────────────────────────────────────────────────────────

const LeadColumn = ({
  stage,
  leads,
  onOpen,
  onDelete,
}: {
  stage: typeof PIPELINE[number];
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onDelete: (id: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.status });

  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 mb-3 rounded-xl border-l-2 bg-[#161b22] ${stage.headerBorder}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${stage.headerText}`}>
            {stage.label}
          </span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-[#0d1117] px-2 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-32 rounded-xl transition-colors p-1.5 space-y-2 ${
          isOver ? 'bg-blue-500/[0.06] ring-1 ring-blue-500/30' : 'bg-transparent'
        }`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <DraggableLeadCard
              key={lead.id}
              lead={lead}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="h-20 flex items-center justify-center border border-dashed border-white/[0.06] rounded-xl">
            <p className="text-xs text-slate-600">Solte aqui</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

const emptyForm = { name: '', phone: '', website: '', city: '', category: '', notes: '' };

export const Leads = () => {
  const { leads, addLead, updateLead, updateStatus, deleteLead, importLeads } = useLeadsStore();
  const { addClient } = useClientsStore();

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Modals
  const [showApify, setShowApify]   = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [showDetail, setShowDetail] = useState<Lead | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  // Apify state
  const [apifyToken, setApifyToken]   = useState(() => localStorage.getItem(LS_KEY) || '');
  const [showToken, setShowToken]     = useState(!localStorage.getItem(LS_KEY));
  const [segment, setSegment]         = useState('');
  const [city, setCity]               = useState('');
  const [maxResults, setMaxResults]   = useState(25);
  const [apifyStatus, setApifyStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [apifyMsg, setApifyMsg]       = useState('');
  const [results, setResults]         = useState<ApifyItem[]>([]);
  const [selected, setSelected]       = useState<Set<number>>(new Set());

  // Manual form
  const [form, setForm] = useState(emptyForm);

  // Detail edit
  const [detailNotes, setDetailNotes]   = useState('');
  const [detailStatus, setDetailStatus] = useState<LeadStatus>('new');

  // dnd sensors — need 5px movement to start drag (avoids blocking clicks)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredBySearch = useMemo(() => {
    if (!search) return leads;
    const s = search.toLowerCase();
    return leads.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.city?.toLowerCase().includes(s) ||
      l.category?.toLowerCase().includes(s)
    );
  }, [leads, search]);

  const byColumn = useMemo(() =>
    PIPELINE.reduce((acc, p) => {
      acc[p.status] = filteredBySearch.filter(l => l.status === p.status);
      return acc;
    }, {} as Record<LeadStatus, Lead[]>),
  [filteredBySearch]);

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;

  // ─── DnD handlers ──────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const lead = leads.find(l => l.id === active.id);
    if (!lead) return;

    // `over.id` is either a column status or another lead id
    const targetStatus = PIPELINE.find(p => p.status === over.id)?.status
      ?? leads.find(l => l.id === over.id)?.status;

    if (targetStatus && targetStatus !== lead.status) {
      updateStatus(lead.id, targetStatus);
    }
  };

  // ─── Apify ─────────────────────────────────────────────────────────────────

  const saveToken = () => { localStorage.setItem(LS_KEY, apifyToken); setShowToken(false); };

  const runApify = async () => {
    if (!apifyToken || !segment || !city) return;
    setApifyStatus('running');
    setApifyMsg('Iniciando busca no Google Maps…');
    setResults([]);
    setSelected(new Set());

    const authHeader = { Authorization: `Bearer ${apifyToken}` };
    try {
      const runRes = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          searchStringsArray: [`${segment} em ${city}`],
          maxCrawledPlacesPerSearch: maxResults,
          language: 'pt-BR',
          maxImages: 0,
          scrapeDirectories: false,
        }),
      });
      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Erro ao iniciar: ${runRes.status}`);
      }
      const runData = await runRes.json();
      const runId: string = runData.data.id;
      const datasetId: string = runData.data.defaultDatasetId;

      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
        setApifyMsg(`Coletando dados… (${attempts * 3}s)`);
        const st = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: authHeader });
        const stData = await st.json();
        const runStatus: string = stData.data.status;
        if (runStatus === 'SUCCEEDED') {
          const itemsRes = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?limit=${maxResults}&fields=title,phone,website,address,city,totalScore,reviewsCount,categoryName`,
            { headers: authHeader }
          );
          const items: ApifyItem[] = await itemsRes.json();
          const valid = items.filter(i => i.title);
          setResults(valid);
          setApifyStatus('done');
          setApifyMsg(`${valid.length} empresas encontradas`);
          return;
        }
        if (runStatus === 'FAILED' || runStatus === 'ABORTED') throw new Error('A busca falhou no Apify.');
      }
      throw new Error('Tempo esgotado. Tente novamente.');
    } catch (err: unknown) {
      setApifyStatus('error');
      setApifyMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };

  const toggleSelect = (i: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const toggleAll = () =>
    setSelected(prev => prev.size === results.length ? new Set() : new Set(results.map((_, i) => i)));

  const handleImport = () => {
    importLeads(
      results.filter((_, i) => selected.has(i)).map(item => ({
        name: item.title || '',
        phone: item.phone,
        website: item.website,
        address: item.address,
        city: item.city,
        rating: item.totalScore,
        reviewCount: item.reviewsCount,
        category: item.categoryName,
        status: 'new' as LeadStatus,
        source: 'apify' as const,
      }))
    );
    setShowApify(false); setResults([]); setSelected(new Set()); setApifyStatus('idle');
  };

  // ─── Manual add ──────────────────────────────────────────────────────────────

  const handleAddManual = () => {
    if (!form.name.trim()) return;
    addLead({
      name: form.name.trim(),
      phone: form.phone || undefined,
      website: form.website || undefined,
      city: form.city || undefined,
      category: form.category || undefined,
      notes: form.notes || undefined,
      status: 'new',
      source: 'manual',
    });
    setForm(emptyForm);
    setShowAdd(false);
  };

  // ─── Detail ──────────────────────────────────────────────────────────────────

  const openDetail = (lead: Lead) => {
    setShowDetail(lead);
    setDetailNotes(lead.notes || '');
    setDetailStatus(lead.status);
  };

  const saveDetail = () => {
    if (!showDetail) return;
    updateLead(showDetail.id, { notes: detailNotes, status: detailStatus });
    setShowDetail(null);
  };

  const convertToClient = (lead: Lead) => {
    addClient({
      companyName: lead.name,
      contactName: '',
      phone: lead.phone || '',
      email: '',
      plan: '',
      notes: lead.notes || `Lead importado via ${lead.source === 'apify' ? 'Apify/Google Maps' : 'manual'}`,
      status: 'prospect',
    });
    updateLead(lead.id, { status: 'client' });
    setShowDetail(null);
  };

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Leads</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{leads.length} lead(s) no funil</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowApify(true); setApifyStatus('idle'); setResults([]); setSelected(new Set()); }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Target className="w-4 h-4" />
            Buscar no Google
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Lead
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Filtrar por nome, cidade ou segmento…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-white/[0.08] rounded-xl text-sm bg-[#21262d] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-h-96" style={{ minWidth: `${PIPELINE.length * 272}px` }}>
            {PIPELINE.map(stage => (
              <LeadColumn
                key={stage.status}
                stage={stage}
                leads={byColumn[stage.status] || []}
                onOpen={openDetail}
                onDelete={id => setDeleteId(id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead ? <LeadCardSnapshot lead={activeLead} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── Apify Modal ──────────────────────────────────────────────────────────── */}
      {showApify && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-slate-100">Buscar Leads no Google Maps</h2>
              </div>
              <button onClick={() => setShowApify(false)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* API Key */}
              <div className="bg-[#161b22] rounded-xl p-4 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-slate-200">Apify API Token</span>
                  </div>
                  {!showToken && (
                    <button onClick={() => setShowToken(true)} className="text-xs text-blue-400 hover:underline">Alterar token</button>
                  )}
                </div>
                {showToken ? (
                  <div className="flex gap-2">
                    <input type="password" value={apifyToken} onChange={e => setApifyToken(e.target.value)}
                      placeholder="apify_api_xxxxxxxxxxxx"
                      className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={saveToken} disabled={!apifyToken}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                      Salvar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Token salvo. Acesse{' '}
                    <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
                      console.apify.com <ExternalLink className="w-3 h-3" />
                    </a>{' '}para obter o seu.
                  </p>
                )}
              </div>

              {/* Search fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Segmento / Tipo de empresa</label>
                  <input type="text" value={segment} onChange={e => setSegment(e.target.value)}
                    placeholder="ex: agência de marketing digital"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Cidade / Estado</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    placeholder="ex: São Paulo, SP"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Quantidade de empresas
                    <span className="text-slate-500 font-normal ml-1">(máx. 100)</span>
                  </label>
                  <input type="number" min={1} max={100} value={maxResults}
                    onChange={e => setMaxResults(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <button onClick={runApify} disabled={!apifyToken || !segment || !city || apifyStatus === 'running'}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
                {apifyStatus === 'running'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{apifyMsg}</>
                  : <><Target className="w-4 h-4" />Buscar no Google Maps</>
                }
              </button>

              {apifyStatus === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{apifyMsg}</div>
              )}

              {apifyStatus === 'done' && results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-200">{apifyMsg}</p>
                    <button onClick={toggleAll} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      {selected.size === results.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      {selected.size === results.length ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {results.map((item, i) => (
                      <div key={i} onClick={() => toggleSelect(i)}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selected.has(i) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/[0.06] hover:border-white/20 bg-[#161b22]'
                        }`}>
                        <div className="mt-0.5 flex-shrink-0">
                          {selected.has(i) ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {item.categoryName && <span className="text-xs text-slate-500">{item.categoryName}</span>}
                            {item.city && <span className="text-xs text-slate-500 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{item.city}</span>}
                            {item.phone && <span className="text-xs text-slate-500 flex items-center gap-0.5"><Phone className="w-3 h-3" />{item.phone}</span>}
                            {item.totalScore != null && <span className="text-xs text-yellow-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{item.totalScore.toFixed(1)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {apifyStatus === 'done' && selected.size > 0 && (
              <div className="px-6 py-4 border-t border-white/[0.05] flex items-center justify-between">
                <p className="text-sm text-slate-400">{selected.size} empresa(s) selecionada(s)</p>
                <button onClick={handleImport}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold">
                  Importar para Leads <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Manual ───────────────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100">Novo Lead Manual</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Nome da empresa *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: XYZ Marketing" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Telefone</label>
                  <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="(11) 9999-9999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Cidade</label>
                  <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="São Paulo" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Website</label>
                <input type="text" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://empresa.com.br" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Segmento</label>
                <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: E-commerce, Clínica..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Observações iniciais..." />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowAdd(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={handleAddManual} disabled={!form.name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">
                Adicionar Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────────── */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100 truncate flex-1 mr-4">{showDetail.name}</h2>
              <button onClick={() => setShowDetail(null)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06] flex-shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {showDetail.phone && (
                  <div className="flex items-center gap-2 text-slate-400"><Phone className="w-3.5 h-3.5 flex-shrink-0" />{showDetail.phone}</div>
                )}
                {showDetail.city && (
                  <div className="flex items-center gap-2 text-slate-400"><MapPin className="w-3.5 h-3.5 flex-shrink-0" />{showDetail.city}</div>
                )}
                {showDetail.website && (
                  <div className="flex items-center gap-2 col-span-2">
                    <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <a href={showDetail.website.startsWith('http') ? showDetail.website : `https://${showDetail.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-xs flex items-center gap-1">
                      {showDetail.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {showDetail.rating != null && (
                  <div className="flex items-center gap-1.5 text-yellow-400">
                    <Star className="w-3.5 h-3.5 fill-yellow-400" />
                    <span className="font-semibold">{showDetail.rating.toFixed(1)}</span>
                    {showDetail.reviewCount && <span className="text-slate-500 text-xs">({showDetail.reviewCount} avaliações)</span>}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Status no Funil</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PIPELINE.map(p => (
                    <button key={p.status} onClick={() => setDetailStatus(p.status)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        detailStatus === p.status ? p.badge : 'border-white/[0.06] text-slate-500 hover:border-white/20'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Notas</label>
                <textarea value={detailNotes} onChange={e => setDetailNotes(e.target.value)} rows={4}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Observações, histórico de contato..." />
              </div>

              {showDetail.status !== 'client' && (
                <button onClick={() => convertToClient(showDetail)}
                  className="w-full flex items-center justify-center gap-2 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  <Building2 className="w-4 h-4" />
                  Converter em Cliente
                </button>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowDetail(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={saveDetail} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Excluir lead?</h3>
            <p className="text-slate-500 text-sm mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={() => { deleteLead(deleteId); setDeleteId(null); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
