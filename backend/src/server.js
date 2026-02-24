require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ========== TRUST PROXY (Railway/Heroku/etc) ==========
app.set('trust proxy', 1);

// ========== SEGURANÇA ==========
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || '*').split(',').map(u => u.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Muitas requisições.' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Muitas tentativas.' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ========== BODY ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== UPLOADS ==========
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ========== ROTAS ==========
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cars', require('./routes/cars'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/webhooks', require('./routes/webhooks'));

// ========== HEALTH ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ========== RAIZ ==========
app.get('/', (req, res) => {
  res.json({ app: 'LocaCar API', version: '1.0', health: '/api/health' });
});

// ========== ERROR ==========
app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ========== AUTO MIGRATE + SEED + START ==========
async function start() {
  const pool = require('./config/database');
  const bcrypt = require('bcryptjs');

  // 1) Testa conexão
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Erro ao conectar PostgreSQL:', err.message);
    app.listen(PORT, () => console.log('🚗 LocaCar API porta ' + PORT + ' | SEM BANCO'));
    return;
  }

  // 2) Auto migrate: cria tabelas se não existirem
  try {
    const tableCheck = await pool.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'"
    );

    if (parseInt(tableCheck.rows[0].count) === 0) {
      console.log('📦 Tabelas não encontradas. Rodando migrate...');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(`CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY, nome VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL,
          senha_hash VARCHAR(255) NOT NULL, cpf VARCHAR(14) UNIQUE, telefone VARCHAR(20),
          role VARCHAR(20) DEFAULT 'motorista', ativo BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS cars (
          id SERIAL PRIMARY KEY, marca VARCHAR(100) NOT NULL, modelo VARCHAR(100) NOT NULL,
          ano INTEGER, placa VARCHAR(20) UNIQUE NOT NULL, cor VARCHAR(50), foto_url TEXT,
          valor_semanal DECIMAL(10,2) NOT NULL, valor_caucao DECIMAL(10,2) DEFAULT 0,
          disponivel BOOLEAN DEFAULT true, observacoes TEXT,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS driver_profiles (
          id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          car_id INTEGER REFERENCES cars(id) ON DELETE SET NULL, status VARCHAR(30) DEFAULT 'pendente',
          cnh_url TEXT, comprovante_url TEXT, selfie_url TEXT, contrato_url TEXT,
          contrato_confirmado BOOLEAN DEFAULT false, caucao_pago BOOLEAN DEFAULT false,
          token_externo VARCHAR(20), cadastro_externo BOOLEAN DEFAULT false,
          data_inicio TIMESTAMP, data_rescisao TIMESTAMP, motivo_reprovacao TEXT,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          tipo VARCHAR(50) NOT NULL, nome_arquivo VARCHAR(255), caminho TEXT NOT NULL,
          mime_type VARCHAR(100), tamanho INTEGER, created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS weekly_charges (
          id SERIAL PRIMARY KEY, driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          semana_ref DATE NOT NULL, valor_base DECIMAL(10,2) NOT NULL, abatimentos DECIMAL(10,2) DEFAULT 0,
          credito_anterior DECIMAL(10,2) DEFAULT 0, multa DECIMAL(10,2) DEFAULT 0,
          valor_final DECIMAL(10,2) NOT NULL, pago BOOLEAN DEFAULT false, data_pagamento TIMESTAMP,
          observacoes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS abatimentos (
          id SERIAL PRIMARY KEY, charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
          driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          descricao TEXT, valor DECIMAL(10,2) NOT NULL, nota_url TEXT, aprovado BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), driver_id INTEGER REFERENCES driver_profiles(id),
          charge_id INTEGER REFERENCES weekly_charges(id), tipo VARCHAR(30) NOT NULL, metodo VARCHAR(30) NOT NULL,
          valor DECIMAL(10,2) NOT NULL, parcelas INTEGER DEFAULT 1, juros DECIMAL(5,2) DEFAULT 0,
          valor_total DECIMAL(10,2) NOT NULL, status VARCHAR(30) DEFAULT 'pendente',
          mp_payment_id VARCHAR(100), mp_preference_id VARCHAR(100), mp_qr_code TEXT,
          mp_qr_code_base64 TEXT, mp_ticket_url TEXT, mp_expiration TIMESTAMP, data_pagamento TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY, chave VARCHAR(100) UNIQUE NOT NULL, valor TEXT, descricao TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS installment_fees (
          id SERIAL PRIMARY KEY, parcelas INTEGER UNIQUE NOT NULL, taxa_percentual DECIMAL(5,2) DEFAULT 0,
          ativo BOOLEAN DEFAULT true
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS final_settlements (
          id SERIAL PRIMARY KEY, driver_id INTEGER REFERENCES driver_profiles(id),
          debitos_pendentes DECIMAL(10,2) DEFAULT 0, multas_acumuladas DECIMAL(10,2) DEFAULT 0,
          danos DECIMAL(10,2) DEFAULT 0, outros_descontos DECIMAL(10,2) DEFAULT 0,
          valor_caucao DECIMAL(10,2) DEFAULT 0, saldo_final DECIMAL(10,2) DEFAULT 0,
          observacoes TEXT, pdf_url TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query('COMMIT');
        console.log('✅ Tabelas criadas!');
      } catch (migErr) {
        await client.query('ROLLBACK');
        console.error('❌ Erro migrate:', migErr.message);
      } finally {
        client.release();
      }
    } else {
      console.log('✅ Tabelas OK.');
    }
  } catch (err) {
    console.error('❌ Erro verificar tabelas:', err.message);
  }

  // 3) Auto seed: cria admin + settings se não existirem
  try {
    const adminCheck = await pool.query("SELECT id FROM users WHERE email = 'admin@locacar.com'");
    if (adminCheck.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query("INSERT INTO users (nome, email, senha_hash, role) VALUES ('Administrador', 'admin@locacar.com', $1, 'admin')", [hash]);
      console.log('✅ Admin criado: admin@locacar.com / admin123');
    } else {
      console.log('✅ Admin OK.');
    }

    const defaults = [
      ['dia_vencimento', '1', 'Dia da semana para vencimento'],
      ['multa_tipo', 'percentual', 'Tipo de multa'],
      ['multa_valor', '2', 'Valor da multa'],
      ['multa_carencia_dias', '3', 'Dias de carência'],
      ['multa_diferida', 'true', 'Multa diferida'],
      ['evento_cadastro_externo', 'caucao_pago', 'Evento cadastro externo'],
      ['mp_webhook_url', '', 'Webhook MP'],
    ];
    for (const [c, v, d] of defaults) {
      await pool.query('INSERT INTO settings (chave, valor, descricao) VALUES ($1, $2, $3) ON CONFLICT (chave) DO NOTHING', [c, v, d]);
    }

    const fees = [[1,0],[2,5.49],[3,7.49],[4,9.49],[5,11.49],[6,13.49],[7,15.49],[8,17.49],[9,19.49],[10,21.49],[11,23.49],[12,25.49]];
    for (const [p, t] of fees) {
      await pool.query('INSERT INTO installment_fees (parcelas, taxa_percentual) VALUES ($1, $2) ON CONFLICT (parcelas) DO NOTHING', [p, t]);
    }
    console.log('✅ Settings e taxas OK.');
  } catch (seedErr) {
    console.error('⚠️ Seed erro:', seedErr.message);
  }

  // 4) Inicia servidor
  app.listen(PORT, () => {
    console.log('🚗 LocaCar API porta ' + PORT + ' | ' + (process.env.NODE_ENV || 'development'));
  });
}

start();
module.exports = app;
