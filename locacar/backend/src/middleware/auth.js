const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação JWT
 */
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

/**
 * Middleware para exigir role admin
 */
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};

/**
 * Middleware para exigir role motorista
 */
const driverOnly = (req, res, next) => {
  if (req.user.role !== 'motorista') {
    return res.status(403).json({ error: 'Acesso restrito a motoristas' });
  }
  next();
};

module.exports = { auth, adminOnly, driverOnly };
