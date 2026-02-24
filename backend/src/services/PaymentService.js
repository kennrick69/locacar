/**
 * PaymentService — Lógica de pagamento com Mercado Pago real
 * Fallback para modo simulação se MP_ACCESS_TOKEN não configurado
 */
const pool = require('../config/database');
const { getMercadoPago } = require('./MercadoPagoService');
const ExternalPlatformService = require('./ExternalPlatformService');

class PaymentService {

  /**
   * Busca taxa de juros para quantidade de parcelas
   */
  static async getInstallmentFee(parcelas) {
    const result = await pool.query(
      'SELECT taxa_percentual FROM installment_fees WHERE parcelas = $1 AND ativo = true',
      [parcelas]
    );
    return result.rows[0]?.taxa_percentual || 0;
  }

  /**
   * Calcula valor total com juros embutidos
   */
  static async calcularValorComJuros(valorBase, parcelas) {
    const taxa = await this.getInstallmentFee(parcelas);
    const multiplicador = 1 + (parseFloat(taxa) / 100);
    const total = parseFloat(valorBase) * multiplicador;
    return {
      valor_base: parseFloat(valorBase),
      parcelas,
      taxa_percentual: parseFloat(taxa),
      valor_total: Math.round(total * 100) / 100,
      valor_parcela: Math.round((total / parcelas) * 100) / 100,
    };
  }

  /**
   * Cria pagamento (Pix ou Cartão) — integrado com Mercado Pago real
   */
  static async criarPagamento({ userId, driverId, chargeId, tipo, metodo, valor, parcelas = 1, justificativa = null }) {
    const calculo = await this.calcularValorComJuros(valor, parcelas);
    const mp = getMercadoPago();

    // Busca dados do motorista para enviar ao MP
    const userRes = await pool.query('SELECT nome, email, cpf FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0] || {};

    // Cria registro de pagamento no banco
    const result = await pool.query(`
      INSERT INTO payments (user_id, driver_id, charge_id, tipo, metodo, valor, parcelas, juros, valor_total, status, justificativa)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', $10)
      RETURNING *
    `, [userId, driverId, chargeId, tipo, metodo, calculo.valor_base, parcelas, calculo.taxa_percentual, calculo.valor_total, justificativa]);

    const payment = result.rows[0];
    const descricao = tipo === 'caucao' ? 'LocaCar - Caução' : `LocaCar - Semana ${chargeId}`;

    // ========== PIX ==========
    if (metodo === 'pix') {
      if (mp) {
        // Integração real
        try {
          const pixData = await mp.criarPix({
            valor: calculo.valor_total,
            descricao,
            email: user.email,
            cpf: user.cpf,
            nome: user.nome,
          });

          await pool.query(`
            UPDATE payments SET
              mp_payment_id = $1, mp_qr_code = $2, mp_qr_code_base64 = $3,
              mp_ticket_url = $4, mp_expiration = $5
            WHERE id = $6
          `, [pixData.mp_payment_id, pixData.mp_qr_code, pixData.mp_qr_code_base64,
              pixData.mp_ticket_url, pixData.mp_expiration, payment.id]);

          Object.assign(payment, pixData);
        } catch (err) {
          console.error('Erro MP Pix, usando simulação:', err.message);
          await this._simularPix(payment);
        }
      } else {
        // Modo simulação
        await this._simularPix(payment);
      }
    }

    // ========== CARTÃO (Checkout Pro) ==========
    if (metodo === 'cartao') {
      if (mp) {
        try {
          const prefData = await mp.criarPreferenciaCartao({
            valor: calculo.valor_total,
            descricao,
            parcelas_max: parcelas,
            email: user.email,
            external_reference: `payment_${payment.id}`,
          });

          await pool.query(`
            UPDATE payments SET
              mp_preference_id = $1, mp_ticket_url = $2
            WHERE id = $3
          `, [prefData.mp_preference_id, prefData.init_point, payment.id]);

          payment.mp_preference_id = prefData.mp_preference_id;
          payment.mp_ticket_url = prefData.init_point;
          payment.checkout_url = prefData.init_point;
          payment.sandbox_url = prefData.sandbox_init_point;
        } catch (err) {
          console.error('Erro MP Cartão, usando simulação:', err.message);
          payment.checkout_url = null;
          payment.sandbox_url = null;
        }
      }
    }

    return { payment, calculo };
  }

  /**
   * Simulação de Pix para desenvolvimento
   */
  static async _simularPix(payment) {
    const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${Date.now()}5204000053039865802BR5913LOCACAR6009SAO_PAULO62070503***6304`;
    await pool.query(`
      UPDATE payments SET
        mp_payment_id = $1, mp_qr_code = $2,
        mp_expiration = NOW() + interval '30 minutes'
      WHERE id = $3
    `, [`SIM_${payment.id}`, fakeCode, payment.id]);

    payment.mp_payment_id = `SIM_${payment.id}`;
    payment.mp_qr_code = fakeCode;
    payment.mp_expiration = new Date(Date.now() + 30 * 60 * 1000);
    payment._simulado = true;
  }

  /**
   * Regenera Pix expirado
   */
  static async regenerarPix(paymentId, userId) {
    const mp = getMercadoPago();
    const payRes = await pool.query('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [paymentId, userId]);
    if (payRes.rows.length === 0) throw new Error('Pagamento não encontrado');

    const payment = payRes.rows[0];
    if (payment.status === 'pago') throw new Error('Pagamento já foi pago');

    const userRes = await pool.query('SELECT nome, email, cpf FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0] || {};

    if (mp) {
      const pixData = await mp.criarPix({
        valor: parseFloat(payment.valor_total),
        descricao: payment.tipo === 'caucao' ? 'LocaCar - Caução' : 'LocaCar - Semanal',
        email: user.email,
        cpf: user.cpf,
        nome: user.nome,
      });

      await pool.query(`
        UPDATE payments SET
          mp_payment_id = $1, mp_qr_code = $2, mp_qr_code_base64 = $3,
          mp_ticket_url = $4, mp_expiration = $5, updated_at = NOW()
        WHERE id = $6
      `, [pixData.mp_payment_id, pixData.mp_qr_code, pixData.mp_qr_code_base64,
          pixData.mp_ticket_url, pixData.mp_expiration, paymentId]);

      return pixData;
    } else {
      const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${Date.now()}6304`;
      await pool.query(`
        UPDATE payments SET mp_qr_code = $1, mp_expiration = NOW() + interval '30 minutes', updated_at = NOW()
        WHERE id = $2
      `, [fakeCode, paymentId]);
      return { mp_qr_code: fakeCode, _simulado: true };
    }
  }

