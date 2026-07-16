# Servidor WAHA central — Growth Expert

Servidor único de WhatsApp que atende **todas as agências** por sessões
isoladas. O cliente nunca toca aqui: ele só escaneia o QR no painel, e o
gateway (Edge Function `wa-gateway`) cria e gerencia a sessão dele.

> A antiga separação "WAHA Core / WAHA Plus" não se aplica mais — multi-sessão
> e webhooks por sessão estão disponíveis na versão atual do WAHA. Basta subir
> a imagem `devlikeapro/waha:latest`.

## 1. Subir o WAHA

```bash
cd deploy/waha
cp .env.example .env
# edite .env e defina WAHA_API_KEY (openssl rand -hex 32) e a senha do dashboard
docker compose up -d
docker compose logs -f waha   # acompanhe o boot
```

O WAHA sobe em `http://SEU_SERVIDOR:3000`.

## 2. Colocar atrás de HTTPS (obrigatório)

O painel roda em HTTPS, então o WAHA também precisa. Um proxy reverso resolve.
Exemplo com **Caddy** (`/etc/caddy/Caddyfile`):

```
waha.seudominio.com {
    reverse_proxy localhost:3000
}
```

`systemctl reload caddy` e pronto: `https://waha.seudominio.com`.

## 3. Ligar no painel (Edge Function)

No Supabase → Edge Functions → `wa-gateway` → Settings → Secrets:

| Secret | Valor |
|---|---|
| `WAHA_BASE_URL` | `https://waha.seudominio.com` |
| `WAHA_API_KEY`  | a mesma `WAHA_API_KEY` do `.env` |

Deixe **Verify JWT LIGADO** nessa função. As funções `waha-webhook` e
`meta-wa-webhook` continuam com **Verify JWT DESLIGADO**.

## 4. Testar

No sistema: Configurações → Integrações → WhatsApp → **Conectar WhatsApp** →
escaneie o QR. O status vira "Conectado" e as mensagens fluem na aba
Atendimento.

## Configurações de estabilidade já embutidas

- `WHATSAPP_RESTART_ALL_SESSIONS=true` + volumes persistentes: se o container
  reiniciar, as sessões voltam **sem** o cliente precisar re-escanear.
- `WHATSAPP_DEFAULT_ENGINE=NOWEB`: engine leve, ideal para muitas sessões
  (baixo consumo de RAM comparado ao WEBJS).
- `healthcheck`: o Docker reinicia o container se o WAHA travar.

## Dimensionamento

Cada sessão consome memória. Com NOWEB, estime folga de RAM conforme o número
de agências ativas. Comece com um servidor de 2–4 GB e monitore; suba conforme
o volume. Este é um ponto único de falha — se o servidor cair, o atendimento de
todas as agências para (o banimento de um número, porém, é isolado por sessão).
