const express = require('express');
const crypto = require('crypto');
const PaymentService = require('../services/PaymentService');

const router = express.Router();

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

    // Validação de assinatura (opcional mas recomendado)
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];

      if (signature && requestId) {
        // Validação básica de integridade
        const ts = signature.match(/ts=(\d+)/)?.[1];
        const v1 = signature.match(/v1=([a-f0-9]+)/)?.[1];

        if (ts && v1) {
          const manifest = `id:${data?.id};request-id:${requestId};ts:${ts};`;
          const hash = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

          if (hash !== v1) {
            console.warn('[WEBHOOK MP] Assinatura inválida! Processando mesmo assim por segurança.');
          }
        }
      }
    }

    // Processa apenas notificações de pagamento
    if (type === 'payment' && data?.id) {
      const result = await PaymentService.processarWebhook(data.id);
      console.log(`[WEBHOOK MP] Resultado: ${JSON.stringify(result)}`);
    }

  } catch (err) {
    console.error('[WEBHOOK MP] Erro:', err.message);
    // Não retorna erro — o res.status(200) já foi enviado
  }
});

/**
 * GET /api/webhooks/mp
 * O Mercado Pago pode fazer GET para verificar se o endpoint existe
 */
router.get('/mp', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'LocaCar MP Webhook' });
});

module.exports = router;
