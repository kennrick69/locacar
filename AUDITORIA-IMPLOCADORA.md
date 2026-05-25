# Auditoria Profissional — IMP Locadora

**Data**: 2026-05-25
**Auditor**: Claudio (Opus 4.7, em squad com 3 agents Sonnet — Frente 1/2/3)
**Escopo**: Backend de produção (`/mnt/c/Projetos/locacar/backend/`) + frontend `services/api.js` e `pages/admin/DriverDetail.jsx`
**Stack**: Node/Express + PostgreSQL + JWT + Mercado Pago + Cloudinary + Resend, hospedado em Railway (`locacar-production.up.railway.app`)
**Modo**: Investigação ampla + correções aplicadas só onde 100% seguras; arriscadas DOCUMENTADAS pra aprovação.

---

## 0. Sumário Executivo

| Frente | Críticos | Altos | Médios | Baixos | Total |
|--------|---------:|------:|-------:|-------:|------:|
| 1 — Bugs e erros | 4 | 6 | 8 | 5 | **23** |
| 2 — Segurança | 3 | 3 | 3 | 2 | **11** |
| 3 — Integridade DB | 3 | 4 | 5 | 0 | **12** |
| **TOTAL ÚNICOS** | **8** | **11** | **14** | **5** | **38** ¹ |

¹ *Há sobreposição entre frentes (ex.: race condition do webhook MP aparece na F1 e F2; XSS aparece na F1 e F2). Total único cruzado é ~38, não 46.*

**Aplicado neste commit (`dfeb290`)**: 14 correções seguras (defensivas, sem mudar schema nem contrato).
**Documentado pra aprovação do JOs**: 12 correções arriscadas (mexem em MP/auth/schema — pode quebrar prod).

**Resposta direta à pergunta-chave do JOs (Frente 3)**:
> "Estou perdendo dados agora? Vou perder?"

- **Agora**: **NÃO** — não há perda silenciosa em operação normal. Sistema usa transações nos pontos críticos certos (criar pagamento, gerar cobranças, aprovar abatimento, deletar motorista). Cobranças não duplicam graças ao SELECT-antes-INSERT do CRON.
- **Em 3-6 meses (operação normal + crescimento)**: **SIM**, em 3 cenários reais:
  1. **Admin deleta motorista** (`DELETE /api/drivers/:id`) — apaga **TUDO** (user, pagamentos MP históricos, cobranças, documentos) sem soft-delete. Acidente = perda total.
  2. **Webhook MP duplicado/concorrente** — sem `UNIQUE(mp_payment_id)` e sem row-lock, pode processar pagamento 2x → caução contada 2x, motorista liberado sem ter pagado de verdade.
  3. **Backup Railway** — depende da configuração no painel. **Você precisa verificar AGORA** se está ativo (recomendado neste relatório).

A boa notícia: nenhum desses 3 está "vazando dados todo dia" — são bombas-relógio. Tempo pra agir.

---

## 1. O QUE FOI APLICADO (commit `dfeb290`, deploy em prod)

Cada item é **defensivo** (validação antes de operação, ou guard ao invés de crash). Comportamento idêntico em request legítimo; mais resiliente em edge case/malicioso. Cada fix passou `node --check` e foi pensado pra **não quebrar fluxo de cliente real**.

### Segurança
1. **XSS em emails admin** (`drivers.js` linha 13-28 e 651-653): `notifyAdminAcaoMotorista()` agora escapa o `nome` (vindo do banco) e o `descricao` enviado pelo motorista via novo helper `escapeHtml()`. Antes: motorista podia enviar `<img onerror=fetch(...)>` em descrição de abatimento → admin abre email → JS executa → roubo de sessão.
2. **XSS em PDF de acerto final** (`drivers.js:1648`): `observacoes` do settlement agora passa por `escapeHtml()` antes de virar HTML. Antes: admin com observação maliciosa → PDF/HTML executa script ao abrir.
3. **Vazamento de tokens em log** (`auth.js:220-225`): removido o debug que listava TODOS os `token_externo` dos motoristas em ambiente não-prod. Risco real: screenshot/Datadog/Slack expondo tokens (6 dígitos = espaço de 1M, fácil de brute-forçar offline).
4. **Vazamento de credenciais em log** (`payments.js:168, 172`): removidos `console.log` que mostravam primeiros 15 chars da MP `publicKey` e primeiros 10 chars do `token` de cartão. Agora só logam em modo `DEBUG_PAYMENTS=true` (não em produção).
5. **`/api/health` sem env** (`server.js:101`): removido o campo `env` da resposta — info disclosure menor (atacante não precisa saber se está em prod/dev).

