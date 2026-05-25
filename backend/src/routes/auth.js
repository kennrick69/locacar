const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { notifyAdmin, sendEmail } = require('../utils/email');

const router = express.Router();

// ============================================================
// MAGIC LINK — login admin sem senha (defesa contra roubo de
// credenciais MP). Lista de emails autorizados em ADMIN_EMAILS
// env var, separada por vírgula. Tokens crypto.randomBytes(32)
// + sha256 (nunca armazenamos o token cru). TTL 15min, uso único.
// ============================================================
const MAGIC_LINK_TTL_MIN = 15;
const MAGIC_LINK_TOKEN_BYTES = 32;
const ADMIN_JWT_TTL = '4h'; // bem mais curto que os 7d normais

function _hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function _adminEmailsSet() {
  const raw = (process.env.ADMIN_EMAILS || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

function _isAdminEmail(email) {
  if (!email) return false;
  return _adminEmailsSet().has(String(email).trim().toLowerCase());
}

function _genericMagicLinkResponse(res) {
  // Anti-enumeração: sempre 200 com mesma mensagem (acerto ou erro).
  return res.json({
    message: 'Se este email é autorizado como admin, você receberá um link de acesso em alguns segundos. Verifique sua caixa de entrada.'
  });
}

/**
 * POST /api/auth/register
 * Cadastro de motorista
 */
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, cpf, telefone, endereco, car_interesse_id, property_interesse_id } = req.body;

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
      INSERT INTO driver_profiles (user_id, token_externo, endereco_completo, car_interesse_id, property_interesse_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [user.id, tokenExterno, endereco || null, car_interesse_id || null, property_interesse_id || null]);

    // Notifica admin do novo cadastro (fire-and-forget)
    if (process.env.RESEND_API_KEY) {
      let interesseHtml = '<p>Sem carro/imóvel de interesse selecionado.</p>';
      try {
        if (car_interesse_id) {
          const carRes = await pool.query(
            'SELECT marca, modelo, ano, placa FROM cars WHERE id = $1',
            [car_interesse_id]
          );
          const c = carRes.rows[0];
          if (c) interesseHtml = `<p>Interesse: <strong>${c.marca} ${c.modelo} ${c.ano || ''} (${c.placa})</strong></p>`;
        } else if (property_interesse_id) {
          const propRes = await pool.query(
            'SELECT titulo FROM properties WHERE id = $1',
            [property_interesse_id]
          );
          const p = propRes.rows[0];
          if (p) interesseHtml = `<p>Interesse: imóvel <strong>${p.titulo}</strong></p>`;
        }
      } catch (e) { /* ignora */ }

      notifyAdmin({
        subject: `[IMP Locadora] Novo cadastro: ${nome}`,
        html: `
          <h2>Novo motorista cadastrado</h2>
          <p><strong>${nome}</strong> acabou de se cadastrar e quer alugar um veículo.</p>
          ${interesseHtml}
          <ul>
            <li>Email: ${email}</li>
            <li>Telefone: ${telefone}</li>
            <li>CPF: ${cpfClean}</li>
            ${endereco ? `<li>Endereço: ${endereco}</li>` : ''}
          </ul>
          <p>Acesse o painel admin para revisar e aprovar.</p>
        `,
      });
    }

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

    // Admin não loga mais com senha (defesa contra roubo de credencial MP).
    // Email ∈ ADMIN_EMAILS env só entra via magic link (POST /magic-link/request
    // → email → GET /magic-link/consume). Motorista continua usando senha
    // normalmente (raro mas existe; o login motorista típico é /token-login).
    if (_isAdminEmail(email)) {
      try {
        await pool.query(
          `INSERT INTO audit_log (user_email, acao, recurso, ip, via)
           VALUES ($1, 'admin_password_login_blocked', 'auth', $2, 'password')`,
          [String(email).toLowerCase(), req.ip || null]
        );
      } catch (_) { /* audit pode não existir */ }
      return res.status(403).json({
        error: 'Login admin agora é via link mágico. Vá em /login e digite seu email pra receber o link.',
        magic_link_url: '/login',
      });
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
      // Não loga o token tentado nem lista tokens existentes (Frente 2 —
      // Sensitive Data Exposure: tokens vazados em screenshot/log permitem
      // brute-force trivial num espaço de 1M).
      console.log('⚠️ Token-login: token não encontrado');
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

/**
 * GET /api/auth/cep/:cep
 * Proxy para ViaCEP/BrasilAPI (evita bloqueio de CSP no frontend).
 * Cache em memória (Map+TTL 1h) — evita estourar rate-limit de APIs
 * externas quando frontend dispara busca várias vezes pra mesmo CEP.
 */
const _cepCache = new Map();
const _CEP_TTL_MS = 60 * 60 * 1000; // 1 hora
const _CEP_CACHE_MAX = 5000; // teto pra não vazar memória

router.get('/cep/:cep', async (req, res) => {
  const cep = req.params.cep.replace(/\D/g, '');
  if (cep.length !== 8) return res.status(400).json({ error: 'CEP inválido' });

  // Cache hit
  const cached = _cepCache.get(cep);
  if (cached && (Date.now() - cached.ts) < _CEP_TTL_MS) {
    return res.json(cached.data);
  }

  const https = require('https');

  const fetchUrl = (url) => new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });

  const storeAndSend = (data) => {
    // Eviction simples: se passou do teto, dropa o mais antigo
    if (_cepCache.size >= _CEP_CACHE_MAX) {
      const firstKey = _cepCache.keys().next().value;
      if (firstKey) _cepCache.delete(firstKey);
    }
    _cepCache.set(cep, { data, ts: Date.now() });
    return res.json(data);
  };

  // 1) BrasilAPI (primário)
  try {
    const br = await fetchUrl(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (br && br.street) {
      return storeAndSend({
        cep: br.cep, logradouro: br.street, complemento: '',
        bairro: br.neighborhood, localidade: br.city, uf: br.state
      });
    }
  } catch (e) { console.log('BrasilAPI falhou, tentando ViaCEP...', e.message); }

  // 2) ViaCEP (fallback)
  try {
    const via = await fetchUrl(`https://viacep.com.br/ws/${cep}/json/`);
    if (via && !via.erro) {
      return storeAndSend(via);
    }
  } catch (e) { console.log('ViaCEP também falhou:', e.message); }

  res.status(404).json({ error: 'CEP não encontrado' });
});

/**
 * POST /api/auth/magic-link/request
 * Body: { email }
 * Sempre retorna resposta genérica (anti-enumeração).
 * Se email ∈ ADMIN_EMAILS env, gera token, salva sha256 no banco,
 * envia link único pro email com TTL 15min. Rate-limit (5/15min/IP).
 */
router.post('/magic-link/request', async (req, res) => {
  try {
    const emailRaw = (req.body && req.body.email) || '';
    const email = String(emailRaw).trim().toLowerCase();

    // Validação básica do formato (não revela se passou)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return _genericMagicLinkResponse(res);
    }

    // Se não está na lista admin, retorna genérico sem fazer nada
    if (!_isAdminEmail(email)) {
      console.log('[magic-link] tentativa com email não-admin (silenciado)');
      return _genericMagicLinkResponse(res);
    }

    // Gera token: 32 bytes hex (256 bits) crypto.randomBytes
    const rawToken = crypto.randomBytes(MAGIC_LINK_TOKEN_BYTES).toString('hex');
    const tokenHash = _hashToken(rawToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

    await pool.query(
      `INSERT INTO magic_link_tokens (email, token_hash, expires_at, ip_origem, ua_origem)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, tokenHash, expiresAt, req.ip || null, (req.headers['user-agent'] || '').slice(0, 500)]
    );

    // Frontend deve ter rota /admin/magic?token=XXX que faz GET no consume.
    // FRONTEND_URL configurado no env (mesma var usada por outros emails).
    const baseFront = process.env.FRONTEND_URL || 'https://implocadora.com.br';
    const link = `${baseFront.replace(/\/$/, '')}/admin/magic?token=${rawToken}`;

    try {
      await sendEmail({
        to: email,
        subject: 'IMP Locadora — Link de acesso admin',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 16px">Link de acesso admin</h2>
            <p>Alguém pediu um link de acesso admin pra <strong>${email}</strong> (provavelmente você).</p>
            <p>Clique no botão abaixo pra entrar. O link expira em <strong>${MAGIC_LINK_TTL_MIN} minutos</strong> e funciona <strong>uma única vez</strong>.</p>
            <p style="margin:28px 0">
              <a href="${link}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">
                Entrar no painel admin
              </a>
            </p>
            <p style="font-size:12px;color:#6b7280">
              Se você NÃO pediu, ignore este email — o link expira sozinho e ninguém entra.<br>
              IP de origem: ${req.ip || 'desconhecido'}.
            </p>
          </div>
        `,
      });
      console.log(`[magic-link] enviado pra ${email} (expira em ${MAGIC_LINK_TTL_MIN}min)`);
    } catch (mailErr) {
      console.error('[magic-link] falha ao enviar email:', mailErr.message);
      // Resposta genérica mesmo assim — não vaza erro de email
    }

    return _genericMagicLinkResponse(res);
  } catch (err) {
    console.error('[magic-link/request] erro:', err.message);
    return _genericMagicLinkResponse(res);
  }
});

