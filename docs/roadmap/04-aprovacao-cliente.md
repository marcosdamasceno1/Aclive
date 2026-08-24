# Aprovação de vídeo/legenda por link público — IMPLEMENTADO

O cliente aprova vídeo e legenda por um link, SEM login. A agência cria e
acompanha tudo dentro da demanda no Kanban.

## Fluxo

1. Kanban → abrir a demanda → "Criar link de aprovação": cola o link do vídeo
   (Google Drive), adiciona 1+ opções de legenda, nome da agência e WhatsApp
   de aviso. Gera um link público com token UUID.
2. Manda o link pro cliente. Ele abre sem login: vê o vídeo embutido (Drive),
   aprova/pede alteração no vídeo (com observação), escolhe uma legenda e
   aprova/pede alteração (com observação).
3. Ao enviar: a resposta volta organizada na demanda e a agência é avisada no
   WhatsApp. Se precisar de ajuste, a agência sobe nova versão no MESMO link
   (volta a "aguardando").

## Segurança

- Token UUID (2× randomUUID) — não sequencial, impossível de adivinhar.
- Página pública fala só com as Edge Functions `approval-get` / `approval-submit`
  (service_role, filtram por token). A tabela `approvals` NÃO é exposta ao anon.
- approval-get devolve só campos públicos (sem company_id, notify_phone, token).
- approval-submit valida statuses, limita tamanho dos textos e só aceita
  caption_choice que exista. Só edita a aprovação daquele token.
- Isolamento por company_id para o lado da agência (RLS).
- Nenhum segredo (Drive, WAHA, Supabase) exposto no frontend.

## Deploy

1. **SQL**: rodar `supabase/migrations/approvals.sql` (tabela + colunas +
   RLS). Idempotente.
2. **Edge Functions** (Dashboard → colar → Deploy), ambas com **Verify JWT
   DESLIGADO** (acesso público por token):
   - `approval-get`    ← `supabase/functions/approval-get/index.ts`
   - `approval-submit` ← `supabase/functions/approval-submit/index.ts`
     - Usa os secrets `WAHA_BASE_URL` e `WAHA_API_KEY` (já existentes) para o
       aviso no WhatsApp. Nada novo a configurar.
3. Subir o novo dist. O link do cliente é `SEU_DOMINIO/aprovar/<token>` — a
   rota já está no SPA (o .htaccess de SPA cobre).

## Requisito do Drive

O vídeo precisa estar como **"qualquer pessoa com o link pode ver"** no Google
Drive, senão o cliente não consegue ver o preview. O sistema avisa isso na hora
de criar. Há botão "Abrir no Drive" como reserva.
