const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { reloadMercadoPago } = require('../services/MercadoPagoService');

const router = express.Router();

// Chaves SENSÍVEIS (credenciais MP, secrets).
// - GET retorna mascarado (ex: "***UL7K").
// - PUT exige JWT com claim via='magic_link' (recebido pelo magic link admin).
//   Defesa em profundidade: mesmo se senha admin vazar, atacante não troca
//   credenciais MP sem acesso ao email do JOs.
const SENSITIVE_KEYS = new Set([
  'mp_access_token',
  'mp_access_token_test',
  'mp_public_key',
  'mp_public_key_test',
  'mp_webhook_secret',
]);

function _maskSecret(value) {
  if (!value || typeof value !== 'string') return value;
  const v = value.trim();
  if (v.length === 0) return '';
  if (v.length <= 8) return '***';
  return '***' + v.slice(-4); // só os últimos 4 chars (suficiente pro admin reconhecer)
}

/**
 * GET /api/settings
 * Credenciais sensíveis vêm MASCARADAS — admin vê só "***UL7K" pra confirmar
 * que valor existe e qual conta é (último 4). Pra ver/mudar o token completo,
 * só via re-autenticação por magic-link (claim via='magic_link').
 */
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY chave');
    const isMagicLink = req.user && req.user.via === 'magic_link';
    const settings = {};
    result.rows.forEach(row => {
      let valor = row.valor;
      if (SENSITIVE_KEYS.has(row.chave) && !isMagicLink) {
        valor = _maskSecret(valor);
      }
      settings[row.chave] = { valor, descricao: row.descricao, sensitive: SENSITIVE_KEYS.has(row.chave) };
    });
    res.json(settings);
  } catch (err) {
    console.error('Erro ao buscar settings:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/settings
 * Body: { chave: valor, chave2: valor2, ... }
 * Chaves SENSITIVE_KEYS exigem JWT com claim via='magic_link'.
 * Toda mudança vai pro audit_log (valor mascarado).
 */
router.put('/', auth, adminOnly, async (req, res) => {
  const updates = req.body || {};
  const isMagicLink = req.user && req.user.via === 'magic_link';

  // Bloqueia mudança em credenciais sensíveis sem step-up auth.
  const sensitiveAttempt = Object.keys(updates).filter(k => SENSITIVE_KEYS.has(k));
  if (sensitiveAttempt.length > 0 && !isMagicLink) {
    return res.status(403).json({
      error: 'Pra alterar credenciais sensíveis (Mercado Pago, webhook secret), entre via magic link admin (/admin/magic-link).',
      sensitive_keys: sensitiveAttempt,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [chave, valor] of Object.entries(updates)) {
      // Pega valor antigo pra audit
      const old = await client.query('SELECT valor FROM settings WHERE chave = $1', [chave]);
      const oldVal = old.rows[0]?.valor || null;

      await client.query(
        'UPDATE settings SET valor = $1, updated_at = NOW() WHERE chave = $2',
        [String(valor), chave]
      );

      // Audit: registra mudança. Mascara valores sensíveis.
      try {
        await client.query(
          `INSERT INTO audit_log (user_id, user_email, acao, recurso, recurso_id, dados_antigos, dados_novos, ip, via)
           VALUES ($1, $2, 'update_setting', 'settings', $3, $4, $5, $6, $7)`,
          [
            req.user.id,
            req.user.email,
            chave,
            SENSITIVE_KEYS.has(chave) ? _maskSecret(oldVal) : oldVal,
            SENSITIVE_KEYS.has(chave) ? _maskSecret(String(valor)) : String(valor),
            req.ip || null,
            req.user.via || 'password',
          ]
        );
      } catch (_) { /* audit_log pode não existir ainda */ }
    }

    await client.query('COMMIT');

    // Se atualizou credenciais do MP, recarrega o serviço
    const mpKeys = Object.keys(updates).filter(k => k.startsWith('mp_'));
    if (mpKeys.length > 0) {
      const ok = await reloadMercadoPago(pool);
      console.log(`[Settings] Credenciais MP recarregadas. Configurado: ${ok}`);
    }

    res.json({ message: 'Configurações atualizadas' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar settings:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/settings/installment-fees
 */
router.get('/installment-fees', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM installment_fees WHERE ativo = true ORDER BY parcelas');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar taxas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/settings/installment-fees
 * Body: [{ parcelas: 1, taxa_percentual: 0 }, ...]
 */
router.put('/installment-fees', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fees = req.body;

    for (const fee of fees) {
      await client.query(`
        INSERT INTO installment_fees (parcelas, taxa_percentual)
        VALUES ($1, $2)
        ON CONFLICT (parcelas) DO UPDATE SET taxa_percentual = $2, updated_at = NOW()
      `, [fee.parcelas, fee.taxa_percentual]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Taxas atualizadas' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar taxas:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
