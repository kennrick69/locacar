/**
 * MercadoPagoService — Integração direta com API REST do Mercado Pago
 * Sem dependência do SDK npm (mercadopago) — usa fetch() nativo
 * 
 * Baseado na estrutura testada e aprovada do Araquari Cestas (83+ pontos MP)
 * Suporta: PIX, Cartão (Checkout Transparente + Checkout Pro), Consulta, Reembolso
 */

class MercadoPagoService {
  constructor() {
    this.accessToken = null;
    this.publicKey = null;
    this.webhookUrl = null;
    this.webhookSecret = null;
    this.modo = 'test';
    this.baseUrl = 'https://api.mercadopago.com';
    this._dbLoaded = false;
  }

  isConfigured() {
    return !!(this.accessToken);
  }

  // ══════════════════════════════
  // Carrega credenciais do banco (prioridade sobre env vars)
  // Tabela: settings (mesma usada pelo admin Settings.jsx)
  // ══════════════════════════════
  async reloadFromDB(pool) {
    try {
      if (!pool) return;

      const result = await pool.query(
        "SELECT chave, valor FROM settings WHERE chave IN ('mp_modo', 'mp_access_token', 'mp_access_token_test', 'mp_public_key', 'mp_public_key_test', 'mp_webhook_url', 'mp_webhook_secret')"
      );
      const config = {};
      result.rows.forEach(r => { config[r.chave] = r.valor; });

      this.modo = config.mp_modo || 'test';

      // Token: usa produção ou teste conforme modo
      const dbToken = this.modo === 'production'
        ? config.mp_access_token
        : (config.mp_access_token_test || config.mp_access_token);

      const dbPublicKey = this.modo === 'production'
        ? config.mp_public_key
        : (config.mp_public_key_test || config.mp_public_key);

      // DB tem prioridade, env vars como fallback
      this.accessToken = dbToken || process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || null;
      this.publicKey = dbPublicKey || process.env.MP_PUBLIC_KEY || null;
      this.webhookUrl = config.mp_webhook_url || process.env.MP_WEBHOOK_URL || null;
      this.webhookSecret = config.mp_webhook_secret || process.env.MP_WEBHOOK_SECRET || null;

      this._dbLoaded = true;
      console.log(`[MP] Credenciais carregadas (modo: ${this.modo}, configurado: ${this.isConfigured()})`);
    } catch (e) {
      // Fallback para env vars
      this.accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || null;
      this.publicKey = process.env.MP_PUBLIC_KEY || null;
      this.webhookUrl = process.env.MP_WEBHOOK_URL || null;
      this._dbLoaded = true;
      console.log('[MP] Usando variáveis de ambiente (banco indisponível)');
    }
  }

  // Garante que credenciais do DB foram carregadas
  async _ensureLoaded(pool) {
    if (!this._dbLoaded && pool) await this.reloadFromDB(pool);
  }

  // ══════════════════════════════
  // Headers padrão
  // ══════════════════════════════
  _headers(idempotencyKey) {
    const h = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
    if (idempotencyKey) {
      h['X-Idempotency-Key'] = idempotencyKey;
    }
    return h;
  }

