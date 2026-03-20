const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir } = require('../middleware/upload');

const router = express.Router();

// Campos de specs
const SPEC_FIELDS = ['ar_condicionado', 'combustivel', 'transmissao', 'direcao', 'consumo_medio', 'portas', 'descricao', 'renavam',
  'vidro_eletrico', 'trava_eletrica', 'airbag', 'freio_abs', 'sensor_estacionamento', 'camera_re',
  'multimidia', 'bluetooth', 'gps_nativo', 'banco_couro', 'teto_solar', 'sensor_chuva',
  'farol_neblina', 'rodas_liga', 'alarme', 'controle_tracao', 'piloto_automatico'];

const BOOLEAN_FEATURES = ['ar_condicionado', 'vidro_eletrico', 'trava_eletrica', 'airbag', 'freio_abs',
  'sensor_estacionamento', 'camera_re', 'multimidia', 'bluetooth', 'gps_nativo', 'banco_couro',
  'teto_solar', 'sensor_chuva', 'farol_neblina', 'rodas_liga', 'alarme', 'controle_tracao', 'piloto_automatico'];

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
      combustivel, transmissao, direcao, consumo_medio, portas, descricao, renavam } = req.body;

    if (!marca || !modelo || !placa || !valor_semanal) {
      return res.status(400).json({ error: 'Campos obrigatórios: marca, modelo, placa, valor_semanal' });
    }

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : null;

    const boolVals = {};
    for (const f of BOOLEAN_FEATURES) {
      boolVals[f] = req.body[f] === 'true' || req.body[f] === true;
    }

    const cols = ['marca', 'modelo', 'ano', 'placa', 'cor', 'foto_url', 'valor_semanal', 'valor_caucao', 'observacoes',
      'combustivel', 'transmissao', 'direcao', 'consumo_medio', 'portas', 'descricao', 'renavam', ...BOOLEAN_FEATURES];
    const vals = [marca, modelo, ano || null, placa, cor || null, fotoUrl, valor_semanal, valor_caucao || 0, observacoes || null,
      combustivel || 'Flex', transmissao || 'Manual', direcao || 'Hidráulica', consumo_medio || null, portas || 4,
      descricao || null, renavam || null, ...BOOLEAN_FEATURES.map(f => boolVals[f])];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');

    const result = await pool.query(
      `INSERT INTO cars (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`, vals);

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
      combustivel, transmissao, direcao, consumo_medio, portas, descricao, renavam } = req.body;

    const fotoUrl = req.file ? `/uploads/cars/${req.file.filename}` : undefined;

    const boolVals = {};
    for (const f of BOOLEAN_FEATURES) {
      boolVals[f] = req.body[f] === 'true' || req.body[f] === true;
    }

    let idx = 1;
    const sets = [];
    const params = [];
    const addParam = (col, val) => { sets.push(`${col}=$${idx++}`); params.push(val); };

    addParam('marca', marca); addParam('modelo', modelo); addParam('ano', ano);
    addParam('placa', placa); addParam('cor', cor); addParam('valor_semanal', valor_semanal);
    addParam('valor_caucao', valor_caucao || 0);
    addParam('disponivel', disponivel !== 'false' && disponivel !== false);
    addParam('observacoes', observacoes);
    addParam('combustivel', combustivel || 'Flex'); addParam('transmissao', transmissao || 'Manual');
    addParam('direcao', direcao || 'Hidráulica'); addParam('consumo_medio', consumo_medio || null);
    addParam('portas', portas || 4); addParam('descricao', descricao || null);
    addParam('renavam', renavam || null);
    for (const f of BOOLEAN_FEATURES) { addParam(f, boolVals[f]); }

    let query = `UPDATE cars SET ${sets.join(', ')}, updated_at=NOW()`;

    if (fotoUrl) {
      query += `, foto_url=$${idx++}`;
      params.push(fotoUrl);
    }

    params.push(req.params.id);
    query += ` WHERE id=$${idx} RETURNING *`;

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
router.post('/:id/photos', auth, adminOnly, setUploadDir('cars'), upload.array('fotos', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    // Busca fotos atuais
    const car = await pool.query('SELECT fotos_extras FROM cars WHERE id = $1', [req.params.id]);
    if (car.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });

    let fotos = [];
    try { fotos = JSON.parse(car.rows[0].fotos_extras || '[]'); } catch { fotos = []; }

    const novas = [];
    for (const file of req.files) {
      const url = `/uploads/cars/${file.filename}`;
      fotos.push(url);
      novas.push(url);
    }

    await pool.query('UPDATE cars SET fotos_extras = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(fotos), req.params.id]);
    res.json({ fotos, novas });
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
