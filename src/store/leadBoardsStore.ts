/**
 * leadBoardsStore — janelas (kanbans) de leads, suas etapas e as tags da agência.
 * Isolado por agência: toda leitura filtra company_id e a RLS do banco garante
 * o mesmo mesmo que o filtro falhe. Só admin e gestor alteram (RLS).
 */
import { create } from 'zustand';
import { supabaseData as supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/companyIsolation';
import type { Lead, LeadStatus } from '../types';

export type StageKind = 'open' | 'won' | 'lost';
export interface LeadBoard { id: string; name: string; position: number; sources: string[] }
export interface LeadStage { id: string; boardId: string; name: string; color: string; position: number; kind: StageKind; legacyStatus?: string | null }
export interface LeadTag { id: string; name: string; color: string }

export const COLORS: { key: string; dot: string; chip: string; border: string; text: string }[] = [
  { key: 'blue',   dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 border-blue-200',       border: 'border-blue-400',    text: 'text-blue-700' },
  { key: 'amber',  dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200',    border: 'border-amber-400',   text: 'text-amber-700' },
  { key: 'orange', dot: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700 border-orange-200', border: 'border-orange-400',  text: 'text-orange-700' },
  { key: 'green',  dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', border: 'border-emerald-400', text: 'text-emerald-700' },
  { key: 'red',    dot: 'bg-red-500',     chip: 'bg-red-50 text-red-700 border-red-200',          border: 'border-red-400',     text: 'text-red-700' },
  { key: 'purple', dot: 'bg-purple-500',  chip: 'bg-purple-50 text-purple-700 border-purple-200', border: 'border-purple-400',  text: 'text-purple-700' },
  { key: 'pink',   dot: 'bg-pink-500',    chip: 'bg-pink-50 text-pink-700 border-pink-200',       border: 'border-pink-400',    text: 'text-pink-700' },
  { key: 'teal',   dot: 'bg-teal-500',    chip: 'bg-teal-50 text-teal-700 border-teal-200',       border: 'border-teal-400',    text: 'text-teal-700' },
  { key: 'slate',  dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600 border-slate-200',   border: 'border-slate-300',   text: 'text-slate-500' },
];
export const colorOf = (key: string) => COLORS.find(c => c.key === key) ?? COLORS[0];

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', website: 'Site', apify: 'Google Maps', meta: 'Meta Lead Ads', form: 'Formulários',
};

/** Status antigo que uma etapa representa (relatórios e conversão em cliente). */
export const statusForStage = (stage: LeadStage, isFirst: boolean): LeadStatus => {
  if (stage.legacyStatus && ['new', 'contacted', 'proposal', 'client', 'lost'].includes(stage.legacyStatus)) {
    return stage.legacyStatus as LeadStatus;
  }
  if (stage.kind === 'won') return 'client';
  if (stage.kind === 'lost') return 'lost';
  return isFirst ? 'new' : 'contacted';
};

interface State {
  boards: LeadBoard[];
  stages: LeadStage[];
  tags: LeadTag[];
  loaded: boolean;
  error: string | null;
  init: () => Promise<void>;
  boardStages: (boardId: string) => LeadStage[];
  /** Janela e etapa onde o lead aparece (leads antigos não têm janela gravada). */
  placement: (lead: Lead) => { boardId: string | null; stageId: string | null };
  addBoard: (name: string) => Promise<string | null>;
  updateBoard: (id: string, patch: Partial<Pick<LeadBoard, 'name' | 'sources' | 'position'>>) => Promise<string | null>;
  deleteBoard: (id: string) => Promise<string | null>;
  addStage: (boardId: string, name: string, color: string, kind: StageKind) => Promise<string | null>;
  updateStage: (id: string, patch: Partial<Pick<LeadStage, 'name' | 'color' | 'kind' | 'position'>>) => Promise<string | null>;
  deleteStage: (id: string) => Promise<string | null>;
  addTag: (name: string, color: string) => Promise<string | null>;
  updateTag: (id: string, patch: Partial<Pick<LeadTag, 'name' | 'color'>>) => Promise<string | null>;
  deleteTag: (id: string) => Promise<string | null>;
}

const err = (e: { message: string } | null) => (e ? e.message : null);

export const useLeadBoardsStore = create<State>()((set, get) => ({
  boards: [],
  stages: [],
  tags: [],
  loaded: false,
  error: null,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ boards: [], stages: [], tags: [], loaded: false }); return; }
    const [b, s, t] = await Promise.all([
      supabase.from('lead_boards').select('*').eq('company_id', cid).order('position'),
      supabase.from('lead_stages').select('*').eq('company_id', cid).order('position'),
      supabase.from('lead_tags').select('*').eq('company_id', cid).order('name'),
    ]);
    if (b.error || s.error || t.error) {
      set({ error: 'Janelas de leads indisponíveis. Rode a migração forms_and_lead_boards.sql no Supabase.', loaded: true });
      return;
    }
    set({
      boards: (b.data ?? []).map(r => ({ id: r.id, name: r.name, position: r.position, sources: r.sources ?? [] })),
      stages: (s.data ?? []).map(r => ({ id: r.id, boardId: r.board_id, name: r.name, color: r.color, position: r.position, kind: r.kind, legacyStatus: r.legacy_status })),
      tags: (t.data ?? []).map(r => ({ id: r.id, name: r.name, color: r.color })),
      loaded: true,
      error: null,
    });
  },

  boardStages: (boardId) => get().stages.filter(s => s.boardId === boardId).sort((a, b) => a.position - b.position),

  placement: (lead) => {
    const { boards } = get();
    if (!boards.length) return { boardId: null, stageId: null };
    let board = lead.boardId ? boards.find(b => b.id === lead.boardId) : undefined;
    if (!board) board = boards.find(b => b.sources.includes(lead.source)) ?? boards[0];
    const stages = get().boardStages(board.id);
    let stage = lead.stageId ? stages.find(s => s.id === lead.stageId) : undefined;
    if (!stage) {
      stage = stages.find(s => s.legacyStatus === lead.status)
        ?? (lead.status === 'client' ? stages.find(s => s.kind === 'won') : undefined)
        ?? (lead.status === 'lost' ? stages.find(s => s.kind === 'lost') : undefined)
        ?? (lead.status === 'new' ? stages[0] : stages.find(s => s.kind === 'open' && s !== stages[0]))
        ?? stages[0];
    }
    return { boardId: board.id, stageId: stage?.id ?? null };
  },

  addBoard: async (name) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const position = get().boards.length;
    const { data, error } = await supabase.from('lead_boards')
      .insert({ company_id: cid, name: name.trim().slice(0, 60), position, sources: [] }).select('*').single();
    if (error) return error.message;
    const board: LeadBoard = { id: data.id, name: data.name, position: data.position, sources: [] };
    // Etapas iniciais, editáveis depois
    const defaults: [string, string, StageKind][] = [['Novo', 'blue', 'open'], ['Em contato', 'amber', 'open'], ['Fechado', 'green', 'won'], ['Perdido', 'slate', 'lost']];
    const { data: st, error: stErr } = await supabase.from('lead_stages').insert(
      defaults.map(([n, c, k], i) => ({ company_id: cid, board_id: board.id, name: n, color: c, kind: k, position: i })),
    ).select('*');
    set(s => ({
      boards: [...s.boards, board],
      stages: [...s.stages, ...((st ?? []).map(r => ({ id: r.id, boardId: r.board_id, name: r.name, color: r.color, position: r.position, kind: r.kind, legacyStatus: r.legacy_status })))],
    }));
    return stErr ? stErr.message : null;
  },

  updateBoard: async (id, patch) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    set(s => ({ boards: s.boards.map(b => b.id === id ? { ...b, ...patch } : b) }));
    const { error } = await supabase.from('lead_boards').update(patch).eq('id', id).eq('company_id', cid);
    return err(error);
  },

  deleteBoard: async (id) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    if (get().boards.length <= 1) return 'A agência precisa ter pelo menos uma janela.';
    const { error } = await supabase.from('lead_boards').delete().eq('id', id).eq('company_id', cid);
    if (error) return error.message;
    // Leads da janela apagada voltam para a janela padrão (sem board_id)
    await supabase.from('leads').update({ board_id: null, stage_id: null }).eq('company_id', cid).eq('board_id', id);
    set(s => ({ boards: s.boards.filter(b => b.id !== id), stages: s.stages.filter(x => x.boardId !== id) }));
    return null;
  },

  addStage: async (boardId, name, color, kind) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const position = get().boardStages(boardId).length;
    const { data, error } = await supabase.from('lead_stages')
      .insert({ company_id: cid, board_id: boardId, name: name.trim().slice(0, 40), color, kind, position }).select('*').single();
    if (error) return error.message;
    set(s => ({ stages: [...s.stages, { id: data.id, boardId, name: data.name, color: data.color, position: data.position, kind: data.kind, legacyStatus: null }] }));
    return null;
  },

  updateStage: async (id, patch) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    set(s => ({ stages: s.stages.map(x => x.id === id ? { ...x, ...patch } : x) }));
    const { error } = await supabase.from('lead_stages').update(patch).eq('id', id).eq('company_id', cid);
    return err(error);
  },

  deleteStage: async (id) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const stage = get().stages.find(s => s.id === id);
    if (!stage) return null;
    if (get().boardStages(stage.boardId).length <= 1) return 'A janela precisa ter pelo menos uma etapa.';
    const { error } = await supabase.from('lead_stages').delete().eq('id', id).eq('company_id', cid);
    if (error) return error.message;
    await supabase.from('leads').update({ stage_id: null }).eq('company_id', cid).eq('stage_id', id);
    set(s => ({ stages: s.stages.filter(x => x.id !== id) }));
    return null;
  },

  addTag: async (name, color) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const { data, error } = await supabase.from('lead_tags').insert({ company_id: cid, name: name.trim().slice(0, 40), color }).select('*').single();
    if (error) return error.message;
    set(s => ({ tags: [...s.tags, { id: data.id, name: data.name, color: data.color }].sort((a, b) => a.name.localeCompare(b.name)) }));
    return null;
  },

  updateTag: async (id, patch) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    set(s => ({ tags: s.tags.map(t => t.id === id ? { ...t, ...patch } : t) }));
    const { error } = await supabase.from('lead_tags').update(patch).eq('id', id).eq('company_id', cid);
    return err(error);
  },

  deleteTag: async (id) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const { error } = await supabase.from('lead_tags').delete().eq('id', id).eq('company_id', cid);
    if (error) return error.message;
    set(s => ({ tags: s.tags.filter(t => t.id !== id) }));
    return null;
  },
}));
