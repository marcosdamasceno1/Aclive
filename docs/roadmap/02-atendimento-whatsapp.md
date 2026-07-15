# Roadmap — Atendimento WhatsApp na plataforma (inbox)

> Estudo de viabilidade. NÃO implementado. Provider segue a escolha já existente
> em Configurações (WAHA ou Meta oficial).

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
