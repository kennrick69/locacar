const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Cadastro de motorista
 */
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, cpf, telefone } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    // Verifica se email já existe
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    // Verifica CPF se fornecido
    if (cpf) {
      const cpfExists = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
      if (cpfExists.rows.length > 0) {
        return res.status(409).json({ error: 'CPF já cadastrado' });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await pool.query(`
      INSERT INTO users (nome, email, senha_hash, cpf, telefone, role)
      VALUES ($1, $2, $3, $4, $5, 'motorista')
      RETURNING id, nome, email, cpf, telefone, role, created_at
    `, [nome, email, senhaHash, cpf || null, telefone || null]);

    const user = result.rows[0];

    // Cria perfil de motorista automaticamente
    const tokenExterno = cpf ? cpf.replace(/\D/g, '').substring(0, 6) : null;
    await pool.query(`
      INSERT INTO driver_profiles (user_id, token_externo)
      VALUES ($1, $2)
    `, [user.id, tokenExterno]);

    // Gera JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await pool.query(
      'SELECT id, nome, email, senha_hash, role, ativo FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    if (!user.ativo) {
      return res.status(403).json({ error: 'Conta desativada' });
    }

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { senha_hash, ...userData } = user;
    res.json({ user: userData, token });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário logado
 */
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, cpf, telefone, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    // Se motorista, inclui perfil
    if (user.role === 'motorista') {
      const profile = await pool.query(
        'SELECT * FROM driver_profiles WHERE user_id = $1',
        [user.id]
      );
      user.profile = profile.rows[0] || null;
    }

    res.json(user);
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * POST /api/auth/token-login
 * Login do motorista via token (6 primeiros dígitos do CPF)
 */
router.post('/token-login', async (req, res) => {
  try {
    const { token: tokenInput } = req.body;

    if (!tokenInput || tokenInput.length !== 6) {
      return res.status(400).json({ error: 'Token deve ter 6 dígitos' });
    }

    const result = await pool.query(`
      SELECT u.id, u.nome, u.email, u.role, u.ativo, dp.id as profile_id, dp.status, dp.token_externo
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.token_externo = $1
    `, [tokenInput]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Token não encontrado' });
    }

    const user = result.rows[0];

    if (!user.ativo) {
      return res.status(403).json({ error: 'Conta desativada' });
    }

    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role, ativo: user.ativo },
      token: jwtToken
    });
  } catch (err) {
    console.error('Erro no token-login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
