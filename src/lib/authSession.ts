/**
 * authSession.ts — Módulo isolado de gestão de sessão
 *
 * Toda a lógica de login/logout/validação de sessão fica AQUI.
 * O authStore apenas chama as funções deste arquivo.
 *
 * Regra: nunca importe supabaseAuth.auth fora deste arquivo e do authStore.
 */

import { supabaseAuth } from './supabase';

// ─── Chave usada para marcar o timestamp do último logout ────────────────────
const LOGOUT_AT_KEY = 'aclive_lo_at';

// ─── Limpeza defensiva do storage ───────────────────────────────────────────

/**
 * Remove todas as chaves de sessão do Supabase do localStorage.
 * Cobre qualquer variante de nome que o Supabase possa usar agora ou no futuro:
 * - "sb-*"              (padrão Supabase v2)
 * - "supabase*"         (variantes legadas)
 * - "sb-auth"           (storageKey customizado deste projeto)
 */
function wipeSbStorage(): void {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') || k.includes('supabase'))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ambiente sem localStorage (SSR, test) */ }
}

// ─── Marca de logout ────────────────────────────────────────────────────────

/** Salva o timestamp do logout para bloquear tokens emitidos antes dele. */
function stampLogout(): void {
  try { localStorage.setItem(LOGOUT_AT_KEY, Date.now().toString()); } catch {}
}

/** Remove a marca de logout ao fazer login com sucesso. */
function clearLogoutStamp(): void {
  try { localStorage.removeItem(LOGOUT_AT_KEY); } catch {}
}

/**
 * Verifica se um access token JWT foi emitido APÓS o último logout.
 *
 * Isso blinda contra a condição de corrida onde o autoRefreshToken do Supabase
 * grava um novo token no localStorage APÓS o logout ter limpado o storage —
 * porque o novo token tem iat (issued-at) posterior ao timestamp do logout,
 * e PORTANTO seria indevidamente aceito. Mas esse token foi gerado a partir de
 * um refresh_token que já foi revogado pelo nosso logout, então rejeitamos
 * qualquer token cujo iat seja anterior ao stamp de logout.
 *
 * Retorna true  → token emitido após o logout (válido)
 * Retorna false → token emitido antes ou durante o logout (inválido)
 */
export function isTokenIssuedAfterLogout(accessToken: string): boolean {
  try {
    const logoutAt = parseInt(localStorage.getItem(LOGOUT_AT_KEY) || '0', 10);
    if (!logoutAt) return true; // nunca houve logout registrado
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const issuedAtMs = (payload.iat as number) * 1000;
    return issuedAtMs > logoutAt;
  } catch {
    return true; // em caso de erro de parsing, não bloqueie
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Executa logout de forma segura e definitiva.
 *
 * Sequência defensiva:
 * 1. Stampa o logout (timestamp) — qualquer token emitido antes disso será
 *    rejeitado pelo initSession mesmo que o Supabase o recupere do storage.
 * 2. Limpa o storage ANTES do signOut — impede o autoRefreshToken de usar
 *    um refresh_token que ainda estava no storage.
 * 3. Chama signOut({ scope:'local' }) — dispara SIGNED_OUT (limpa stores/state).
 * 4. Limpa o storage NOVAMENTE — garante que qualquer token que o
 *    autoRefreshToken tenha gravado durante os passos anteriores seja removido.
 */
export async function performLogout(): Promise<void> {
  stampLogout();
  wipeSbStorage();
  try {
    // Tenta parar o timer de auto-refresh se a versão do Supabase suportar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAuth.auth as any).stopAutoRefresh?.();
  } catch {}
  await supabaseAuth.auth.signOut({ scope: 'local' }).catch(() => {});
  wipeSbStorage(); // última barreira contra corrida de autoRefreshToken
}

/**
 * Obtém o usuário da sessão atual com claims frescos do servidor.
 *
 * Retorna null se:
 * - Não há sessão salva no localStorage
 * - O token foi emitido antes do último logout (sessão fantasma)
 * - O refresh_token foi revogado no servidor
 * - (Offline) Retorna o usuário em cache como fallback
 */
export async function getValidSession() {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session?.user) return null;

  // Rejeita sessão emitida antes do logout — bloqueia tokens "zumbis"
  // que o autoRefreshToken pode ter salvo durante a corrida com o logout.
  if (!isTokenIssuedAfterLogout(session.access_token)) {
    wipeSbStorage();
    await supabaseAuth.auth.signOut({ scope: 'local' }).catch(() => {});
    return null;
  }

  // Força refresh para obter claims atualizados (company_id, role, etc.)
  // getSession() retorna o JWT em cache que pode estar desatualizado.
  try {
    const { data: refreshed, error: refreshErr } = await supabaseAuth.auth.refreshSession();
    if (refreshErr) {
      // Token revogado no servidor — limpa e rejeita
      wipeSbStorage();
      stampLogout(); // atualiza o stamp para bloquear qualquer token anterior
      await supabaseAuth.auth.signOut({ scope: 'local' }).catch(() => {});
      return null;
    }
    return refreshed.session?.user ?? session.user;
  } catch {
    // Erro de rede (offline) — usa o usuário em cache
    return session.user;
  }
}

/**
 * Chama após login bem-sucedido para limpar qualquer stamp de logout anterior.
 * Isso garante que um re-login após logout funcione corretamente.
 */
export function onLoginSuccess(): void {
  clearLogoutStamp();
}
