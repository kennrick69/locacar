const express = require('express');
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const PaymentService = require('../services/PaymentService');
const { getMercadoPago, mpInstance } = require('../services/MercadoPagoService');

const router = express.Router();

/**
 * GET /api/payments/me
 * Lista pagamentos do motorista logado
 */
router.get('/me', auth, driverOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, wc.semana_ref
      FROM payments p
      LEFT JOIN weekly_charges wc ON wc.id = p.charge_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar pagamentos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/payments/admin
 * Lista todos os pagamentos (admin)
 */
router.get('/admin', auth, adminOnly, async (req, res) => {
  try {
    const { status, tipo, limit = 100, offset = 0 } = req.query;
    const conditions = [];
    const values = [];

    if (status) { conditions.push(`p.status = $${values.length + 1}`); values.push(status); }
    if (tipo)   { conditions.push(`p.tipo = $${values.length + 1}`);   values.push(tipo); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT p.*, u.nome as motorista_nome, u.email as motorista_email,
             wc.semana_ref
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN weekly_charges wc ON wc.id = p.charge_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, [...values, limit, offset]);

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar pagamentos admin:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/payments/mp-diag
 * Diagnóstico das credenciais MP (temporário)
 */
router.get('/mp-diag', auth, async (req, res) => {
  try {
    const mp = await getMercadoPago(pool);
    const inst = mpInstance; // singleton always exists even if not configured
    res.json({
      mp_modo: inst.modo,
      configurado: inst.isConfigured(),
      accessToken_preview: inst.accessToken ? inst.accessToken.slice(0,15)+'...' : 'NENHUM — VAI FALHAR',
      publicKey_preview: inst.publicKey ? inst.publicKey.slice(0,15)+'...' : 'vazio',
      webhookUrl: inst.webhookUrl || 'NÃO SET',
      env_MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.slice(0,15)+'...' : 'NÃO SET',
      env_MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN ? process.env.MERCADOPAGO_ACCESS_TOKEN.slice(0,15)+'...' : 'NÃO SET',
      sdk: 'fetch() direto (sem SDK npm)',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/payments/public-key
 * Retorna a Public Key do MP para o frontend inicializar o SDK JS
 * DEVE ficar antes de /:id para não ser capturado pelo catch-all
 */
router.get('/public-key', auth, async (req, res) => {
  try {
    const s = await pool.query(
      "SELECT chave, valor FROM settings WHERE chave IN ('mp_public_key', 'mp_modo') LIMIT 2"
    );
    const sMap = {};
    s.rows.forEach(r => { sMap[r.chave] = r.valor; });
    const publicKey = process.env.MP_PUBLIC_KEY || sMap.mp_public_key || null;
    const modo = sMap.mp_modo || 'test';
    res.json({ publicKey, modo });
  } catch (err) {
    res.json({ publicKey: process.env.MP_PUBLIC_KEY || null, modo: 'test' });
  }
});

/**
 * GET /api/payments/:id
 * Detalhe de um pagamento (dono ou admin)
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.nome as motorista_nome, wc.semana_ref
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN weekly_charges wc ON wc.id = p.charge_id
      WHERE p.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado' });

    const p = result.rows[0];
    if (req.user.role !== 'admin' && p.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(p);
  } catch (err) {
    console.error('Erro ao buscar pagamento:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/payments/:id/cancel
 * Cancela pagamento pendente (admin)
 */
router.post('/:id/cancel', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE payments SET status = 'cancelado', updated_at = NOW() WHERE id = $1 AND status = 'pendente' RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Pagamento não encontrado ou não está pendente' });
    res.json({ message: 'Pagamento cancelado' });
  } catch (err) {
    console.error('Erro ao cancelar pagamento:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/payments/tokenize-card
 * Tokeniza cartão server-side (evita CORS do browser → MP API)
 */
router.post('/tokenize-card', auth, driverOnly, async (req, res) => {
  try {
    const { cardNumber, expMonth, expYear, securityCode, cardholderName, cpf } = req.body;
    if (!cardNumber || !expMonth || !expYear || !securityCode || !cardholderName) {
      return res.status(400).json({ error: 'Dados do cartão incompletos' });
    }

    // Usa o singleton do MercadoPagoService (fetch direto, sem SDK)
    const mp = await getMercadoPago(pool);
    if (!mp) {
      return res.status(500).json({ error: 'Mercado Pago não configurado. Configure as credenciais nas Configurações.' });
    }

    // Log de tokens/credenciais removido (Frente 2 — Sensitive Data Exposure).
    // Em debug pesado, ative DEBUG_PAYMENTS=true em desenvolvimento.
    if (process.env.DEBUG_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production') {
      console.log('[tokenize-card] modo:', mp.modo, '| publicKey configurada?', !!mp.publicKey);
    }

    const token = await mp.tokenizarCartao({ cardNumber, expMonth, expYear, securityCode, cardholderName, cpf });

    if (process.env.DEBUG_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production') {
      console.log('[tokenize-card] OK, token gerado?', !!token);
    }
    res.json({ token });
  } catch (err) {
    console.error('Erro ao tokenizar cartão:', err.message);
    res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

/**
 * POST /api/payments/simulate
 * Simula pagamento com juros para escolha de parcelas
 */
router.post('/simulate', auth, async (req, res) => {
  try {
    const { valor } = req.body;
    if (!valor || parseFloat(valor) <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const fees = await pool.query(
      'SELECT parcelas, taxa_percentual FROM installment_fees WHERE ativo = true ORDER BY parcelas'
    );

    const simulacoes = fees.rows.map(fee => {
      const taxa = parseFloat(fee.taxa_percentual) / 100;
      const total = parseFloat(valor) * (1 + taxa);
      return {
        parcelas: fee.parcelas,
        taxa_percentual: parseFloat(fee.taxa_percentual),
        valor_parcela: Math.round((total / fee.parcelas) * 100) / 100,
        valor_total: Math.round(total * 100) / 100,
      };
    });

    res.json(simulacoes);
  } catch (err) {
    console.error('Erro na simulação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/payments/caucao
 */
router.post('/caucao', auth, driverOnly, async (req, res) => {
  try {
    const { metodo, parcelas } = req.body;

    const profile = await pool.query(`
      SELECT dp.id, dp.caucao_pago, dp.status, dp.car_id, dp.contrato_confirmado, c.valor_caucao
      FROM driver_profiles dp
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.user_id = $1
    `, [req.user.id]);

    if (profile.rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });
    const p = profile.rows[0];
    if (p.caucao_pago) return res.status(400).json({ error: 'Caução já foi pago' });
    if (!p.car_id || !p.valor_caucao) return res.status(400).json({ error: 'Nenhum carro atribuído' });
    if (!p.contrato_confirmado) return res.status(400).json({ error: 'Assine o contrato antes de pagar o caução' });

    const resultado = await PaymentService.criarPagamento({
      userId: req.user.id,
      driverId: p.id,
      chargeId: null,
      tipo: 'caucao',
      metodo: metodo || 'pix',
      valor: parseFloat(p.valor_caucao),
      parcelas: parcelas || 1,
    });

    res.status(201).json(resultado);
  } catch (err) {
    console.error('Erro ao criar pagamento caução:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/payments/weekly/:chargeId
 */
router.post('/weekly/:chargeId', auth, driverOnly, async (req, res) => {
  try {
    const { metodo, parcelas, valor_pago, justificativa } = req.body;

    // Valida chargeId numérico (defensivo — evita queries inúteis com strings).
    const chargeId = parseInt(req.params.chargeId, 10);
    if (!Number.isInteger(chargeId) || chargeId <= 0) {
      return res.status(400).json({ error: 'Cobrança inválida' });
    }

    const profile = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });
    const driverId = profile.rows[0].id;

    await PaymentService.calcularMulta(chargeId);

    const charge = await pool.query(
      'SELECT * FROM weekly_charges WHERE id = $1 AND driver_id = $2',
      [chargeId, driverId]
    );
    if (charge.rows.length === 0) return res.status(404).json({ error: 'Cobrança não encontrada' });
    const c = charge.rows[0];
    if (c.pago) return res.status(400).json({ error: 'Esta cobrança já foi paga' });

    // Calcula quanto já foi pago
    const jaPage = await pool.query(
      "SELECT COALESCE(SUM(valor), 0) as total FROM payments WHERE charge_id = $1 AND status = 'pago'",
      [c.id]
    );
    const totalJaPago = parseFloat(jaPage.rows[0].total) || 0;
    const restante = (parseFloat(c.valor_final) || 0) - totalJaPago;

    // Valor a pagar: customizado ou total restante. isNaN guard evita
    // pagamento com valor=NaN (string inválida bypassava check `<= 0`).
    let valor = valor_pago !== undefined && valor_pago !== null && valor_pago !== '' ? parseFloat(valor_pago) : restante;
    if (isNaN(valor) || valor <= 0) {
      return res.status(400).json({ error: 'Valor deve ser um número maior que zero' });
    }
    if (valor > restante + 0.01) return res.status(400).json({ error: `Valor máximo: R$ ${restante.toFixed(2)}` });

    const resultado = await PaymentService.criarPagamento({
      userId: req.user.id,
      driverId,
      chargeId: c.id,
      tipo: 'semanal',
      metodo: metodo || 'pix',
      valor,
      parcelas: parcelas || 1,
      justificativa: justificativa || null,
    });

    resultado.parcial = valor < restante;
    resultado.restante = Math.max(restante - valor, 0);

    res.status(201).json(resultado);
  } catch (err) {
    console.error('Erro ao criar pagamento semanal:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/payments/:id/regenerate-pix
 * Regenera QR Code Pix expirado
 */
router.post('/:id/regenerate-pix', auth, async (req, res) => {
  try {
    const result = await PaymentService.regenerarPix(req.params.id, req.user.id);
    res.json({ message: 'Pix regenerado', ...result });
  } catch (err) {
    console.error('Erro ao regenerar Pix:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/payments/:id/confirm
 * Confirmar pagamento (simulação / manual)
 */
router.post('/:id/confirm', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payment = await client.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (payment.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado' });

    const p = payment.rows[0];
    if (p.status === 'pago') return res.status(400).json({ error: 'Pagamento já confirmado' });

    await client.query(`
      UPDATE payments SET status = 'pago', data_pagamento = NOW(), updated_at = NOW() WHERE id = $1
    `, [p.id]);

    if (p.tipo === 'caucao') {
      await PaymentService.confirmarCaucao(p.driver_id);
    }

    if (p.tipo === 'semanal' && p.charge_id) {
      // Verifica se a cobrança foi totalmente paga
      const totalPago = await client.query(
        "SELECT COALESCE(SUM(valor), 0) as total FROM payments WHERE charge_id = $1 AND status = 'pago'",
        [p.charge_id]
      );
      const charge = await client.query('SELECT valor_final FROM weekly_charges WHERE id = $1', [p.charge_id]);
      
      if (charge.rows.length > 0) {
        const pago = parseFloat(totalPago.rows[0].total) + parseFloat(p.valor);
        const devido = parseFloat(charge.rows[0].valor_final);
        
        if (pago >= devido - 0.01) {
          // Totalmente pago
          await client.query(`
            UPDATE weekly_charges SET pago = true, data_pagamento = NOW(), updated_at = NOW() WHERE id = $1
          `, [p.charge_id]);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Pagamento confirmado' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao confirmar:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payments/card-token
 * Pagamento com cartão via Secure Fields (Checkout Transparente)
 * Recebe token gerado pelo SDK JS do MP — nunca toca dados brutos do cartão
 * Body: { tipo: 'caucao'|'semanal', charge_id?, token, parcelas }
 */
router.post('/card-token', auth, driverOnly, async (req, res) => {
  try {
    const { tipo, charge_id, token, parcelas, payer_data } = req.body;
    if (!token) return res.status(400).json({ error: 'Token do cartão obrigatório' });
    if (!tipo) return res.status(400).json({ error: 'tipo obrigatório (caucao ou semanal)' });

    const profile = await pool.query(
      'SELECT dp.id, dp.caucao_pago, dp.car_id, dp.contrato_confirmado, c.valor_caucao FROM driver_profiles dp LEFT JOIN cars c ON c.id = dp.car_id WHERE dp.user_id = $1',
      [req.user.id]
    );
    if (profile.rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });
    const p = profile.rows[0];

    let valor, chargeId = null;

    if (tipo === 'caucao') {
      if (p.caucao_pago) return res.status(400).json({ error: 'Caução já foi pago' });
      if (!p.car_id || !p.valor_caucao) return res.status(400).json({ error: 'Nenhum carro atribuído' });
      if (!p.contrato_confirmado) return res.status(400).json({ error: 'Assine o contrato antes de pagar o caução' });
      valor = parseFloat(p.valor_caucao);
    } else if (tipo === 'semanal' || tipo === 'weekly') {
      if (!charge_id) return res.status(400).json({ error: 'charge_id obrigatório para pagamento semanal' });
      const charge = await pool.query(
        'SELECT valor_final FROM weekly_charges WHERE id = $1 AND driver_id = $2',
        [charge_id, p.id]
      );
      if (charge.rows.length === 0) return res.status(404).json({ error: 'Cobrança não encontrada' });
      valor = parseFloat(charge.rows[0].valor_final);
      chargeId = charge_id;
    } else {
      return res.status(400).json({ error: 'tipo inválido' });
    }

    const resultado = await PaymentService.criarCartaoToken({
      userId: req.user.id,
      driverId: p.id,
      chargeId,
      tipo: tipo === 'weekly' ? 'semanal' : tipo,
      valor,
      parcelas: parseInt(parcelas) || 1,
      token,
      payerData: payer_data || null,
    });

    res.status(201).json(resultado);
  } catch (err) {
    console.error('Erro ao processar cartão token:', err.message);
    res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

/**
 * GET /api/payments/installment-options
 */
router.get('/installment-options', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT parcelas, taxa_percentual FROM installment_fees WHERE ativo = true ORDER BY parcelas'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
