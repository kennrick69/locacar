const express = require('express');
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const { upload, setUploadDir } = require('../middleware/upload');

const router = express.Router();

// ========================================================
//  ROTAS DO MOTORISTA
// ========================================================

/**
 * GET /api/drivers/me
 * Perfil completo do motorista logado
 */
router.get('/me', auth, driverOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.valor_semanal as car_valor_semanal, c.valor_caucao as car_valor_caucao,
        c.foto_url as car_foto_url
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.user_id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/me/documents
 * Lista documentos do motorista
 */
router.get('/me/documents', auth, driverOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar documentos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/drivers/me/documents
 * Upload de documento (CNH, comprovante, selfie, contrato)
 * Query: ?tipo=cnh|comprovante|selfie|perfil_app|contrato
 */
router.post('/me/documents',
  auth, driverOnly,
  setUploadDir('documents'),
  upload.single('arquivo'),
  async (req, res) => {
    try {
      const tipo = req.query.tipo || req.body.tipo;
      if (!tipo) {
        return res.status(400).json({ error: 'Tipo do documento é obrigatório (?tipo=cnh|comprovante|selfie|perfil_app|contrato)' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const caminho = `/uploads/documents/${req.file.filename}`;

      // Salva na tabela documents
      const result = await pool.query(`
        INSERT INTO documents (user_id, tipo, nome_arquivo, caminho, mime_type, tamanho)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [req.user.id, tipo, req.file.originalname, caminho, req.file.mimetype, req.file.size]);

      // Atualiza URL no perfil do motorista
      const fieldMap = {
        cnh: 'cnh_url',
        comprovante: 'comprovante_url',
        selfie: 'selfie_url',
        perfil_app: 'perfil_app_url',
        contrato: 'contrato_url',
      };

      if (fieldMap[tipo]) {
        await pool.query(`
          UPDATE driver_profiles SET ${fieldMap[tipo]} = $1, updated_at = NOW()
          WHERE user_id = $2
        `, [caminho, req.user.id]);
      }

      // Se todos os docs obrigatórios foram enviados, atualiza status
      const profile = await pool.query(
        'SELECT cnh_url, comprovante_url, selfie_url, perfil_app_url FROM driver_profiles WHERE user_id = $1',
        [req.user.id]
      );

      if (profile.rows[0]) {
        const p = profile.rows[0];
        if (p.cnh_url && p.comprovante_url && p.selfie_url && p.perfil_app_url) {
          await pool.query(`
            UPDATE driver_profiles SET status = 'em_analise', updated_at = NOW()
            WHERE user_id = $1 AND status = 'pendente'
          `, [req.user.id]);
        }
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erro no upload:', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  }
);

/**
 * POST /api/drivers/me/contrato
 * Upload do contrato Gov.br (PDF)
 */
router.post('/me/contrato',
  auth, driverOnly,
  setUploadDir('contratos'),
  upload.single('contrato'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'O contrato deve ser um arquivo PDF' });
      }

      const caminho = `/uploads/contratos/${req.file.filename}`;

      // Salva doc
      await pool.query(`
        INSERT INTO documents (user_id, tipo, nome_arquivo, caminho, mime_type, tamanho)
        VALUES ($1, 'contrato', $2, $3, $4, $5)
      `, [req.user.id, req.file.originalname, caminho, req.file.mimetype, req.file.size]);

      // Atualiza perfil
      await pool.query(`
        UPDATE driver_profiles SET contrato_url = $1, updated_at = NOW()
        WHERE user_id = $2
      `, [caminho, req.user.id]);

      res.json({ message: 'Contrato enviado com sucesso', caminho });
    } catch (err) {
      console.error('Erro no upload contrato:', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  }
);

// ========================================================
//  COBRANÇAS SEMANAIS (DÉBITOS)
// ========================================================

/**
 * GET /api/drivers/me/charges
 * Lista cobranças semanais do motorista
 */
router.get('/me/charges', auth, driverOnly, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const driverId = profile.rows[0].id;

    const result = await pool.query(`
      SELECT wc.*,
        COALESCE(
          (SELECT json_agg(a.*) FROM abatimentos a WHERE a.charge_id = wc.id),
          '[]'
        ) as abatimentos_lista,
        COALESCE(
          (SELECT json_agg(ac.*) FROM acrescimos ac WHERE ac.charge_id = wc.id),
          '[]'
        ) as acrescimos_lista,
        COALESCE(
          (SELECT SUM(p.valor) FROM payments p WHERE p.charge_id = wc.id AND p.status = 'pago'),
          0
        ) as total_pago
      FROM weekly_charges wc
      WHERE wc.driver_id = $1
      ORDER BY wc.semana_ref DESC
    `, [driverId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar cobranças:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/me/charges/current
 * Cobrança da semana atual
 */
router.get('/me/charges/current', auth, driverOnly, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const driverId = profile.rows[0].id;

    // Busca cobrança mais recente não paga
    const result = await pool.query(`
      SELECT wc.*,
        COALESCE(
          (SELECT json_agg(a.* ORDER BY a.created_at DESC) FROM abatimentos a WHERE a.charge_id = wc.id),
          '[]'
        ) as abatimentos_lista
      FROM weekly_charges wc
      WHERE wc.driver_id = $1 AND wc.pago = false
      ORDER BY wc.semana_ref DESC
      LIMIT 1
    `, [driverId]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar cobrança atual:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/me/charges/:id
 * Detalhe de uma cobrança
 */
router.get('/me/charges/:id', auth, driverOnly, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const result = await pool.query(`
      SELECT wc.*,
        COALESCE(
          (SELECT json_agg(a.* ORDER BY a.created_at DESC) FROM abatimentos a WHERE a.charge_id = wc.id),
          '[]'
        ) as abatimentos_lista
      FROM weekly_charges wc
      WHERE wc.id = $1 AND wc.driver_id = $2
    `, [req.params.id, profile.rows[0].id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cobrança não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar cobrança:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/me/balance
 * Saldo/crédito acumulado do motorista
 */
router.get('/me/balance', auth, driverOnly, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const driverId = profile.rows[0].id;

    // Total pago, total devido, crédito
    const stats = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN pago = true THEN valor_final ELSE 0 END), 0) as total_pago,
        COALESCE(SUM(CASE WHEN pago = false THEN valor_final ELSE 0 END), 0) as total_pendente,
        COALESCE(SUM(multa), 0) as total_multas,
        COALESCE(SUM(abatimentos), 0) as total_abatimentos,
        COUNT(*) as total_semanas,
        COUNT(CASE WHEN pago = false THEN 1 END) as semanas_pendentes
      FROM weekly_charges
      WHERE driver_id = $1
    `, [driverId]);

    // Último crédito (da última semana paga)
    const lastPaid = await pool.query(`
      SELECT credito_anterior FROM weekly_charges
      WHERE driver_id = $1
      ORDER BY semana_ref DESC
      LIMIT 1
    `, [driverId]);

    const balance = stats.rows[0];
    balance.credito_atual = lastPaid.rows[0]?.credito_anterior || 0;

    res.json(balance);
  } catch (err) {
    console.error('Erro ao calcular saldo:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========================================================
//  ABATIMENTOS
// ========================================================

/**
 * POST /api/drivers/me/charges/:chargeId/abatimentos
 * Solicitar abatimento com upload de nota
 */
router.post('/me/charges/:chargeId/abatimentos',
  auth, driverOnly,
  setUploadDir('notas'),
  upload.single('nota'),
  async (req, res) => {
    try {
      const { descricao, valor } = req.body;
      const { chargeId } = req.params;

      if (!valor || parseFloat(valor) <= 0) {
        return res.status(400).json({ error: 'Valor do abatimento é obrigatório e deve ser positivo' });
      }

      // Verifica se a cobrança pertence ao motorista
      const profile = await pool.query(
        'SELECT id FROM driver_profiles WHERE user_id = $1',
        [req.user.id]
      );
      const driverId = profile.rows[0].id;

      const charge = await pool.query(
        'SELECT id, pago FROM weekly_charges WHERE id = $1 AND driver_id = $2',
        [chargeId, driverId]
      );

      if (charge.rows.length === 0) {
        return res.status(404).json({ error: 'Cobrança não encontrada' });
      }

      if (charge.rows[0].pago) {
        return res.status(400).json({ error: 'Esta cobrança já foi paga' });
      }

      const notaUrl = req.file ? `/uploads/notas/${req.file.filename}` : null;

      const result = await pool.query(`
        INSERT INTO abatimentos (charge_id, driver_id, descricao, valor, nota_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [chargeId, driverId, descricao || null, parseFloat(valor), notaUrl]);

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erro ao criar abatimento:', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  }
);

// ========================================================
//  PAGAMENTOS DO MOTORISTA
// ========================================================

/**
 * GET /api/drivers/me/payments
 * Histórico de pagamentos
 */
router.get('/me/payments', auth, driverOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, wc.semana_ref
      FROM payments p
      LEFT JOIN weekly_charges wc ON wc.id = p.charge_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar pagamentos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========================================================
//  ROTAS ADMIN - GESTÃO DE MOTORISTAS (usadas na Etapa 3)
// ========================================================

/**
 * POST /api/drivers/admin-create - Admin: cadastrar motorista manualmente
 */
router.post('/admin-create', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nome, email, cpf, telefone, car_id, data_inicio, data_fim, observacoes, dia_cobranca } = req.body;

    if (!nome || !cpf) {
      return res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
    }

    // Verifica se CPF já existe
    const cpfCheck = await client.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
    if (cpfCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    // Cria user (senha = token = 6 primeiros do CPF)
    const bcrypt = require('bcryptjs');
    const cpfClean = cpf.replace(/\D/g, '');
    const tokenExterno = cpfClean.substring(0, 6);
    const senhaHash = await bcrypt.hash(tokenExterno, 10);
    const emailFinal = email || `motorista_${cpfClean}@locacar.temp`;

    const userResult = await client.query(`
      INSERT INTO users (nome, email, senha_hash, cpf, telefone, role)
      VALUES ($1, $2, $3, $4, $5, 'motorista')
      RETURNING id, nome, email, cpf, telefone, role
    `, [nome, emailFinal, senhaHash, cpf, telefone || null]);

    const user = userResult.rows[0];

    // Cria perfil de motorista já ativo
    const profileResult = await client.query(`
      INSERT INTO driver_profiles (user_id, car_id, status, token_externo, contrato_confirmado, data_inicio, motivo_reprovacao, dia_cobranca)
      VALUES ($1, $2, 'ativo', $3, true, $4, $5, $6)
      RETURNING *
    `, [user.id, car_id || null, tokenExterno, data_inicio || new Date(), observacoes || null, dia_cobranca || 'segunda']);

    // Se atribuiu carro, marca como indisponível
    if (car_id) {
      await client.query('UPDATE cars SET disponivel = false, updated_at = NOW() WHERE id = $1', [car_id]);
    }

    await client.query('COMMIT');
    res.status(201).json({
      user,
      profile: profileResult.rows[0],
      token: tokenExterno,
      message: `Motorista criado! Token de acesso: ${tokenExterno}`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar motorista:', err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/drivers - Admin: lista todos os motoristas
 */
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        ci.marca as interesse_marca, ci.modelo as interesse_modelo
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      LEFT JOIN cars ci ON ci.id = dp.car_interesse_id
    `;
    const params = [];

    if (status) {
      query += ' WHERE dp.status = $1';
      params.push(status);
    }

    query += ' ORDER BY dp.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar motoristas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /api/drivers/:id/update - Admin: editar dados do motorista
 */
router.patch('/:id/update', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driverId = req.params.id;
    const { nome, cpf, telefone, email, car_id, dia_cobranca, observacoes, rg, endereco_completo } = req.body;

    // Busca driver
    const driverRes = await client.query('SELECT * FROM driver_profiles WHERE id = $1', [driverId]);
    if (driverRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Motorista não encontrado' }); }
    const driver = driverRes.rows[0];

    // Atualiza user (nome, cpf, telefone, email)
    if (nome || cpf || telefone || email) {
      const fields = [];
      const vals = [];
      let idx = 1;
      if (nome) { fields.push(`nome = $${idx++}`); vals.push(nome); }
      if (cpf) { fields.push(`cpf = $${idx++}`); vals.push(cpf); }
      if (telefone !== undefined) { fields.push(`telefone = $${idx++}`); vals.push(telefone || null); }
      if (email) { fields.push(`email = $${idx++}`); vals.push(email); }
      if (fields.length > 0) {
        vals.push(driver.user_id);
        await client.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
      }
    }

    // Atualiza perfil (car_id, dia_cobranca, observacoes)
    const profileFields = [];
    const profileVals = [];
    let pIdx = 1;

    if (car_id !== undefined) {
      // Libera carro antigo
      if (driver.car_id && driver.car_id !== parseInt(car_id)) {
        await client.query('UPDATE cars SET disponivel = true, updated_at = NOW() WHERE id = $1', [driver.car_id]);
      }
      // Ocupa novo carro
      if (car_id) {
        await client.query('UPDATE cars SET disponivel = false, updated_at = NOW() WHERE id = $1', [car_id]);
      }
      profileFields.push(`car_id = $${pIdx++}`); profileVals.push(car_id || null);
    }
    if (dia_cobranca !== undefined) { profileFields.push(`dia_cobranca = $${pIdx++}`); profileVals.push(dia_cobranca); }
    if (rg !== undefined) { profileFields.push(`rg = $${pIdx++}`); profileVals.push(rg || null); }
    if (endereco_completo !== undefined) { profileFields.push(`endereco_completo = $${pIdx++}`); profileVals.push(endereco_completo || null); }
    if (observacoes !== undefined) { profileFields.push(`motivo_reprovacao = $${pIdx++}`); profileVals.push(observacoes); }

    if (profileFields.length > 0) {
      profileFields.push(`updated_at = NOW()`);
      profileVals.push(driverId);
      await client.query(`UPDATE driver_profiles SET ${profileFields.join(', ')} WHERE id = $${pIdx}`, profileVals);
    }

    // Atualiza token_externo se CPF mudou
    if (cpf) {
      const cpfClean = cpf.replace(/\D/g, '');
      const token = cpfClean.substring(0, 6);
      await client.query('UPDATE driver_profiles SET token_externo = $1 WHERE id = $2', [token, driverId]);
    }

    await client.query('COMMIT');
    
    // Retorna driver atualizado
    const updated = await pool.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.valor_semanal as car_valor_semanal
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.id = $1
    `, [driverId]);

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar motorista:', err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/drivers/:id/documents - Admin: upload documento para motorista
 */
router.post('/:id/documents',
  auth, adminOnly,
  setUploadDir('documents'),
  upload.single('arquivo'),
  async (req, res) => {
    try {
      const driverId = req.params.id;
      const tipo = req.query.tipo || req.body.tipo;

      if (!tipo) {
        return res.status(400).json({ error: 'Tipo do documento é obrigatório (?tipo=cnh|comprovante|selfie|perfil_app|contrato|nota_fiscal|outro)' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      // Busca user_id do motorista
      const profile = await pool.query('SELECT user_id FROM driver_profiles WHERE id = $1', [driverId]);
      if (profile.rows.length === 0) return res.status(404).json({ error: 'Motorista não encontrado' });

      const userId = profile.rows[0].user_id;
      const caminho = `/uploads/documents/${req.file.filename}`;

      // Salva documento
      const result = await pool.query(`
        INSERT INTO documents (user_id, tipo, nome_arquivo, caminho, mime_type, tamanho)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [userId, tipo, req.file.originalname, caminho, req.file.mimetype, req.file.size]);

      // Atualiza URL no perfil
      const fieldMap = { cnh: 'cnh_url', comprovante: 'comprovante_url', selfie: 'selfie_url', perfil_app: 'perfil_app_url', contrato: 'contrato_url' };
      if (fieldMap[tipo]) {
        await pool.query(`UPDATE driver_profiles SET ${fieldMap[tipo]} = $1, updated_at = NOW() WHERE id = $2`, [caminho, driverId]);
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erro no upload admin:', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  }
);

/**
 * GET /api/drivers/:id - Admin: detalhe motorista
 */
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.valor_semanal as car_valor_semanal, c.valor_caucao as car_valor_caucao,
        ci.marca as interesse_marca, ci.modelo as interesse_modelo, ci.id as interesse_car_id
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      LEFT JOIN cars ci ON ci.id = dp.car_interesse_id
      WHERE dp.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    // Documentos
    const docs = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [result.rows[0].user_id]
    );

    // Cobranças
    const charges = await pool.query(`
      SELECT wc.*,
        COALESCE((SELECT json_agg(a.*) FROM abatimentos a WHERE a.charge_id = wc.id), '[]') as abatimentos_lista,
        COALESCE((SELECT json_agg(ac.*) FROM acrescimos ac WHERE ac.charge_id = wc.id), '[]') as acrescimos_lista,
        COALESCE((SELECT SUM(p.valor) FROM payments p WHERE p.charge_id = wc.id AND p.status = 'pago'), 0) as total_pago,
        COALESCE((SELECT json_agg(pe.* ORDER BY pe.data_pagamento) FROM payment_entries pe WHERE pe.charge_id = wc.id), '[]') as pagamentos_manuais
      FROM weekly_charges wc WHERE wc.driver_id = $1
      ORDER BY wc.semana_ref DESC LIMIT 50
    `, [req.params.id]);

    // Pagamentos
    const payments = await pool.query(
      'SELECT * FROM payments WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    );

    // Car swap history
    const swaps = await pool.query(`
      SELECT cs.*, ca.marca || ' ' || ca.modelo as carro_anterior, cn.marca || ' ' || cn.modelo as carro_novo
      FROM car_swaps cs LEFT JOIN cars ca ON ca.id = cs.car_anterior_id LEFT JOIN cars cn ON cn.id = cs.car_novo_id
      WHERE cs.driver_id = $1 ORDER BY cs.created_at DESC
    `, [req.params.id]);

    const driver = result.rows[0];
    driver.documents = docs.rows;
    driver.charges = charges.rows;
    driver.payments = payments.rows;
    driver.car_swaps = swaps.rows;

    res.json(driver);
  } catch (err) {
    console.error('Erro ao buscar motorista:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /api/drivers/:id/approve - Admin: aprovar motorista
 */
router.patch('/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const { car_id } = req.body;

    const result = await pool.query(`
      UPDATE driver_profiles
      SET status = 'aprovado', car_id = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'em_analise'
      RETURNING *
    `, [car_id || null, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorista não encontrado ou status inválido' });
    }

    // Se associou carro, marca como indisponível
    if (car_id) {
      await pool.query('UPDATE cars SET disponivel = false, updated_at = NOW() WHERE id = $1', [car_id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao aprovar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /api/drivers/:id/reject - Admin: reprovar motorista
 */
router.patch('/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const { motivo } = req.body;

    const result = await pool.query(`
      UPDATE driver_profiles
      SET status = 'reprovado', motivo_reprovacao = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'em_analise'
      RETURNING *
    `, [motivo || null, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorista não encontrado ou status inválido' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao reprovar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /api/drivers/:id/activate - Admin: ativar motorista (após caução + contrato)
 */
router.patch('/:id/activate', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE driver_profiles
      SET status = 'ativo', data_inicio = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'aprovado' AND caucao_pago = true AND contrato_confirmado = true
      RETURNING *
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Motorista precisa ter caução pago e contrato confirmado para ativar' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao ativar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /api/drivers/:id/confirm-contract - Admin: confirmar contrato Gov.br
 */
router.patch('/:id/confirm-contract', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE driver_profiles
      SET contrato_confirmado = true, updated_at = NOW()
      WHERE id = $1 AND contrato_url IS NOT NULL
      RETURNING *
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Contrato não enviado pelo motorista' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao confirmar contrato:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/drivers/:id/charges - Admin: criar cobrança semanal
 */
router.post('/:id/charges', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { semana_ref, valor_base, observacoes } = req.body;
    const driverId = req.params.id;

    if (!semana_ref || !valor_base) {
      return res.status(400).json({ error: 'semana_ref e valor_base são obrigatórios' });
    }

    // Buscar crédito da semana anterior
    const lastCharge = await client.query(`
      SELECT credito_anterior, valor_final, pago FROM weekly_charges
      WHERE driver_id = $1
      ORDER BY semana_ref DESC LIMIT 1
    `, [driverId]);

    let creditoAnterior = 0;
    if (lastCharge.rows.length > 0) {
      const last = lastCharge.rows[0];
      // Se a última foi paga e sobrou crédito, carrega
      // Crédito negativo (sobra) do motorista vira desconto
      if (last.pago && parseFloat(last.credito_anterior) < 0) {
        creditoAnterior = parseFloat(last.credito_anterior);
      }
    }

    // Busca settings de multa
    const settingsResult = await client.query(
      "SELECT chave, valor FROM settings WHERE chave IN ('multa_tipo', 'multa_valor', 'multa_carencia_dias', 'multa_diferida')"
    );
    const settings = {};
    settingsResult.rows.forEach(r => { settings[r.chave] = r.valor; });

    // Calcula valor final
    const base = parseFloat(valor_base);
    const valorFinal = base + creditoAnterior; // crédito é negativo, então subtrai

    const result = await client.query(`
      INSERT INTO weekly_charges (driver_id, semana_ref, valor_base, credito_anterior, valor_final, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [driverId, semana_ref, base, creditoAnterior, Math.max(valorFinal, 0), observacoes || null]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar cobrança:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/drivers/charges/auto-generate - Admin: gerar cobranças automáticas
 * Gera cobrança para todos motoristas ativos cujo dia_cobranca = dia informado
 * Se não informar dia, usa o dia atual da semana
 */
router.post('/charges/auto-generate', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const diasMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };
    const diaFiltro = req.body.dia_cobranca || diasMap[new Date().getDay()];
    const semanaRef = req.body.semana_ref || new Date().toISOString().split('T')[0];

    // Busca motoristas ativos com carro atribuído nesse dia
    const drivers = await client.query(`
      SELECT dp.id, dp.car_id, dp.dia_cobranca, c.valor_semanal
      FROM driver_profiles dp
      JOIN cars c ON c.id = dp.car_id
      WHERE dp.status = 'ativo'
        AND dp.car_id IS NOT NULL
        AND dp.dia_cobranca = $1
    `, [diaFiltro]);

    let geradas = 0;
    let puladas = 0;
    const detalhes = [];

    for (const drv of drivers.rows) {
      // Verifica se já existe cobrança nessa semana
      const exists = await client.query(
        'SELECT id FROM weekly_charges WHERE driver_id = $1 AND semana_ref = $2',
        [drv.id, semanaRef]
      );
      if (exists.rows.length > 0) {
        puladas++;
        continue;
      }

      // Busca crédito da última cobrança
      const lastCharge = await client.query(
        'SELECT credito_anterior, pago FROM weekly_charges WHERE driver_id = $1 ORDER BY semana_ref DESC LIMIT 1',
        [drv.id]
      );
      let creditoAnterior = 0;
      if (lastCharge.rows.length > 0 && lastCharge.rows[0].pago && parseFloat(lastCharge.rows[0].credito_anterior) < 0) {
        creditoAnterior = parseFloat(lastCharge.rows[0].credito_anterior);
      }

      const base = parseFloat(drv.valor_semanal);
      const valorFinal = Math.max(base + creditoAnterior, 0);

      await client.query(`
        INSERT INTO weekly_charges (driver_id, semana_ref, valor_base, credito_anterior, valor_final, observacoes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [drv.id, semanaRef, base, creditoAnterior, valorFinal, 'Gerada automaticamente']);

      geradas++;
      detalhes.push({ driver_id: drv.id, valor: valorFinal });
    }

    await client.query('COMMIT');
    res.json({
      dia: diaFiltro,
      semana_ref: semanaRef,
      total_motoristas: drivers.rows.length,
      geradas,
      puladas,
      detalhes
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao gerar cobranças:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/drivers/:driverId/abatimentos/:id/approve - Admin: aprovar abatimento
 */
router.patch('/:driverId/abatimentos/:id/approve', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const abat = await client.query(
      'SELECT * FROM abatimentos WHERE id = $1 AND driver_id = $2',
      [req.params.id, req.params.driverId]
    );

    if (abat.rows.length === 0) {
      return res.status(404).json({ error: 'Abatimento não encontrado' });
    }

    const abatimento = abat.rows[0];

    // Marca como aprovado
    await client.query(
      'UPDATE abatimentos SET aprovado = true WHERE id = $1',
      [abatimento.id]
    );

    // Atualiza total de abatimentos na cobrança
    const totalAbat = await client.query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM abatimentos WHERE charge_id = $1 AND aprovado = true',
      [abatimento.charge_id]
    );

    const total = parseFloat(totalAbat.rows[0].total);

    // Recalcula valor_final
    const charge = await client.query(
      'SELECT valor_base, credito_anterior, multa FROM weekly_charges WHERE id = $1',
      [abatimento.charge_id]
    );

    if (charge.rows.length > 0) {
      const c = charge.rows[0];
      const valorFinal = parseFloat(c.valor_base) - total + parseFloat(c.credito_anterior) + parseFloat(c.multa);
      await client.query(
        'UPDATE weekly_charges SET abatimentos = $1, valor_final = $2, updated_at = NOW() WHERE id = $3',
        [total, Math.max(valorFinal, 0), abatimento.charge_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Abatimento aprovado', abatimento: { ...abatimento, aprovado: true } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao aprovar abatimento:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/drivers/:id/acrescimos - Admin: adicionar acréscimo a uma cobrança
 */
router.post('/:id/acrescimos', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { charge_id, descricao, valor } = req.body;
    const driverId = req.params.id;

    if (!charge_id || !descricao || !valor) {
      return res.status(400).json({ error: 'charge_id, descricao e valor são obrigatórios' });
    }

    // Verifica se a cobrança existe e pertence ao motorista
    const charge = await client.query(
      'SELECT * FROM weekly_charges WHERE id = $1 AND driver_id = $2',
      [charge_id, driverId]
    );
    if (charge.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cobrança não encontrada' });
    }

    // Insere acréscimo
    const result = await client.query(`
      INSERT INTO acrescimos (charge_id, driver_id, descricao, valor)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [charge_id, driverId, descricao, parseFloat(valor)]);

    // Recalcula valor_final
    const totalAcrescimos = await client.query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM acrescimos WHERE charge_id = $1',
      [charge_id]
    );
    const totalAbatimentos = await client.query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM abatimentos WHERE charge_id = $1 AND aprovado = true',
      [charge_id]
    );

    const c = charge.rows[0];
    const valorFinal = parseFloat(c.valor_base) - parseFloat(totalAbatimentos.rows[0].total) 
      + parseFloat(c.credito_anterior) + parseFloat(c.multa) + parseFloat(totalAcrescimos.rows[0].total);

    await client.query(
      'UPDATE weekly_charges SET valor_final = $1, updated_at = NOW() WHERE id = $2',
      [Math.max(valorFinal, 0), charge_id]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar acréscimo:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/drivers/:id/acrescimos/:acrescimoId - Admin: remover acréscimo
 */
router.delete('/:id/acrescimos/:acrescimoId', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const acr = await client.query(
      'SELECT * FROM acrescimos WHERE id = $1 AND driver_id = $2',
      [req.params.acrescimoId, req.params.id]
    );
    if (acr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Acréscimo não encontrado' });
    }

    const chargeId = acr.rows[0].charge_id;
    await client.query('DELETE FROM acrescimos WHERE id = $1', [req.params.acrescimoId]);

    // Recalcula
    const totalAcrescimos = await client.query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM acrescimos WHERE charge_id = $1', [chargeId]
    );
    const totalAbatimentos = await client.query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM abatimentos WHERE charge_id = $1 AND aprovado = true', [chargeId]
    );
    const charge = await client.query('SELECT * FROM weekly_charges WHERE id = $1', [chargeId]);

    if (charge.rows.length > 0) {
      const c = charge.rows[0];
      const valorFinal = parseFloat(c.valor_base) - parseFloat(totalAbatimentos.rows[0].total)
        + parseFloat(c.credito_anterior) + parseFloat(c.multa) + parseFloat(totalAcrescimos.rows[0].total);
      await client.query('UPDATE weekly_charges SET valor_final = $1, updated_at = NOW() WHERE id = $2',
        [Math.max(valorFinal, 0), chargeId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Acréscimo removido' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

// ========================================================
//  ACERTO FINAL / RESCISÃO (Etapa 3)
// ========================================================

/**
 * POST /api/drivers/:id/settlement - Admin: gerar acerto final e rescindir
 */
router.post('/:id/settlement', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driverId = req.params.id;
    const { debitos_pendentes, multas_acumuladas, danos, outros_descontos, observacoes } = req.body;

    // Busca dados do motorista
    const driverRes = await client.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.valor_caucao as car_valor_caucao, c.id as car_id_ref
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.id = $1
    `, [driverId]);

    if (driverRes.rows.length === 0) {
      return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    const driver = driverRes.rows[0];
    const valorCaucao = parseFloat(driver.car_valor_caucao || 0);
    const debitos = parseFloat(debitos_pendentes || 0);
    const multas = parseFloat(multas_acumuladas || 0);
    const danosVal = parseFloat(danos || 0);
    const outros = parseFloat(outros_descontos || 0);
    const saldoFinal = valorCaucao - debitos - multas - danosVal - outros;

    // Salva na tabela final_settlements
    const settlement = await client.query(`
      INSERT INTO final_settlements (driver_id, debitos_pendentes, multas_acumuladas, danos, outros_descontos, valor_caucao, saldo_final, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [driverId, debitos, multas, danosVal, outros, valorCaucao, saldoFinal, observacoes || null]);

    // Atualiza status para rescindido
    await client.query(`
      UPDATE driver_profiles SET status = 'rescindido', data_rescisao = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [driverId]);

    // Libera o carro
    if (driver.car_id_ref) {
      await client.query('UPDATE cars SET disponivel = true, updated_at = NOW() WHERE id = $1', [driver.car_id_ref]);
    }

    // Gera relatório HTML
    const fs = require('fs');
    const path = require('path');
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const fmt = (v) => parseFloat(v).toFixed(2).replace('.', ',');

    const htmlPdf = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:700px;margin:0 auto;padding:40px}
h1{color:#1e40af;font-size:22px;border-bottom:2px solid #1e40af;padding-bottom:10px}
h2{color:#374151;font-size:16px;margin-top:30px}
table{width:100%;border-collapse:collapse;margin:15px 0}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e5e7eb}
th{background:#f3f4f6;font-weight:600;color:#374151}
.total{font-size:18px;font-weight:bold}
.positive{color:#15803d}.negative{color:#dc2626}
.highlight{background:#f0f9ff;padding:15px;border-radius:8px;margin:20px 0}
.footer{margin-top:40px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:15px}
</style>
</head>
<body>
<h1>LocaCar — Relatório de Acerto Final</h1>
<h2>Dados do Motorista</h2>
<table>
<tr><th>Nome</th><td>${driver.nome}</td></tr>
<tr><th>CPF</th><td>${driver.cpf || '—'}</td></tr>
<tr><th>Email</th><td>${driver.email}</td></tr>
<tr><th>Telefone</th><td>${driver.telefone || '—'}</td></tr>
<tr><th>Data início</th><td>${driver.data_inicio ? new Date(driver.data_inicio).toLocaleDateString('pt-BR') : '—'}</td></tr>
<tr><th>Data rescisão</th><td>${dataHoje}</td></tr>
</table>
<h2>Dados do Veículo</h2>
<table>
<tr><th>Veículo</th><td>${driver.car_marca || ''} ${driver.car_modelo || ''}</td></tr>
<tr><th>Placa</th><td>${driver.car_placa || '—'}</td></tr>
</table>
<h2>Demonstrativo Financeiro</h2>
<table>
<tr><th>Item</th><th style="text-align:right">Valor (R$)</th></tr>
<tr><td>Valor do Caução</td><td style="text-align:right">${fmt(valorCaucao)}</td></tr>
<tr><td>(−) Débitos semanais pendentes</td><td style="text-align:right;color:#dc2626">−${fmt(debitos)}</td></tr>
<tr><td>(−) Multas acumuladas</td><td style="text-align:right;color:#dc2626">−${fmt(multas)}</td></tr>
<tr><td>(−) Danos ao veículo</td><td style="text-align:right;color:#dc2626">−${fmt(danosVal)}</td></tr>
<tr><td>(−) Outros descontos</td><td style="text-align:right;color:#dc2626">−${fmt(outros)}</td></tr>
</table>
<div class="highlight">
<table><tr>
<td class="total">SALDO FINAL</td>
<td class="total ${saldoFinal >= 0 ? 'positive' : 'negative'}" style="text-align:right">
${saldoFinal >= 0 ? 'R$ ' + fmt(saldoFinal) + ' (devolver ao motorista)' : 'R$ ' + fmt(Math.abs(saldoFinal)) + ' (motorista deve)'}
</td>
</tr></table>
</div>
${observacoes ? '<h2>Observações</h2><p>' + observacoes + '</p>' : ''}
<div class="footer">
<p>Documento gerado em ${dataHoje} pelo sistema LocaCar. ID: #${settlement.rows[0].id}</p>
</div>
</body></html>`;

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const settlementDir = path.join(uploadDir, 'settlements');
    if (!fs.existsSync(settlementDir)) fs.mkdirSync(settlementDir, { recursive: true });

    const filename = `acerto_${driverId}_${Date.now()}.html`;
    fs.writeFileSync(path.join(settlementDir, filename), htmlPdf);

    const pdfUrl = `/uploads/settlements/${filename}`;
    await client.query('UPDATE final_settlements SET pdf_url = $1 WHERE id = $2', [pdfUrl, settlement.rows[0].id]);

    await client.query('COMMIT');

    res.json({
      message: 'Acerto final gerado e motorista rescindido',
      settlement: { ...settlement.rows[0], pdf_url: pdfUrl },
      saldo_final: saldoFinal,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no acerto final:', err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/drivers/:id - Admin: excluir motorista
 */
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driverId = req.params.id;

    // Busca driver
    const driverRes = await client.query('SELECT * FROM driver_profiles WHERE id = $1', [driverId]);
    if (driverRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Motorista não encontrado' }); }
    const driver = driverRes.rows[0];

    // Libera carro se tinha
    if (driver.car_id) {
      await client.query('UPDATE cars SET disponivel = true, updated_at = NOW() WHERE id = $1', [driver.car_id]);
    }

    // Deleta em cascata (driver_profiles → charges, abatimentos, acrescimos, payments, documents)
    await client.query('DELETE FROM acrescimos WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM abatimentos WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM payments WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM weekly_charges WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM final_settlements WHERE driver_id = $1', [driverId]);
    await client.query('DELETE FROM documents WHERE user_id = $1', [driver.user_id]);
    await client.query('DELETE FROM driver_profiles WHERE id = $1', [driverId]);
    await client.query('DELETE FROM users WHERE id = $1', [driver.user_id]);

    await client.query('COMMIT');
    res.json({ message: 'Motorista excluído com sucesso' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir motorista:', err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/drivers/:id/generate-contract - Admin: gerar contrato DOCX
 */
router.post('/:id/generate-contract', auth, adminOnly, async (req, res) => {
  try {
    const driverId = req.params.id;
    const extraData = req.body; // dados extras que o admin pode enviar

    // Busca dados do motorista
    const driverRes = await pool.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.cor as car_cor, c.ano as car_ano, c.valor_semanal, c.valor_caucao,
        c.renavam as car_renavam
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
      WHERE dp.id = $1
    `, [driverId]);

    if (driverRes.rows.length === 0) return res.status(404).json({ error: 'Motorista não encontrado' });
    const driver = driverRes.rows[0];

    // Busca dados do locador (settings)
    const settingsRes = await pool.query(
      "SELECT chave, valor FROM settings WHERE chave LIKE 'locador_%'"
    );
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.chave] = r.valor; });

    // Monta dados do contrato
    const { gerarContrato } = require('../services/ContratoService');

    const valorSemanal = parseFloat(driver.valor_semanal || 0).toFixed(2).replace('.', ',');
    const valorCaucao = parseFloat(driver.valor_caucao || 0).toFixed(2).replace('.', ',');

    const data = {
      locador_nome: extraData.locador_nome || settings.locador_nome || 'NOME DO LOCADOR',
      locador_rg: extraData.locador_rg || settings.locador_rg || '_______________',
      locador_cpf: extraData.locador_cpf || settings.locador_cpf || '_______________',
      locador_endereco: extraData.locador_endereco || settings.locador_endereco || '_______________',
      locador_email: extraData.locador_email || settings.locador_email || '_______________',
      locatario_nome: driver.nome,
      locatario_rg: extraData.locatario_rg || driver.rg || '_______________',
      locatario_cpf: driver.cpf,
      locatario_endereco: extraData.locatario_endereco || driver.endereco_completo || '_______________',
      veiculo_marca_modelo: (driver.car_marca || '') + ' ' + (driver.car_modelo || ''),
      veiculo_cor: driver.car_cor || '_______________',
      veiculo_ano: driver.car_ano ? String(driver.car_ano) : '_______________',
      veiculo_placa: driver.car_placa || '_______________',
      veiculo_renavam: extraData.renavam || driver.car_renavam || '_______________',
      valor_semanal: valorSemanal,
      valor_semanal_extenso: extraData.valor_semanal_extenso || valorSemanal + ' reais',
      dia_pagamento: extraData.dia_pagamento || driver.dia_cobranca || 'quinta',
      valor_caucao: valorCaucao,
      valor_caucao_extenso: extraData.valor_caucao_extenso || valorCaucao + ' reais',
      cidade_comarca: extraData.cidade_comarca || settings.locador_cidade || 'JARAGUÁ DO SUL - SC',
      data_contrato: extraData.data_contrato || new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
    };

    const buffer = await gerarContrato(data);

    // Salva o contrato como arquivo
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'contracts');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `contrato_${driverId}_${Date.now()}.docx`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const caminho = `/uploads/contracts/${fileName}`;

    // Salva na tabela documents
    await pool.query(`
      INSERT INTO documents (user_id, tipo, nome_arquivo, caminho, mime_type, tamanho)
      VALUES ($1, 'contrato_gerado', $2, $3, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', $4)
    `, [driver.user_id, fileName, caminho, buffer.length]);

    // Envia o arquivo
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao gerar contrato:', err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

// ========== CAR SWAP ==========

/**
 * POST /api/drivers/:id/swap-car - Admin: trocar carro do motorista
 */
router.post('/:id/swap-car', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_car_id, motivo } = req.body;
    if (!new_car_id) return res.status(400).json({ error: 'Novo carro é obrigatório' });

    const driver = await pool.query('SELECT * FROM driver_profiles WHERE id = $1', [id]);
    if (driver.rows.length === 0) return res.status(404).json({ error: 'Motorista não encontrado' });

    const oldCarId = driver.rows[0].car_id;

    // Libera carro antigo
    if (oldCarId) {
      await pool.query('UPDATE cars SET disponivel = true WHERE id = $1', [oldCarId]);
    }

    // Atribui novo carro
    await pool.query('UPDATE driver_profiles SET car_id = $1, updated_at = NOW() WHERE id = $2', [new_car_id, id]);
    await pool.query('UPDATE cars SET disponivel = false WHERE id = $1', [new_car_id]);

    // Registra troca
    await pool.query(`
      INSERT INTO car_swaps (driver_id, car_anterior_id, car_novo_id, motivo)
      VALUES ($1, $2, $3, $4)
    `, [id, oldCarId, new_car_id, motivo || null]);

    res.json({ message: 'Carro trocado com sucesso' });
  } catch (err) {
    console.error('Erro ao trocar carro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/:id/swap-history - Admin: histórico de trocas
 */
router.get('/:id/swap-history', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.*, 
        ca.marca || ' ' || ca.modelo as carro_anterior,
        cn.marca || ' ' || cn.modelo as carro_novo
      FROM car_swaps cs
      LEFT JOIN cars ca ON ca.id = cs.car_anterior_id
      LEFT JOIN cars cn ON cn.id = cs.car_novo_id
      WHERE cs.driver_id = $1
      ORDER BY cs.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== MANUAL PAYMENT ENTRIES ==========

/**
 * POST /api/drivers/:id/generate-charges - Admin: gerar cobranças retroativas
 * Gera charges proporcionais desde data_inicio até hoje
 */
router.post('/:id/generate-charges', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_inicio, dia_cobranca, valor_semanal, juros_diario } = req.body;

    if (!data_inicio || !dia_cobranca || !valor_semanal) {
      return res.status(400).json({ error: 'data_inicio, dia_cobranca e valor_semanal são obrigatórios' });
    }

    const diasMap = { 'domingo': 0, 'segunda': 1, 'terca': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6 };
    const diaAlvo = diasMap[dia_cobranca];
    if (diaAlvo === undefined) return res.status(400).json({ error: 'dia_cobranca inválido' });

    // Atualiza perfil
    await pool.query(`
      UPDATE driver_profiles SET dia_cobranca = $1, data_inicio = $2, updated_at = NOW() WHERE id = $3
    `, [dia_cobranca, data_inicio, id]);

    const inicio = new Date(data_inicio + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(23, 59, 59);

    const valorBase = parseFloat(valor_semanal);
    const taxaJuros = parseFloat(juros_diario || 0.5) / 100; // padrão 0.5% ao dia

    // Encontra primeiro vencimento a partir da data de início
    let currentDate = new Date(inicio);
    while (currentDate.getDay() !== diaAlvo) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Primeira semana proporcional
    const diasPrimeiraWeek = Math.ceil((currentDate - inicio) / (1000 * 60 * 60 * 24));
    const charges = [];

    if (diasPrimeiraWeek > 0 && diasPrimeiraWeek < 7) {
      const valorProporcional = Math.round((valorBase / 7) * diasPrimeiraWeek * 100) / 100;
      charges.push({
        semana_ref: currentDate.toISOString().split('T')[0],
        valor_base: valorProporcional,
        proporcional: true,
        dias: diasPrimeiraWeek
      });
    } else {
      charges.push({
        semana_ref: currentDate.toISOString().split('T')[0],
        valor_base: valorBase,
        proporcional: false,
        dias: 7
      });
    }

    // Próximas semanas
    currentDate.setDate(currentDate.getDate() + 7);
    while (currentDate <= hoje) {
      charges.push({
        semana_ref: currentDate.toISOString().split('T')[0],
        valor_base: valorBase,
        proporcional: false,
        dias: 7
      });
      currentDate.setDate(currentDate.getDate() + 7);
    }

    // Insere no banco
    const client = await pool.connect();
    let geradas = 0;
    try {
      await client.query('BEGIN');
      for (const charge of charges) {
        const exists = await client.query(
          'SELECT id FROM weekly_charges WHERE driver_id = $1 AND semana_ref = $2',
          [id, charge.semana_ref]
        );
        if (exists.rows.length > 0) continue;

        const obs = charge.proporcional ? `Proporcional: ${charge.dias} dias` : 'Gerada retroativamente';
        await client.query(`
          INSERT INTO weekly_charges (driver_id, semana_ref, valor_base, valor_final, saldo_devedor, observacoes)
          VALUES ($1, $2, $3, $3, $3, $4)
        `, [id, charge.semana_ref, charge.valor_base, obs]);
        geradas++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: `${geradas} cobranças geradas`, total: charges.length, geradas });
  } catch (err) {
    console.error('Erro ao gerar cobranças:', err);
    res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

/**
 * POST /api/drivers/:id/charges/:chargeId/payment-entry - Admin: registrar pagamento manual
 */
router.post('/:id/charges/:chargeId/payment-entry', auth, adminOnly, async (req, res) => {
  try {
    const { chargeId } = req.params;
    const { valor_pago, data_pagamento, observacoes } = req.body;

    if (!valor_pago || !data_pagamento) {
      return res.status(400).json({ error: 'valor_pago e data_pagamento são obrigatórios' });
    }

    // Insere entrada de pagamento
    await pool.query(`
      INSERT INTO payment_entries (charge_id, driver_id, valor_pago, data_pagamento, observacoes)
      VALUES ($1, $2, $3, $4, $5)
    `, [chargeId, req.params.id, valor_pago, data_pagamento, observacoes || null]);

    // Recalcula totais da cobrança
    const entries = await pool.query('SELECT SUM(valor_pago) as total FROM payment_entries WHERE charge_id = $1', [chargeId]);
    const totalPago = parseFloat(entries.rows[0].total || 0);

    const charge = await pool.query('SELECT * FROM weekly_charges WHERE id = $1', [chargeId]);
    if (charge.rows.length === 0) return res.status(404).json({ error: 'Cobrança não encontrada' });

    const valorFinal = parseFloat(charge.rows[0].valor_final);
    const saldo = Math.max(valorFinal - totalPago, 0);
    const pago = saldo <= 0.01; // tolerância de centavo

    await pool.query(`
      UPDATE weekly_charges SET valor_pago_total = $1, saldo_devedor = $2, pago = $3,
        data_pagamento = CASE WHEN $3 THEN $4::TIMESTAMP ELSE NULL END, updated_at = NOW()
      WHERE id = $5
    `, [totalPago, saldo, pago, data_pagamento, chargeId]);

    res.json({ total_pago: totalPago, saldo_devedor: saldo, pago });
  } catch (err) {
    console.error('Erro ao registrar pagamento:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/drivers/:id/charges/:chargeId/payment-entries - Admin: listar pagamentos de uma cobrança
 */
router.get('/:id/charges/:chargeId/payment-entries', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payment_entries WHERE charge_id = $1 ORDER BY data_pagamento',
      [req.params.chargeId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * DELETE /api/drivers/:id/charges/:chargeId/payment-entries/:entryId
 */
router.delete('/:id/charges/:chargeId/payment-entries/:entryId', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM payment_entries WHERE id = $1', [req.params.entryId]);

    // Recalcula
    const entries = await pool.query('SELECT SUM(valor_pago) as total FROM payment_entries WHERE charge_id = $1', [req.params.chargeId]);
    const totalPago = parseFloat(entries.rows[0].total || 0);
    const charge = await pool.query('SELECT valor_final FROM weekly_charges WHERE id = $1', [req.params.chargeId]);
    const valorFinal = parseFloat(charge.rows[0]?.valor_final || 0);
    const saldo = Math.max(valorFinal - totalPago, 0);

    await pool.query(`
      UPDATE weekly_charges SET valor_pago_total = $1, saldo_devedor = $2, pago = $3, updated_at = NOW()
      WHERE id = $4
    `, [totalPago, saldo, saldo <= 0.01, req.params.chargeId]);

    res.json({ message: 'Pagamento removido' });
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/drivers/:id/recalculate-interest - Admin: recalcular juros
 * Pega saldo devedor de cada semana e acumula juros nas próximas
 */
router.post('/:id/recalculate-interest', auth, adminOnly, async (req, res) => {
  try {
    const { juros_diario } = req.body;
    const taxa = parseFloat(juros_diario || 0.5) / 100;

    const charges = await pool.query(
      'SELECT * FROM weekly_charges WHERE driver_id = $1 ORDER BY semana_ref ASC',
      [req.params.id]
    );

    let jurosPendente = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < charges.rows.length; i++) {
        const ch = charges.rows[i];
        const valorBase = parseFloat(ch.valor_base);
        const valorFinal = valorBase + jurosPendente;
        const totalPago = parseFloat(ch.valor_pago_total || 0);
        const saldo = Math.max(valorFinal - totalPago, 0);
        const pago = saldo <= 0.01;

        await client.query(`
          UPDATE weekly_charges SET juros_acumulados = $1, valor_final = $2, saldo_devedor = $3, pago = $4, updated_at = NOW()
          WHERE id = $5
        `, [jurosPendente, valorFinal, saldo, pago, ch.id]);

        // Calcula juros para próxima semana baseado no saldo
        if (saldo > 0 && i < charges.rows.length - 1) {
          const nextRef = new Date(charges.rows[i + 1].semana_ref);
          const thisRef = new Date(ch.semana_ref);
          const diasAtraso = Math.max(Math.ceil((nextRef - thisRef) / (1000 * 60 * 60 * 24)), 0);
          jurosPendente = Math.round(saldo * taxa * diasAtraso * 100) / 100;
        } else {
          jurosPendente = 0;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: 'Juros recalculados' });
  } catch (err) {
    console.error('Erro ao recalcular juros:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
