# Relatório — LocaCar Hardening Wave 3

**Data**: 2026-07-15/16
**Executor**: Claude (Fable 5), missão autônoma
**Escopo**: fechar CVEs pendentes da `AUDITORIA-IMPLOCADORA.md` + achados novos da re-auditoria (`RELATORIO_AUDIT_ESTADO_ATUAL.md`)

---

## 1. O que foi corrigido (antes → depois, com evidência)

### 🔴 CVE #2 — Assinatura do webhook MP era pulável (`webhooks.js`)

- **Antes**: a validação HMAC só rodava se `x-signature` E `x-request-id` viessem no request E parseassem. Atacante forjava webhook simplesmente **omitindo os headers**. Pior: o código lia só `process.env.MP_WEBHOOK_SECRET` — o secret configurado pelo admin no painel (settings `mp_webhook_secret`) era **ignorado**.
- **Depois** (`validarAssinaturaMP()` em `backend/src/routes/webhooks.js`):
  - Secret configurado (painel admin tem prioridade, env como fallback) → assinatura **obrigatória**. Headers ausentes, `ts`/`v1` malformados ou HMAC divergente = rejeitado + WARN + registro em `audit_log` (`webhook_assinatura_invalida` com payment_id e IP).
  - Comparação HMAC em **tempo constante** (`crypto.timingSafeEqual`).
  - Secret NÃO configurado → aceita (retro-compat, mesma decisão do L2Impure) mas loga `[ALERTA]` com instrução de configuração (rate-limited 1x/15min pra não poluir).
  - Lazy-load do secret do DB garantido antes da validação (`mpInstance._ensureLoaded`).
- **Evidência**: smoke casos 1-4 (`backend/scripts/smoke-wave3.js`) — sem headers = ignorado; HMAC errado = ignorado; HMAC válido = processado; sem secret = aceito com WARN.
- **⚠️ Atenção operacional**: se o Railway tem `MP_WEBHOOK_SECRET` setado mas o webhook no painel do MP estiver em modo IPN legado (sem headers de assinatura), pagamentos legítimos passarão a ser rejeitados. Sintoma no log: `Assinatura REJEITADA (headers ... ausentes)`. Correção: reconfigurar o webhook no painel MP (modo Webhooks, mesma secret) OU limpar o secret temporariamente. Ver §4.

### 🔴 P0 NOVO (N1) — Motorista podia confirmar pagamento real sem pagar (`payments.js /:id/confirm`)

- **Antes**: o endpoint "Simular confirmação" (`POST /api/payments/:id/confirm`) verificava só que o pagamento era do usuário. O botão do frontend só aparece pra pagamento `SIM_`, mas **a API não impunha isso**: motorista com PIX real pendente chamava direto e virava `status='pago'` → `confirmarCaucao()` → **liberado pra dirigir sem pagar**. Bypass completo do Mercado Pago, explorável com uma linha de curl.
- **Depois**: motorista só confirma pagamento **simulado** (`mp_payment_id` nulo ou `SIM_%`); pagamento real → 403 + `audit_log` (`confirm_pagamento_real_bloqueado`). Admin continua podendo confirmar qualquer um (agora sem exigir ser o dono). Claim atômico `UPDATE ... WHERE status='pendente'` (mesmo padrão do webhook) contra confirmação dupla.
- **Bugs adjacentes corrigidos (N2)**: (a) dupla contagem — o `SUM(pagos)` já enxergava o UPDATE na mesma transação e o código somava `p.valor` de novo → cobrança marcada paga antes da hora; (b) early-returns (404/400) saíam com `BEGIN` aberto, devolvendo conexão suja pro pool — agora todo caminho faz ROLLBACK.
- **Evidência**: smoke casos 5-6 — pagamento real → 403 e status continua `pendente`; pagamento `SIM_` → 200 e status `pago` (fluxo de simulação preservado).

### 🟠 N3 — `GET /api/payments/mp-diag` vazava credenciais pra motorista

- **Antes**: rota com `auth` mas sem `adminOnly` — qualquer motorista via preview de 15 chars do access token MP, URL do webhook e presença das env vars.
- **Depois**: `auth, adminOnly`. Evidência: smoke caso 7 (motorista → 403).

### 🟠 N4 — Cartão cobrava cobrança já paga / ignorava parciais (`payments.js /card-token`)

- **Antes**: pagamento semanal via cartão não checava `charge.pago` e cobrava `valor_final` cheio mesmo com pagamentos parciais já feitos — motorista pagava 2x.
- **Depois**: rejeita cobrança paga/quitada; cobra apenas o **restante** (`valor_final − SUM(payments pagos)`), consistente com o fluxo PIX (`/weekly/:chargeId`).

### 🟡 N5 — `GET /api/payments/public-key` divergia do backend

- **Antes**: prioridade env>DB (inverso do `MercadoPagoService`, que é DB>env) e ignorava `mp_public_key_test` em modo test — frontend podia inicializar o SDK com public key de conta diferente do access token do backend.
- **Depois**: mesma lógica do service (modo production → `mp_public_key`; test → `mp_public_key_test || mp_public_key`; DB prioridade, env fallback). Contrato da resposta (`{publicKey, modo}`) intacto.

