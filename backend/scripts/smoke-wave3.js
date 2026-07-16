/**
 * SMOKE TEST — Wave 3 (hardening 2026-07-15)
 * Valida COMPORTAMENTO (não só sintaxe) dos fixes, sem precisar de Postgres:
 * injeta um pool fake no require.cache e sobe os routers reais em Express.
 *
 * Rodar:  node scripts/smoke-wave3.js
 * Saída:  [OK]/[ERRO] por caso; exit 1 se qualquer caso falhar.
 *
 * Casos:
 *  1. Webhook MP COM secret + SEM headers de assinatura  → NÃO processa (CVE #2)
 *  2. Webhook MP COM secret + assinatura INVÁLIDA        → NÃO processa
 *  3. Webhook MP COM secret + assinatura VÁLIDA          → processa
 *  4. Webhook MP SEM secret                              → processa (compat) + warn
 *  5. POST /payments/:id/confirm motorista + pagamento REAL (mp_payment_id numérico) → 403
 *  6. POST /payments/:id/confirm motorista + pagamento SIM_ → 200
 *  7. GET /payments/mp-diag como motorista               → 403 (era 200 antes do fix)
 */
process.env.JWT_SECRET = 'smoke-test-secret-0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const path = require('path');
const crypto = require('crypto');
const Module = require('module');

// ---------- Fake pool (injetado no require.cache) ----------
const state = {
  payments: {},           // id -> row
  updates: [],            // log de UPDATEs
  auditRows: [],
};

function fakeQuery(sql, params = []) {
  const s = String(sql);
  if (/INSERT INTO audit_log/i.test(s)) { state.auditRows.push({ sql: s, params }); return { rows: [], rowCount: 1 }; }
  if (/SELECT \* FROM payments WHERE id = \$1/i.test(s)) {
    const row = state.payments[String(params[0])];
    if (!row) return { rows: [], rowCount: 0 };
    if (s.includes('user_id = $2') && row.user_id !== params[1]) return { rows: [], rowCount: 0 };
    return { rows: [row], rowCount: 1 };
  }
  if (/UPDATE payments SET status = 'pago'/i.test(s)) {
    const row = state.payments[String(params[0])];
    if (!row || row.status !== 'pendente') return { rows: [], rowCount: 0 };
    row.status = 'pago';
    state.updates.push({ id: params[0] });
    return { rows: [{ id: row.id }], rowCount: 1 };
  }
  if (/SELECT COALESCE\(SUM\(valor\), 0\)/i.test(s)) return { rows: [{ total: '0' }], rowCount: 1 };
  if (/SELECT valor_final FROM weekly_charges/i.test(s)) return { rows: [], rowCount: 0 };
  if (/FROM settings/i.test(s)) return { rows: [], rowCount: 0 };
  if (/UPDATE driver_profiles SET caucao_pago/i.test(s)) return { rows: [], rowCount: 1 };
  if (/FROM weekly_charges/i.test(s)) return { rows: [], rowCount: 0 };
  if (/BEGIN|COMMIT|ROLLBACK/i.test(s)) return { rows: [], rowCount: 0 };
  return { rows: [], rowCount: 0 };
}
const fakePool = {
  query: async (sql, params) => fakeQuery(sql, params),
  connect: async () => ({ query: async (sql, params) => fakeQuery(sql, params), release: () => {} }),
  on: () => {},
};

