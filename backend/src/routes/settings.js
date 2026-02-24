const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/settings
 */
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY chave');
    // Retorna como objeto chave:valor
    const settings = {};
    result.rows.forEach(row => {
      settings[row.chave] = { valor: row.valor, descricao: row.descricao };
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
 */
router.put('/', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updates = req.body;

    for (const [chave, valor] of Object.entries(updates)) {
      await client.query(
        'UPDATE settings SET valor = $1, updated_at = NOW() WHERE chave = $2',
        [String(valor), chave]
      );
    }

    await client.query('COMMIT');
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
