/**
 * apifySearch.ts — Cliente da prospecção Google Maps via chave-mestra.
 *
 * O frontend nunca vê o token da Apify. Tudo passa pela Edge Function
 * apify-search, que guarda a chave, valida a agência (JWT), aplica a cota
 * mensal e o teto de resultados. O supabase-js injeta o JWT do usuário.
 */

import { supabaseData as supabase } from './supabase';

export interface Quota { used: number; limit: number; }

export interface ApifyPlace {
  title?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  totalScore?: number;
  reviewsCount?: number;
  categoryName?: string;
}

interface StartResult {
  runId?: string;
  datasetId?: string;
  usageId?: string | null;
  used?: number;
  limit?: number;
  error?: string;
  message?: string;
}

interface PollResult {
  status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  items?: ApifyPlace[];
  error?: string;
  message?: string;
}

const invoke = async (action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
  try {
    const { data, error } = await supabase.functions.invoke('apify-search', { body: { action, ...extra } });
    if (error) {
      const raw = error.message || '';
      const friendly = /Failed to send a request|Failed to fetch|network/i.test(raw)
        ? 'Prospecção indisponível no momento. Tente novamente em instantes.'
        : raw;
      return { error: friendly };
    }
    return (data ?? {}) as Record<string, unknown>;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

/** Uso do mês: { used, limit }. */
export const apifyQuota = async (): Promise<Quota | { error: string }> => {
  const r = await invoke('quota');
  if (r.error) return { error: String(r.message ?? r.error) };
  return { used: Number(r.used ?? 0), limit: Number(r.limit ?? 0) };
};

/** Dispara a busca. Consome 1 da cota. */
export const apifyStart = async (segment: string, city: string): Promise<StartResult> => {
  const r = await invoke('start', { segment, city }) as StartResult;
  if (r.error) return { error: String(r.message ?? r.error), used: r.used, limit: r.limit };
  return r;
};

/** Consulta o andamento e devolve os resultados quando prontos. */
export const apifyPoll = async (runId: string, datasetId: string, usageId: string | null): Promise<PollResult> => {
  const r = await invoke('poll', { runId, datasetId, usageId: usageId ?? '' }) as PollResult;
  if (r.error) return { error: String(r.message ?? r.error) };
  return r;
};
