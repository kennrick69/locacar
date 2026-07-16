# Relatório — Estado Atual da Auditoria (pré-hardening wave 3)

**Data**: 2026-07-15
**Auditor**: Claude (Fable 5), missão autônoma "LocaCar redondo, zerado, sem bugs"
**Base**: `AUDITORIA-IMPLOCADORA.md` (2026-05-25, waves 1+2) reavaliada contra o código em `main` (HEAD `e2b4332`)

## Working tree no início da missão (documentado antes de tocar)

- 12 arquivos "modified" (`Dockerfile`, `railway.toml`, `docker-compose.yml`, `README.md`, `deploy*.bat`, `.github/workflows/deploy.yml`, `.gitignore`, `.dockerignore`, `push.bat`, `setup-vps.sh`, `.claude/settings.local.json`) — **100% ruído CRLF/LF** (diff mostra linhas idênticas, 779+/779−; ver memória `feedback_crlf-wsl-windows`). Nenhum conteúdo real alterado. **Não commitados por esta missão.**
- `CLAUDE.md` untracked na raiz — persona "Executor Dev LocaCar" da IMP Dev Squad. Preservado, não commitado.

## Classificação issue a issue (auditoria original §2 + achados novos)

| # | Issue | Status | Evidência |
|---|-------|--------|-----------|
| CRÍTICO #1 | Webhook MP não valida VALOR pago | ✅ Fixed (wave 2) | `PaymentService.js:382-400` — compara `payment.valor_total` vs `transaction_amount`, tolerância 0.01, mismatch → audit_log + rejeita. Valida moeda BRL também (`:373-380`) |
| CRÍTICO #2 | `MP_WEBHOOK_SECRET` opcional — assinatura skip | ❌ **Não fixado** | `webhooks.js:23-44` — se headers `x-signature`/`x-request-id` **ausentes ou malformados**, processa mesmo com secret configurado. Pior: só lê `process.env.MP_WEBHOOK_SECRET` e **ignora** `mp_webhook_secret` configurado no painel admin (DB settings) |
| CRÍTICO #3 | `mp_payment_id` sem UNIQUE | ✅ Fixed (wave 2) | `server.js:562-578` — DO block idempotente: dedup (mantém MIN(id)) + `uq_payments_mp_payment_id` |
| CRÍTICO #4 | Race condition webhook (TOCTOU) | ✅ Fixed (wave 2) | `PaymentService.js:405-413` — `UPDATE ... WHERE status='pendente' RETURNING`; rowCount=0 → "race detectada e bloqueada" |
| ALTO #5 | DELETE driver sem soft-delete | ✅ Fixed (wave 2) | `drivers.js:1990+` — arquiva (deleted_at), libera carro, `users.ativo=false`, audit log, rota `/restore` |
| ALTO #6 | ON DELETE CASCADE nas FKs | 🚫 Mitigado/adiado | Soft-delete elimina o hard DELETE no caminho normal; CASCADE→RESTRICT continua no backlog (schema migration, decisão JOs) |
| ALTO #7 | Idempotência precisa row-lock | ✅ Coberto | UPDATE atômico do #4 cobre single-instance Railway (cenário atual) |
| ALTO #8 | JWT 7d sem refresh rotation | ❌ Adiado (decisão wave 2 mantida) | Derruba login de todos os motoristas; precisa plano de comunicação. Admin já tem JWT 4h via magic link |
| MÉDIO #9 | Rate-limit login frouxo | ⚠️ Parcial (aceitável) | `server.js:66-76` — login 30/15min (=2/min), token-login 10/15min, magic-link 5/15min. Dentro da faixa razoável; lockout por conta continua backlog |
| MÉDIO #10 | CSP unsafe-inline/eval | ❌ Adiado (consciente) | Remoção quebra SDK MP/checkout sem staging pra testar |
| MÉDIO #11 | Timezone CRON via JS Date | ❌ Adiado (baixo risco) | Dedup `SELECT ... WHERE driver_id AND semana_ref` protege contra duplicação (`server.js:748-752`) |
| MÉDIO #12 | UNIQUE(ordem) contract_clauses | ❌ Adiado (risco > benefício) | Reordenação de cláusulas pela UI faria duplicata transitória → UNIQUE quebraria o PUT. Re-seed atual já garante ordens únicas |
| Wave 2 §9.0-1 | ADMIN_PASSWORD fallback + magic link | ✅ Fixed | `auth.js:165-177` — admin com email em ADMIN_EMAILS **não loga mais com senha** (403 + audit); magic link é o único caminho (commit `a39dbe2`) |
| Wave 2 §9.2 | Credenciais MP mascaradas | ✅ Fixed | `settings.js` — GET mascara `***XXXX`; PUT de chave sensível exige claim `via='magic_link'` |
| Wave 2 §9.6 | Backup exportável | ✅ Fixed | `admin.js` — `/backup/export` + `/backup/stats`, adminOnly, credenciais MP excluídas, audit |
| Wave 2 §9.7 | Audit log | ✅ Fixed | tabela + registros em settings/magic-link/soft-delete/backup/webhook-mismatch |
| F1 wave 1 (14 fixes) | XSS emails, NaN guards, CEP cache, CRON singleton etc. | ✅ Fixed | commit `dfeb290`, confirmados no código |

