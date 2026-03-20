const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir, processUpload, processUploads } = require('../middleware/upload');

const router = express.Router();

/**
 * GET /api/properties - Lista imóveis disponíveis (público)
 * Esconde endereço completo, mostra apenas bairro + cidade
 */
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM properties';
    if (req.query.disponivel !== 'all') {
      query += ' WHERE disponivel = true';
    }
    query += ' ORDER BY cidade, bairro, titulo';
    const result = await pool.query(query);
    // Público: esconde endereço completo, cep
    const propertiesPublic = result.rows.map(({ endereco, cep, ...rest }) => rest);
    res.json(propertiesPublic);
  } catch (err) {
    console.error('Erro ao listar imóveis:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/properties/all - Admin: todos os imóveis
 */
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM properties ORDER BY cidade, bairro, titulo');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar imóveis:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/properties/:id - Detalhe público (sem endereço completo)
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Imóvel não encontrado' });
    }
    // Público: esconde endereço completo, cep
    const { endereco, cep, ...property } = result.rows[0];
    res.json(property);
  } catch (err) {
    console.error('Erro ao buscar imóvel:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/properties - Admin: criar imóvel
 */
router.post('/', auth, adminOnly, setUploadDir('properties'), upload.single('foto'), async (req, res) => {
  try {
    const { tipo, titulo, endereco, bairro, cidade, estado, cep,
      quartos, banheiros, vagas_garagem, area_m2, valor_mensal, valor_deposito,
      mobiliado, aceita_pets, piscina, churrasqueira, portaria_24h, elevador,
      academia, varanda, area_servico, playground, salao_festas,
      descricao, observacoes } = req.body;

    if (!endereco || !cidade || !valor_mensal) {
      return res.status(400).json({ error: 'Campos obrigatórios: endereco, cidade, valor_mensal' });
    }

    const fotoUrl = await processUpload(req.file, 'properties');
    const toBool = (v) => v === 'true' || v === true;

    const result = await pool.query(`
      INSERT INTO properties (tipo, titulo, endereco, bairro, cidade, estado, cep,
        quartos, banheiros, vagas_garagem, area_m2, valor_mensal, valor_deposito,
        mobiliado, aceita_pets, piscina, churrasqueira, portaria_24h, elevador,
        academia, varanda, area_servico, playground, salao_festas,
        descricao, foto_url, observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      RETURNING *
    `, [
      tipo || 'apartamento', titulo || null, endereco, bairro || null, cidade, estado || 'SC', cep || null,
      quartos || 0, banheiros || 0, vagas_garagem || 0, area_m2 || null, valor_mensal, valor_deposito || 0,
      toBool(mobiliado), toBool(aceita_pets), toBool(piscina), toBool(churrasqueira),
      toBool(portaria_24h), toBool(elevador), toBool(academia), toBool(varanda),
      toBool(area_servico), toBool(playground), toBool(salao_festas),
      descricao || null, fotoUrl, observacoes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar imóvel:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/properties/:id - Admin: atualizar imóvel
 */
router.put('/:id', auth, adminOnly, setUploadDir('properties'), upload.single('foto'), async (req, res) => {
  try {
    const { tipo, titulo, endereco, bairro, cidade, estado, cep,
      quartos, banheiros, vagas_garagem, area_m2, valor_mensal, valor_deposito,
      disponivel, mobiliado, aceita_pets, piscina, churrasqueira, portaria_24h, elevador,
      academia, varanda, area_servico, playground, salao_festas,
      descricao, observacoes } = req.body;

    const fotoUrl = req.file ? await processUpload(req.file, 'properties') : undefined;
    const toBool = (v) => v === 'true' || v === true;

    let query = `UPDATE properties SET tipo=$1, titulo=$2, endereco=$3, bairro=$4, cidade=$5, estado=$6, cep=$7,
      quartos=$8, banheiros=$9, vagas_garagem=$10, area_m2=$11, valor_mensal=$12, valor_deposito=$13,
      disponivel=$14, mobiliado=$15, aceita_pets=$16, piscina=$17, churrasqueira=$18, portaria_24h=$19,
      elevador=$20, academia=$21, varanda=$22, area_servico=$23, playground=$24, salao_festas=$25,
      descricao=$26, observacoes=$27, updated_at=NOW()`;
    const params = [
      tipo || 'apartamento', titulo || null, endereco, bairro || null, cidade, estado || 'SC', cep || null,
      quartos || 0, banheiros || 0, vagas_garagem || 0, area_m2 || null, valor_mensal, valor_deposito || 0,
      disponivel !== 'false' && disponivel !== false,
      toBool(mobiliado), toBool(aceita_pets), toBool(piscina), toBool(churrasqueira),
      toBool(portaria_24h), toBool(elevador), toBool(academia), toBool(varanda),
      toBool(area_servico), toBool(playground), toBool(salao_festas),
      descricao || null, observacoes || null
    ];

    if (fotoUrl) {
      query += `, foto_url=$${params.length + 1}`;
      params.push(fotoUrl);
    }

    params.push(req.params.id);
    query += ` WHERE id=$${params.length} RETURNING *`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar imóvel:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/properties/:id/photos - Admin: upload fotos extras (múltiplas)
 */
router.post('/:id/photos', auth, adminOnly, setUploadDir('properties'), upload.array('fotos', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const novasFotos = await processUploads(req.files, 'properties');

    // Busca fotos atuais
    const prop = await pool.query('SELECT fotos_extras FROM properties WHERE id = $1', [req.params.id]);
    if (prop.rows.length === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });

    let fotos = [];
    try { fotos = JSON.parse(prop.rows[0].fotos_extras || '[]'); } catch { fotos = []; }
    fotos.push(...novasFotos);

    await pool.query('UPDATE properties SET fotos_extras = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(fotos), req.params.id]);
    res.json({ fotos, novas: novasFotos });
  } catch (err) {
    console.error('Erro ao adicionar fotos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/properties/:id/photos - Admin: remover foto extra
 */
router.delete('/:id/photos', auth, adminOnly, async (req, res) => {
  try {
    const { url } = req.body;
    const prop = await pool.query('SELECT fotos_extras FROM properties WHERE id = $1', [req.params.id]);
    if (prop.rows.length === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });

    let fotos = [];
    try { fotos = JSON.parse(prop.rows[0].fotos_extras || '[]'); } catch { fotos = []; }
    fotos = fotos.filter(f => f !== url);

    await pool.query('UPDATE properties SET fotos_extras = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(fotos), req.params.id]);
    res.json({ fotos });
  } catch (err) {
    console.error('Erro ao remover foto:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/properties/:id - Admin: remover imóvel
 */
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });
    res.json({ message: 'Imóvel removido' });
  } catch (err) {
    console.error('Erro ao remover imóvel:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
