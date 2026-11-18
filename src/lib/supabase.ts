import { createClient } from '@supabase/supabase-js';

import { SUPABASE_URL, ANON_KEY } from './supabaseConfig';

// Lock LOCAL à aba (fila de promises) no lugar do navigator.locks.
// O navigator.locks cross-tab pode ficar preso indefinidamente (aba zumbi,
// deadlock em callback) e aí TODA query de dados pendura antes do fetch —
// era a causa da tela "logada porém zerada" após atualizações. Este mutex
// serializa as operações de auth dentro da aba e é imune a travamento
// externo: se uma operação falha, a fila segue.
let authOpChain: Promise<unknown> = Promise.resolve();
const inTabLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const run = authOpChain.then(fn);
  authOpChain = run.catch(() => {});
  return await run;
};

// Single client for auth + data — session JWT is automatically included in all
// PostgREST requests, so RLS policies receive the correct auth.jwt() claims.
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sb-auth', lock: inTabLock },
});

// Alias — all data stores import this; using the same client means no manual
// session sync is needed and the JWT is always current.
export const supabaseData = supabaseAuth;

// Kept for API compatibility — no-ops because the single client manages the
// session automatically.
export const setDataSession = async (_a: string, _r: string): Promise<void> => {};
export const clearDataSession = async (): Promise<void> => {};

// Admin operations via Edge Function (server-side, uses service_role safely).
// A função confere no servidor quem chama: só administradores da agência
// (ou o super admin) conseguem listar, criar, editar ou excluir usuários.
export type RawUser = {
  id: string;
  email?: string;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EdgeResult = { data: any; error: any };

const edgeFn = async (action: string, body: Record<string, unknown> = {}): Promise<EdgeResult> => {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Edge Function não respondeu (timeout 10s). Verifique se o projeto Supabase está ativo.')), 10000)
  );
  try {
    return await Promise.race([
      supabaseAuth.functions.invoke('admin-users', { body: { action, ...body } }),
      timer,
    ]) as EdgeResult;
  } catch (e) {
    return { data: null, error: { message: String(e) } };
  }
};

// Erro da função vem no corpo ({ error }) mesmo com status 4xx.
const errorOf = async (res: EdgeResult): Promise<string | null> => {
  if (res.data?.error) return typeof res.data.error === 'string' ? res.data.error : res.data.error.message ?? 'Erro desconhecido';
  if (res.error) {
    try {
      const ctx = res.error.context;
      if (ctx && typeof ctx.json === 'function') {
        const b = await ctx.json();
        if (b?.error) return String(b.error);
      }
    } catch { /* corpo não-JSON */ }
    return res.error.message ?? 'Erro desconhecido';
  }
  return null;
};

export const adminApi = {
  ping: async (): Promise<{ ok: boolean; message: string }> => {
    const err = await errorOf(await edgeFn('list'));
    return err ? { ok: false, message: err } : { ok: true, message: '' };
  },

  listUsers: async (): Promise<{ data: { users: RawUser[] } | null; error: { message: string } | null }> => {
    const res = await edgeFn('list');
    const err = await errorOf(res);
    if (err) return { data: null, error: { message: err } };
    return { data: { users: res.data?.users ?? [] }, error: null };
  },

  createUser: async (params: {
    email: string;
    password: string;
    name: string;
    role: string;
    permissions?: string[];
    companyId?: string;
  }): Promise<{ data: { user: RawUser } | null; error: { message: string } | null }> => {
    const res = await edgeFn('create', params as unknown as Record<string, unknown>);
    const err = await errorOf(res);
    if (err || !res.data?.user) return { data: null, error: { message: err ?? 'Falha ao criar usuário' } };
    return { data: { user: res.data.user }, error: null };
  },

  updateUser: async (
    id: string,
    params: { name?: string; role?: string; permissions?: string[]; professionalId?: string | null; password?: string },
  ): Promise<{ error: { message: string } | null }> => {
    const err = await errorOf(await edgeFn('update', { id, ...params }));
    return { error: err ? { message: err } : null };
  },

  deleteUser: async (id: string): Promise<{ error: { message: string } | null }> => {
    const err = await errorOf(await edgeFn('delete', { id }));
    return { error: err ? { message: err } : null };
  },
};