## ACHADOS NOVOS desta re-auditoria (não estavam na auditoria original)

| # | Achado | Severidade | Onde |
|---|--------|-----------|------|
| N1 | **`POST /api/payments/:id/confirm` permite motorista confirmar o PRÓPRIO pagamento real sem pagar** — endpoint de "simular confirmação" não verifica se o pagamento é simulado. Motorista autenticado chama direto na API com o id do seu PIX pendente → status='pago' → `confirmarCaucao()` → liberado sem pagar. Bypass total do MP. | 🔴 P0 | `payments.js:350-402` |
| N2 | No mesmo endpoint: dupla contagem (`SUM(pagos)` já inclui o pagamento recém-atualizado dentro da transação **+ soma `p.valor` de novo**) → cobrança marcada paga antes da hora; e early-returns saem com `BEGIN` aberto (conexão volta ao pool com transação pendurada) | 🟠 P1 | `payments.js:355-390` |
| N3 | **`GET /api/payments/mp-diag` é `auth` sem `adminOnly`** — qualquer motorista vê preview do access token MP (15 chars), URLs e presença de env vars | 🟠 P1 | `payments.js:66-83` |
| N4 | `POST /api/payments/card-token` (semanal): não verifica `charge.pago` e cobra `valor_final` cheio ignorando pagamentos parciais já feitos → motorista paga duas vezes | 🟠 P1 | `payments.js:430-441` |
| N5 | `GET /api/payments/public-key` ignora `mp_public_key_test` quando `mp_modo='test'` e usa prioridade env>DB (inverso do `MercadoPagoService`, que é DB>env) → chave do frontend pode divergir do token do backend | 🟡 P2 | `payments.js:90-103` |
| N6 | `token-login` loga o token válido de 6 dígitos em texto claro a cada login (`console.log` linha 261) — token = 6 primeiros dígitos do CPF | 🟡 P2 | `auth.js:261` |
| N7 | Email de novo cadastro (`/register`) injeta `nome`/`email`/`telefone`/`endereco` sem `escapeHtml` — mesma classe de XSS corrigida na wave 1 em `drivers.js`, esquecida em `auth.js` | 🟡 P2 | `auth.js:119-133` |
| N8 | Boot não valida `JWT_SECRET` (ausente → crash em runtime no primeiro login; curto → brute-forceável) | 🟡 P2 | `server.js` start() |

## Verificações OWASP que PASSARAM (sem ação necessária)

- **A01**: todos os endpoints admin têm `auth, adminOnly` (grep completo em routes/); endpoints `/me/*` filtram por `req.user.id`; `GET /payments/:id` valida dono-ou-admin; abatimentos filtram `driver_id`. Únicas rotas públicas: vitrine (`GET /cars`, `GET /properties`), webhook MP, register/login/cep — corretas.
- **A03**: zero SQL injection — os 5 hits de interpolação em template literal usam whitelist hardcoded (`EXPORT_TABLES` em admin.js) ou field-names controlados por código com valores parametrizados (drivers.js).
- **A05**: helmet ativo com CSP; CORS restrito a `FRONTEND_URL` em produção (não `*`); `trust proxy 1`.
- **A07**: bcryptjs (não md5); senha admin desativada em favor de magic link.
- **A08**: `package-lock.json` presente em backend e frontend (versões efetivamente pinned no build); Dockerfile `node:20-alpine` (major pinned + healthcheck).
- **A10 SSRF**: `EXTERNAL_API_URL` é env-only (não configurável via API); proxy CEP usa hosts fixos com input sanitizado pra dígitos; `mp_webhook_url` é enviado ao MP como notification_url (MP faz o fetch, não nós).

## Plano wave 3 (aplicado nesta missão)

1. CVE #2 — assinatura webhook obrigatória quando secret existe (env OU painel), WARN alto se nenhum secret.
2. N1+N2 — `/confirm` restrito a pagamento simulado (`SIM_%`/sem mp_payment_id) ou admin; contagem e transação corrigidas.
3. N3 — `mp-diag` adminOnly.
4. N4 — card-token semanal: rejeita cobrança paga + cobra apenas o restante.
5. N5 — public-key respeita modo test e prioridade DB (consistente com o service).
6. N6, N7, N8 — log sem token, escapeHtml no email de registro, warn de JWT_SECRET no boot.

Detalhes antes/depois em `RELATORIO_LOCACAR_HARDENING.md`.