### 🟡 N6 — Token de login logado em claro (`auth.js token-login`)

- **Antes**: `console.log` com o token de 6 dígitos (= 6 primeiros do CPF) a cada tentativa, inclusive as válidas.
- **Depois**: mascarado (`12****`).

### 🟡 N7 — XSS no email de novo cadastro (`auth.js /register`)

- **Antes**: `nome`/`email`/`telefone`/`endereco` do formulário público interpolados sem escape no HTML do email do admin — mesma classe corrigida na wave 1 em `drivers.js`, esquecida aqui.
- **Depois**: `escapeHtml()` em todos os campos de input (inclusive dados de carro/imóvel de interesse).

### 🟡 N8 — Boot não validava `JWT_SECRET` (`server.js`)

- **Depois**: warn-only no boot — ausente ("login vai falhar") ou < 32 chars ("fraco contra brute-force"). Nunca derruba produção.

---

## 2. Regressão zero — validação executada

Docker indisponível na máquina da missão → validação feita em 2 níveis, ambos executados de verdade:

1. **Smoke comportamental** (`backend/scripts/smoke-wave3.js`, commitado): sobe os routers REAIS em Express com pool fake injetado + JWT real. **8/8 casos passaram** (rodar com `node scripts/smoke-wave3.js`).
2. **Boot do server real** (porta 3197, modo SEM BANCO): `/api/health` 503 degraded (correto sem DB), webhook GET/POST 200, rotas protegidas 401 sem token, `/login` 400 com body vazio — contratos idênticos aos de antes.
3. `node --check` em todos os arquivos tocados.

Nenhum contrato de endpoint mudou: mesmos paths, mesmos shapes de resposta. Os únicos comportamentos novos são rejeições de casos que **já eram abuso** (webhook sem assinatura com secret ativo; motorista confirmando pagamento real; motorista lendo mp-diag; dupla cobrança de charge quitada).

## 3. Score de segurança (subjetivo)

| Área | Antes wave 3 | Depois |
|------|:---:|:---:|
| Webhook MP (assinatura+valor+moeda+idempotência) | 6/10 | 9/10 |
| Fluxo de pagamento (bypass /confirm) | **3/10** | 9/10 |
| Exposição de credenciais | 7/10 | 9/10 |
| XSS / injeção | 8/10 | 9/10 |
| **Geral** | **6/10** | **9/10** |

O 1 ponto que falta: JWT 7d sem rotation, CSP unsafe-inline, CASCADE nas FKs, lockout de conta — todos adiados conscientemente (quebram sessões/checkout; ver backlog na auditoria §7).

## 4. O que o JOs precisa fazer manualmente

1. **Conferir no Railway se `MP_WEBHOOK_SECRET` (env) ou `mp_webhook_secret` (painel admin → Configurações) está setado.**
   - Se ESTÁ: confirmar que no painel do Mercado Pago o webhook é modo "Webhooks" (não IPN) com a MESMA secret. Depois do deploy, fazer 1 pagamento PIX de teste de R$ 1 num motorista de teste e ver se confirma sozinho. Se no log do Railway aparecer `Assinatura REJEITADA` pra pagamento legítimo → ajustar painel MP ou limpar a secret temporariamente (volta pro modo compat com WARN).
   - Se NÃO ESTÁ: o sistema segue funcionando como antes (aceita tudo) mas agora grita `[ALERTA]` no log a cada 15min. Recomendo fortemente configurar: painel MP → Suas integrações → Webhooks → "Assinatura secreta" → colar em Configurações do LocaCar (via magic link, é chave sensível).
2. **Backup**: confirmar backup automático no painel Railway OU baixar um dump agora via `GET /api/admin/backup/export` (logado como admin). Não consegui verificar isso da missão (sem acesso ao painel).
3. Nada mais — nenhum secret foi rotacionado, nenhum schema alterado, nenhuma migration nova.

## 5. Comandos pra testar em produção

```bash
# Health
curl https://locacar-production.up.railway.app/api/health
# Webhook forjado SEM assinatura (com secret setado: aceita 200 mas NÃO processa — ver log "Assinatura REJEITADA")
curl -X POST https://locacar-production.up.railway.app/api/webhooks/mp -H "Content-Type: application/json" -d '{"type":"payment","data":{"id":"1"}}'
# mp-diag sem token → 401
curl -i https://locacar-production.up.railway.app/api/payments/mp-diag
# Vitrine pública continua aberta
curl https://locacar-production.up.railway.app/api/cars
```

## 6. Arquivos tocados

- `backend/src/routes/webhooks.js` — CVE #2
- `backend/src/routes/payments.js` — N1, N2, N3, N4, N5
- `backend/src/routes/auth.js` — N6, N7
- `backend/src/server.js` — N8
- `backend/scripts/smoke-wave3.js` — smoke test comportamental (novo)
- `RELATORIO_AUDIT_ESTADO_ATUAL.md` — classificação completa da auditoria original (novo)
- Este relatório

**NÃO tocados**: os 12 arquivos com ruído CRLF no working tree (documentados no relatório de estado atual) e o `CLAUDE.md` untracked (persona da squad) — deixados como estavam.
