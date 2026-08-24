/**
 * approvalPublic.ts — Cliente da página pública de aprovação (sem login).
 * Fala apenas com as Edge Functions públicas approval-get / approval-submit.
 */

import { supabaseData as supabase } from './supabase';
import type { ApprovalStatus, CaptionOption } from '../types';

export interface PublicApproval {
  title: string;
  agencyName?: string;
  videoUrl?: string;
  videoStatus: ApprovalStatus;
  videoFeedback?: string;
  captions: CaptionOption[];
  captionChoice?: string;
  captionStatus: ApprovalStatus;
  captionFeedback?: string;
  decidedAt?: string;
}

export interface SubmitPayload {
  videoStatus: ApprovalStatus;
  videoFeedback?: string;
  captionStatus: ApprovalStatus;
  captionChoice?: string;
  captionFeedback?: string;
}

export const getApproval = async (token: string): Promise<{ data: PublicApproval | null; error: string | null }> => {
  try {
    const { data, error } = await supabase.functions.invoke('approval-get', { body: { token } });
    if (error) return { data: null, error: 'Não foi possível carregar. Tente novamente.' };
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.error) return { data: null, error: d.error === 'not_found' ? 'Link inválido ou expirado.' : 'Erro ao carregar.' };
    return { data: d as unknown as PublicApproval, error: null };
  } catch {
    return { data: null, error: 'Falha de conexão. Tente novamente.' };
  }
};

export const submitApproval = async (token: string, payload: SubmitPayload): Promise<string | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('approval-submit', { body: { token, ...payload } });
    if (error) return 'Não foi possível enviar. Tente novamente.';
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.error) return d.error === 'not_found' ? 'Link inválido ou expirado.' : 'Erro ao enviar.';
    return null;
  } catch {
    return 'Falha de conexão. Tente novamente.';
  }
};
