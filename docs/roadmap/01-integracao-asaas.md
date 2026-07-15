# Roadmap — Integração de pagamentos (Asaas)

> Estudo de viabilidade aprovado para atualização futura. NÃO implementado.

## Fluxo

1. Cliente da agência → cliente no Asaas (`POST /customers`, guardar `asaas_customer_id` em `clients`).
2. Cobrança → `POST /payments` (BOLETO/PIX, valor, vencimento) → URL do boleto + QR Pix.
   Mensalidades → `POST /subscriptions` (Asaas gera todo mês sozinho).
3. Baixa automática: webhook Asaas → Edge Function → `financial_movements.status = paid`.
4. Sinergia: enviar link de cobrança + lembretes via WAHA/Meta (WhatsApp).

## Regras de arquitetura (inegociáveis)

- Chave de API do Asaas movimenta dinheiro → **nunca no frontend**. Tabela
  `company_secrets` SEM política de SELECT para o cliente (apenas service_role);
  todas as chamadas via Edge Function.
- Cada agência tem a própria conta Asaas (KYC próprio) e cadastra a própria chave.
- Webhook idempotente + validação do token `asaas-access-token`.
- Asaas é a fonte da verdade do status de pagamento; o sistema espelha, nunca decide.
- Integração isolada: falha no Asaas não pode afetar o restante do sistema.

## Mudanças de banco

- `clients.asaas_customer_id`
- `financial_movements`: + `asaas_payment_id`, `billing_type`, `invoice_url`
- Nova tabela `company_secrets` (service_role only)

## Fases

| Fase | Entrega |
|---|---|
| 1 | Botão "Gerar cobrança" (boleto/Pix) + link/QR na tela + webhook de baixa automática |
| 2 | Assinaturas recorrentes por cliente |
| 3 | Cobrança via WhatsApp (link, lembrete de vencimento, aviso de atraso) + painel de inadimplência |

## Riscos mapeados

- LGPD: passa a armazenar CPF/CNPJ dos clientes finais.
- Casos de borda: pagamento após vencimento, estorno, duplicado, valor divergente.
- Custo por cobrança liquidada é da agência (conta própria).
- Testar 100% no sandbox (`sandbox.asaas.com`) antes de produção.

## Decisões pendentes

1. Confirmar Asaas (alternativas: Efí, Iugu, Mercado Pago).
2. Boleto + Pix ou só boleto.
3. Começar pela Fase 1 ou já com recorrência.