  // ══════════════════════════════
  // Request genérico — fetch() nativo
  // ══════════════════════════════
  async _request(method, path, body = null, idempotencyKey = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: this._headers(idempotencyKey)
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      console.error('[MP] API Error:', res.status, JSON.stringify(data));
      const msg = data.message || data.error || `Erro MP API: ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  // ══════════════════════════════
  // Monta body completo (payer + additional_info)
  // Regras de tipo do guia MP:
  //   payer.address.street_number                              → STRING ("123")
  //   additional_info.payer.address.street_number               → INTEGER (123)
  //   additional_info.shipments.receiver_address.street_number  → INTEGER (123)
  // ══════════════════════════════
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

    const body = {
      transaction_amount,
      description: descricao || 'IMP Locadora - Pagamento',
      statement_descriptor: 'IMP LOCADORA',
      external_reference: external_reference || undefined,
      notification_url: this.webhookUrl || undefined,
      payer: {
        email: email || 'motorista@implocadora.com',
        first_name: firstName,
        last_name: lastName,
        identification: { type: 'CPF', number: cpfLimpo },
        address: {
          zip_code: cepLimpo,
          street_name: ruaNome,
          street_number: numeroStr,
          neighborhood: bairro || '',
          city: cidade || '',
          federal_unit: estado || 'SC',
        },
      },
      additional_info: {
        items: [{
          id: external_reference || 'pagamento',
          title: descricao || 'IMP Locadora - Pagamento',
          description: descricao || 'IMP Locadora - Pagamento',
          quantity: 1,
          unit_price: transaction_amount,
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
            street_number: numeroInt,
          },
        },
        shipments: {
          receiver_address: {
            zip_code: cepLimpo,
            street_name: ruaNome,
            street_number: numeroInt,
            city_name: cidade || '',
            state_name: estado || 'SC',
          },
        },
      },
      ...extras,
    };

    return body;
  }

  // ══════════════════════════════
  // PIX — Criar pagamento
  // ══════════════════════════════
  async criarPix(dados) {
    const idempotency = dados.idempotencyKey || `pix-${dados.external_reference}-${Date.now()}`;
    const body = this._buildFullBody(dados, { payment_method_id: 'pix' });
    const data = await this._request('POST', '/v1/payments', body, idempotency);

    return {
      mp_payment_id: String(data.id),
      mp_qr_code: data.point_of_interaction?.transaction_data?.qr_code || null,
      mp_qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      mp_ticket_url: data.point_of_interaction?.transaction_data?.ticket_url || null,
      mp_expiration: data.date_of_expiration || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: data.status,
    };
  }

  // ══════════════════════════════
  // CARTÃO — Tokenizar server-side (sem CORS)
  // Usa public_key como query param — sem necessidade de access token
  // ══════════════════════════════
  async tokenizarCartao({ cardNumber, expMonth, expYear, securityCode, cardholderName, cpf }) {
    if (!this.publicKey) throw new Error('Public Key do MP não configurada');

    const payload = {
      card_number: cardNumber.replace(/\D/g, ''),
      expiration_month: parseInt(expMonth),
      expiration_year: parseInt(expYear) < 100 ? 2000 + parseInt(expYear) : parseInt(expYear),
      security_code: securityCode,
      cardholder: {
        name: cardholderName,
        identification: { type: 'CPF', number: cpf ? cpf.replace(/\D/g, '') : '00000000000' },
      },
    };

    const url = `${this.baseUrl}/v1/card_tokens?public_key=${encodeURIComponent(this.publicKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const desc = data.cause?.[0]?.description || data.message || `HTTP ${res.status}`;
      throw new Error(`Erro ao tokenizar cartão MP: ${desc}`);
    }

    return data.id; // card token string
  }

  // ══════════════════════════════
  // CARTÃO — Pagamento com token (Checkout Transparente)
  // ══════════════════════════════
  async criarCartaoToken(dados, token, parcelas = 1) {
    const idempotency = dados.idempotencyKey || `card-${dados.external_reference}-${Date.now()}`;
    const body = this._buildFullBody(dados, {
      token,
      installments: 1, // juros já embutido no valor
    });
    const data = await this._request('POST', '/v1/payments', body, idempotency);

    return {
      mp_payment_id: String(data.id),
      status: data.status,
      status_detail: data.status_detail,
    };
  }

  // ══════════════════════════════
  // CARTÃO — Checkout Pro (Preferência)
  // ══════════════════════════════
  async criarPreferenciaCartao({ valor, descricao, parcelas_max = 12, email, nome, cpf, telefone, external_reference, frontendUrl }) {
    const valorFloat = parseFloat(parseFloat(valor).toFixed(2));
    const nomePartes = (nome || '').split(' ');
    const baseUrl = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

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
        email: email || 'motorista@implocadora.com',
        name: nomePartes[0] || undefined,
        surname: nomePartes.slice(1).join(' ') || undefined,
        identification: cpf ? { type: 'CPF', number: cpf.replace(/\D/g, '') } : undefined,
        phone: telefone ? {
          area_code: telefone.replace(/\D/g, '').slice(0, 2),
          number: telefone.replace(/\D/g, '').slice(2),
        } : undefined,
      },
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: 'ticket' }],
      },
      back_urls: {
        success: `${baseUrl}/motorista/pagamentos?status=success`,
        failure: `${baseUrl}/motorista/pagamentos?status=failure`,
        pending: `${baseUrl}/motorista/pagamentos?status=pending`,
      },
      auto_return: 'approved',
      external_reference: external_reference || undefined,
      notification_url: this.webhookUrl || undefined,
      statement_descriptor: 'IMP LOCADORA',
    };

    const data = await this._request('POST', '/checkout/preferences', body);

    return {
      mp_preference_id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    };
  }

  // ══════════════════════════════
  // Consultar pagamento
  // ══════════════════════════════
  async consultarPagamento(paymentId) {
    const data = await this._request('GET', `/v1/payments/${paymentId}`);
    return {
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      transaction_amount: data.transaction_amount,
      date_approved: data.date_approved,
      payment_method_id: data.payment_method_id,
      payment_type_id: data.payment_type_id,
      installments: data.installments,
      payer: data.payer,
      external_reference: data.external_reference,
    };
  }

  // ══════════════════════════════
  // Reembolso (total ou parcial)
  // ══════════════════════════════
  async reembolsar(paymentId, amount = null) {
    const body = amount ? { amount: parseFloat(amount) } : {};
    return this._request('POST', `/v1/payments/${paymentId}/refunds`, body);
  }

  // ══════════════════════════════
  // Cancelar pagamento pendente
  // ══════════════════════════════
  async cancelar(paymentId) {
    return this._request('PUT', `/v1/payments/${paymentId}`, { status: 'cancelled' });
  }
}

// ══════════════════════════════
// Singleton — mesma instância reutilizada
// ══════════════════════════════
const mpInstance = new MercadoPagoService();

/**
 * Retorna instância do MercadoPagoService carregada com credenciais do DB.
 * Padrão Araquari Cestas: singleton com lazy loading.
 * 
 * @param {Pool} pool - Pool do PostgreSQL
 * @returns {MercadoPagoService|null} - null se não configurado (modo simulação)
 */
async function getMercadoPago(pool) {
  await mpInstance._ensureLoaded(pool);

  if (!mpInstance.isConfigured()) {
    console.warn('⚠️  MP token não configurado. Usando modo simulação.');
    return null;
  }

  return mpInstance;
}

/**
 * Força recarga das credenciais do banco.
 * Chamar após admin salvar novas credenciais no Settings.
 */
async function reloadMercadoPago(pool) {
  mpInstance._dbLoaded = false;
  await mpInstance.reloadFromDB(pool);
  return mpInstance.isConfigured();
}

module.exports = { MercadoPagoService, getMercadoPago, reloadMercadoPago, mpInstance };
