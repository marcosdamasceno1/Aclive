/**
 * formsStore — formulários da agência (construtor, publicação, resultados).
 * Isolado por agência (company_id + RLS). O token da API de Conversões só é
 * gravado pela função set_form_secret e nunca volta para o navegador.
 */
import { create } from 'zustand';
import { supabaseData as supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/companyIsolation';
import { defaultConfig, normalizeConfig, type FormConfig } from '../lib/forms/schema';

export type FormStatus = 'draft' | 'published' | 'paused';
export interface FormRecord {
  id: string;
  slug: string;
  name: string;
  status: FormStatus;
  config: FormConfig;
  pixelId: string | null;
  capiConfigured: boolean;
  boardId: string | null;
  stageId: string | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface FormStats { visits: number; started: number; completed: number; qualified: number; disqualified: number }

export interface SessionRow { id: string; last_step: number; started: boolean; completed: boolean; created_at: string; completed_at: string | null; device: string | null; tracking: Record<string, string> | null }
export interface SubmissionRow { id: string; lead_id: string | null; answers: Record<string, string | string[]>; outcome: string; tracking: Record<string, string> | null; capi_status: string | null; created_at: string }

export const slugify = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const fromRow = (r: Record<string, unknown>): FormRecord => ({
  id: r.id as string,
  slug: r.slug as string,
  name: r.name as string,
  status: r.status as FormStatus,
  config: normalizeConfig(r.config),
  pixelId: (r.pixel_id as string) ?? null,
  capiConfigured: !!r.capi_configured,
  boardId: (r.board_id as string) ?? null,
  stageId: (r.stage_id as string) ?? null,
  clientId: (r.client_id as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

interface State {
  forms: FormRecord[];
  stats: Record<string, FormStats>;
  companySlug: string | null;
  loaded: boolean;
  error: string | null;
  init: () => Promise<void>;
  setCompanySlug: (slug: string) => Promise<string | null>;
  createForm: (name: string, config?: FormConfig) => Promise<{ id?: string; error?: string }>;
  saveForm: (id: string, patch: Partial<Pick<FormRecord, 'name' | 'slug' | 'config' | 'pixelId' | 'boardId' | 'stageId' | 'clientId'>>) => Promise<string | null>;
  setStatus: (id: string, status: FormStatus) => Promise<string | null>;
  duplicate: (id: string) => Promise<{ id?: string; error?: string }>;
  remove: (id: string) => Promise<string | null>;
  setCapiSecret: (id: string, token: string, testCode: string) => Promise<string | null>;
  loadResults: (id: string, sinceIso: string) => Promise<{ sessions: SessionRow[]; submissions: SubmissionRow[]; error?: string }>;
}

const uniqueSlug = (base: string, taken: string[]) => {
  let s = base || 'formulario';
  if (s.length < 2) s = `${s}-form`;
  let n = 2;
  while (taken.includes(s)) s = `${base}-${n++}`;
  return s;
};

export const useFormsStore = create<State>()((set, get) => ({
  forms: [],
  stats: {},
  companySlug: null,
  loaded: false,
  error: null,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ forms: [], stats: {}, companySlug: null, loaded: false }); return; }
    const [{ data: company }, { data, error }] = await Promise.all([
      supabase.from('companies').select('slug').eq('id', cid).maybeSingle(),
      supabase.from('forms').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ]);
    if (error) {
      set({ loaded: true, error: 'Formulários indisponíveis. Rode a migração forms_and_lead_boards.sql no Supabase.' });
      return;
    }
    const forms = (data ?? []).map(fromRow);
    set({ forms, companySlug: (company as { slug?: string } | null)?.slug ?? null, loaded: true, error: null });

    // Números da lista: visitas, inícios e envios dos últimos 30 dias
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: sess }, { data: subs }] = await Promise.all([
      supabase.from('form_sessions').select('form_id, started, completed').eq('company_id', cid).gte('created_at', since).limit(20000),
      supabase.from('form_submissions').select('form_id, outcome').eq('company_id', cid).gte('created_at', since).limit(20000),
    ]);
    const stats: Record<string, FormStats> = {};
    for (const f of forms) stats[f.id] = { visits: 0, started: 0, completed: 0, qualified: 0, disqualified: 0 };
    for (const s of (sess ?? []) as { form_id: string; started: boolean; completed: boolean }[]) {
      const st = stats[s.form_id]; if (!st) continue;
      st.visits++; if (s.started) st.started++; if (s.completed) st.completed++;
    }
    for (const s of (subs ?? []) as { form_id: string; outcome: string }[]) {
      const st = stats[s.form_id]; if (!st) continue;
      if (s.outcome === 'disqualified') st.disqualified++; else st.qualified++;
    }
    set({ stats });
  },

  setCompanySlug: async (slug) => {
    const { data, error } = await supabase.rpc('set_company_slug', { p_slug: slug });
    if (error) return error.message;
    set({ companySlug: data as string });
    return null;
  },

  createForm: async (name, config) => {
    const cid = getCompanyId(); if (!cid) return { error: 'Sem agência' };
    const slug = uniqueSlug(slugify(name), get().forms.map(f => f.slug));
    const { data, error } = await supabase.from('forms').insert({
      company_id: cid, name: name.trim().slice(0, 80) || 'Formulário', slug, status: 'draft', config: config ?? defaultConfig(),
    }).select('*').single();
    if (error) return { error: error.message };
    const form = fromRow(data);
    set(s => ({ forms: [form, ...s.forms], stats: { ...s.stats, [form.id]: { visits: 0, started: 0, completed: 0, qualified: 0, disqualified: 0 } } }));
    return { id: form.id };
  },

  saveForm: async (id, patch) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 80) || 'Formulário';
    if (patch.slug !== undefined) {
      const s = slugify(patch.slug);
      if (s.length < 2) return 'O endereço precisa ter pelo menos 2 letras ou números.';
      if (get().forms.some(f => f.id !== id && f.slug === s)) return 'Já existe outro formulário com este endereço.';
      row.slug = s;
    }
    if (patch.config !== undefined) row.config = patch.config;
    if (patch.pixelId !== undefined) {
      const p = (patch.pixelId ?? '').replace(/\D/g, '');
      if (p && (p.length < 5 || p.length > 20)) return 'ID do Pixel inválido (só números).';
      row.pixel_id = p || null;
    }
    if (patch.boardId !== undefined) row.board_id = patch.boardId;
    if (patch.stageId !== undefined) row.stage_id = patch.stageId;
    if (patch.clientId !== undefined) row.client_id = patch.clientId;
    const { data, error } = await supabase.from('forms').update(row).eq('id', id).eq('company_id', cid).select('*').single();
    if (error) return error.message.includes('forms_company_slug') ? 'Já existe outro formulário com este endereço.' : error.message;
    set(s => ({ forms: s.forms.map(f => f.id === id ? fromRow(data) : f) }));
    return null;
  },

  setStatus: async (id, status) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const { error } = await supabase.from('forms').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', cid);
    if (error) return error.message;
    set(s => ({ forms: s.forms.map(f => f.id === id ? { ...f, status } : f) }));
    return null;
  },

  duplicate: async (id) => {
    const f = get().forms.find(x => x.id === id);
    if (!f) return { error: 'Formulário não encontrado' };
    const res = await get().createForm(`${f.name} (cópia)`, f.config);
    if (res.id) await get().saveForm(res.id, { pixelId: f.pixelId, boardId: f.boardId, stageId: f.stageId });
    return res;
  },

  remove: async (id) => {
    const cid = getCompanyId(); if (!cid) return 'Sem agência';
    const { error } = await supabase.from('forms').delete().eq('id', id).eq('company_id', cid);
    if (error) return error.message;
    set(s => ({ forms: s.forms.filter(f => f.id !== id) }));
    return null;
  },

  setCapiSecret: async (id, token, testCode) => {
    const { data, error } = await supabase.rpc('set_form_secret', { p_form_id: id, p_capi_token: token, p_test_event_code: testCode });
    if (error) return error.message;
    set(s => ({ forms: s.forms.map(f => f.id === id ? { ...f, capiConfigured: !!data } : f) }));
    return null;
  },

  loadResults: async (id, sinceIso) => {
    const cid = getCompanyId(); if (!cid) return { sessions: [], submissions: [], error: 'Sem agência' };
    const [s, sub] = await Promise.all([
      supabase.from('form_sessions').select('id, last_step, started, completed, created_at, completed_at, device, tracking')
        .eq('company_id', cid).eq('form_id', id).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(10000),
      supabase.from('form_submissions').select('id, lead_id, answers, outcome, tracking, capi_status, created_at')
        .eq('company_id', cid).eq('form_id', id).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(2000),
    ]);
    return {
      sessions: (s.data ?? []) as SessionRow[],
      submissions: (sub.data ?? []) as SubmissionRow[],
      error: s.error?.message ?? sub.error?.message,
    };
  },
}));
