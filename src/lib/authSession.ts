/**
 * authSession.ts — Módulo isolado de gestão de sessão
 *
 * Toda a lógica de login/logout/validação de sessão fica AQUI.
 * O authStore apenas chama as funções deste arquivo.
 *
 * Princípios (aprendidos com bugs em produção):
 * - NUNCA apagar a sessão por erro transitório (rede, timeout, refresh
 *   rotacionado por outra aba). Só destruir a sessão quando o servidor
 *   disser explicitamente que ela é inválida (401/403).
 * - NUNCA comparar relógio do cliente com iat do JWT (relógio do servidor)
 *   — desvio de relógio derruba sessões válidas em loop.
 * - No logout, signOut PRIMEIRO (limpa a sessão em memória e para o
 *   auto-refresh), storage depois.
 */

import { supabaseAuth } from './supabase';

// Migração: remove a marca de logout de versões anteriores. Ela comparava o
// relógio do cliente com o iat do JWT e derrubava sessões válidas.
try { localStorage.removeItem('aclive_lo_at'); } catch { /* SSR/test */ }

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

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Executa logout de forma segura e que nunca trava a UI.
 *
 * Ordem importa:
 * 1. stopAutoRefresh — impede o timer de gravar um token novo durante o logout.
 * 2. signOut({ scope:'local' }) — limpa a sessão EM MEMÓRIA do client e
 *    dispara SIGNED_OUT. Com timeout de 2.5s: se a rede estiver lenta ou
 *    offline, o logout local prossegue mesmo assim.
 * 3. wipeSbStorage por último — remove qualquer resíduo do localStorage,
 *    inclusive algo gravado durante os passos anteriores.
 */
export async function performLogout(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAuth.auth as any).stopAutoRefresh?.();
  } catch { /* versão sem stopAutoRefresh */ }

  await Promise.race([
    supabaseAuth.auth.signOut({ scope: 'local' }).catch(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, 2500)),
  ]);

  wipeSbStorage();
}

/**
 * Religa o timer de auto-refresh após um novo login.
 * Necessário porque performLogout() chama stopAutoRefresh() — sem isso,
 * um login feito na mesma aba (sem reload) ficaria com o timer desligado.
 */
export function resumeAutoRefresh(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAuth.auth as any).startAutoRefresh?.();
  } catch { /* versão sem startAutoRefresh */ }
}

/**
 * Obtém o usuário da sessão atual, validando no servidor quando possível.
 *
 * - Sem sessão no storage → null.
 * - getUser() valida o JWT no servidor e retorna metadata fresco
 *   (company_id, role) SEM consumir o refresh token — portanto sem risco
 *   de corrida de rotação com outras abas ou com o autoRefreshToken.
 * - 401/403 do servidor → sessão realmente inválida → limpa e retorna null.
 * - Erro de rede/timeout → retorna o usuário em cache (o autoRefreshToken
 *   do SDK renova o token em segundo plano quando a rede voltar).
 */
export async function getValidSession() {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session?.user) return null;

  try {
    const result = await Promise.race([
      supabaseAuth.auth.getUser(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
    ]);

    // Timeout — servidor lento; segue com o usuário em cache.
    if (!result) return session.user;

    const { data, error } = result;
    if (error) {
      if (error.status === 401 || error.status === 403) {
        // Sessão revogada/expirada de verdade — única situação destrutiva.
        await supabaseAuth.auth.signOut({ scope: 'local' }).catch(() => {});
        wipeSbStorage();
        return null;
      }
      // Erro transitório (rede, 5xx) — mantém a sessão em cache.
      return session.user;
    }
    return data.user ?? session.user;
  } catch {
    // Offline — usa o usuário em cache.
    return session.user;
  }
}