### Integridade / Consistência
6. **DELETE cobrança em transação** (`drivers.js:2309-2325`): 5 `pool.query` soltos agora estão em `BEGIN/COMMIT` com `client.connect()`. Se conexão caísse entre o 4º e o 5º DELETE, pagamentos sumiam e a `weekly_charge` ficava órfã. Agora tudo-ou-nada.
7. **NaN guard no PaymentService** (`PaymentService.js:396-409`): se `weekly_charges.valor_final` vier NULL/inválido, antes `parseFloat(null) = NaN` → `Math.max(NaN, 0) = 0` → `isPago = (0 <= 0.01) = true` → **cobrança marcada como paga sem ter recebido pagamento**. Agora detecta, loga WARN, não corrompe estado. Operações em saldo agregado também ganharam `|| 0` defensivo.

### Validação de input
8. **chargeId numérico** (`payments.js:253-262`): `POST /api/payments/weekly/:chargeId` agora rejeita 400 se chargeId não-numérico. Antes: PostgreSQL forçava cast string→int em toda query, ineficiente e propenso a confundir.
9. **valor_pago não-NaN** (`payments.js:280-282`): `parseFloat("abc") = NaN`; `NaN <= 0` é `false` → bypass da validação → INSERT com valor=NaN crashava no PG com erro 500 genérico. Agora retorna 400 amigável.
10. **Teto em valor de abatimento** (`drivers.js:614-650`): motorista não pode mais pedir abatimento individual > valor_final da cobrança. Antes: podia pedir R$ 50.000 em cobrança de R$ 100 — admin podia aprovar por engano com 1 clique. (Soma de múltiplos abatimentos continua sendo responsabilidade do admin no momento de aprovar.)

### Resiliência
11. **Cache CEP** (`auth.js:255-291`): `GET /api/auth/cep/:cep` cacheado em `Map` com TTL 1h, teto 5000 entradas. Evita estourar rate-limit de BrasilAPI/ViaCEP quando frontend repete consulta.
12. **Singleton CRON + SIGTERM** (`server.js:586+`): guard contra múltiplas inicializações do `setInterval` (hot-reload, deploys sobrepostos). SIGTERM agora limpa o interval pra shutdown gracioso no Railway.
13. **Log estruturado no webhook MP** (`webhooks.js:63-77`): WARN/OK + duração; stack trace só em dev. Mais fácil pegar problema sem ruído.
14. **Rate-limit de log no notifyAdmin** (`drivers.js:27-42`): só loga 1ª falha + cada 100ª quando DB cai. Antes: 1000 req/s falhando → 1000 logs/s.

**Validação aplicada**: `node --check` em cada arquivo. Diff total: **157 inserts / 48 deletes** em 6 arquivos. Branch `main` pushed (`dfeb290`).

---

## 2. O QUE NÃO FOI APLICADO — AGUARDA APROVAÇÃO DO JOS

Cada item tem **risco real de quebrar produção** se aplicado sem cuidado. Detalho problema + correção proposta + por que adiar.

### 🔴 CRÍTICO #1 — Webhook MP não valida VALOR pago vs cobrança