// Injeta ANTES de qualquer require dos routers
const dbPath = require.resolve(path.join(__dirname, '..', 'src', 'config', 'database.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

// ---------- Sobe app com routers REAIS ----------
const express = require('express');
const jwt = require('jsonwebtoken');
const { mpInstance } = require('../src/services/MercadoPagoService');
const PaymentService = require('../src/services/PaymentService');

// Marca credenciais MP como "já carregadas" (evita reload do DB fake)
mpInstance._dbLoaded = true;

// Intercepta processarWebhook pra registrar chamadas
let webhookCalls = [];
const origProcessar = PaymentService.processarWebhook.bind(PaymentService);
PaymentService.processarWebhook = async (id) => { webhookCalls.push(id); return { processed: true, _mock: true }; };

const app = express();
app.use(express.json());
app.use('/api/webhooks', require('../src/routes/webhooks'));
app.use('/api/payments', require('../src/routes/payments'));

const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '[OK]  ' : '[ERRO]'} ${name}`);
}

function signMp(secret, dataId, requestId, ts) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}

async function main() {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const SECRET = 'segredo-webhook-teste';

  // ===== Caso 1: secret + sem headers → NÃO processa =====
  mpInstance.webhookSecret = SECRET;
  webhookCalls = [];
  await fetch(`${base}/api/webhooks/mp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment', data: { id: '111' } }),
  });
  await new Promise(r => setTimeout(r, 150)); // handler responde 200 antes de processar
  check('CVE#2: secret configurado + POST sem assinatura → webhook IGNORADO', webhookCalls.length === 0);
  check('CVE#2: tentativa registrada no audit_log', state.auditRows.some(a => /webhook_assinatura_invalida/.test(JSON.stringify(a))));

  // ===== Caso 2: secret + assinatura inválida → NÃO processa =====
  webhookCalls = [];
  await fetch(`${base}/api/webhooks/mp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': 'ts=123,v1=deadbeef', 'x-request-id': 'req-1' },
    body: JSON.stringify({ type: 'payment', data: { id: '111' } }),
  });
  await new Promise(r => setTimeout(r, 150));
  check('CVE#2: assinatura HMAC errada → webhook IGNORADO', webhookCalls.length === 0);

  // ===== Caso 3: secret + assinatura VÁLIDA → processa =====
  webhookCalls = [];
  const ts = String(Date.now());
  const v1 = signMp(SECRET, '222', 'req-2', ts);
  await fetch(`${base}/api/webhooks/mp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-2' },
    body: JSON.stringify({ type: 'payment', data: { id: '222' } }),
  });
  await new Promise(r => setTimeout(r, 150));
  check('Webhook com assinatura válida → PROCESSADO', webhookCalls.length === 1 && webhookCalls[0] === '222');

  // ===== Caso 4: SEM secret → processa (compat) =====
  mpInstance.webhookSecret = null;
  delete process.env.MP_WEBHOOK_SECRET;
  webhookCalls = [];
  await fetch(`${base}/api/webhooks/mp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment', data: { id: '333' } }),
  });
  await new Promise(r => setTimeout(r, 150));
  check('Sem secret configurado → aceita (retro-compat, com WARN no log)', webhookCalls.length === 1);

  // ===== Casos 5-6: /confirm guard =====
  const tokenMotorista = jwt.sign({ id: 42, email: 'm@x.com', role: 'motorista' }, process.env.JWT_SECRET);
  state.payments['10'] = { id: 10, user_id: 42, driver_id: 7, tipo: 'caucao', valor: '500', status: 'pendente', mp_payment_id: '987654321' };
  state.payments['11'] = { id: 11, user_id: 42, driver_id: 7, tipo: 'caucao', valor: '500', status: 'pendente', mp_payment_id: 'SIM_11' };

  const r5 = await fetch(`${base}/api/payments/10/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${tokenMotorista}` } });
  check('P0: motorista confirmando pagamento REAL → 403 (antes: 200 = bypass do MP)', r5.status === 403 && state.payments['10'].status === 'pendente');

  const r6 = await fetch(`${base}/api/payments/11/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${tokenMotorista}` } });
  check('Simulação: motorista confirmando pagamento SIM_ → 200 (fluxo preservado)', r6.status === 200 && state.payments['11'].status === 'pago');

  // ===== Caso 7: mp-diag motorista → 403 =====
  const r7 = await fetch(`${base}/api/payments/mp-diag`, { headers: { Authorization: `Bearer ${tokenMotorista}` } });
  check('mp-diag como motorista → 403 (antes vazava preview do access token)', r7.status === 403);

  server.close();
  const falhas = results.filter(r => !r.ok).length;
  console.log(`\n${falhas === 0 ? '[OK] TODOS OS ' + results.length + ' CASOS PASSARAM' : '[ERRO] ' + falhas + ' caso(s) falharam'}`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error('[ERRO] smoke crashou:', e); process.exit(1); });