  /**
   * Marca caução como pago e dispara cadastro externo se configurado
   */
  static async confirmarCaucao(driverId) {
    await pool.query(
      'UPDATE driver_profiles SET caucao_pago = true, updated_at = NOW() WHERE id = $1',
      [driverId]
    );

    // Dispara cadastro externo
    await ExternalPlatformService.verificarEDisparar('caucao_pago', driverId);
  }

  /**
   * Processa webhook do Mercado Pago
   * Chamado quando MP notifica sobre mudança de status
   */
  static async processarWebhook(mpPaymentId) {
    const mp = getMercadoPago();
    if (!mp) {
      console.log('[WEBHOOK] Modo simulação, ignorando webhook.');
      return { processed: false, reason: 'Modo simulação' };
    }

    try {
      // Consulta status no MP
      const mpData = await mp.consultarPagamento(mpPaymentId);

      // Busca nosso registro pelo mp_payment_id
      const payRes = await pool.query(
        'SELECT * FROM payments WHERE mp_payment_id = $1',
        [String(mpPaymentId)]
      );

      if (payRes.rows.length === 0) {
        console.log(`[WEBHOOK] Pagamento ${mpPaymentId} não encontrado no banco.`);
        return { processed: false, reason: 'Pagamento não encontrado' };
      }

      const payment = payRes.rows[0];

      // Já processado?
      if (payment.status === 'pago') {
        return { processed: true, reason: 'Já processado' };
      }

      // Status do MP: approved, pending, rejected, cancelled, refunded
      if (mpData.status === 'approved') {
        // Marca como pago
        await pool.query(`
          UPDATE payments SET status = 'pago', data_pagamento = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [payment.id]);

        // Se é caução, atualiza perfil
        if (payment.tipo === 'caucao') {
          await this.confirmarCaucao(payment.driver_id);
        }

        // Se é semanal, verifica se totalmente pago
        if (payment.tipo === 'semanal' && payment.charge_id) {
          const totalPago = await pool.query(
            "SELECT COALESCE(SUM(valor), 0) as total FROM payments WHERE charge_id = $1 AND status = 'pago'",
            [payment.charge_id]
          );
          const chargeRes = await pool.query('SELECT valor_final FROM weekly_charges WHERE id = $1', [payment.charge_id]);
          if (chargeRes.rows.length > 0) {
            const pago = parseFloat(totalPago.rows[0].total) + parseFloat(payment.valor);
            if (pago >= parseFloat(chargeRes.rows[0].valor_final) - 0.01) {
              await pool.query(`
                UPDATE weekly_charges SET pago = true, data_pagamento = NOW(), updated_at = NOW()
                WHERE id = $1
              `, [payment.charge_id]);
            }
          }
        }

        console.log(`[WEBHOOK] Pagamento ${payment.id} confirmado via MP!`);
        return { processed: true, status: 'approved', payment_id: payment.id };

      } else if (mpData.status === 'rejected' || mpData.status === 'cancelled') {
        await pool.query(
          "UPDATE payments SET status = 'cancelado', updated_at = NOW() WHERE id = $1",
          [payment.id]
        );
        return { processed: true, status: mpData.status };

      } else if (mpData.status === 'refunded') {
        await pool.query(
          "UPDATE payments SET status = 'estornado', updated_at = NOW() WHERE id = $1",
          [payment.id]
        );
        return { processed: true, status: 'refunded' };
      }

      return { processed: false, reason: `Status MP: ${mpData.status}` };

    } catch (err) {
      console.error('[WEBHOOK] Erro ao processar:', err.message);
      return { processed: false, reason: err.message };
    }
  }

  /**
   * Calcula multa por atraso
   */
  static async calcularMulta(chargeId) {
    const charge = await pool.query('SELECT * FROM weekly_charges WHERE id = $1', [chargeId]);
    if (charge.rows.length === 0) return 0;

    const c = charge.rows[0];
    if (c.pago) return 0;

    const settingsResult = await pool.query(
      "SELECT chave, valor FROM settings WHERE chave IN ('multa_tipo', 'multa_valor', 'multa_carencia_dias', 'multa_diferida')"
    );
    const settings = {};
    settingsResult.rows.forEach(r => { settings[r.chave] = r.valor; });

    const carenciaDias = parseInt(settings.multa_carencia_dias) || 3;
    const multaDiferida = settings.multa_diferida === 'true';

    const vencimento = new Date(c.semana_ref);
    const hoje = new Date();
    const diffDias = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));

    if (diffDias <= carenciaDias) return 0;

    const diasMulta = diffDias - carenciaDias;
    let multa = 0;

    if (settings.multa_tipo === 'percentual') {
      const taxaDia = parseFloat(settings.multa_valor) || 2;
      multa = (parseFloat(c.valor_base) * taxaDia / 100) * diasMulta;
    } else {
      multa = (parseFloat(settings.multa_valor) || 5) * diasMulta;
    }

    if (multaDiferida) {
      await pool.query('UPDATE weekly_charges SET multa = $1, updated_at = NOW() WHERE id = $2', [multa, chargeId]);
      return { multa, diferida: true, dias_atraso: diasMulta };
    }

    const valorFinal = parseFloat(c.valor_base) - parseFloat(c.abatimentos) + parseFloat(c.credito_anterior) + multa;
    await pool.query(
      'UPDATE weekly_charges SET multa = $1, valor_final = $2, updated_at = NOW() WHERE id = $3',
      [multa, Math.max(valorFinal, 0), chargeId]
    );

    return { multa, diferida: false, dias_atraso: diasMulta };
  }
}

module.exports = PaymentService;
