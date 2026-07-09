const express = require('express');
const pool = require('../config/database');
const PDFDocument = require('pdfkit');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir, processUpload, processUploads } = require('../middleware/upload');

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
 * GET /api/cars/maintenance/report-all - Relatório geral de manutenção (PDF)
 * (deve ficar ANTES de /:id para não conflitar)
 */
router.get('/maintenance/report-all', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cm.*, c.marca, c.modelo, c.placa,
             u.nome AS motorista_nome
      FROM car_maintenance cm
      JOIN cars c ON c.id = cm.car_id
      LEFT JOIN abatimentos a ON a.id = cm.abatimento_id
      LEFT JOIN driver_profiles dp ON dp.id = a.driver_id
      LEFT JOIN users u ON u.id = dp.user_id
      ORDER BY cm.data_realizacao DESC
    `);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 40, right: 40 }, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=manutencao_geral.pdf');
      res.send(buffer);
    });

    // Agrupa por veículo
    const porVeiculo = {};
    for (const m of result.rows) {
      const key = `${m.marca} ${m.modelo} (${m.placa})`;
      if (!porVeiculo[key]) porVeiculo[key] = [];
      porVeiculo[key].push(m);
    }

    const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Capa
    doc.font('Helvetica-Bold').fontSize(18).text('IMP Locadora', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(14).text('Relatório Geral de Manutenção', { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#666').text(`Todos os Veículos`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, { align: 'right' });
    doc.fillColor('#000');
    doc.moveDown(0.5);

    // Resumo
    let totalGeralGasto = 0;
    let totalGeralItens = 0;
    for (const items of Object.values(porVeiculo)) {
      totalGeralItens += items.length;
      totalGeralGasto += items.reduce((s, m) => s + parseFloat(m.valor || 0), 0);
    }
    doc.font('Helvetica-Bold').fontSize(11).text(`${Object.keys(porVeiculo).length} veículos | ${totalGeralItens} manutenções | Total: R$ ${fmt(totalGeralGasto)}`);
    doc.moveDown(0.5);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ccc').stroke();

    // Cada veículo
    for (const [veiculo, items] of Object.entries(porVeiculo)) {
      doc.addPage();
      gerarPdfManutencao(doc, `Manutenção`, veiculo, items);
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar relatório geral:', err);
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

    const fotoUrl = await processUpload(req.file, 'cars');

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

    const fotoUrl = req.file ? await processUpload(req.file, 'cars') : undefined;

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

    const novas = await processUploads(req.files, 'cars');
    fotos.push(...novas);

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

// ========== MANUTENÇÃO DE VEÍCULOS ==========

/**
 * GET /api/cars/:id/maintenance - Listar manutenções de um carro
 */
router.get('/:id/maintenance', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cm.*, a.nota_url AS comprovante_url, u.nome AS motorista_nome
      FROM car_maintenance cm
      LEFT JOIN abatimentos a ON a.id = cm.abatimento_id
      LEFT JOIN driver_profiles dp ON dp.id = a.driver_id
      LEFT JOIN users u ON u.id = dp.user_id
      WHERE cm.car_id = $1
      ORDER BY cm.data_realizacao DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar manutenções:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/cars/:id/maintenance - Adicionar manutenção (com nota fiscal opcional)
 */
router.post('/:id/maintenance', auth, adminOnly, setUploadDir('manutencao'), upload.single('nota'), async (req, res) => {
  try {
    const { tipo, descricao, data_realizacao, km_realizacao, valor, fornecedor, observacoes } = req.body;
    if (!tipo || !data_realizacao) {
      return res.status(400).json({ error: 'Tipo e data são obrigatórios' });
    }
    const notaUrl = await processUpload(req.file, 'manutencao');
    const result = await pool.query(`
      INSERT INTO car_maintenance (car_id, tipo, descricao, data_realizacao, km_realizacao, valor, fornecedor, observacoes, nota_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [req.params.id, tipo, descricao || null, data_realizacao, km_realizacao || null,
        valor || 0, fornecedor || null, observacoes || null, notaUrl]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao adicionar manutenção:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/cars/:id/maintenance/:mid - Atualizar manutenção (com nota fiscal opcional)
 */
router.put('/:id/maintenance/:mid', auth, adminOnly, setUploadDir('manutencao'), upload.single('nota'), async (req, res) => {
  try {
    const { tipo, descricao, data_realizacao, km_realizacao, valor, fornecedor, observacoes } = req.body;
    const notaUrl = await processUpload(req.file, 'manutencao');

    let query, params;
    if (notaUrl) {
      query = `UPDATE car_maintenance
        SET tipo = $1, descricao = $2, data_realizacao = $3, km_realizacao = $4,
            valor = $5, fornecedor = $6, observacoes = $7, nota_url = $8, updated_at = NOW()
        WHERE id = $9 AND car_id = $10 RETURNING *`;
      params = [tipo, descricao || null, data_realizacao, km_realizacao || null,
        valor || 0, fornecedor || null, observacoes || null, notaUrl,
        req.params.mid, req.params.id];
    } else {
      query = `UPDATE car_maintenance
        SET tipo = $1, descricao = $2, data_realizacao = $3, km_realizacao = $4,
            valor = $5, fornecedor = $6, observacoes = $7, updated_at = NOW()
        WHERE id = $8 AND car_id = $9 RETURNING *`;
      params = [tipo, descricao || null, data_realizacao, km_realizacao || null,
        valor || 0, fornecedor || null, observacoes || null,
        req.params.mid, req.params.id];
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Manutenção não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar manutenção:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/cars/:id/maintenance/:mid - Remover manutenção
 */
router.delete('/:id/maintenance/:mid', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM car_maintenance WHERE id = $1 AND car_id = $2 RETURNING id',
      [req.params.mid, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Manutenção não encontrada' });
    res.json({ message: 'Removida' });
  } catch (err) {
    console.error('Erro ao remover manutenção:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== GERADOR DE PDF DE MANUTENÇÃO ==========
function gerarPdfManutencao(doc, titulo, subtitulo, rows) {
  const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Cabeçalho
  doc.font('Helvetica-Bold').fontSize(16).text('IMP Locadora', { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(13).text(titulo, { align: 'center' });
  if (subtitulo) {
    doc.font('Helvetica').fontSize(10).fillColor('#666').text(subtitulo, { align: 'center' });
  }
  doc.fillColor('#000');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9).text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, { align: 'right' });
  doc.moveDown(0.5);

  // Linha separadora
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(0.5);

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(11).text('Nenhuma manutenção registrada.', { align: 'center' });
    return 0;
  }

  // Colunas: Data | Tipo | Descrição | KM | Valor | Fornecedor
  const cols = [
    { label: 'Data', w: 58 },
    { label: 'Tipo', w: 110 },
    { label: 'Descrição', w: 110 },
    { label: 'KM', w: 45 },
    { label: 'Valor (R$)', w: 60 },
    { label: 'Fornecedor', w: pageW - 58 - 110 - 110 - 45 - 60 },
  ];

  // Header da tabela
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, pageW, 18).fill('#2563eb');
    let x = doc.page.margins.left + 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    for (const col of cols) {
      doc.text(col.label, x, y + 4, { width: col.w - 8, height: 14, ellipsis: true });
      x += col.w;
    }
    doc.fillColor('#000');
    doc.y = y + 20;
  };

  drawHeader();

  let totalGasto = 0;
  let even = false;

  for (const m of rows) {
    // Verificar se precisa nova página
    if (doc.y + 28 > doc.page.height - 60) {
      doc.addPage();
      drawHeader();
    }

    const valor = parseFloat(m.valor || 0);
    totalGasto += valor;

    const y = doc.y;
    if (even) {
      doc.rect(doc.page.margins.left, y, pageW, 22).fill('#f3f4f6');
    }

    let x = doc.page.margins.left + 4;
    doc.font('Helvetica').fontSize(7.5).fillColor('#333');

    const cellData = [
      fmtDate(m.data_realizacao),
      m.tipo || '',
      m.descricao || '',
      m.km_realizacao ? parseInt(m.km_realizacao).toLocaleString('pt-BR') : '',
      `R$ ${fmt(m.valor)}`,
      m.fornecedor || '',
    ];

    for (let i = 0; i < cols.length; i++) {
      doc.text(cellData[i], x, y + 3, { width: cols[i].w - 8, height: 18, ellipsis: true });
      x += cols[i].w;
    }

    // Observações na linha de baixo se houver
    if (m.observacoes || m.motorista_nome) {
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#888');
      const obs = [m.observacoes, m.motorista_nome ? `Motorista: ${m.motorista_nome}` : ''].filter(Boolean).join(' | ');
      doc.text(obs, doc.page.margins.left + 4, y + 13, { width: pageW - 8, height: 10, ellipsis: true });
    }

    doc.fillColor('#000');
    doc.y = y + 24;
    even = !even;
  }

  // Totais
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Total de manutenções: ${rows.length}`, doc.page.margins.left, doc.y, { continued: true });
  doc.text(`Total gasto: R$ ${fmt(totalGasto)}`, { align: 'right' });

  return totalGasto;
}

/**
 * GET /api/cars/:id/maintenance/report - Relatório de manutenção (PDF)
 */
router.get('/:id/maintenance/report', auth, adminOnly, async (req, res) => {
  try {
    const car = await pool.query('SELECT marca, modelo, placa, ano FROM cars WHERE id = $1', [req.params.id]);
    if (car.rows.length === 0) return res.status(404).json({ error: 'Carro não encontrado' });

    const result = await pool.query(`
      SELECT cm.*, u.nome AS motorista_nome
      FROM car_maintenance cm
      LEFT JOIN abatimentos a ON a.id = cm.abatimento_id
      LEFT JOIN driver_profiles dp ON dp.id = a.driver_id
      LEFT JOIN users u ON u.id = dp.user_id
      WHERE cm.car_id = $1 ORDER BY cm.data_realizacao DESC
    `, [req.params.id]);

    const c = car.rows[0];
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 40, right: 40 }, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=manutencao_${c.placa}.pdf`);
      res.send(buffer);
    });

    const titulo = `Relatório de Manutenção`;
    const subtitulo = `${c.marca} ${c.modelo} ${c.ano || ''} — Placa: ${c.placa}`;
    gerarPdfManutencao(doc, titulo, subtitulo, result.rows);
    doc.end();
  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
