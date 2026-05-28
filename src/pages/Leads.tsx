import { useState, useMemo, useEffect } from 'react';
import { useLeadsStore } from '../store/leadsStore';
import { useClientsStore } from '../store/clientsStore';
import type { Lead, LeadStatus } from '../types';
import {
  Plus, Search, Trash2, X, ExternalLink, Phone, MapPin,
  Star, Globe, Target, Loader2, CheckSquare, Square, Key,
  Building2, ArrowRight, ChevronDown,
} from 'lucide-react';

const PIPELINE: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: 'new',       label: 'Novo',              color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',    dot: 'bg-blue-400' },
  { status: 'contacted', label: 'Contatado',          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-400' },
  { status: 'proposal',  label: 'Proposta Enviada',   color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
  { status: 'client',    label: 'Fechado',            color: 'bg-green-500/10 text-green-400 border-green-500/20',  dot: 'bg-green-400' },
  { status: 'lost',      label: 'Perdido',            color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',  dot: 'bg-slate-500' },
];

const getStage = (s: LeadStatus) => PIPELINE.find(p => p.status === s) || PIPELINE[0];

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

const emptyForm = { name: '', phone: '', website: '', city: '', category: '', notes: '' };

export const Leads = () => {
  const { leads, addLead, updateLead, updateStatus, deleteLead, importLeads } = useLeadsStore();
  const { addClient } = useClientsStore();

  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [search, setSearch] = useState('');

  // Modals
  const [showApify, setShowApify]     = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [showDetail, setShowDetail]   = useState<Lead | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);

  // Apify state
  const [apifyToken, setApifyToken]   = useState(() => localStorage.getItem(LS_KEY) || '');
  const [showToken, setShowToken]     = useState(!localStorage.getItem(LS_KEY));
  const [segment, setSegment]         = useState('');
  const [city, setCity]               = useState('');
  const [apifyStatus, setApifyStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [apifyMsg, setApifyMsg]       = useState('');
  const [results, setResults]         = useState<ApifyItem[]>([]);
  const [selected, setSelected]       = useState<Set<number>>(new Set());

  // Manual form
  const [form, setForm] = useState(emptyForm);

  // Detail edit
  const [detailNotes, setDetailNotes] = useState('');
  const [detailStatus, setDetailStatus] = useState<LeadStatus>('new');

  const filtered = useMemo(() => {
    let list = leads;
    if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.category?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [leads, statusFilter, search]);

  const counts = useMemo(() =>
    PIPELINE.reduce((acc, p) => {
      acc[p.status] = leads.filter(l => l.status === p.status).length;
      return acc;
    }, {} as Record<LeadStatus, number>),
  [leads]);

  // ─── Apify ───────────────────────────────────────────────────────────────────

  const saveToken = () => {
    localStorage.setItem(LS_KEY, apifyToken);
    setShowToken(false);
  };

  const runApify = async () => {
    if (!apifyToken || !segment || !city) return;
    setApifyStatus('running');
    setApifyMsg('Iniciando busca no Google Maps…');
    setResults([]);
    setSelected(new Set());

    try {
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray: [`${segment} em ${city}`],
            maxCrawledPlacesPerSearch: 25,
            language: 'pt',
            maxImages: 0,
            scrapeDirectories: false,
          }),
        }
      );
      if (!runRes.ok) throw new Error(`Erro ao iniciar: ${runRes.status}`);
      const runData = await runRes.json();
      const runId: string = runData.data.id;
      const datasetId: string = runData.data.defaultDatasetId;

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 3 min max
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
        setApifyMsg(`Coletando dados… (${attempts * 3}s)`);

        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
        );
        const statusData = await statusRes.json();
        const runStatus: string = statusData.data.status;

        if (runStatus === 'SUCCEEDED') {
          const itemsRes = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=50&fields=title,phone,website,address,city,totalScore,reviewsCount,categoryName`
          );
          const items: ApifyItem[] = await itemsRes.json();
          setResults(items.filter(i => i.title));
          setApifyStatus('done');
          setApifyMsg(`${items.filter(i => i.title).length} empresas encontradas`);
          return;
        }

        if (runStatus === 'FAILED' || runStatus === 'ABORTED') {
          throw new Error('A busca falhou no Apify.');
        }
      }
      throw new Error('Tempo esgotado. Tente novamente.');
    } catch (err: unknown) {
      setApifyStatus('error');
      setApifyMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === results.length ? new Set() : new Set(results.map((_, i) => i))
    );
  };

  const handleImport = () => {
    const toImport = results
      .filter((_, i) => selected.has(i))
      .map(item => ({
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
      }));
    importLeads(toImport);
    setShowApify(false);
    setResults([]);
    setSelected(new Set());
    setApifyStatus('idle');
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

  // ─── Detail modal ─────────────────────────────────────────────────────────────

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Pipeline summary */}
      <div className="grid grid-cols-5 gap-3">
        {PIPELINE.map(p => (
          <button
            key={p.status}
            onClick={() => setStatusFilter(prev => prev === p.status ? 'all' : p.status)}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === p.status
                ? p.color + ' ring-1 ring-current/40'
                : 'bg-[#21262d] border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${p.dot}`} />
              <span className="text-xs font-semibold text-slate-400">{p.label}</span>
            </div>
            <p className="text-2xl font-black text-white">{counts[p.status] || 0}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-[#21262d] rounded-xl p-4 border border-white/[0.08]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, cidade ou segmento…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Lead table */}
      <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Target className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Nenhum lead encontrado</p>
            <p className="text-slate-600 text-xs mt-1">Use "Buscar no Google" para importar prospects via Apify</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Empresa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Contato</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Cidade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Avaliação</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Fonte</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map(lead => {
                  const stage = getStage(lead.status);
                  return (
                    <tr key={lead.id} className="hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={() => openDetail(lead)}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{lead.name}</p>
                          {lead.category && <p className="text-xs text-slate-500 mt-0.5">{lead.category}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {lead.phone}
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
                                className="truncate max-w-32 hover:underline"
                              >
                                {lead.website.replace(/^https?:\/\//, '')}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.city && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {lead.city}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.rating != null && (
                          <div className="flex items-center gap-1 text-xs text-yellow-400">
                            <Star className="w-3.5 h-3.5 fill-yellow-400" />
                            <span className="font-semibold">{lead.rating.toFixed(1)}</span>
                            {lead.reviewCount && <span className="text-slate-500">({lead.reviewCount})</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${stage.color}`}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          lead.source === 'apify'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-slate-500/10 text-slate-400'
                        }`}>
                          {lead.source === 'apify' ? 'Google Maps' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => setDeleteId(lead.id)}
                            className="p-1.5 text-red-400 hover:bg-red-600/[0.12] rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Apify Modal ─────────────────────────────────────────────────────────── */}
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
                    <button onClick={() => setShowToken(true)} className="text-xs text-blue-400 hover:underline">
                      Alterar token
                    </button>
                  )}
                </div>
                {showToken ? (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apifyToken}
                      onChange={e => setApifyToken(e.target.value)}
                      placeholder="apify_api_xxxxxxxxxxxx"
                      className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={saveToken}
                      disabled={!apifyToken}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Token salvo. Acesse <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">console.apify.com <ExternalLink className="w-3 h-3" /></a> para obter o seu.
                  </p>
                )}
              </div>

              {/* Search fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Segmento / Tipo de empresa</label>
                  <input
                    type="text"
                    value={segment}
                    onChange={e => setSegment(e.target.value)}
                    placeholder="ex: agência de marketing digital"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">Cidade / Estado</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="ex: São Paulo, SP"
                    className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={runApify}
                disabled={!apifyToken || !segment || !city || apifyStatus === 'running'}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {apifyStatus === 'running' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{apifyMsg}</>
                ) : (
                  <><Target className="w-4 h-4" />Buscar no Google Maps</>
                )}
              </button>

              {apifyStatus === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                  {apifyMsg}
                </div>
              )}

              {/* Results */}
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
                      <div
                        key={i}
                        onClick={() => toggleSelect(i)}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selected.has(i)
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-white/[0.06] hover:border-white/20 bg-[#161b22]'
                        }`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {selected.has(i)
                            ? <CheckSquare className="w-4 h-4 text-emerald-400" />
                            : <Square className="w-4 h-4 text-slate-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {item.categoryName && <span className="text-xs text-slate-500">{item.categoryName}</span>}
                            {item.city && (
                              <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />{item.city}
                              </span>
                            )}
                            {item.phone && (
                              <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                <Phone className="w-3 h-3" />{item.phone}
                              </span>
                            )}
                            {item.totalScore != null && (
                              <span className="text-xs text-yellow-400 flex items-center gap-0.5">
                                <Star className="w-3 h-3 fill-yellow-400" />{item.totalScore.toFixed(1)}
                              </span>
                            )}
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
                <button
                  onClick={handleImport}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                >
                  Importar para Leads
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Manual Modal ────────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100">Novo Lead Manual</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Nome da empresa *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: XYZ Marketing"
                />
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

      {/* ── Detail Modal ────────────────────────────────────────────────────────── */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <h2 className="text-lg font-bold text-slate-100 truncate flex-1 mr-4">{showDetail.name}</h2>
              <button onClick={() => setShowDetail(null)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06] flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {showDetail.phone && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {showDetail.phone}
                  </div>
                )}
                {showDetail.city && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    {showDetail.city}
                  </div>
                )}
                {showDetail.website && (
                  <div className="flex items-center gap-2 col-span-2">
                    <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <a
                      href={showDetail.website.startsWith('http') ? showDetail.website : `https://${showDetail.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-xs flex items-center gap-1"
                    >
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

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Status no Funil</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PIPELINE.map(p => (
                    <button
                      key={p.status}
                      onClick={() => setDetailStatus(p.status)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        detailStatus === p.status ? p.color : 'border-white/[0.06] text-slate-500 hover:border-white/20'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Notas</label>
                <textarea
                  value={detailNotes}
                  onChange={e => setDetailNotes(e.target.value)}
                  rows={4}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Observações, histórico de contato..."
                />
              </div>

              {/* Convert to client */}
              {showDetail.status !== 'client' && (
                <button
                  onClick={() => convertToClient(showDetail)}
                  className="w-full flex items-center justify-center gap-2 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Building2 className="w-4 h-4" />
                  Converter em Cliente
                </button>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05]">
              <button onClick={() => setShowDetail(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={saveDetail} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold">
                Salvar
              </button>
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
