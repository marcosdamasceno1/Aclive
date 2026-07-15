# Atendimento WhatsApp na plataforma (inbox)

> **v1 IMPLEMENTADA.** Provider segue a escolha em Configurações (WAHA ou Meta).
> Fases 2 e 3 (mídia, templates, atribuição de atendente) permanecem no roadmap.

## Checklist de deploy da v1

1. **SQL**: rodar `supabase/migrations/wa_inbox.sql` inteiro no SQL Editor
   (tabelas wa_chats/wa_messages, dedup, RLS, função wa_touch_chat, Realtime).
2. **Edge Functions** (Dashboard → Edge Functions → colar código → Deploy):
   - `waha-webhook`  ← `supabase/functions/waha-webhook/index.ts`
   - `meta-wa-webhook` ← `supabase/functions/meta-wa-webhook/index.ts`
3. **Painel**: Configurações → Integrações → WhatsApp → "Ativar recepção de
   mensagens" (gera o segredo e mostra as URLs prontas).
4. **WAHA** (se for o provider): no container, definir
   `WHATSAPP_HOOK_URL=<URL mostrada no painel>` e `WHATSAPP_HOOK_EVENTS=message`
   (somente `message`; `message.any` duplicaria as enviadas). Reiniciar.
5. **Meta** (se for o provider): developers.facebook.com → app → WhatsApp →
   Configuration → Webhook: colar Callback URL + Verify token do painel e
   assinar o campo `messages`.
6. Testar: enviar mensagem de um celular para o número → deve aparecer na aba
   Atendimento em segundos (Realtime) e o badge verde no menu deve subir.

## Decisões tomadas na v1

- Somente conversas individuais (grupos ignorados pelo webhook).
- Um número por agência.
- Notificação por badge verde na sidebar (sem som).
- Mensagens de mídia aparecem como "[mídia — abra no celular]" (corpo/caption
  quando existir) — thread nunca fica com buraco silencioso.
- Mensagens enviadas são gravadas pelo painel (webhook ignora fromMe) —
  elimina a corrida de duplicação do eco.

## Veredito

Viável e estabilizável, com uma condição de arquitetura: o inbox NUNCA fala com
o provider diretamente para ler mensagens — tudo passa por um hub central no
Supabase (webhooks → tabelas → Realtime → UI). O provider é só transporte.

## O problema central: RECEBER (enviar já existe)

| | WAHA (não oficial) | Meta Cloud API (oficial) |
|---|---|---|
| Recepção | Webhook por evento + endpoints de histórico (`/api/{session}/chats`, `/messages`) | SOMENTE webhook; **não existe backfill** — histórico começa quando o webhook entra no ar |
| Janela de resposta | Livre | **24h após a última msg do cliente**; fora disso, só template aprovado |
| Custo por conversa | Zero (infra própria) | Responder dentro da janela: grátis; iniciar com template: pago |
| Risco de banimento | Real (viola ToS do WhatsApp) — uso 1:1 moderado reduz, não elimina | Zero |
| Número no celular | Continua usável no app | Número dedicado à API (sem uso no app, salvo coexistência ainda parcial) |
| Sessão | Pode cair (QR re-scan, update do WhatsApp quebra engine) | Estável |
| Mídia | Suportada (verificar limites WAHA Core vs Plus) | Suportada (baixar via API com token e persistir) |

## Arquitetura recomendada (hub central)

```
WAHA ──webhook──► Edge Function wa-inbound ─┐
Meta ──webhook──► Edge Function meta-inbound ┤─► tabelas chats/messages (RLS por company)
                                             │        │
UI (inbox) ◄── Supabase Realtime ◄───────────┘        ▼
   │                                     Supabase Storage (mídia persistida)
   └─ enviar: Edge Function wa-send → provider ativo (adapter)
```

- Tabelas novas: `wa_contacts`, `wa_chats`, `wa_messages` (direction, status,
  type, media_path, provider, timestamps) — isolamento por company_id.
- Realtime habilitado nas tabelas (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`).
- Adapter `ChatProvider` (sendText/sendMedia/markRead) por provider.
- Mídia SEMPRE persistida no Supabase Storage (não depender de URL do WAHA
  que morre em restart, nem de URL temporária da Meta).
- Vínculo automático conversa ↔ lead/cliente por telefone (sinergia com CRM).

## Bugs e problemas previstos

WAHA: queda de sessão (precisa banner de status + fluxo de reconexão via QR na
própria plataforma); diferenças de engine (WEBJS vs NOWEB) nos endpoints;
grupos/reações/mensagens editadas — deixar fora do escopo inicial; CORS se o
navegador falar direto com WAHA (evitado pelo hub); duplicação de eventos.

Meta: janela de 24h precisa ser VISÍVEL no inbox (estado + seletor de template
quando expirada); sem histórico anterior ao webhook; webhook exige resposta 200
rápida + dedup por `message_id`; verificação do app na Meta para volume.

Gerais: idempotência de webhooks (chave única provider+message_id); ordenação
por timestamp do provider; dois atendentes na mesma conversa (Realtime resolve);
notificação de nova mensagem (badge no menu; som opcional).

## Estabilidade — o que garante

1. Hub central: UI lê só do Supabase (fonte única, mesma resiliência dos stores).
2. Webhooks idempotentes com dedup por ID de mensagem.
3. Indicador de saúde da sessão WAHA sempre visível no inbox.
4. Escopo faseado: texto+imagem individual primeiro; nada de grupos/áudio/reações na v1.

## Fases

| Fase | Entrega |
|---|---|
| 1 | Infra de recepção (webhooks → tabelas) + tela inbox (lista de conversas + thread) + envio de texto + Realtime |
| 2 | Mídia (imagem/documento), status de entrega/leitura, janela 24h + templates (Meta), reconexão WAHA via QR no painel |
| 3 | Atribuição de conversa a atendente, notas internas, vínculo automático com lead/cliente do CRM |

## Decisões pendentes

1. Escopo v1: só conversas individuais (sem grupos)? (recomendado: sim)
2. Inbox único por agência (1 número) na v1? (recomendado: sim)
3. Notificações: badge/som no painel basta na v1?
