const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir } = require('../middleware/upload');

const router = express.Router();

// Campos de specs
const SPEC_FIELDS = ['ar_condicionado', 'combustivel', 'transmissao', 'direcao', 'consumo_medio', 'portas', 'descricao', 'renavam'];

/**
 * GET /api/cars - Lista carros disponíveis (público)
 */
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM cars';
    if (req.query.disponivel !== 'all') {
      query += ' WHERE disponivel = true';
    }
    query += ' ORDER BY marca, modelo';
    const result = await pool.query(query);
    // Remove placa do endpoint público
    const carsPublic = result.rows.map(({ placa, ...rest }) => rest);
    res.json(carsPublic);
  } catch (err) {
    console.error('Erro ao listar carros:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/cars/all - Admin: todos os carros
 */
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM driver_profiles dp WHERE dp.car_id = c.id AND dp.status IN ('ativo','inadimplente')) as motoristas_ativos
      FROM cars c ORDER BY c.marca, c.modelo
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar carros:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/cars/:id - Detalhe público (sem placa)
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cars WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carro não encontrado' });
    }
    // Público: remove placa
    const { placa, ...car } = result.rows[0];
    res.json(car);
  } catch (err) {
    console.error('Erro ao buscar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/cars - Admin: criar carro
 */
router.post('/', auth, adminOnly, setUploadDir('cars'), upload.single('foto'), async (req, res) => {
  try {
    const { marca, modelo, ano, placa, cor, valor_semanal, valor_caucao, observacoes,
      ar_condicionado, combustivel, transmissao, direcao, consumo_medio, portas, descricao, renavam } = req.body;

    if (!marca || !modelo || !placa || !valor_semanal) {
      return res.status(400).json({ error: 'Campos obrigatórios: marca, modelo, placa, valor_semanal' });
    }

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : null;

    const result = await pool.query(`
      INSERT INTO cars (marca, modelo, ano, placa, cor, foto_url, valor_semanal, valor_caucao, observacoes,
        ar_condicionado, combustivel, transmissao, direcao, consumo_medio, portas, descricao, renavam)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [marca, modelo, ano || null, placa, cor || null, fotoUrl, valor_semanal, valor_caucao || 0, observacoes || null,
      ar_condicionado === 'true' || ar_condicionado === true, combustivel || 'Flex', transmissao || 'Manual',
      direcao || 'Hidráulica', consumo_medio || null, portas || 4, descricao || null, renavam || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Placa já cadastrada' });
    console.error('Erro ao criar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/cars/:id - Admin: atualizar carro
 */
router.put('/:id', auth, adminOnly, setUploadDir('cars'), upload.single('foto'), async (req, res) => {
  try {
    const { marca, modelo, ano, placa, cor, valor_semanal, valor_caucao, disponivel, observacoes,
      ar_condicionado, combustivel, transmissao, direcao, consumo_medio, portas, descricao, renavam } = req.body;

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : undefined;

    let query = `UPDATE cars SET marca=$1, modelo=$2, ano=$3, placa=$4, cor=$5, valor_semanal=$6, valor_caucao=$7,
      disponivel=$8, observacoes=$9, ar_condicionado=$10, combustivel=$11, transmissao=$12, direcao=$13,
      consumo_medio=$14, portas=$15, descricao=$16, renavam=$17, updated_at=NOW()`;
    const params = [marca, modelo, ano, placa, cor, valor_semanal, valor_caucao || 0,
      disponivel !== 'false' && disponivel !== false, observacoes,
      ar_condicionado === 'true' || ar_condicionado === true,
      combustivel || 'Flex', transmissao || 'Manual', direcao || 'Hidráulica',
      consumo_medio || null, portas || 4, descricao || null, renavam || null];

    if (fotoUrl) {
      query += `, foto_url=$${params.length + 1}`;
      params.push(fotoUrl);
    }

    params.push(req.params.id);
    query += ` WHERE id=$${params.length} RETURNING *`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/cars/:id/photos - Admin: upload fotos extras
 */
router.post('/:id/photos', auth, adminOnly, setUploadDir('cars'), upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    const fotoUrl = `/uploads/cars/${req.file.filename}`;

    // Busca fotos atuais
    const car = await pool.query('SELECT fotos_extras FROM cars WHERE id = $1', [req.params.id]);
    if (car.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });

    let fotos = [];
    try { fotos = JSON.parse(car.rows[0].fotos_extras || '[]'); } catch { fotos = []; }
    fotos.push(fotoUrl);

    await pool.query('UPDATE cars SET fotos_extras = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(fotos), req.params.id]);
    res.json({ fotos, nova: fotoUrl });
  } catch (err) {
    console.error('Erro ao adicionar foto:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/cars/:id/photos - Admin: remover foto extra
 */
router.delete('/:id/photos', auth, adminOnly, async (req, res) => {
  try {
    const { url } = req.body;
    const car = await pool.query('SELECT fotos_extras FROM cars WHERE id = $1', [req.params.id]);
    if (car.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });

    let fotos = [];
    try { fotos = JSON.parse(car.rows[0].fotos_extras || '[]'); } catch { fotos = []; }
    fotos = fotos.filter(f => f !== url);

    await pool.query('UPDATE cars SET fotos_extras = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(fotos), req.params.id]);
    res.json({ fotos });
  } catch (err) {
    console.error('Erro ao remover foto:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/cars/:id
 */
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cars WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });
    res.json({ message: 'Carro removido' });
  } catch (err) {
    console.error('Erro ao remover carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
