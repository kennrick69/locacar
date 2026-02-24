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
 * Query: ?tipo=cnh|comprovante|selfie|contrato
 */
router.post('/me/documents',
  auth, driverOnly,
  setUploadDir('documents'),
  upload.single('arquivo'),
  async (req, res) => {
    try {
      const tipo = req.query.tipo || req.body.tipo;
      if (!tipo) {
        return res.status(400).json({ error: 'Tipo do documento é obrigatório (?tipo=cnh|comprovante|selfie|contrato)' });
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
        'SELECT cnh_url, comprovante_url, selfie_url FROM driver_profiles WHERE user_id = $1',
        [req.user.id]
      );

      if (profile.rows[0]) {
        const p = profile.rows[0];
        if (p.cnh_url && p.comprovante_url && p.selfie_url) {
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
        ) as abatimentos_lista
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
 * GET /api/drivers - Admin: lista todos os motoristas
 */
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
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
 * GET /api/drivers/:id - Admin: detalhe motorista
 */
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dp.*, u.nome, u.email, u.cpf, u.telefone,
        c.marca as car_marca, c.modelo as car_modelo, c.placa as car_placa,
        c.valor_semanal as car_valor_semanal, c.valor_caucao as car_valor_caucao
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      LEFT JOIN cars c ON c.id = dp.car_id
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
        COALESCE((SELECT json_agg(a.*) FROM abatimentos a WHERE a.charge_id = wc.id), '[]') as abatimentos_lista
      FROM weekly_charges wc WHERE wc.driver_id = $1
      ORDER BY wc.semana_ref DESC LIMIT 20
    `, [req.params.id]);

    // Pagamentos
    const payments = await pool.query(
      'SELECT * FROM payments WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    );

    const driver = result.rows[0];
    driver.documents = docs.rows;
    driver.charges = charges.rows;
    driver.payments = payments.rows;

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

module.exports = router;
