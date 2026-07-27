# Prospecção Apify com chave-mestra (backend) — IMPLEMENTADO

O dono do software banca a Apify. O usuário não cadastra token. Cota mensal
por agência com freios de custo.

## Regras

- Chave da Apify vive só na Edge Function `apify-search` (secret `APIFY_TOKEN`).
- Cota mensal por agência em EMPRESAS (não buscas — é o que custa na Apify):
  padrão **100 empresas/mês**; override em `companies.apify_monthly_limit`
  (editável na conta Master).
- `used` = SOMA de `result_count` do mês. O usuário digita quantas empresas
  quer por busca (1..100), limitado no servidor ao saldo restante → nunca
  estoura o custo. `result_count` é gravado ao concluir cada busca.
- Contagem mensal reseta sozinha ao virar o mês (sem cron).
- `company_id` vem do JWT verificado no servidor. Isolamento por agência.

## Deploy

1. **SQL**: rodar `supabase/migrations/apify_usage.sql` (tabela + coluna +
   RLS). Idempotente.
2. **Edge Function** `apify-search` (Dashboard → colar
   `supabase/functions/apify-search/index.ts` → Deploy):
   - Secret: `APIFY_TOKEN` = seu token da Apify.
   - **Verify JWT: DESLIGADO** (auth feita no código, como wa-gateway).
3. **Apify (backstop de custo)**: no painel da Apify, configure um **limite de
   gasto mensal** na conta. É a última barreira caso as cotas do app falhem.
4. Subir o novo dist.

## UX

- Aba Leads → "Buscar no Google": mostra "X/100" com barra (verde → âmbar em
  80% → vermelho no limite). Bloqueia a busca ao atingir o limite.
- Conta Master → cada agência tem campo "Buscas Google/mês" (vazio = padrão 100).

## Fluxo técnico (evita timeout de Edge Function)

`apify-search` tem 3 ações: `quota` (mostra X/limite), `start` (checa cota,
dispara o run, conta +1, devolve runId) e `poll` (frontend chama a cada 3s até
`SUCCEEDED`). Cada chamada é curta.
