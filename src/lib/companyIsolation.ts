/**
 * companyIsolation.ts — Módulo de isolamento de dados por agência
 *
 * ════════════════════════════════════════════════════════════════
 *  MODELO DE SEGURANÇA — 3 CAMADAS INDEPENDENTES
 * ════════════════════════════════════════════════════════════════
 *
 * Camada 1 — BANCO (Supabase RLS):
 *   Políticas RLS filtram TODAS as operações por company_id usando
 *   auth.jwt()->'user_metadata'->>'company_id'. Mesmo que o código da
 *   aplicação esqueça de filtrar, o banco NUNCA retorna dados de outra
 *   agência. Definidas em SUPABASE_SETUP.sql — não mexer sem revisar RLS.
 *
 * Camada 2 — APLICAÇÃO (queries explícitas):
 *   - SELECTs: .eq('company_id', cid) em todas as queries
 *   - INSERTs: company_id sempre incluído no payload (via companyRow())
 *   - UPDATEs: .eq('company_id', cid) como filtro extra (via companyUpdate())
 *   - DELETEs: .match({ id, company_id: cid }) (via companyDelete())
 *
 * Camada 3 — JWT (authSession.ts):
 *   company_id vem do JWT do usuário, validado no servidor via getUser()
 *   no initAuth(). Sessões revogadas (401/403) são destruídas; erros
 *   transitórios de rede nunca derrubam a sessão.
 *
 * ════════════════════════════════════════════════════════════════
 *  REGRA PARA NOVAS FUNCIONALIDADES
 * ════════════════════════════════════════════════════════════════
 *
 * Todo novo store de dados deve:
 *   1. Importar getCompanyId, companyRow, companyUpdate, companyDelete daqui
 *   2. Chamar getCompanyId() no início de cada operação
 *   3. Retornar cedo se !cid (store não carrega sem company_id)
 *   4. Usar as funções deste módulo para montar queries e payloads
 *
 * Nunca usar supabase.from(table) diretamente para dados multi-tenant
 * sem passar pelo getCompanyId() deste módulo.
 */

import { useAuthStore } from '../store/authStore';
import { supabaseData as supabase } from './supabase';

// ─── Acesso ao company_id atual ──────────────────────────────────────────────

/** Retorna o company_id do usuário logado, ou null se não houver. */
export const getCompanyId = (): string | null =>
  useAuthStore.getState().currentUser?.companyId ?? null;

/**
 * Retorna o company_id ou lança erro se não houver.
 * Use em operações que não fazem sentido sem uma agência associada.
 */
export const requireCompanyId = (): string => {
  const cid = getCompanyId();
  if (!cid) throw new Error('[companyIsolation] Operação requer company_id — usuário sem agência');
  return cid;
};

// ─── Helpers para queries seguras ────────────────────────────────────────────

/**
 * Adiciona company_id a um payload de INSERT.
 * Garante que registros nunca sejam inseridos sem a chave de isolamento.
 *
 * @example
 * supabase.from('clients').insert(companyRow({ name: 'Foo', ... }, cid))
 */
export const companyRow = (
  row: Record<string, unknown>,
  companyId: string,
): Record<string, unknown> => ({ ...row, company_id: companyId });

/**
 * Executa UPDATE com filtro duplo: id específico + company_id da agência.
 * Impede que um bug de ID errado modifique dados de outra agência,
 * além do que a RLS já garante.
 *
 * @example
 * await companyUpdate('clients', id, { name: 'Bar' }, cid)
 */
export const companyUpdate = (
  table: string,
  id: string,
  updates: Record<string, unknown>,
  companyId: string,
) =>
  supabase
    .from(table)
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId); // segunda barreira além do RLS

/**
 * Executa DELETE com filtro duplo: id específico + company_id da agência.
 *
 * @example
 * await companyDelete('clients', id, cid)
 */
export const companyDelete = (
  table: string,
  id: string,
  companyId: string,
) =>
  supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('company_id', companyId); // segunda barreira além do RLS

/**
 * Cria um SELECT base já filtrado por company_id.
 * Combina a proteção RLS (automática) com filtro explícito na query.
 *
 * @example
 * const { data } = await companySelect('clients', cid).order('created_at')
 */
export const companySelect = (table: string, companyId: string) =>
  supabase
    .from(table)
    .select('*')
    .eq('company_id', companyId);

// ─── Leitura blindada (retry + distinção erro × vazio) ───────────────────────

const FETCH_RETRY_DELAYS = [1000, 2000, 4000, 8000];
const FETCH_ATTEMPT_TIMEOUT = 12_000;

// Nenhuma tentativa pode pendurar para sempre (ex: lock de auth preso) —
// estoura em 12s, conta como falha e o ciclo de retry segue.
const withAttemptTimeout = <T>(p: PromiseLike<T>): Promise<T> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout de ${FETCH_ATTEMPT_TIMEOUT / 1000}s na consulta`)), FETCH_ATTEMPT_TIMEOUT),
    ),
  ]);

/**
 * SELECT com retry automático — a ÚNICA forma correta de carregar listas
 * nos inits dos stores.
 *
 * REGRA INEGOCIÁVEL: `rows === null` significa FALHA (rede, token em
 * renovação, 5xx). O store deve MANTER os dados atuais e agendar retry.
 * Jamais grave lista vazia a partir de uma falha — foi exatamente esse
 * padrão (`const { data } = await ...` ignorando o erro) que fazia o
 * sistema "zerar" a cada atualização: um 401 transitório durante a
 * renovação do token virava tela vazia permanente.
 *
 * `rows === []` significa sucesso com zero registros (conta nova) —
 * aí sim pode gravar vazio.
 */
export async function companyFetchAll(
  table: string,
  companyId: string,
  orderBy: string = 'created_at',
  ascending: boolean = true,
): Promise<{ rows: Record<string, unknown>[] | null; error: string | null }> {
  let lastError = 'erro desconhecido';
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS.length; attempt++) {
    try {
      const { data, error } = await withAttemptTimeout(
        supabase
          .from(table)
          .select('*')
          .eq('company_id', companyId)
          .order(orderBy, { ascending }),
      );
      if (!error) return { rows: data ?? [], error: null };
      lastError = error.message;
      // Erro de schema (tabela/coluna inexistente) não se resolve com retry
      if (/does not exist|42P01/i.test(lastError)) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < FETCH_RETRY_DELAYS.length) {
      await new Promise(r => setTimeout(r, FETCH_RETRY_DELAYS[attempt]));
    }
  }
  console.error(`[companyFetchAll:${table}] falha após retries:`, lastError);
  return { rows: null, error: lastError };
}

// ─── Validação pós-carregamento ──────────────────────────────────────────────

/**
 * Valida que todos os registros retornados pertencem à agência correta.
 * Chame após cada init() para detectar vazamentos de dados (ex: JWT antigo
 * com company_id errado que passou pelo RLS antes do refresh).
 *
 * Retorna os registros válidos e descarta (com aviso) os que não pertencem.
 */
export const assertCompanyData = <T>(
  records: T[],
  companyId: string,
  context: string,
): T[] => {
  const valid: T[] = [];
  for (const r of records) {
    const rec = r as Record<string, unknown>;
    if (rec['companyId'] && rec['companyId'] !== companyId) {
      console.error(
        `[companyIsolation] VAZAMENTO DETECTADO em "${context}": ` +
        `registro com companyId="${rec['companyId']}" retornado para agência "${companyId}". ` +
        `Registro ignorado.`,
      );
    } else {
      valid.push(r);
    }
  }
  return valid;
};
