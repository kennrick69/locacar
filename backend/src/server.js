require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ========== SEGURANÇA ==========
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Muitas requisições.' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Muitas tentativas.' } });
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

// ========== FRONTEND (prod) ==========
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ========== ERROR ==========
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ========== AUTO MIGRATE + START ==========
async function start() {
  const pool = require('./config/database');

  // Testa conexão
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Erro ao conectar PostgreSQL:', err.message);
    console.log('Iniciando servidor sem banco...');
    app.listen(PORT, () => console.log(`🚗 LocaCar API porta ${PORT} | SEM BANCO`));
    return;
  }

  // Auto migrate: cria tabelas se não existirem
  try {
    const tableCheck = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    if (parseInt(tableCheck.rows[0].count) === 0) {
      console.log('📦 Tabelas não encontradas. Rodando migrate...');
      
      // Roda o migrate inline
      const fs = require('fs');
      const migratePath = path.join(__dirname, 'config', 'migrate.js');
      
      // Importa e executa o migrate como módulo
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // ===== USERS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            senha VARCHAR(255) NOT NULL,
            cpf VARCHAR(14) UNIQUE,
            telefone VARCHAR(20),
            role VARCHAR(20) DEFAULT 'motorista',
            ativo BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== CARS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS cars (
            id SERIAL PRIMARY KEY,
            marca VARCHAR(100) NOT NULL,
            modelo VARCHAR(100) NOT NULL,
            ano INTEGER,
            placa VARCHAR(20) UNIQUE NOT NULL,
            cor VARCHAR(50),
            foto_url TEXT,
            valor_semanal DECIMAL(10,2) NOT NULL,
            valor_caucao DECIMAL(10,2) DEFAULT 0,
            disponivel BOOLEAN DEFAULT true,
            observacoes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== DRIVER_PROFILES =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS driver_profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            car_id INTEGER REFERENCES cars(id) ON DELETE SET NULL,
            status VARCHAR(30) DEFAULT 'pendente',
            cnh_url TEXT,
            comprovante_url TEXT,
            selfie_url TEXT,
            contrato_url TEXT,
            contrato_confirmado BOOLEAN DEFAULT false,
            caucao_pago BOOLEAN DEFAULT false,
            token_externo VARCHAR(10),
            cadastro_externo BOOLEAN DEFAULT false,
            data_inicio TIMESTAMP,
            data_rescisao TIMESTAMP,
            motivo_reprovacao TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== DOCUMENTS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
            tipo VARCHAR(50) NOT NULL,
            nome_arquivo VARCHAR(255),
            caminho TEXT NOT NULL,
            tamanho INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== WEEKLY_CHARGES =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS weekly_charges (
            id SERIAL PRIMARY KEY,
            driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
            semana_ref DATE NOT NULL,
            valor_base DECIMAL(10,2) NOT NULL,
            abatimentos DECIMAL(10,2) DEFAULT 0,
            credito_anterior DECIMAL(10,2) DEFAULT 0,
            multa DECIMAL(10,2) DEFAULT 0,
            valor_final DECIMAL(10,2) NOT NULL,
            pago BOOLEAN DEFAULT false,
            data_pagamento TIMESTAMP,
            observacoes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== ABATIMENTOS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS abatimentos (
            id SERIAL PRIMARY KEY,
            charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
            driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
            descricao TEXT,
            valor DECIMAL(10,2) NOT NULL,
            nota_url TEXT,
            aprovado BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== PAYMENTS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            driver_id INTEGER REFERENCES driver_profiles(id),
            charge_id INTEGER REFERENCES weekly_charges(id),
            tipo VARCHAR(30) NOT NULL,
            metodo VARCHAR(30) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            parcelas INTEGER DEFAULT 1,
            juros DECIMAL(5,2) DEFAULT 0,
            valor_total DECIMAL(10,2) NOT NULL,
            status VARCHAR(30) DEFAULT 'pendente',
            mp_payment_id VARCHAR(100),
            mp_preference_id VARCHAR(100),
            mp_qr_code TEXT,
            mp_qr_code_base64 TEXT,
            mp_ticket_url TEXT,
            mp_expiration TIMESTAMP,
            data_pagamento TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== SETTINGS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            chave VARCHAR(100) UNIQUE NOT NULL,
            valor TEXT,
            descricao TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // ===== INSTALLMENT_FEES =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS installment_fees (
            id SERIAL PRIMARY KEY,
            parcelas INTEGER UNIQUE NOT NULL,
            taxa_percentual DECIMAL(5,2) DEFAULT 0,
            ativo BOOLEAN DEFAULT true
          )
        `);

        // ===== FINAL_SETTLEMENTS =====
        await client.query(`
          CREATE TABLE IF NOT EXISTS final_settlements (
            id SERIAL PRIMARY KEY,
            driver_id INTEGER REFERENCES driver_profiles(id),
            debitos_pendentes DECIMAL(10,2) DEFAULT 0,
            multas_acumuladas DECIMAL(10,2) DEFAULT 0,
            danos DECIMAL(10,2) DEFAULT 0,
            outros_descontos DECIMAL(10,2) DEFAULT 0,
            valor_caucao DECIMAL(10,2) DEFAULT 0,
            saldo_final DECIMAL(10,2) DEFAULT 0,
            observacoes TEXT,
            pdf_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

        await client.query('COMMIT');
        console.log('✅ Tabelas criadas com sucesso!');

        // ===== SEED =====
        console.log('🌱 Rodando seed...');
        const bcrypt = require('bcryptjs');
        const adminExists = await pool.query("SELECT id FROM users WHERE email = 'admin@locacar.com'");
        
        if (adminExists.rows.length === 0) {
          const hash = await bcrypt.hash('admin123', 10);
          await pool.query(
            "INSERT INTO users (nome, email, senha, role) VALUES ('Administrador', 'admin@locacar.com', $1, 'admin')",
            [hash]
          );
          console.log('✅ Admin criado: admin@locacar.com / admin123');
        }

        // Settings padrão
        const defaults = [
          ['dia_vencimento', '1', 'Dia da semana para vencimento (0=dom, 1=seg...)'],
          ['multa_tipo', 'percentual', 'Tipo de multa: percentual ou fixo'],
          ['multa_valor', '2', 'Valor da multa (% por dia ou R$ por dia)'],
          ['multa_carencia_dias', '3', 'Dias de carência antes da multa'],
          ['multa_diferida', 'true', 'Se true, multa só é cobrada no acerto final'],
          ['evento_cadastro_externo', 'caucao_pago', 'Evento que dispara cadastro externo'],
          ['mp_webhook_url', '', 'URL do webhook do Mercado Pago'],
        ];

        for (const [chave, valor, descricao] of defaults) {
          await pool.query(
            'INSERT INTO settings (chave, valor, descricao) VALUES ($1, $2, $3) ON CONFLICT (chave) DO NOTHING',
            [chave, valor, descricao]
          );
        }

        // Taxas de parcelamento
        const fees = [
          [1, 0], [2, 5.49], [3, 7.49], [4, 9.49], [5, 11.49],
          [6, 13.49], [7, 15.49], [8, 17.49], [9, 19.49], [10, 21.49],
          [11, 23.49], [12, 25.49],
        ];

        for (const [parcelas, taxa] of fees) {
          await pool.query(
            'INSERT INTO installment_fees (parcelas, taxa_percentual) VALUES ($1, $2) ON CONFLICT (parcelas) DO NOTHING',
            [parcelas, taxa]
          );
        }

        console.log('✅ Settings e taxas criados!');
      } catch (migErr) {
        await client.query('ROLLBACK');
        console.error('❌ Erro no migrate:', migErr.message);
      } finally {
        client.release();
      }
    } else {
      console.log('✅ Tabelas já existem, pulando migrate.');
    }
  } catch (err) {
    console.error('❌ Erro ao verificar tabelas:', err.message);
  }

  // Inicia servidor
  app.listen(PORT, () => {
    console.log(`🚗 LocaCar API porta ${PORT} | ${process.env.NODE_ENV || 'development'}`);
  });
}

start();

module.exports = app;
