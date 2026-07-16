const express = require('express');
const crypto = require('crypto');
const PaymentService = require('../services/PaymentService');
const pool = require('../config/database');
const { mpInstance } = require('../services/MercadoPagoService');

const router = express.Router();

// WARN de secret ausente: loga alto mas com rate-limit (1x a cada 15min)
// pra não inundar o log em produção com tráfego de webhook normal.
let _lastNoSecretWarn = 0;
const _NO_SECRET_WARN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Valida a assinatura HMAC do webhook MP (formato oficial: header
 * x-signature "ts=...,v1=..." + manifest id/request-id/ts).
 *
 * Regra (CVE #2 da auditoria, fixada 2026-07-15):
 * - Secret configurado (painel admin OU env) → assinatura é OBRIGATÓRIA.
 *   Headers ausentes/malformados/hash errado = rejeita. Antes, bastava
 *   omitir os headers pra pular a validação inteira.
 * - Secret NÃO configurado → aceita (compat com operação atual) mas loga
 *   WARN alto pro JOs configurar.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
function validarAssinaturaMP(req, dataId) {
  // Secret do painel admin (settings.mp_webhook_secret, carregado pelo
  // MercadoPagoService) tem prioridade; env como fallback. Antes deste fix
  // o secret configurado via painel era simplesmente IGNORADO aqui.
  const webhookSecret = mpInstance.webhookSecret || process.env.MP_WEBHOOK_SECRET || null;

  if (!webhookSecret) {
    const now = Date.now();
    if (now - _lastNoSecretWarn > _NO_SECRET_WARN_INTERVAL_MS) {
      _lastNoSecretWarn = now;
      console.warn('[WEBHOOK MP] [ALERTA] MP_WEBHOOK_SECRET não configurado (nem env, nem painel admin). Webhook aceita POST sem validação de assinatura. Configure a "Assinatura secreta" do webhook no painel do Mercado Pago e salve em Configurações > mp_webhook_secret.');
    }
    return { ok: true, reason: 'sem secret configurado (aceito por compatibilidade)' };
  }

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!signature || !requestId) {
    return { ok: false, reason: 'headers x-signature/x-request-id ausentes' };
  }

  const ts = signature.match(/ts=(\d+)/)?.[1];
  const v1 = signature.match(/v1=([a-f0-9]+)/)?.[1];
  if (!ts || !v1) {
    return { ok: false, reason: 'x-signature malformado (sem ts/v1)' };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

  // Comparação em tempo constante (evita timing attack no HMAC)
  const hashBuf = Buffer.from(hash, 'utf8');
  const v1Buf = Buffer.from(v1, 'utf8');
  if (hashBuf.length !== v1Buf.length || !crypto.timingSafeEqual(hashBuf, v1Buf)) {
    return { ok: false, reason: 'assinatura HMAC inválida' };
  }

  return { ok: true };
}

/**
 * POST /api/webhooks/mp
 * Webhook do Mercado Pago — recebe notificações de pagamento
 * 
 * O MP envia: { action, data: { id }, type }
 * Tipos relevantes: payment.created, payment.updated
 */
router.post('/mp', async (req, res) => {
  try {
    // Responde 200 imediatamente (MP exige resposta rápida)
    res.status(200).json({ received: true });

    const { action, data, type } = req.body;

    console.log(`[WEBHOOK MP] Recebido: action=${action}, type=${type}, data.id=${data?.id}`);

    // Extrai payment_id — MP envia em 3 formatos diferentes
    let paymentId = null;
    if (type === 'payment' && data?.id) {
      // Formato 1: { type: 'payment', data: { id } }
      paymentId = String(data.id);
    } else if (action && action.startsWith('payment.') && data?.id) {
      // Formato 2: { action: 'payment.created', data: { id } }
      paymentId = String(data.id);
    } else {
      // Formato 3: query string ?id=X&topic=payment ou ?data.id=X&type=payment
      const queryId = req.query.id || req.query['data.id'];
      const queryTopic = req.query.topic || req.query.type;
      if ((queryTopic === 'payment') && queryId) {
        paymentId = String(queryId);
      }
    }

    // Garante que o secret do painel admin foi carregado do DB (lazy-load;
    // no-op depois da primeira vez). Sem isso, webhook chegando logo após o
    // boot validaria só contra o env var.
    try { await mpInstance._ensureLoaded(pool); } catch (_) { /* DB fora: cai no env */ }

    // Validação de assinatura — OBRIGATÓRIA quando secret está configurado.
    // (Antes: headers ausentes/malformados pulavam a validação = CVE #2.)
    const assinatura = validarAssinaturaMP(req, data?.id ?? req.query['data.id'] ?? req.query.id);
    if (!assinatura.ok) {
      console.warn(`[WEBHOOK MP] Assinatura REJEITADA (${assinatura.reason}). payment_id=${paymentId || '?'} ip=${req.ip || '?'} — requisição ignorada.`);
      try {
        await pool.query(
          `INSERT INTO audit_log (user_email, acao, recurso, recurso_id, dados_novos, ip, via)
           VALUES ('webhook-mp', 'webhook_assinatura_invalida', 'webhooks', $1, $2, $3, 'webhook')`,
          [paymentId || null, assinatura.reason, req.ip || null]
        );
      } catch (_) { /* audit_log pode não existir */ }
      return;
    }

    if (paymentId) {
      const startedAt = Date.now();
      const result = await PaymentService.processarWebhook(paymentId);
      const dt = Date.now() - startedAt;
      if (!result || result.processed === false) {
        console.warn(`[WEBHOOK MP] não processado (${dt}ms): ${JSON.stringify(result)}`);
      } else {
        console.log(`[WEBHOOK MP] OK (${dt}ms): ${JSON.stringify(result)}`);
      }
    }

  } catch (err) {
    // Loga stack apenas em dev; em prod só mensagem + payload mínimo.
    if (process.env.NODE_ENV === 'production') {
      console.error('[WEBHOOK MP] Erro:', err.message);
    } else {
      console.error('[WEBHOOK MP] Erro:', err);
    }
    // Não retorna erro — o res.status(200) já foi enviado pro MP
  }
});

/**
 * GET /api/webhooks/mp
 * O Mercado Pago pode fazer GET para verificar se o endpoint existe
 */
router.get('/mp', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'IMP Locadora MP Webhook' });
});

module.exports = router;
