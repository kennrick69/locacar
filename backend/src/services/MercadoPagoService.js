/**
 * MercadoPagoService — Integração real com API do Mercado Pago
 * Pix (QR Code) e Cartão (Checkout Pro / preferências)
 */
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

class MercadoPagoService {
  constructor(accessToken) {
    this.client = new MercadoPagoConfig({ accessToken });
    this.payment = new Payment(this.client);
    this.preference = new Preference(this.client);
  }

  async criarPix({ valor, descricao, email, cpf, nome }) {
    try {
      const body = {
        transaction_amount: parseFloat(valor),
        description: descricao || 'IMP Locadora - Pagamento',
        payment_method_id: 'pix',
        payer: {
          email: email,
          first_name: nome?.split(' ')[0] || 'Motorista',
          last_name: nome?.split(' ').slice(1).join(' ') || '',
          identification: cpf ? { type: 'CPF', number: cpf.replace(/\D/g, '') } : undefined,
        },
        notification_url: process.env.MP_WEBHOOK_URL || undefined,
      };

      const result = await this.payment.create({ body });

      return {
        mp_payment_id: String(result.id),
        mp_qr_code: result.point_of_interaction?.transaction_data?.qr_code || null,
        mp_qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64 || null,
        mp_ticket_url: result.point_of_interaction?.transaction_data?.ticket_url || null,
        mp_expiration: result.date_of_expiration || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: result.status,
      };
    } catch (err) {
      console.error('Erro ao criar Pix MP:', err?.message || err);
      throw new Error(`Erro Mercado Pago Pix: ${err?.message || 'desconhecido'}`);
    }
  }

  async criarPreferenciaCartao({ valor, descricao, parcelas_max = 12, email, external_reference }) {
    try {
      const body = {
        items: [{
          title: descricao || 'IMP Locadora - Pagamento',
          quantity: 1,
          unit_price: parseFloat(valor),
          currency_id: 'BRL',
        }],
        payer: { email },
        payment_methods: {
          installments: parcelas_max,
          excluded_payment_types: [{ id: 'ticket' }],
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=success`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=failure`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=pending`,
        },
        auto_return: 'approved',
        external_reference: external_reference || undefined,
        notification_url: process.env.MP_WEBHOOK_URL || undefined,
        statement_descriptor: 'IMP LOCADORA',
      };

      const result = await this.preference.create({ body });

      return {
        mp_preference_id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
      };
    } catch (err) {
      console.error('Erro ao criar preferência MP:', err?.message || err);
      throw new Error(`Erro Mercado Pago Cartão: ${err?.message || 'desconhecido'}`);
    }
  }

  async consultarPagamento(paymentId) {
    try {
      const result = await this.payment.get({ id: paymentId });
      return {
        id: result.id,
        status: result.status,
        status_detail: result.status_detail,
        transaction_amount: result.transaction_amount,
        date_approved: result.date_approved,
        payment_method_id: result.payment_method_id,
        installments: result.installments,
        payer: result.payer,
      };
    } catch (err) {
      console.error('Erro ao consultar pagamento MP:', err?.message || err);
      throw new Error(`Erro ao consultar: ${err?.message || 'desconhecido'}`);
    }
  }

  async regenerarPix(params) {
    return this.criarPix(params);
  }
}

/**
 * Retorna instância do MercadoPagoService com token correto.
 * Prioridade: settings do DB (mp_modo + token) → env vars → simulação
 * @param {object} pool - conexão pg (opcional, para ler do DB)
 */
async function getMercadoPago(pool) {
  // 1) Tenta DB settings (configuradas pelo admin no painel)
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT chave, valor FROM settings WHERE chave IN ('mp_modo', 'mp_access_token', 'mp_access_token_test', 'mp_webhook_url')"
      );
      const s = {};
      result.rows.forEach(r => { s[r.chave] = r.valor; });

      const modo = s.mp_modo || 'test';
      const token = modo === 'production' ? s.mp_access_token : s.mp_access_token_test;

      // Disponibiliza webhook_url do DB como env fallback
      if (s.mp_webhook_url && !process.env.MP_WEBHOOK_URL) {
        process.env.MP_WEBHOOK_URL = s.mp_webhook_url;
      }

      if (token && token.trim()) {
        console.log(`[MP] Usando token do DB (modo: ${modo})`);
        return new MercadoPagoService(token.trim());
      }
    } catch (err) {
      console.warn('[MP] Erro ao ler settings do DB:', err.message);
    }
  }

  // 2) Fallback: env vars (aceita MP_ACCESS_TOKEN ou MERCADOPAGO_ACCESS_TOKEN)
  const token = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️  MP token não configurado. Usando modo simulação.');
    return null;
  }

  console.log('[MP] Usando token da variável de ambiente');
  return new MercadoPagoService(token);
}

module.exports = { MercadoPagoService, getMercadoPago };
