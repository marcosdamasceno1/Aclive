/**
 * initRetry.ts — Re-tentativa contínua de carregamento dos stores.
 *
 * Quando o init() de um store falha mesmo após os retries imediatos do
 * companyFetchAll, ele agenda aqui uma nova tentativa em 30s — e assim
 * sucessivamente até conseguir. O sistema se auto-recupera de qualquer
 * instabilidade (deploy, rede, Supabase reiniciando) sem intervenção
 * do usuário e SEM jamais mostrar tela zerada com dados existentes.
 *
 * Sem dependências de stores para evitar import circular.
 */

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Agenda uma nova tentativa (deduplicada por chave). */
export function scheduleInitRetry(key: string, fn: () => void, delayMs = 30_000): void {
  if (pending.has(key)) return;
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    fn();
  }, delayMs));
}

/** Cancela tudo — chamar no logout. */
export function cancelInitRetries(): void {
  pending.forEach(t => clearTimeout(t));
  pending.clear();
}
