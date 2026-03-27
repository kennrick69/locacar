/**
 * MercadoPagoService — Integração real com API do Mercado Pago
 * Pix, Cartão (Transparent Checkout) e Checkout Pro
 * Implementação seguindo guia de qualidade (83+ pontos)
 */
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

class MercadoPagoService {
  constructor(accessToken) {
    this.client = new MercadoPagoConfig({ accessToken });
    this.payment = new Payment(this.client);
    this.preference = new Preference(this.client);
  }

  /**
   * Monta payer + additional_info completos — reutilizado em Pix, Boleto e Cartão
   * Regras de tipo críticas do guia MP:
   *   payer.address.street_number          → STRING   ("123")
   *   additional_info.payer.address.street_number    → INTEGER  (123)
   *   additional_info.shipments.receiver_address.street_number → INTEGER (123)
   */
  _buildFullBody(dados, extras = {}) {
    const {
      valor, descricao, email, cpf, nome, telefone,
      endereco, numero, cep, bairro, cidade, estado,
      external_reference,
    } = dados;

    const nomePartes = (nome || 'Motorista').split(' ');
    const firstName = nomePartes[0];
    const lastName = nomePartes.slice(1).join(' ') || '-';
    const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : '00000000000';
    const telLimpo = telefone ? telefone.replace(/\D/g, '') : '';
    const transaction_amount = parseFloat(parseFloat(valor).toFixed(2));
    const numeroStr = numero || 'S/N';
    const numeroInt = parseInt(numero) || 0;
    const ruaNome = endereco || '';
    const cepLimpo = cep ? cep.replace(/\D/g, '') : '00000000';

    return {
      transaction_amount,
      description: descricao || 'IMP Locadora - Pagamento',
      statement_descriptor: 'IMP LOCADORA',
      external_reference: external_reference || undefined,
      notification_url: process.env.MP_WEBHOOK_URL || undefined,
      payer: {
        email: email || 'motorista@implocadora.com',
        first_name: firstName,
        last_name: lastName,
        identification: { type: 'CPF', number: cpfLimpo },
        phone: telLimpo ? {
          area_code: telLimpo.slice(0, 2),
          number: telLimpo.slice(2),
        } : undefined,
        address: {
          zip_code: cepLimpo,
          street_name: ruaNome,
          street_number: numeroStr,          // STRING em payer.address
          neighborhood: bairro || '',
          city: cidade || '',
          federal_unit: estado || 'SP',
        },
      },
      additional_info: {
        items: [{
          id: external_reference || 'pagamento',
          title: descricao || 'IMP Locadora - Pagamento',
          description: descricao || 'IMP Locadora - Pagamento',
          quantity: 1,                        // INTEGER
          unit_price: transaction_amount,     // FLOAT
          category_id: 'others',
        }],
        payer: {
          first_name: firstName,
          last_name: lastName,
          phone: telLimpo ? {
            area_code: telLimpo.slice(0, 2),
            number: telLimpo.slice(2),
          } : undefined,
          address: {
            zip_code: cepLimpo,
            street_name: ruaNome,
            street_number: numeroInt,        // INTEGER em additional_info
          },
        },
        shipments: {
          receiver_address: {
            zip_code: cepLimpo,
            street_name: ruaNome,
            street_number: numeroInt,        // INTEGER em shipments
            city_name: cidade || '',
            state_name: estado || 'SP',
          },
        },
      },
      ...extras,
    };
  }

