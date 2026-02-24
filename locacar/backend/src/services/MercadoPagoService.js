/**
 * MercadoPagoService — Integração real com API do Mercado Pago
 * Pix (QR Code) e Cartão (Checkout Pro / preferências)
 */
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

class MercadoPagoService {
  constructor() {
    this.client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });
    this.payment = new Payment(this.client);
    this.preference = new Preference(this.client);
  }

  /**
   * Gera pagamento Pix com QR Code
   * @param {object} params - { valor, descricao, email, cpf, nome }
   * @returns {object} { id, qr_code, qr_code_base64, ticket_url, expiration }
   */
  async criarPix({ valor, descricao, email, cpf, nome }) {
    try {
      const body = {
        transaction_amount: parseFloat(valor),
        description: descricao || 'LocaCar - Pagamento',
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

  /**
   * Cria preferência de pagamento (Checkout Pro) para cartão
   * Retorna URL de checkout onde o motorista completa o pagamento
   * @param {object} params - { valor, descricao, parcelas_max, email, external_reference }
   * @returns {object} { preference_id, init_point, sandbox_init_point }
   */
  async criarPreferenciaCartao({ valor, descricao, parcelas_max = 12, email, external_reference }) {
    try {
      const body = {
        items: [
          {
            title: descricao || 'LocaCar - Pagamento',
            quantity: 1,
            unit_price: parseFloat(valor),
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: email,
        },
        payment_methods: {
          installments: parcelas_max,
          excluded_payment_types: [
            { id: 'ticket' },  // exclui boleto
          ],
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=success`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=failure`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/motorista/pagamentos?status=pending`,
        },
        auto_return: 'approved',
        external_reference: external_reference || undefined,
        notification_url: process.env.MP_WEBHOOK_URL || undefined,
        statement_descriptor: 'LOCACAR',
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

  /**
   * Consulta status de um pagamento pelo ID
   * @param {string} paymentId
   * @returns {object} payment data
   */
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

  /**
   * Regenera Pix expirado — cria um novo pagamento
   */
  async regenerarPix(params) {
    return this.criarPix(params);
  }
}

// Singleton - só instancia se tiver token configurado
let instance = null;

function getMercadoPago() {
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn('⚠️  MP_ACCESS_TOKEN não configurado. Usando modo simulação.');
    return null;
  }
  if (!instance) {
    instance = new MercadoPagoService();
  }
  return instance;
}

module.exports = { MercadoPagoService, getMercadoPago };
