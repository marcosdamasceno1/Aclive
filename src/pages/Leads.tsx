import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { apifyQuota, apifyStart, apifyPoll, type Quota } from '../lib/apifySearch';
import type { Lead, LeadStatus } from '../types';

// Limpeza: remove o token pessoal da Apify de versões anteriores (agora é
// chave-mestra no backend — o usuário não cadastra mais token).
try { localStorage.removeItem('apify_token'); } catch { /* SSR/test */ }
import {
  Plus, Search, Trash2, X, ExternalLink, Phone, MapPin,
  Star, Globe, Target, Loader2, CheckSquare, Square, Key,
  Building2, ArrowRight, AlertTriangle, Mail, RefreshCw, CheckCircle,
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
          {lead.source === 'meta' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 flex-shrink-0 font-medium">
              Meta
            </span>
          )}
          {lead.source === 'website' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 flex-shrink-0 font-medium">
              Site
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
const LS_META_IDS = 'meta_imported_ids';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export const Leads = () => {
  const { leads, addLead, updateLead, updateStatus, deleteLead, importLeads, dbError } = useLeadsStore();
  const { addClient } = useClientsStore();
  const { metaLeadsPageId, metaLeadsPageToken } = useCompanySettingsStore();

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Modals
  const [showApify, setShowApify]   = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [showDetail, setShowDetail] = useState<Lead | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  // Apify state (chave-mestra no backend — sem token do usuário)
  const [segment, setSegment]         = useState('');
  const [city, setCity]               = useState('');
  const [filterNoWebsite, setFilterNoWebsite] = useState(false);
  const [apifyStatus, setApifyStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [apifyMsg, setApifyMsg]       = useState('');
  const [results, setResults]         = useState<ApifyItem[]>([]);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [quota, setQuota]             = useState<Quota | null>(null);

  // Carrega a cota do mês ao abrir o modal de busca
  useEffect(() => {
    if (!showApify) return;
    apifyQuota().then(q => { if (!('error' in q)) setQuota(q); });
  }, [showApify]);

  const quotaReached = !!quota && quota.used >= quota.limit;

  // Manual form
  const [form, setForm] = useState(emptyForm);

  // Detail edit
  const [detailNotes, setDetailNotes]   = useState('');
  const [detailStatus, setDetailStatus] = useState<LeadStatus>('new');

  // Meta sync
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [syncMsg, setSyncMsg]       = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // forces re-render every minute for "X min atrás"

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

  // Results with original index preserved so selection works even when filtered
  const displayedResults = useMemo(() => {
    const indexed = results.map((item, i) => ({ item, idx: i }));
    return filterNoWebsite ? indexed.filter(({ item }) => !item.website) : indexed;
  }, [results, filterNoWebsite]);

  const noWebsiteCount = useMemo(() => results.filter(i => !i.website).length, [results]);

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

  const runApify = async () => {
    if (!segment || !city || quotaReached) return;
    setApifyStatus('running');
    setApifyMsg('Iniciando busca no Google Maps…');
    setResults([]);
    setSelected(new Set());

    const start = await apifyStart(segment, city);
    if (start.error) {
      setApifyStatus('error');
      setApifyMsg(start.error);
      if (typeof start.used === 'number' && typeof start.limit === 'number') {
        setQuota({ used: start.used, limit: start.limit });
      }
      return;
    }
    if (typeof start.used === 'number' && typeof start.limit === 'number') {
      setQuota({ used: start.used, limit: start.limit }); // já consumiu 1
    }

    const runId = start.runId!;
    const datasetId = start.datasetId!;
    const usageId = start.usageId ?? null;

    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
      setApifyMsg(`Coletando dados… (${attempts * 3}s)`);
      const p = await apifyPoll(runId, datasetId, usageId);
      if (p.error) { setApifyStatus('error'); setApifyMsg(p.error); return; }
      if (p.status === 'SUCCEEDED') {
        const valid = (p.items || []) as ApifyItem[];
        setResults(valid);
        setApifyStatus('done');
        setApifyMsg(`${valid.length} empresas encontradas`);
        return;
      }
      if (p.status === 'FAILED') { setApifyStatus('error'); setApifyMsg(p.message || 'A busca falhou.'); return; }
    }
    setApifyStatus('error');
    setApifyMsg('Tempo esgotado. Tente novamente.');
  };

  const toggleSelect = (i: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const toggleAll = () =>
    setSelected(prev => {
      const visibleIdxs = displayedResults.map(({ idx }) => idx);
      const allVisible = visibleIdxs.every(i => prev.has(i));
      const n = new Set(prev);
      if (allVisible) visibleIdxs.forEach(i => n.delete(i));
      else visibleIdxs.forEach(i => n.add(i));
      return n;
    });

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

  const handleAddManual = async () => {
    if (!form.name.trim()) return;
    await addLead({
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

  // ─── Meta sync ───────────────────────────────────────────────────────────────

  const syncMeta = useCallback(async () => {
    if (!metaLeadsPageId || !metaLeadsPageToken) return;
    const importedIds = new Set<string>(JSON.parse(localStorage.getItem(LS_META_IDS) || '[]'));

    setSyncStatus('running');
    setSyncMsg('Buscando formulários...');

    try {
      const formsRes = await fetch(
        `https://graph.facebook.com/v19.0/${metaLeadsPageId}/leadgen_forms?fields=id,name&access_token=${metaLeadsPageToken}&limit=50`
      );
      if (!formsRes.ok) throw new Error('Token inválido ou sem permissão. Verifique o Page Access Token nas Configurações.');
      const formsData = await formsRes.json();
      if (formsData.error) throw new Error(formsData.error.message);
      const forms: { id: string; name: string }[] = formsData.data || [];

      if (forms.length === 0) {
        setSyncStatus('done');
        setSyncMsg('Nenhum formulário encontrado.');
        setLastSyncAt(new Date());
        setTimeout(() => { setSyncStatus('idle'); setSyncMsg(''); }, 4000);
        return;
      }

      const newLeads: Omit<Lead, 'id' | 'createdAt'>[] = [];

      for (const form of forms) {
        setSyncMsg(`Buscando leads de "${form.name}"...`);
        const leadsRes = await fetch(
          `https://graph.facebook.com/v19.0/${form.id}/leads?fields=id,field_data,created_time&access_token=${metaLeadsPageToken}&limit=100`
        );
        if (!leadsRes.ok) continue;
        const leadsData = await leadsRes.json();
        if (leadsData.error) continue;

        for (const lead of (leadsData.data || [])) {
          if (importedIds.has(lead.id)) continue;

          const f: Record<string, string> = {};
          for (const fd of (lead.field_data || [])) {
            f[fd.name] = fd.values?.[0] ?? '';
          }

          const name =
            f['full_name'] || f['nome_completo'] || f['nome'] ||
            [f['first_name'] || f['primeiro_nome'], f['last_name'] || f['sobrenome']]
              .filter(Boolean).join(' ') || 'Lead Meta';

          newLeads.push({
            name: name.trim(),
            phone:  f['phone_number'] || f['telefone'] || f['celular'] || undefined,
            email:  f['email'] || f['e-mail'] || undefined,
            source: 'meta',
            status: 'new',
            notes:  `Formulário: ${form.name}`,
          });
          importedIds.add(lead.id);
        }
      }

      if (newLeads.length > 0) {
        importLeads(newLeads);
        localStorage.setItem(LS_META_IDS, JSON.stringify([...importedIds]));
        setSyncStatus('done');
        setSyncMsg(`${newLeads.length} lead(s) importado(s)!`);
      } else {
        setSyncStatus('done');
        setSyncMsg('Nenhum lead novo.');
      }
      setLastSyncAt(new Date());
    } catch (err) {
      setSyncStatus('error');
      setSyncMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    }

    setTimeout(() => { setSyncStatus('idle'); setSyncMsg(''); }, 5000);
  }, [metaLeadsPageId, metaLeadsPageToken, importLeads]);

  // Auto-sync every 5 minutes
  useEffect(() => {
    if (!metaLeadsPageId || !metaLeadsPageToken) return;
    const id = setInterval(syncMeta, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [syncMeta, metaLeadsPageId, metaLeadsPageToken]);

  // Re-render every minute to keep "X min atrás" fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Leads</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{leads.length} lead(s) no funil</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowApify(true); setApifyStatus('idle'); setResults([]); setSelected(new Set()); }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Target className="w-4 h-4" />
            Buscar no Google
          </button>

          {metaLeadsPageId && metaLeadsPageToken && (
            <div className="flex flex-col items-start gap-0.5">
              <button
                onClick={syncMeta}
                disabled={syncStatus === 'running'}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                  syncStatus === 'error'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : syncStatus === 'done'
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {syncStatus === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                {syncStatus === 'done'    && <CheckCircle className="w-4 h-4" />}
                {syncStatus === 'error'   && <AlertTriangle className="w-4 h-4" />}
                {syncStatus === 'idle'    && <RefreshCw className="w-4 h-4" />}
                {syncStatus === 'idle' ? 'Sincronizar Meta' : syncMsg}
              </button>
              <span className="text-[10px] text-slate-600 pl-1">
                {lastSyncAt
                  ? `sinc. ${Math.round((Date.now() - lastSyncAt.getTime()) / 60000) || '<1'} min atrás · auto 5min`
                  : 'auto-sync ativo · a cada 5min'}
              </span>
            </div>
          )}

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Lead
          </button>
        </div>
      </div>

      {/* DB error banner */}
      {dbError && (
        <div className="flex-shrink-0 flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Leads não estão sendo salvos no banco de dados.</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              Execute o SQL abaixo no Supabase para criar a tabela:{' '}
              <code className="font-mono">
                create table leads (id uuid primary key, name text not null, phone text, website text, address text, city text, rating numeric, review_count integer, category text, status text not null default 'new', notes text, source text not null default 'manual', created_at timestamptz not null default now(), converted_client_id text);
              </code>
            </p>
          </div>
        </div>
      )}

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
              {/* Cota mensal de buscas */}
              {(() => {
                const used = quota?.used ?? 0;
                const limit = quota?.limit ?? 100;
                const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                const near = pct >= 80;
                const barCls = quotaReached ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-emerald-500';
                const txtCls = quotaReached ? 'text-red-400' : near ? 'text-amber-400' : 'text-emerald-400';
                return (
                  <div className="bg-[#161b22] rounded-xl p-4 border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-200">Buscas deste mês</span>
                      <span className={`text-sm font-bold ${txtCls}`}>{used}/{limit}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full ${barCls} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {quotaReached
                        ? 'Limite atingido. Renova no início do próximo mês.'
                        : `Restam ${limit - used} buscas · renova todo mês. Cada busca traz até 20 empresas.`}
                    </p>
                  </div>
                );
              })()}

              {/* Search fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Segmento / Tipo de empresa</label>
                  <input type="text" value={segment} onChange={e => setSegment(e.target.value)}
                    placeholder="ex: agência de marketing digital"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Cidade / Estado</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    placeholder="ex: São Paulo, SP"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Advanced filter */}
              <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-white/[0.06] bg-[#161b22] hover:border-white/[0.12] transition-colors">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={filterNoWebsite}
                    onChange={e => setFilterNoWebsite(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-9 h-5 rounded-full transition-colors ${filterNoWebsite ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${filterNoWebsite ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">Apenas empresas <span className="text-emerald-400">sem site</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">Filtra os resultados para mostrar só quem não tem site — leads ideais para agência</p>
                </div>
              </label>

              <button onClick={runApify} disabled={!segment || !city || apifyStatus === 'running' || quotaReached}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
                {apifyStatus === 'running'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{apifyMsg}</>
                  : quotaReached
                  ? <><Target className="w-4 h-4" />Limite mensal atingido</>
                  : <><Target className="w-4 h-4" />Buscar no Google Maps</>
                }
              </button>

              {apifyStatus === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{apifyMsg}</div>
              )}

              {apifyStatus === 'done' && results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-200">{apifyMsg}</p>
                    <button onClick={toggleAll} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      {displayedResults.every(({ idx }) => selected.has(idx)) && displayedResults.length > 0
                        ? <><CheckSquare className="w-3.5 h-3.5" />Desmarcar todos</>
                        : <><Square className="w-3.5 h-3.5" />Selecionar todos</>
                      }
                    </button>
                  </div>

                  {/* Filter chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setFilterNoWebsite(false)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        !filterNoWebsite
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                          : 'border-white/[0.08] text-slate-500 hover:border-white/20'
                      }`}
                    >
                      Todos ({results.length})
                    </button>
                    <button
                      onClick={() => setFilterNoWebsite(true)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        filterNoWebsite
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-white/[0.08] text-slate-500 hover:border-white/20'
                      }`}
                    >
                      Sem site ({noWebsiteCount})
                    </button>
                    {filterNoWebsite && noWebsiteCount === 0 && (
                      <span className="text-xs text-slate-500 italic">Todos os resultados têm site cadastrado</span>
                    )}
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {displayedResults.map(({ item, idx }) => (
                      <div key={idx} onClick={() => toggleSelect(idx)}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selected.has(idx) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/[0.06] hover:border-white/20 bg-[#161b22]'
                        }`}>
                        <div className="mt-0.5 flex-shrink-0">
                          {selected.has(idx) ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                            {!item.website
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">Sem site</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500 border border-white/[0.06]">Tem site</span>
                            }
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {item.categoryName && <span className="text-xs text-slate-500">{item.categoryName}</span>}
                            {item.city && <span className="text-xs text-slate-500 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{item.city}</span>}
                            {item.phone && <span className="text-xs text-slate-500 flex items-center gap-0.5"><Phone className="w-3 h-3" />{item.phone}</span>}
                            {item.totalScore != null && <span className="text-xs text-yellow-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{item.totalScore.toFixed(1)}</span>}
                            {item.website && (
                              <span className="text-xs text-blue-400/60 flex items-center gap-0.5 truncate max-w-[140px]">
                                <Globe className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{item.website.replace(/^https?:\/\//, '')}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {displayedResults.length === 0 && (
                      <div className="text-center py-8 text-slate-500 text-sm">
                        Nenhum resultado sem site encontrado. Tente uma busca diferente.
                      </div>
                    )}
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
                {showDetail.email && (
                  <div className="flex items-center gap-2 text-slate-400"><Mail className="w-3.5 h-3.5 flex-shrink-0" />{showDetail.email}</div>
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
