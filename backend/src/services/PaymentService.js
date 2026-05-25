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
    const mp = await getMercadoPago(pool);

    // Busca dados do motorista para enviar ao MP
    const userRes = await pool.query('SELECT nome, email, cpf, telefone FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0] || {};
    const driverRes = await pool.query('SELECT endereco_completo FROM driver_profiles WHERE id = $1', [driverId]);
    const driverProfile = driverRes.rows[0] || {};
    // Tenta extrair número do endereço (ex: "Rua X, 123 - Bairro")
    const enderecoMatch = (driverProfile.endereco_completo || '').match(/,?\s*(\d+)/);
    const enderecoNumero = enderecoMatch ? enderecoMatch[1] : null;

    // Cria registro de pagamento no banco
    const result = await pool.query(`
      INSERT INTO payments (user_id, driver_id, charge_id, tipo, metodo, valor, parcelas, juros, valor_total, status, justificativa)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', $10)
      RETURNING *
    `, [userId, driverId, chargeId, tipo, metodo, calculo.valor_base, parcelas, calculo.taxa_percentual, calculo.valor_total, justificativa]);

    const payment = result.rows[0];
    const descricao = tipo === 'caucao' ? 'IMP Locadora - Caução' : `IMP Locadora - Semana ${chargeId}`;
    const externalRef = `payment_${payment.id}`;
    const idempotencyKey = `locacar_pay_${payment.id}_${Date.now()}`;

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
            telefone: user.telefone,
            endereco: driverProfile.endereco_completo,
            numero: enderecoNumero,
            external_reference: externalRef,
            idempotencyKey,
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
            nome: user.nome,
            cpf: user.cpf,
            telefone: user.telefone,
            external_reference: externalRef,
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
   * Cria pagamento com cartão via token do Secure Fields (Checkout Transparente)
   * O token é gerado pelo SDK JS do MP no frontend — nunca passa dados brutos do cartão pelo servidor
   */
  static async criarCartaoToken({ userId, driverId, chargeId, tipo, valor, parcelas = 1, token, payerData = null }) {
    const calculo = await this.calcularValorComJuros(valor, parcelas);
    const mp = await getMercadoPago(pool);
    if (!mp) throw new Error('Mercado Pago não configurado');

    const userRes = await pool.query('SELECT nome, email, cpf, telefone FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0] || {};
    const driverRes = await pool.query('SELECT endereco_completo FROM driver_profiles WHERE id = $1', [driverId]);
    const driverProfile = driverRes.rows[0] || {};
    const enderecoMatch = (driverProfile.endereco_completo || '').match(/,?\s*(\d+)/);
    const enderecoNumero = enderecoMatch ? enderecoMatch[1] : null;

    // Dados do pagador: usa dados do terceiro se fornecidos, senão usa dados do motorista
    const payerNome = payerData?.nome || user.nome;
    const payerCpf = payerData?.cpf || user.cpf;
    const payerEmail = payerData?.email || user.email;
    const payerEndereco = payerData?.endereco || driverProfile.endereco_completo;
    const payerNumero = payerData?.numero || enderecoNumero;
    const payerBairro = payerData?.bairro || null;
    const payerCidade = payerData?.cidade || null;
    const payerEstado = payerData?.estado || null;
    const payerCep = payerData?.cep || null;

    // Cria registro de pagamento no banco
    const result = await pool.query(`
      INSERT INTO payments (user_id, driver_id, charge_id, tipo, metodo, valor, parcelas, juros, valor_total, status)
      VALUES ($1, $2, $3, $4, 'cartao', $5, $6, $7, $8, 'pendente')
      RETURNING *
    `, [userId, driverId, chargeId, tipo, calculo.valor_base, parcelas, calculo.taxa_percentual, calculo.valor_total]);

    const payment = result.rows[0];
    const descricao = tipo === 'caucao' ? 'IMP Locadora - Caução' : `IMP Locadora - Semana ${chargeId}`;
    const externalRef = `payment_${payment.id}`;

    const mpData = await mp.criarCartaoToken({
      valor: calculo.valor_total,
      descricao,
      email: payerEmail,
      cpf: payerCpf,
      nome: payerNome,
      telefone: user.telefone,
      endereco: payerEndereco,
      numero: payerNumero,
      bairro: payerBairro,
      cidade: payerCidade,
      estado: payerEstado,
      cep: payerCep,
      external_reference: externalRef,
      idempotencyKey: `locacar_card_${payment.id}_${Date.now()}`,
    }, token, parcelas);

    // Salva mp_payment_id
    await pool.query(
      'UPDATE payments SET mp_payment_id = $1 WHERE id = $2',
      [mpData.mp_payment_id, payment.id]
    );
    payment.mp_payment_id = mpData.mp_payment_id;

    // Processa confirmação imediata (cartão aprovado na hora)
    if (mpData.status === 'approved') {
      await pool.query(
        "UPDATE payments SET status = 'pago', data_pagamento = NOW() WHERE id = $1",
        [payment.id]
      );
      payment.status = 'pago';

      if (tipo === 'caucao') {
        await this.confirmarCaucao(driverId);
      }
      if (tipo === 'semanal' && chargeId) {
        const totalPago = parseFloat(calculo.valor_total);
        const chargeRes = await pool.query('SELECT valor_final FROM weekly_charges WHERE id = $1', [chargeId]);
        if (chargeRes.rows.length > 0) {
          const valorFinal = parseFloat(chargeRes.rows[0].valor_final);
          if (totalPago >= valorFinal - 0.01) {
            await pool.query(
              'UPDATE weekly_charges SET pago = true, data_pagamento = NOW() WHERE id = $1',
              [chargeId]
            );
          }
        }
      }
    }

    return { payment, calculo, mp_status: mpData.status, mp_status_detail: mpData.status_detail };
  }

  /**
   * Simulação de Pix para desenvolvimento
   */
  static async _simularPix(payment) {
    const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${Date.now()}5204000053039865802BR5916IMPLOCADORA6009SAO_PAULO62070503***6304`;
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
    const mp = await getMercadoPago(pool);
    const payRes = await pool.query('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [paymentId, userId]);
    if (payRes.rows.length === 0) throw new Error('Pagamento não encontrado');

    const payment = payRes.rows[0];
    if (payment.status === 'pago') throw new Error('Pagamento já foi pago');

    const userRes = await pool.query('SELECT nome, email, cpf, telefone FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0] || {};
    const driverRes = await pool.query('SELECT endereco_completo FROM driver_profiles WHERE id = $1', [payment.driver_id]);
    const driverProfile = driverRes.rows[0] || {};

    if (mp) {
      const pixData = await mp.criarPix({
        valor: parseFloat(payment.valor_total),
        descricao: payment.tipo === 'caucao' ? 'IMP Locadora - Caução' : 'IMP Locadora - Semanal',
        email: user.email,
        cpf: user.cpf,
        nome: user.nome,
        telefone: user.telefone,
        endereco: driverProfile.endereco_completo,
        external_reference: `payment_${paymentId}`,
        idempotencyKey: `locacar_regen_${paymentId}_${Date.now()}`,
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
   * Marca caução como pago e dispara cadastro externo se configurado.
   * Se houver charge tipo='caucao' aberta, registra payment_entry pelo
   * saldo restante e marca a charge como paga.
   */
  static async confirmarCaucao(driverId) {
    await pool.query(
      'UPDATE driver_profiles SET caucao_pago = true, updated_at = NOW() WHERE id = $1',
      [driverId]
    );

    // Quita a charge tipo='caucao' (se existir e ainda não estiver paga)
    const ch = await pool.query(
      `SELECT id, valor_final, COALESCE(valor_pago_total, 0) as pago_total
       FROM weekly_charges
       WHERE driver_id = $1 AND tipo = 'caucao' AND pago = false
       LIMIT 1`,
      [driverId]
    );
    if (ch.rows.length > 0) {
      const charge = ch.rows[0];
      const saldo = Math.max(parseFloat(charge.valor_final) - parseFloat(charge.pago_total), 0);
      if (saldo > 0.01) {
        await pool.query(
          `INSERT INTO payment_entries (charge_id, driver_id, valor_pago, data_pagamento, observacoes)
           VALUES ($1, $2, $3, NOW(), 'Caução confirmada manualmente')`,
          [charge.id, driverId, saldo]
        );
      }
      await pool.query(
        `UPDATE weekly_charges
         SET valor_pago_total = valor_final, saldo_devedor = 0, pago = true,
             data_pagamento = COALESCE(data_pagamento, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [charge.id]
      );
    }

    // Dispara cadastro externo
    await ExternalPlatformService.verificarEDisparar('caucao_pago', driverId);
  }

  /**
   * Processa webhook do Mercado Pago
   * Chamado quando MP notifica sobre mudança de status
   */
  static async processarWebhook(mpPaymentId) {
    const mp = await getMercadoPago(pool);
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

        // Se é semanal, atualiza valor_pago_total e saldo_devedor
        if (payment.tipo === 'semanal' && payment.charge_id) {
          // Soma pagamentos MP confirmados
          const mpTotal = await pool.query(
            "SELECT COALESCE(SUM(valor), 0) as total FROM payments WHERE charge_id = $1 AND status = 'pago'",
            [payment.charge_id]
          );
          // Soma payment_entries manuais
          const peTotal = await pool.query(
            "SELECT COALESCE(SUM(valor_pago), 0) as total FROM payment_entries WHERE charge_id = $1",
            [payment.charge_id]
          );
          const chargeRes = await pool.query('SELECT valor_final FROM weekly_charges WHERE id = $1', [payment.charge_id]);

          if (chargeRes.rows.length > 0) {
            // Guards de NaN: charge sem valor_final OU sum vazio retornam null/string —
            // sem `|| 0`, parseFloat vira NaN e saldo=0 marcava cobrança como paga
            // sem ter recebido nada de verdade.
            const totalPagoMp = parseFloat(mpTotal.rows[0].total) || 0;
            const totalPagoPe = parseFloat(peTotal.rows[0].total) || 0;
            const totalPago = totalPagoMp + totalPagoPe;
            const valorFinal = parseFloat(chargeRes.rows[0].valor_final);

            if (isNaN(valorFinal) || valorFinal < 0) {
              console.warn('[WEBHOOK] weekly_charges.valor_final inválido (charge_id=' + payment.charge_id + '). NÃO atualizando saldo/pago — revisar manualmente.');
            } else {
              const saldo = Math.max(valorFinal - totalPago, 0);
              const isPago = saldo <= 0.01;

              await pool.query(`
                UPDATE weekly_charges SET valor_pago_total = $1, saldo_devedor = $2, pago = $3,
                  data_pagamento = CASE WHEN $3 THEN NOW() ELSE data_pagamento END, updated_at = NOW()
                WHERE id = $4
              `, [totalPago, saldo, isPago, payment.charge_id]);
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
