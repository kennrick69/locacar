const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir } = require('../middleware/upload');

const router = express.Router();

/**
 * GET /api/cars
 * Lista carros disponíveis (público) ou todos (admin)
 */
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.headers.authorization ? false : false;
    let query = 'SELECT * FROM cars';
    const params = [];

    // Se não autenticado ou motorista, só mostra disponíveis
    if (req.query.disponivel !== 'all') {
      query += ' WHERE disponivel = true';
    }

    query += ' ORDER BY marca, modelo';
    const result = await pool.query(query, params);
    
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
 * GET /api/cars/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cars WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carro não encontrado' });
    }
    res.json(result.rows[0]);
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
    const { marca, modelo, ano, placa, cor, valor_semanal, valor_caucao, observacoes } = req.body;

    if (!marca || !modelo || !placa || !valor_semanal) {
      return res.status(400).json({ error: 'Campos obrigatórios: marca, modelo, placa, valor_semanal' });
    }

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : null;

    const result = await pool.query(`
      INSERT INTO cars (marca, modelo, ano, placa, cor, foto_url, valor_semanal, valor_caucao, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [marca, modelo, ano || null, placa, cor || null, fotoUrl, valor_semanal, valor_caucao || 0, observacoes || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Placa já cadastrada' });
    }
    console.error('Erro ao criar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/cars/:id - Admin: atualizar carro
 */
router.put('/:id', auth, adminOnly, setUploadDir('cars'), upload.single('foto'), async (req, res) => {
  try {
    const { marca, modelo, ano, placa, cor, valor_semanal, valor_caucao, disponivel, observacoes } = req.body;

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : undefined;

    let query = `UPDATE cars SET marca=$1, modelo=$2, ano=$3, placa=$4, cor=$5, valor_semanal=$6, valor_caucao=$7, disponivel=$8, observacoes=$9, updated_at=NOW()`;
    const params = [marca, modelo, ano, placa, cor, valor_semanal, valor_caucao || 0, disponivel !== false, observacoes];

    if (fotoUrl) {
      query += `, foto_url=$${params.length + 1}`;
      params.push(fotoUrl);
    }

    params.push(req.params.id);
    query += ` WHERE id=$${params.length} RETURNING *`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carro não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/cars/:id - Admin
 */
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cars WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carro não encontrado' });
    }
    res.json({ message: 'Carro removido' });
  } catch (err) {
    console.error('Erro ao remover carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