  async criarPix(dados) {
    try {
      const body = this._buildFullBody(dados, { payment_method_id: 'pix' });
      const idempotencyKey = dados.idempotencyKey || `pix-${dados.external_reference}-${Date.now()}`;
      const result = await this.payment.create({ body, requestOptions: { idempotencyKey } });

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
   * Cria token de cartão via API REST do MP (server-side, sem CORS)
   * publicKey é a chave pública — obrigatória para tokenização
   */
  async tokenizarCartao({ publicKey, cardNumber, expMonth, expYear, securityCode, cardholderName, cpf }) {
    const url = `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`;
    const body = {
      card_number: cardNumber.replace(/\D/g, ''),
      expiration_month: parseInt(expMonth),
      expiration_year: parseInt(expYear) < 100 ? 2000 + parseInt(expYear) : parseInt(expYear),
      security_code: securityCode,
      cardholder: {
        name: cardholderName,
        identification: { type: 'CPF', number: cpf ? cpf.replace(/\D/g, '') : '00000000000' },
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const desc = data.cause?.[0]?.description || data.message || `HTTP ${res.status}`;
      throw new Error(`Erro ao tokenizar cartão MP: ${desc}`);
    }
    return data.id;
  }

  async criarCartaoToken(dados, token, parcelas = 1) {
    try {
      // installments: 1 — o juros já foi calculado no nosso sistema e
      // embutido no transaction_amount. O MP cobra o total de uma vez.
      const body = this._buildFullBody(dados, {
        token,
        installments: 1,
      });
      const idempotencyKey = dados.idempotencyKey || `card-${dados.external_reference}-${Date.now()}`;
      const result = await this.payment.create({ body, requestOptions: { idempotencyKey } });

      return {
        mp_payment_id: String(result.id),
        status: result.status,               // 'approved', 'rejected', 'in_process'
        status_detail: result.status_detail,
      };
    } catch (err) {
      console.error('Erro ao criar pagamento cartão MP:', err?.message || err);
      throw new Error(`Erro Mercado Pago Cartão: ${err?.message || 'desconhecido'}`);
    }
  }

  async criarPreferenciaCartao({ valor, descricao, parcelas_max = 12, email, nome, cpf, telefone, external_reference }) {
    try {
      const valorFloat = parseFloat(parseFloat(valor).toFixed(2));
      const nomePartes = (nome || '').split(' ');
      const body = {
        items: [{
          id: external_reference || 'pagamento',
          title: descricao || 'IMP Locadora - Pagamento',
          description: descricao || 'IMP Locadora - Pagamento',
          quantity: 1,
          unit_price: valorFloat,
          currency_id: 'BRL',
          category_id: 'others',
        }],
        payer: {
          email,
          name: nomePartes[0] || undefined,
          surname: nomePartes.slice(1).join(' ') || undefined,
          identification: cpf ? { type: 'CPF', number: cpf.replace(/\D/g, '') } : undefined,
          phone: telefone ? {
            area_code: telefone.replace(/\D/g, '').slice(0, 2),
            number: telefone.replace(/\D/g, '').slice(2),
          } : undefined,
        },
        payment_methods: {
          // installments: 1 — juros já embutido no valor, MP não parcela por conta própria
          installments: 1,
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
        payment_type_id: result.payment_type_id,
        installments: result.installments,
        payer: result.payer,
        external_reference: result.external_reference,
      };
    } catch (err) {
      console.error('Erro ao consultar pagamento MP:', err?.message || err);
      throw new Error(`Erro ao consultar: ${err?.message || 'desconhecido'}`);
    }
  }
}

/**
 * Retorna instância do MercadoPagoService com token correto.
 * Prioridade: settings do DB → env vars → null (simulação)
 */
async function getMercadoPago(pool) {
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT chave, valor FROM settings WHERE chave IN ('mp_modo', 'mp_access_token', 'mp_access_token_test', 'mp_webhook_url', 'mp_public_key')"
      );
      const s = {};
      result.rows.forEach(r => { s[r.chave] = r.valor; });

      const modo = s.mp_modo || 'test';
      const token = modo === 'production' ? s.mp_access_token : s.mp_access_token_test;

      if (s.mp_webhook_url && !process.env.MP_WEBHOOK_URL) {
        process.env.MP_WEBHOOK_URL = s.mp_webhook_url;
      }
      if (s.mp_public_key && !process.env.MP_PUBLIC_KEY) {
        process.env.MP_PUBLIC_KEY = s.mp_public_key;
      }

      if (token && token.trim()) {
        console.log(`[MP] Usando token do DB (modo: ${modo})`);
        return new MercadoPagoService(token.trim());
      }
    } catch (err) {
      console.warn('[MP] Erro ao ler settings do DB:', err.message);
    }
  }

  const token = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️  MP token não configurado. Usando modo simulação.');
    return null;
  }

  console.log('[MP] Usando token da variável de ambiente');
  return new MercadoPagoService(token);
}

module.exports = { MercadoPagoService, getMercadoPago };
