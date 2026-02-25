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
    const { nome, email, senha, cpf, telefone, endereco } = req.body;

    if (!nome || !cpf) {
      return res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
    }

    const cpfClean = cpf.replace(/\D/g, '');
    if (cpfClean.length < 11) {
      return res.status(400).json({ error: 'CPF deve ter 11 dígitos' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    if (!telefone) {
      return res.status(400).json({ error: 'Telefone é obrigatório' });
    }

    // Verifica CPF
    const cpfExists = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpfClean]);
    if (cpfExists.rows.length > 0) {
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    // Verifica email
    const emailExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    // Senha = token = 6 primeiros do CPF (motorista não precisa de senha)
    const tokenExterno = cpfClean.substring(0, 6);
    const senhaHash = await bcrypt.hash(senha || tokenExterno, 10);

    const result = await pool.query(`
      INSERT INTO users (nome, email, senha_hash, cpf, telefone, role)
      VALUES ($1, $2, $3, $4, $5, 'motorista')
      RETURNING id, nome, email, cpf, telefone, role, created_at
    `, [nome, email, senhaHash, cpfClean, telefone]);

    const user = result.rows[0];

    // Cria perfil de motorista automaticamente
    await pool.query(`
      INSERT INTO driver_profiles (user_id, token_externo, endereco_completo)
      VALUES ($1, $2, $3)
    `, [user.id, tokenExterno, endereco || null]);

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

    // Limpa qualquer formatação
    const cleanToken = (tokenInput || '').replace(/\D/g, '').trim();

    if (!cleanToken || cleanToken.length !== 6) {
      return res.status(400).json({ error: 'Token deve ter exatamente 6 dígitos numéricos' });
    }

    console.log(`🔑 Token-login tentativa: "${cleanToken}"`);

    const result = await pool.query(`
      SELECT u.id, u.nome, u.email, u.role, u.ativo, dp.id as profile_id, dp.status, dp.token_externo
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.token_externo = $1
    `, [cleanToken]);

    if (result.rows.length === 0) {
      console.log(`⚠️ Token-login falhou: token="${cleanToken}" (raw: "${tokenInput}") não encontrado no banco`);
      // Debug: lista tokens existentes (só em dev)
      if (process.env.NODE_ENV !== 'production') {
        const all = await pool.query('SELECT dp.token_externo, u.nome FROM driver_profiles dp JOIN users u ON u.id = dp.user_id WHERE dp.token_externo IS NOT NULL LIMIT 10');
        console.log('Tokens existentes:', all.rows.map(r => `${r.token_externo} (${r.nome})`));
      }
      return res.status(401).json({ error: 'Token não encontrado. Verifique se são os 6 primeiros números do seu CPF.' });
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