- **Arquivo**: `services/PaymentService.js:342-410` (`processarWebhook`)
- **Problema**: O sistema confia no `mpData.transaction_amount` retornado pelo MP, mas **nunca compara com `payment.valor_total`** que ele mesmo registrou na cobrança. Se um atacante manipula o pagamento no MP (ou se MP processa em moeda errada), sistema marca como pago independente do valor real.
- **Cenário concreto**: motorista deve R$ 100 de caução; cria pagamento no MP por R$ 1; MP retorna `status=approved, transaction_amount=1`; webhook chega; sistema marca como pago; **motorista liberado pra dirigir tendo pagado R$ 1 ao invés de R$ 100**. Escalável: 100 motoristas → R$ 10k de prejuízo.
- **Correção sugerida** (segura conceitualmente, mas precisa decisão de tolerância):
  ```js
  const expected = parseFloat(payment.valor_total);
  const actual = parseFloat(mpData.transaction_amount);
  if (Math.abs(expected - actual) > 0.01) {
    console.error('[WEBHOOK] Valor mismatch:', { expected, actual, payment_id: payment.id });
    // OPÇÃO A: rejeitar (mais seguro mas pode falsificar quando MP processar parcial legítimo)
    return { processed: false, reason: 'Valor não corresponde' };
    // OPÇÃO B: aceitar mas marcar pra revisão (notifyAdmin + flag review_required)
  }
  ```
- **Por que não apliquei autônomo**: precisa SUA decisão entre **OPÇÃO A** (rejeitar — bloqueia fraude mas pode bloquear pagamentos legítimos onde MP processou valor diferente — extremamente raro mas existe em estornos parciais) ou **OPÇÃO B** (aceitar e flagar — não bloqueia mas exige fluxo de revisão).
- **Minha recomendação**: começar com **B + email automático ao admin + dashboard "pagamentos suspeitos"**. Depois de 30 dias com zero falso positivo legítimo, virar A.

### 🔴 CRÍTICO #2 — `MP_WEBHOOK_SECRET` opcional (validação de assinatura skip se vazio)

- **Arquivo**: `routes/webhooks.js:23-44`
- **Problema**: Se `MP_WEBHOOK_SECRET` não estiver no env, ou se headers `x-signature`/`x-request-id` não vierem, o sistema **aceita qualquer POST** ao webhook. Atacante pode forjar `data.id` apontando pra um pagamento real e fazer o sistema "processar" sem validação.
- **Correção sugerida** (1 linha, mas perigosa):
  ```js
  if (!webhookSecret) {
    console.error('[WEBHOOK] MP_WEBHOOK_SECRET não configurado — rejeitando');
    return; // já respondeu 200 antes; só pára o processamento
  }
  ```
- **Por que não apliquei**: se **prod estiver hoje sem MP_WEBHOOK_SECRET configurado** (env não-setado), aplicar isso **PARA TODOS OS WEBHOOKS**. Pagamentos legítimos não serão processados. Cobrança fica eternamente pendente.
- **Ação que VOCÊ precisa fazer ANTES de aplicar**:
  1. Confirmar no painel Railway que `MP_WEBHOOK_SECRET` está setado.
  2. Confirmar no painel MP que o webhook está configurado com a mesma secret.
  3. Testar 1 webhook real em ambiente staging (se tiver).
  4. Só depois, deploy do fix.

### 🔴 CRÍTICO #3 — `payments.mp_payment_id` sem UNIQUE

