const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/contract-clauses
 * Lista todas as cláusulas (admin)
 */
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contract_clauses ORDER BY ordem');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar cláusulas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/contract-clauses/:id
 * Atualizar cláusula
 */
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { titulo, conteudo, ativo, ordem } = req.body;
    await pool.query(
      'UPDATE contract_clauses SET titulo = COALESCE($1, titulo), conteudo = COALESCE($2, conteudo), ativo = COALESCE($3, ativo), ordem = COALESCE($4, ordem), updated_at = NOW() WHERE id = $5',
      [titulo, conteudo, ativo, ordem, req.params.id]
    );
    res.json({ message: 'Cláusula atualizada' });
  } catch (err) {
    console.error('Erro ao atualizar cláusula:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/contract-clauses
 * Criar nova cláusula
 */
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { titulo, conteudo } = req.body;
    if (!titulo || !conteudo) return res.status(400).json({ error: 'Título e conteúdo obrigatórios' });
    const maxOrdem = await pool.query('SELECT COALESCE(MAX(ordem), 0) + 1 as next FROM contract_clauses');
    const result = await pool.query(
      'INSERT INTO contract_clauses (titulo, conteudo, ordem) VALUES ($1, $2, $3) RETURNING *',
      [titulo, conteudo, maxOrdem.rows[0].next]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar cláusula:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/contract-clauses/:id
 */
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM contract_clauses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Cláusula removida' });
  } catch (err) {
    console.error('Erro ao remover cláusula:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/contract-clauses/reorder
 * Reordenar cláusulas
 */
router.put('/reorder/batch', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items } = req.body; // [{id, ordem}]
    for (const item of items) {
      await client.query('UPDATE contract_clauses SET ordem = $1 WHERE id = $2', [item.ordem, item.id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Reordenado' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