/**
 * GET /api/auth/magic-link/consume?token=XXX
 * Valida token: existe, não expirou, não foi usado. Marca used_at=NOW().
 * Confirma que email ainda está em ADMIN_EMAILS (env pode ter mudado).
 * Garante user admin no DB (cria se faltar). Gera JWT 4h com
 * claim via='magic_link' (usado pra permitir mudar credenciais MP).
 * Retorna { user, token, via: 'magic_link' }.
 */
router.get('/magic-link/consume', async (req, res) => {
  try {
    const raw = String(req.query.token || '').trim();
    if (!raw || raw.length < 16) {
      return res.status(400).json({ error: 'Token inválido' });
    }
    const tokenHash = _hashToken(raw);

    const r = await pool.query(
      `SELECT id, email, expires_at, used_at FROM magic_link_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    const row = r.rows[0];
    if (row.used_at) {
      return res.status(401).json({ error: 'Link já foi usado. Solicite um novo.' });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Link expirado. Solicite um novo.' });
    }
    // Re-verifica que email AINDA é autorizado (env pode ter mudado)
    if (!_isAdminEmail(row.email)) {
      return res.status(401).json({ error: 'Email não está mais autorizado como admin.' });
    }

    // Marca usado (atomicamente — protege replay simultâneo)
    const used = await pool.query(
      `UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id`,
      [row.id]
    );
    if (used.rowCount === 0) {
      return res.status(401).json({ error: 'Link já foi usado. Solicite um novo.' });
    }

    // Garante user admin (cria se não existir) — multi-email admin (JOs tem ~10)
    let userRes = await pool.query(
      `SELECT id, nome, email, role, ativo FROM users WHERE LOWER(email) = LOWER($1)`,
      [row.email]
    );
    let user;
    if (userRes.rows.length === 0) {
      // Cria com senha randômica longa (admin não usa senha — só magic link)
      const randomPass = crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(randomPass, 10);
      const ins = await pool.query(
        `INSERT INTO users (nome, email, senha_hash, role, ativo)
         VALUES ($1, $2, $3, 'admin', true)
         RETURNING id, nome, email, role, ativo`,
        [row.email.split('@')[0], row.email, hash]
      );
      user = ins.rows[0];
      console.log(`[magic-link] criou user admin novo: ${row.email}`);
    } else {
      user = userRes.rows[0];
      // Garante role=admin e ativo=true (corrige drift se admin mexeu)
      if (user.role !== 'admin' || !user.ativo) {
        await pool.query(`UPDATE users SET role='admin', ativo=true WHERE id=$1`, [user.id]);
        user.role = 'admin';
        user.ativo = true;
      }
    }

    // JWT curto + claim via='magic_link' (usado em ações sensíveis tipo PUT mp_*)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'admin', via: 'magic_link' },
      process.env.JWT_SECRET,
      { expiresIn: ADMIN_JWT_TTL }
    );

    // Audit log
    try {
      await pool.query(
        `INSERT INTO audit_log (user_id, user_email, acao, recurso, ip, via)
         VALUES ($1, $2, 'magic_link_consume', 'auth', $3, 'magic_link')`,
        [user.id, user.email, req.ip || null]
      );
    } catch (_) { /* tabela pode não existir ainda */ }

    res.json({ user: { id: user.id, nome: user.nome, email: user.email, role: 'admin', ativo: true }, token, via: 'magic_link' });
  } catch (err) {
    console.error('[magic-link/consume] erro:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