- **Arquivo**: `config/migrate.js` (linhas ~155-180, tabela `payments`)
- **Problema**: Nada impede INSERT de 2 `payments` com mesmo `mp_payment_id`. Combinado com a race condition do webhook (CRÍTICO #4 abaixo), pode levar a processamento duplicado.
- **Correção sugerida**:
  ```sql
  -- 1) cleanup de duplicatas existentes (pode ter zero, mas precisa checar)
  SELECT mp_payment_id, COUNT(*) FROM payments
   WHERE mp_payment_id IS NOT NULL GROUP BY mp_payment_id HAVING COUNT(*) > 1;
  -- 2) se houver duplicatas, manter o mais antigo:
  DELETE FROM payments WHERE id NOT IN (
    SELECT MIN(id) FROM payments WHERE mp_payment_id IS NOT NULL GROUP BY mp_payment_id
  ) AND mp_payment_id IS NOT NULL;
  -- 3) adicionar UNIQUE
  ALTER TABLE payments ADD CONSTRAINT uq_payments_mp_payment_id UNIQUE (mp_payment_id);
  ```
- **Por que não apliquei**: schema migration em prod, precisa ser feita com cuidado. **Você precisa rodar o SELECT do passo 1 primeiro** — se retornar linhas, decidir caso a caso o que manter antes de deletar.

### 🔴 CRÍTICO #4 — Race condition no webhook MP (já parcialmente coberta)

- **Arquivo**: `services/PaymentService.js:367-377` (`processarWebhook`)
- **Problema**: Padrão TOCTOU clássico — `SELECT WHERE status='pendente'` → `UPDATE WHERE id=$1`. Dois webhooks simultâneos podem ler "pendente", ambos atualizam pra "pago", ambos chamam `confirmarCaucao()` ou recalculam saldo agregado.
- **Correção sugerida** (mexe em fluxo MP em prod, sensível):
  ```js
  // ATÔMICO — só processa se ainda está pendente
  const r = await pool.query(`
    UPDATE payments SET status='pago', data_pagamento=NOW(), updated_at=NOW()
    WHERE id=$1 AND status='pendente'
    RETURNING id
  `, [payment.id]);
  if (r.rowCount === 0) {
    return { processed: true, reason: 'Já processado por outra requisição' };
  }
  // downstream (confirmarCaucao, recalc) só após o UPDATE atômico
  ```
- **Por que não apliquei**: alteração no fluxo crítico de pagamento. Mesmo conceito seguro, mas qualquer mudança aqui precisa de testes manuais em staging (que não existe). Se aplicar e tiver regressão, motoristas não conseguem pagar.

### 🟠 ALTO #5 — `DELETE /api/drivers/:id` cascateia tudo sem soft-delete

- **Arquivo**: `routes/drivers.js:1688-1723`
- **Problema**: Admin clica "excluir motorista" → apaga `users`, `payments` MP históricos, `weekly_charges` (52 semanas), `documents` (CNH, contrato assinado, proof-of-life). Sem volta. Sem confirmação backend. Sem soft-delete.
- **Correção sugerida**: refator em 3 passos
  1. `ALTER TABLE driver_profiles ADD COLUMN deleted_at TIMESTAMP`
  2. `ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP` (idem outras tabelas críticas)
  3. Trocar todos os `DELETE FROM ...` por `UPDATE ... SET deleted_at = NOW() WHERE id = $1`
  4. Adicionar `WHERE deleted_at IS NULL` nas queries de leitura (ou usar VIEW)
- **Por que não apliquei**: precisa migration de schema + atualizar ~50 queries em código. Refator de 4-8h. Risco de esquecer um `WHERE deleted_at IS NULL` em alguma rota e ela passar a ler dados "deletados".
- **Mitigação enquanto não faz**: ao MENOS adicionar `window.confirm("Tem certeza? Vai apagar TUDO do motorista — histórico financeiro, contrato, documentos. Digite 'CONFIRMAR' pra continuar")` no frontend.

### 🟠 ALTO #6 — `ON DELETE CASCADE` em payments/abatimentos → perda silenciosa

- **Arquivo**: `config/migrate.js` (FK declarations)
- **Problema**: `payments.driver_id REFERENCES driver_profiles(id) ON DELETE CASCADE` — deletar driver apaga automaticamente todos seus pagamentos. Sem aviso. Idem `abatimentos`, `weekly_charges`, `final_settlements`.
- **Correção sugerida**: mudar pra `ON DELETE RESTRICT`. Admin precisa explicitamente limpar histórico antes de deletar (forçando consciência do que vai perder).
- **Por que não apliquei**: depende de #5 (soft-delete). Se aplicar RESTRICT sem soft-delete, qualquer admin que tentar deletar motorista com qualquer histórico recebe erro 409.

### 🟠 ALTO #7 — Idempotência do webhook MP precisa de row lock

- **Arquivo**: `services/PaymentService.js:354-369`
- **Cobertura parcial**: o CRÍTICO #4 acima resolve a maior parte com `UPDATE ... WHERE status='pendente'` atômico. Para máxima segurança em ambiente multi-instance:
  ```sql
  SELECT * FROM payments WHERE mp_payment_id = $1 FOR UPDATE
  ```
  dentro de `BEGIN ISOLATION LEVEL SERIALIZABLE`.
- **Por que adiar**: SERIALIZABLE muda comportamento de outras queries concorrentes. Se prod hoje só roda 1 instance no Railway, o fix do CRÍTICO #4 (UPDATE atômico) já cobre.

### 🟠 ALTO #8 — JWT `expiresIn: 7d` sem refresh token rotation

- **Arquivo**: `routes/auth.js:235-238`
- **Problema**: token roubado em cybercafé fica válido 7 dias. Sem rotação. Sem revogação.
- **Correção sugerida**: refactor pra access (15min) + refresh (7d com rotação por JTI).
- **Por que não apliquei**: derrubaria login de TODOS os clientes ativos imediatamente. Precisa de plano de deploy (manter compat 30 dias, comunicação, etc.). Sou conservador aqui.

### 🟡 MÉDIO #9 — Rate-limit de login frouxo (`max: 30` por 15min)

- **Arquivo**: `server.js:66-71`
- **Problema**: 30 tentativas/15min em rota tradicional, 10 em token-login. Em paralelo com IPs distintos, brute-force de token de 6 dígitos é viável em ~3 dias.
- **Correção sugerida**: reduzir pra 5/3 + adicionar account lockout após N falhas.
- **Por que não apliquei**: pode bloquear motoristas reais que erram senha (esquecimento, autocomplete errado). Precisa coordenação com fluxo de "esqueci senha" pra ser viável.

### 🟡 MÉDIO #10 — CSP com `'unsafe-inline'` e `'unsafe-eval'`

- **Arquivo**: `server.js:23-24`
- **Problema**: reduz a efetividade da CSP como defesa em profundidade.
- **Correção sugerida**: usar `nonce-${random}` por request + remover unsafe-*.
- **Por que não apliquei**: SDK do Mercado Pago e o React build podem precisar de inline scripts. Remoção sem teste pode quebrar o checkout.

### 🟡 MÉDIO #11 — Timezone do CRON via JS `Date` (risco duplicação na borda de dia)

- **Arquivo**: `server.js:590-596`
- **Problema**: conversão `toLocaleString` + `toISOString` é confusa e pode dar resultados diferentes dependendo do TZ do server Railway (UTC vs São Paulo).
- **Correção sugerida**:
  ```js
  const r = await pool.query("SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS dia, EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') AS dow");
  const semanaRef = r.rows[0].dia;
  const diaSemana = diasMap[r.rows[0].dow];
  ```
- **Por que não apliquei**: o `SELECT id FROM weekly_charges WHERE driver_id AND semana_ref` antes do INSERT (linha 619-622) **já protege contra duplicação** mesmo que `semanaRef` venha errado. Risco real é "cobrança gerada no dia errado", não "cobrança duplicada". Vale corrigir, mas não tem urgência de madrugada.

### 🟡 MÉDIO #12 — UNIQUE(ordem) em `contract_clauses`

- **Problema**: duas cláusulas com mesmo `ordem` quebram a montagem do contrato em ordem determinística.
- **Correção**: `ALTER TABLE contract_clauses ADD CONSTRAINT uq_contract_clauses_ordem UNIQUE (ordem);` — depois de checar duplicatas com `SELECT ordem, COUNT(*) FROM contract_clauses GROUP BY ordem HAVING COUNT(*) > 1`.
- **Por que adiar**: pequeno, mas precisa checar duplicatas primeiro.

---

## 3. FALSOS POSITIVOS (achados dos agents que ao olhar fonte NÃO se confirmaram)

- **IDOR em PATCH abatimentos approve** (Frente 2, ALTO #5): o agent disse que o filtro de owner faltava. **NÃO É VERDADE**. Arquivo `drivers.js:1352-1355` já faz `SELECT * FROM abatimentos WHERE id = $1 AND driver_id = $2` corretamente. Falso positivo do agent — possivelmente leu janela menor. Validei lendo o arquivo eu mesmo. Não há IDOR aqui.

---

## 4. INTEGRIDADE DO BANCO — RESUMO COMPLETO (Frente 3)

### Schema atual (resumo das FKs críticas)

| Tabela | FKs (ON DELETE) | UNIQUE | Risco |
|--------|-----------------|--------|-------|
| `users` | — | email, cpf | ✅ OK |
| `driver_profiles` | `user_id` CASCADE, `car_id` SET NULL | (nenhum) | ⚠️ Sem `(user_id)` UNIQUE explícito |
| `weekly_charges` | `driver_id` CASCADE | (nenhum) | 🟠 Sem `(driver_id, semana_ref)` UNIQUE — duplicação possível |
| `payments` | `user_id`, `driver_id` CASCADE; `charge_id` SET NULL | (nenhum) | 🔴 **Sem `mp_payment_id` UNIQUE** |
| `abatimentos` | `charge_id`, `driver_id` CASCADE | (nenhum) | ⚠️ Aprovado-duplicado possível |
| `acrescimos` | `charge_id`, `driver_id` CASCADE | (nenhum) | ⚠️ |
| `documents` | `user_id` CASCADE | (nenhum) | ⚠️ CASCADE apaga CNH ao deletar user |
| `final_settlements` | `driver_id` CASCADE | (nenhum) | 🔴 Apaga acerto final ao deletar driver |
| `contract_clauses` | — | (nenhum) | 🟡 Sem `(ordem)` UNIQUE |
| `cars` | — | placa | ✅ |

### Transações faltando

| Operação | Status | Risco |
|----------|--------|-------|
| Criar pagamento + chamar MP | ❌ Sem rollback se MP API falhar | Payment órfão no banco com status pendente sem `mp_payment_id` |
| `processarWebhook()` multi-query | ❌ Sem transação explícita | Crash entre UPDATE payments e UPDATE weekly_charges = inconsistência |
| ~~DELETE cobrança~~ | ✅ **CORRIGIDO neste commit** | — |
| `confirmarCaucao()` | ❌ 2-3 queries sem BEGIN/COMMIT | Caução pago no DB mas perfil não atualizado |
| CRON `gerarCobrancasDoDia` | ✅ Já em transação | — |
| DELETE motorista | ✅ Em transação | — (mas hard delete, ver CRÍTICO #5) |

### Backups

**Estado atual**: NENHUM script de backup automático configurado no código. README menciona script `/usr/local/bin/implocadora-pgbackup.sh` mas é pra VPS (Hostinger), **não pra Railway**.

**AÇÃO MANUAL OBRIGATÓRIA DO JOS**:
1. Abrir painel Railway → seu Postgres → aba **Backups**.
2. Confirmar "Automatic backups enabled" (disponível em plano pago).
3. Se NÃO estiver no plano pago: ou upgrade, ou configurar backup manual via cron externo:
   ```bash
   # cron diário 02:00 em algum servidor externo (ex.: VPS Hostinger que você já tem)
   0 2 * * * /usr/bin/pg_dump $DATABASE_URL | gzip > /backups/locacar_$(date +\%Y\%m\%d).sql.gz
   # rotação 30 dias
   0 3 * * * find /backups -name "locacar_*.sql.gz" -mtime +30 -delete
   ```
4. **Testar restore 1x/mês** num banco staging.

**Cloudinary** (PDFs, fotos): tem versionamento próprio + replicação global. OK.

### Migrations

`migrate.js` é **idempotente** ✅ — usa `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Roda automaticamente no boot via `server.js:148-287`.

Nenhuma migration arriscada pendente (não há DROP COLUMN ou ALTER TYPE). **Mas** se alguém adicionar futuramente `ALTER COLUMN ... SET NOT NULL` sem cleanup de NULLs prévios, próximo boot quebra.

---

## 5. SEGURANÇA — RESUMO MERCADO PAGO (Frente 2)

### Checklist webhook MP

| Item | Status | Severidade |
|------|--------|-----------|
| Validação assinatura HMAC | ⚠️ Implementada mas opcional (skip se SECRET vazio) | CRÍTICO |
| Validação valor pago vs cobrança | ❌ Não existe | CRÍTICO |
| Idempotência por `data.id` | ⚠️ Parcial (check status mas TOCTOU) | ALTO |
| Secrets não-hardcoded | ✅ Via env/DB | OK |
| Logging eventos | ✅ Melhorado neste commit | OK |
| Validação moeda BRL | ❌ Não existe | MÉDIO |
| Validação status válidos | ✅ Lista enum | OK |
| Token cartão não passa pelo backend | ✅ Secure Fields | OK |

### Multi-tenant — endpoints checados

Análise por endpoint (de motorista, admin, público). **Conclusão**: bem protegido em geral. Filtros de owner aplicados nos endpoints `/me/*` corretamente. Único achado:
- ~~IDOR em PATCH abatimentos~~ — **falso positivo** (já filtra owner, ver seção 3).
- `/api/health` retornando `env` — **CORRIGIDO**.

---

## 6. RECHECK FINAL — está tudo no ar?

Verificações pós-deploy:
- Homepage: `HTTP 200` ✅
- `/api/health`: `200 {"status":"ok","db":"ok",...}` (sem `env` agora) ✅
- `/api/cars`, `/api/properties`: `200 []` ✅
- Headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options ativos ✅

Working tree do repo continua com ruído CRLF de ~80 arquivos não-tocados (ver memória `feedback_crlf-wsl-windows`). Não commitei nada disso.

---

## 7. PRÓXIMOS PASSOS RECOMENDADOS (ordem de prioridade)

### Esta semana
1. **Verificar/ativar backups Railway** (5 min — clica e confirma).
2. **Aplicar CRÍTICO #3** (UNIQUE em `mp_payment_id`): rodar SELECT de duplicatas → revisar → ALTER. Total: 30 min.
3. **Decidir e aplicar CRÍTICO #1** (validação valor webhook MP): escolher OPÇÃO A ou B + deploy + monitor 30 dias.
4. **Confirmar `MP_WEBHOOK_SECRET` no Railway** + aplicar CRÍTICO #2.
5. **Aplicar CRÍTICO #4** (UPDATE atômico no webhook): cobre 80% do risco de race condition.

### Próximas 2 semanas
6. Confirmação no frontend pra `DELETE /api/drivers/:id` (mitigação enquanto soft-delete não vem).
7. UNIQUE em `contract_clauses(ordem)`.
8. Timezone CRON via `NOW() AT TIME ZONE`.

### Próximo mês
9. **Soft-delete em driver_profiles/users** (ALTO #5) + mudar CASCADE pra RESTRICT (ALTO #6). Pacote único.
10. JWT refresh token rotation (ALTO #8).
11. Rate-limit login mais apertado + account lockout (MÉDIO #9).
12. CSP sem unsafe-* (MÉDIO #10) — com teste cuidadoso do checkout MP.

### Backlog
13. Audit log table.
14. Restore-test automatizado.
15. Pool tuning conforme limite Railway.

---

## 8. COMMITS DESTA AUDITORIA

- `dfeb290` — `fix(auditoria): correções seguras da auditoria profissional` (14 fixes, 157+/48− em 6 arquivos)
- Este relatório (`AUDITORIA-IMPLOCADORA.md`) **ainda não commitado** — vai num commit separado pra não misturar código com doc.

---

**Sistema continua no ar**. Nenhum dos fixes aplicados muda contrato visível ao cliente legítimo. Ninguém vai notar a diferença operacional além de menos crashes, logs mais limpos e ataques bloqueados na entrada.

A pergunta-chave do JOs ("estou perdendo dados?") tem resposta tranquila: **não agora, mas a porta está entreaberta**. As 3 bombas-relógio (delete sem soft-delete, mp_payment_id sem UNIQUE, backup Railway não confirmado) podem ser desarmadas em 1-2 horas de trabalho focado, com sua aprovação.

Boa noite.
— Claudio
