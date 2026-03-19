const express = require('express');
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const PaymentService = require('../services/PaymentService');

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
      SELECT dp.id, dp.caucao_pago, dp.status, dp.car_id, c.valor_caucao
      FROM driver_profiles dp
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.user_id = $1
    `, [req.user.id]);

    if (profile.rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });
    const p = profile.rows[0];
    if (p.caucao_pago) return res.status(400).json({ error: 'Caução já foi pago' });
    if (p.status !== 'aprovado') return res.status(400).json({ error: 'Você precisa ser aprovado antes de pagar o caução' });
    if (!p.car_id || !p.valor_caucao) return res.status(400).json({ error: 'Nenhum carro atribuído' });

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

    const profile = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });
    const driverId = profile.rows[0].id;

    await PaymentService.calcularMulta(req.params.chargeId);

    const charge = await pool.query(
      'SELECT * FROM weekly_charges WHERE id = $1 AND driver_id = $2',
      [req.params.chargeId, driverId]
    );
    if (charge.rows.length === 0) return res.status(404).json({ error: 'Cobrança não encontrada' });
    const c = charge.rows[0];
    if (c.pago) return res.status(400).json({ error: 'Esta cobrança já foi paga' });

    // Calcula quanto já foi pago
    const jaPage = await pool.query(
      "SELECT COALESCE(SUM(valor), 0) as total FROM payments WHERE charge_id = $1 AND status = 'pago'",
      [c.id]
    );
    const totalJaPago = parseFloat(jaPage.rows[0].total);
    const restante = parseFloat(c.valor_final) - totalJaPago;

    // Valor a pagar: customizado ou total restante
    let valor = valor_pago ? parseFloat(valor_pago) : restante;
    if (valor <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });
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
