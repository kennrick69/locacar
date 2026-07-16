require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ========== TRUST PROXY (Railway/Heroku/etc) ==========
app.set('trust proxy', 1);

// ========== SEGURANÇA ==========
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com',
        'https://*.mercadopago.com', 'https://*.mercadolibre.com', 'https://*.mercadolivre.com', 'https://*.mlstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'",
        'https://sdk.mercadopago.com', 'https://*.mercadolibre.com', 'https://*.mlstatic.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://*.mlstatic.com'],
      connectSrc: ["'self'",
        // Cloudinary — download/preview de contratos e documentos
        'https://res.cloudinary.com',
        // Mercado Pago — API, Secure Fields e telemetria
        'https://api.mercadopago.com',
        'https://sdk.mercadopago.com',
        'https://secure-fields.mercadopago.com',
        'https://api-static.mercadopago.com',
        'https://events.mercadopago.com',
        'https://*.mercadopago.com',
        // Mercado Livre — tracks/telemetria e iframes
        'https://api.mercadolibre.com',
        'https://api.mercadolivre.com',
        'https://*.mercadolibre.com',
        'https://*.mercadolivre.com',
        'https://*.mlstatic.com'],
      frameSrc: ["'self'",
        'https://*.mercadopago.com',
        'https://www.mercadopago.com',
        'https://secure-fields.mercadopago.com',
        'https://*.mercadolibre.com',
        'https://*.mercadolivre.com',
        'https://secure.mlstatic.com',
        'https://*.mlstatic.com'],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean)
        : false)
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Muitas requisições.' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Muitas tentativas.' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

const tokenLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Muitas tentativas de login.' } });
app.use('/api/auth/token-login', tokenLoginLimiter);

// Magic Link: limite estrito por IP (evita flood de emails).
// Resposta SEMPRE genérica (anti-enumeração de email) — não revela acerto.
const magicLinkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Muitas solicitações de link mágico. Aguarde 15 minutos.' } });
app.use('/api/auth/magic-link/request', magicLinkLimiter);

// ========== BODY ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== UPLOADS ==========
// Garante que as subpastas existem (necessário quando Railway monta volume vazio)
const uploadsBase = path.join(__dirname, '..', 'uploads');
['cars', 'documents', 'contracts', 'contratos', 'settlements', 'properties', 'misc'].forEach(sub => {
  const dir = path.join(uploadsBase, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
app.use('/uploads', express.static(uploadsBase));

// ========== ROTAS ==========
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cars', require('./routes/cars'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/contract-clauses', require('./routes/contractClauses'));
app.use('/api/admin', require('./routes/admin'));

// ========== HEALTH ==========
app.get('/api/health', async (req, res) => {
  try {
    const pool = require('./config/database');
    await pool.query('SELECT 1');
    // Não expõe NODE_ENV (info disclosure)
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'error', timestamp: new Date().toISOString() });
  }
});

// ========== RAIZ / FRONTEND ==========
const publicPath = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicPath, 'index.html');

if (fs.existsSync(indexPath)) {
  const assetsPath = path.join(publicPath, 'assets');
  const assetFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath) : [];
  console.log('📁 Frontend em /public. Assets:', assetFiles.join(', ') || 'VAZIO!');
  app.use(express.static(publicPath, { maxAge: '1d', etag: true }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
      res.sendFile(indexPath);
    }
  });
} else {
  app.get('/', (req, res) => {
    res.json({ app: 'IMP Locadora API', version: '1.0', health: '/api/health' });
  });
}

// ========== ERROR ==========
app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ========== AUTO MIGRATE + SEED + START ==========
async function start() {
  const pool = require('./config/database');
  const bcrypt = require('bcryptjs');

  // 0) Sanity de secrets (warn-only — nunca derruba produção).
  // Sem JWT_SECRET o primeiro login crasha com erro criptico do jsonwebtoken;
  // secret curto é brute-forceável offline a partir de 1 token vazado.
  if (!process.env.JWT_SECRET) {
    console.error('⚠️  CRÍTICO: JWT_SECRET não configurado — login vai falhar. Configure no Railway (sugestão: 64 chars aleatórios).');
  } else if (process.env.JWT_SECRET.length < 32) {
    console.error(`⚠️  ALERTA: JWT_SECRET tem só ${process.env.JWT_SECRET.length} chars (< 32) — fraco contra brute-force offline. Recomendado: 64 chars aleatórios.`);
  }

  // 1) Testa conexão
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Erro ao conectar PostgreSQL:', err.message);
    app.listen(PORT, () => console.log('🚗 IMP Locadora API porta ' + PORT + ' | SEM BANCO'));
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
          ar_condicionado BOOLEAN DEFAULT false, combustivel VARCHAR(30) DEFAULT 'Flex',
          transmissao VARCHAR(30) DEFAULT 'Manual', direcao VARCHAR(30) DEFAULT 'Hidráulica',
          consumo_medio VARCHAR(30), portas INTEGER DEFAULT 4, descricao TEXT,
          fotos_extras TEXT DEFAULT '[]', renavam VARCHAR(30),
          vidro_eletrico BOOLEAN DEFAULT false, trava_eletrica BOOLEAN DEFAULT false,
          airbag BOOLEAN DEFAULT false, freio_abs BOOLEAN DEFAULT false,
          sensor_estacionamento BOOLEAN DEFAULT false, camera_re BOOLEAN DEFAULT false,
          multimidia BOOLEAN DEFAULT false, bluetooth BOOLEAN DEFAULT false,
          gps_nativo BOOLEAN DEFAULT false, banco_couro BOOLEAN DEFAULT false,
          teto_solar BOOLEAN DEFAULT false, sensor_chuva BOOLEAN DEFAULT false,
          farol_neblina BOOLEAN DEFAULT false, rodas_liga BOOLEAN DEFAULT false,
          alarme BOOLEAN DEFAULT false, controle_tracao BOOLEAN DEFAULT false,
          piloto_automatico BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS driver_profiles (
          id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          car_id INTEGER REFERENCES cars(id) ON DELETE SET NULL, car_interesse_id INTEGER REFERENCES cars(id),
          status VARCHAR(30) DEFAULT 'pendente',
          cnh_url TEXT, comprovante_url TEXT, selfie_url TEXT, contrato_url TEXT, perfil_app_url TEXT,
          contrato_confirmado BOOLEAN DEFAULT false, caucao_pago BOOLEAN DEFAULT false,
          token_externo VARCHAR(20), cadastro_externo BOOLEAN DEFAULT false,
          data_inicio TIMESTAMP, data_rescisao TIMESTAMP, motivo_reprovacao TEXT,
          dia_cobranca VARCHAR(20) DEFAULT 'segunda', rg VARCHAR(30), endereco_completo TEXT,
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
          juros_acumulados DECIMAL(10,2) DEFAULT 0, valor_pago_total DECIMAL(10,2) DEFAULT 0,
          saldo_devedor DECIMAL(10,2) DEFAULT 0,
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

        await client.query(`CREATE TABLE IF NOT EXISTS acrescimos (
          id SERIAL PRIMARY KEY, charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
          driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          descricao VARCHAR(255) NOT NULL, valor DECIMAL(10,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS final_settlements (
          id SERIAL PRIMARY KEY, driver_id INTEGER REFERENCES driver_profiles(id),
          debitos_pendentes DECIMAL(10,2) DEFAULT 0, multas_acumuladas DECIMAL(10,2) DEFAULT 0,
          danos DECIMAL(10,2) DEFAULT 0, outros_descontos DECIMAL(10,2) DEFAULT 0,
          valor_caucao DECIMAL(10,2) DEFAULT 0, renavam VARCHAR(30), saldo_final DECIMAL(10,2) DEFAULT 0,
          observacoes TEXT, pdf_url TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS car_swaps (
          id SERIAL PRIMARY KEY, driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          car_anterior_id INTEGER REFERENCES cars(id), car_novo_id INTEGER REFERENCES cars(id),
          motivo TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS payment_entries (
          id SERIAL PRIMARY KEY, charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
          driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          valor_pago DECIMAL(10,2) NOT NULL, data_pagamento DATE NOT NULL,
          observacoes TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS properties (
          id SERIAL PRIMARY KEY,
          tipo VARCHAR(50) NOT NULL DEFAULT 'apartamento',
          titulo VARCHAR(255),
          endereco VARCHAR(255) NOT NULL,
          bairro VARCHAR(100),
          cidade VARCHAR(100) NOT NULL,
          estado VARCHAR(2) NOT NULL DEFAULT 'SC',
          cep VARCHAR(10),
          quartos INTEGER DEFAULT 0,
          banheiros INTEGER DEFAULT 0,
          vagas_garagem INTEGER DEFAULT 0,
          area_m2 DECIMAL(10,2),
          valor_mensal DECIMAL(10,2) NOT NULL,
          valor_deposito DECIMAL(10,2) DEFAULT 0,
          disponivel BOOLEAN DEFAULT true,
          mobiliado BOOLEAN DEFAULT false,
          aceita_pets BOOLEAN DEFAULT false,
          piscina BOOLEAN DEFAULT false,
          churrasqueira BOOLEAN DEFAULT false,
          portaria_24h BOOLEAN DEFAULT false,
          elevador BOOLEAN DEFAULT false,
          academia BOOLEAN DEFAULT false,
          varanda BOOLEAN DEFAULT false,
          area_servico BOOLEAN DEFAULT false,
          playground BOOLEAN DEFAULT false,
          salao_festas BOOLEAN DEFAULT false,
          descricao TEXT,
          foto_url TEXT,
          fotos_extras TEXT DEFAULT '[]',
          observacoes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
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
      // Incremental: cria tabelas novas se não existirem
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS acrescimos (
          id SERIAL PRIMARY KEY, charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
          driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          descricao VARCHAR(255) NOT NULL, valor DECIMAL(10,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
        // Add data_inicio if missing
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMP`);
        await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS justificativa TEXT`);
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS dia_cobranca VARCHAR(20) DEFAULT 'segunda'`);
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS perfil_app_url TEXT`);
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS rg VARCHAR(30)`);
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS endereco_completo TEXT`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS renavam VARCHAR(30)`);
        // Car specs
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS ar_condicionado BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS combustivel VARCHAR(30) DEFAULT 'Flex'`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS transmissao VARCHAR(30) DEFAULT 'Manual'`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS direcao VARCHAR(30) DEFAULT 'Hidráulica'`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS consumo_medio VARCHAR(30)`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS portas INTEGER DEFAULT 4`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS descricao TEXT`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS fotos_extras TEXT DEFAULT '[]'`);
        // Feature boolean columns
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS vidro_eletrico BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS trava_eletrica BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS airbag BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS freio_abs BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS sensor_estacionamento BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS camera_re BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS multimidia BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS bluetooth BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS gps_nativo BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS banco_couro BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS teto_solar BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS sensor_chuva BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS farol_neblina BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS rodas_liga BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS alarme BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS controle_tracao BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS piloto_automatico BOOLEAN DEFAULT false`);
        // Driver car interest
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS car_interesse_id INTEGER REFERENCES cars(id)`);
        // Car swap history
        await pool.query(`CREATE TABLE IF NOT EXISTS car_swaps (
          id SERIAL PRIMARY KEY, driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          car_anterior_id INTEGER REFERENCES cars(id), car_novo_id INTEGER REFERENCES cars(id),
          motivo TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);
        // Manual payment entries (multiple per charge)
        await pool.query(`CREATE TABLE IF NOT EXISTS payment_entries (
          id SERIAL PRIMARY KEY, charge_id INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
          driver_id INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
          valor_pago DECIMAL(10,2) NOT NULL, data_pagamento DATE NOT NULL,
          observacoes TEXT, created_at TIMESTAMP DEFAULT NOW()
        )`);
        // Properties table
        await pool.query(`CREATE TABLE IF NOT EXISTS properties (
          id SERIAL PRIMARY KEY,
          tipo VARCHAR(50) NOT NULL DEFAULT 'apartamento',
          titulo VARCHAR(255),
          endereco VARCHAR(255) NOT NULL,
          bairro VARCHAR(100),
          cidade VARCHAR(100) NOT NULL,
          estado VARCHAR(2) NOT NULL DEFAULT 'SC',
          cep VARCHAR(10),
          quartos INTEGER DEFAULT 0,
          banheiros INTEGER DEFAULT 0,
          vagas_garagem INTEGER DEFAULT 0,
          area_m2 DECIMAL(10,2),
          valor_mensal DECIMAL(10,2) NOT NULL,
          valor_deposito DECIMAL(10,2) DEFAULT 0,
          disponivel BOOLEAN DEFAULT true,
          mobiliado BOOLEAN DEFAULT false,
          aceita_pets BOOLEAN DEFAULT false,
          piscina BOOLEAN DEFAULT false,
          churrasqueira BOOLEAN DEFAULT false,
          portaria_24h BOOLEAN DEFAULT false,
          elevador BOOLEAN DEFAULT false,
          academia BOOLEAN DEFAULT false,
          varanda BOOLEAN DEFAULT false,
          area_servico BOOLEAN DEFAULT false,
          playground BOOLEAN DEFAULT false,
          salao_festas BOOLEAN DEFAULT false,
          descricao TEXT,
          foto_url TEXT,
          fotos_extras TEXT DEFAULT '[]',
          observacoes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`);
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS property_interesse_id INTEGER REFERENCES properties(id)`);
        // Titulo e juros on weekly_charges
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS titulo VARCHAR(255)`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS juros_acumulados DECIMAL(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS valor_pago_total DECIMAL(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS saldo_devedor DECIMAL(10,2) DEFAULT 0`);

        // FIX 2026-07-09: coluna pra rastrear pagamento propagado como crédito
        // da semana anterior (idempotência ao recalcular)
        await pool.query(`ALTER TABLE payment_entries ADD COLUMN IF NOT EXISTS origem_charge_id INTEGER NULL REFERENCES weekly_charges(id) ON DELETE SET NULL`);

        // FIX 2026-07-09: setting juros_diferido (mesmo espírito de multa_diferida)
        await pool.query(`
          INSERT INTO settings (chave, valor, descricao)
          VALUES ('juros_diferido', 'true', 'Se true, juros acumulam e só são cobrados na rescisão')
          ON CONFLICT (chave) DO NOTHING
        `);

        // Indexes para performance
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON driver_profiles (user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON driver_profiles (status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_weekly_charges_driver_id ON weekly_charges (driver_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_driver_id ON payments (driver_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id)`);

        // Remove constraint que bloqueava cobranças avulsas na mesma semana
        try {
          await pool.query(`ALTER TABLE weekly_charges DROP CONSTRAINT IF EXISTS unique_driver_week`);
        } catch (_) { /* ignora */ }

        // Fixação de documentos pelo admin
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS fixado BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS descricao TEXT`);

        // Liberação de caução
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS caucao_liberada BOOLEAN DEFAULT false`);

        // Tipo de cobrança (semanal/caucao/avulsa) — diferencia a charge de caução das semanais
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'semanal'`);

        // Backfill: cria charge tipo='caucao' para motoristas com caução liberada e sem pagamento
        await pool.query(`
          INSERT INTO weekly_charges
            (driver_id, semana_ref, valor_base, valor_final, tipo, titulo, observacoes)
          SELECT dp.id, CURRENT_DATE, c.valor_caucao, c.valor_caucao,
                 'caucao', 'Caução', 'Caução liberada sem pagamento — cobrança retroativa'
          FROM driver_profiles dp
          JOIN cars c ON c.id = dp.car_id
          WHERE dp.caucao_liberada = true
            AND dp.caucao_pago = false
            AND c.valor_caucao > 0
            AND NOT EXISTS (
              SELECT 1 FROM weekly_charges wc
              WHERE wc.driver_id = dp.id AND wc.tipo = 'caucao'
            )
        `);

        // Manutenção de veículos
        await pool.query(`CREATE TABLE IF NOT EXISTS car_maintenance (
          id SERIAL PRIMARY KEY, car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
          tipo VARCHAR(100) NOT NULL, descricao TEXT, data_realizacao DATE NOT NULL,
          km_realizacao INTEGER, valor DECIMAL(10,2) DEFAULT 0, fornecedor VARCHAR(200),
          observacoes TEXT, abatimento_id INTEGER REFERENCES abatimentos(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )`);
        await pool.query(`ALTER TABLE car_maintenance ADD COLUMN IF NOT EXISTS abatimento_id INTEGER REFERENCES abatimentos(id) ON DELETE SET NULL`);
        await pool.query(`ALTER TABLE car_maintenance ADD COLUMN IF NOT EXISTS nota_url TEXT`);

        // Tabela de cláusulas do contrato (editáveis pelo admin)
        await pool.query(`CREATE TABLE IF NOT EXISTS contract_clauses (
          id SERIAL PRIMARY KEY,
          ordem INTEGER NOT NULL DEFAULT 0,
          titulo VARCHAR(255) NOT NULL,
          conteudo TEXT NOT NULL,
          ativo BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`);

        // Backfill: preenche token_externo para motoristas que não têm
        await pool.query(`
          UPDATE driver_profiles dp
          SET token_externo = SUBSTRING(REGEXP_REPLACE(u.cpf, '[^0-9]', '', 'g'), 1, 6)
          FROM users u
          WHERE u.id = dp.user_id
            AND u.cpf IS NOT NULL
            AND (dp.token_externo IS NULL OR dp.token_externo = '')
        `);

        // Backfill: motoristas pendentes com 3 docs → em_analise
        await pool.query(`
          UPDATE driver_profiles SET status = 'em_analise', updated_at = NOW()
          WHERE status = 'pendente'
            AND cnh_url IS NOT NULL
            AND comprovante_url IS NOT NULL
            AND perfil_app_url IS NOT NULL
        `);

        // ========== MIGRAÇÕES DA AUDITORIA (2026-05-25) ==========
        // Idempotentes — roda toda boot, sem efeito se já aplicadas.
        // Soft-delete em tabelas críticas (preserva histórico)
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE abatimentos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE acrescimos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        await pool.query(`ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);

        // Magic Link tokens (login admin sem senha — gerados por crypto.randomBytes)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS magic_link_tokens (
            id          SERIAL PRIMARY KEY,
            email       VARCHAR(255) NOT NULL,
            token_hash  VARCHAR(128) NOT NULL UNIQUE,
            expires_at  TIMESTAMP NOT NULL,
            used_at     TIMESTAMP,
            ip_origem   VARCHAR(64),
            ua_origem   TEXT,
            created_at  TIMESTAMP DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens(email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires ON magic_link_tokens(expires_at)`);

        // Audit log (toda mudança em settings + ações sensíveis)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS audit_log (
            id            SERIAL PRIMARY KEY,
            user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
            user_email    VARCHAR(255),
            acao          VARCHAR(100) NOT NULL,
            recurso       VARCHAR(100),
            recurso_id    VARCHAR(64),
            dados_antigos TEXT,
            dados_novos   TEXT,
            ip            VARCHAR(64),
            via           VARCHAR(32),
            created_at    TIMESTAMP DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_recurso ON audit_log(recurso)`);

        // UNIQUE em mp_payment_id (anti-duplicação de pagamento webhook).
        // Limpa duplicatas e adiciona constraint — tudo idempotente em DO block.
        await pool.query(`
          DO $$
          BEGIN
            DELETE FROM payments WHERE id IN (
              SELECT id FROM payments p1
              WHERE mp_payment_id IS NOT NULL
                AND id > (SELECT MIN(id) FROM payments p2 WHERE p2.mp_payment_id = p1.mp_payment_id)
            );
            BEGIN
              ALTER TABLE payments ADD CONSTRAINT uq_payments_mp_payment_id UNIQUE (mp_payment_id);
            EXCEPTION WHEN duplicate_object THEN NULL;
            END;
          END
          $$
        `);
      } catch (e) { /* já existe */ }
    }
  } catch (err) {
    console.error('❌ Erro verificar tabelas:', err.message);
  }

  // 3) Auto seed: cria admin + settings se não existirem
  try {
    const adminCheck = await pool.query("SELECT id FROM users WHERE email = 'admin@implocadora.com.br'");
    if (adminCheck.rows.length === 0) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      // Hardening: avisa em PROD se ADMIN_PASSWORD não foi setado.
      // Recomendação ao JOs: usar magic link como caminho de login admin
      // (rotas /api/auth/magic-link/*); admin@implocadora.com.br precisa
      // estar em ADMIN_EMAILS env var.
      if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || adminPassword === 'admin123' || adminPassword.length < 12)) {
        console.error('⚠️  CRÍTICO: ADMIN_PASSWORD fraca/default em PRODUÇÃO. Configure ADMIN_PASSWORD com 12+ chars no Railway, ou use Magic Link (ADMIN_EMAILS env).');
      }
      const hash = await bcrypt.hash(adminPassword, 10);
      await pool.query("INSERT INTO users (nome, email, senha_hash, role) VALUES ('Administrador', 'admin@implocadora.com.br', $1, 'admin')", [hash]);
      console.log('✅ Admin criado: admin@implocadora.com.br');
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
      ['mp_webhook_url', 'https://locacar-production.up.railway.app/api/webhooks/mp', 'Webhook MP'],
      ['mp_access_token', '', 'Access Token do Mercado Pago (produção)'],
      ['mp_public_key', '', 'Public Key do Mercado Pago (produção)'],
      ['mp_access_token_test', '', 'Access Token de teste do Mercado Pago'],
      ['mp_public_key_test', '', 'Public Key de teste do Mercado Pago'],
      ['mp_modo', 'test', 'Modo do MP: test ou production'],
      ['locador_nome', '', 'Nome do locador'],
      ['locador_rg', '', 'RG do locador'],
      ['locador_cpf', '', 'CPF do locador'],
      ['locador_endereco', '', 'Endereço do locador'],
      ['locador_email', '', 'Email do locador'],
      ['locador_cidade', '', 'Cidade/Comarca'],
    ];
    for (const [c, v, d] of defaults) {
      await pool.query('INSERT INTO settings (chave, valor, descricao) VALUES ($1, $2, $3) ON CONFLICT (chave) DO NOTHING', [c, v, d]);
    }

    const fees = [[1,0],[2,5.49],[3,7.49],[4,9.49],[5,11.49],[6,13.49],[7,15.49],[8,17.49],[9,19.49],[10,21.49],[11,23.49],[12,25.49]];
    for (const [p, t] of fees) {
      await pool.query('INSERT INTO installment_fees (parcelas, taxa_percentual) VALUES ($1, $2) ON CONFLICT (parcelas) DO NOTHING', [p, t]);
    }

    // Seed cláusulas do contrato — SEMPRE verifica se precisa atualizar
    const clauseCount = await pool.query('SELECT COUNT(*) FROM contract_clauses');
    const clauses = require('./config/defaultClauses');
    
    let needsReseed = false;
    const count = parseInt(clauseCount.rows[0].count);
    
    if (count === 0) {
      needsReseed = true;
      console.log('📝 Nenhuma cláusula encontrada, seedando...');
    } else if (count !== clauses.length) {
      needsReseed = true;
      console.log(`🔄 Número de cláusulas diferente (DB: ${count}, esperado: ${clauses.length}). Re-seedando...`);
    } else {
      // Verifica se texto é a versão completa
      const longestExpected = clauses.reduce((max, c) => Math.max(max, c[2].length), 0);
      const longestDB = await pool.query('SELECT MAX(LENGTH(conteudo)) as maxlen FROM contract_clauses');
      const dbMaxLen = parseInt(longestDB.rows[0]?.maxlen || 0);
      
      if (dbMaxLen < longestExpected * 0.7) {
        needsReseed = true;
        console.log(`🔄 Cláusulas abreviadas detectadas (DB: ${dbMaxLen} chars, esperado: ${longestExpected}). Re-seedando...`);
      }
    }

    if (needsReseed) {
      await pool.query('DELETE FROM contract_clauses');
      for (const [ordem, titulo, conteudo] of clauses) {
        await pool.query('INSERT INTO contract_clauses (ordem, titulo, conteudo) VALUES ($1, $2, $3)', [ordem, titulo, conteudo]);
      }
      console.log(`✅ ${clauses.length} cláusulas do contrato seedadas (v4 com vistoria digital, LGPD, reajuste).`);
    }

    console.log('✅ Settings e taxas OK.');
  } catch (seedErr) {
    console.error('⚠️ Seed erro:', seedErr.message);
  }

  // 4) Inicia servidor
  app.listen(PORT, () => {
    console.log('🚗 IMP Locadora API porta ' + PORT + ' | ' + (process.env.NODE_ENV || 'development'));
  });

  // 4.5) Reconciliação one-shot: roda uma vez pra corrigir bug de valor_final
  // (multa embutida quando multa_diferida=true). Marca em settings.
  setTimeout(async () => {
    try {
      const CHAVE = 'reconciliado_v2_2026_07_09';
      const jaRodou = await pool.query(`SELECT valor FROM settings WHERE chave = $1`, [CHAVE]);
      if (jaRodou.rows.length > 0 && jaRodou.rows[0].valor === 'true') {
        console.log(`🔧 Reconciliação já foi executada — pulando`);
        return;
      }
      console.log(`🔧 Executando reconciliação financeira one-shot...`);
      const { runReconciliacao } = require('./services/ReconciliacaoService');
      const resumo = await runReconciliacao(pool, { apply: true });
      console.log(`🔧 Reconciliação concluída:`, resumo);
      await pool.query(
        `INSERT INTO settings (chave, valor, descricao) VALUES ($1, $2, $3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
        [CHAVE, 'true', `Reconciliação executada: ${JSON.stringify(resumo)}`]
      );
    } catch (err) {
      console.error(`🔧 Erro na reconciliação (não bloqueante):`, err.message);
    }
  }, 8000);

  // 5) CRON: Gerar cobranças automáticas diariamente.
  // Singleton guard: nodemon/hot-reload pode chamar start() 2x; o handler
  // de SIGTERM limpa o interval em shutdown gracioso pro Railway.
  let _chargeIntervalId = null;
  const startChargeCron = () => {
    if (_chargeIntervalId) {
      console.log('⏰ CRON já estava ativo — pulando inicialização dupla');
      return;
    }
    const diasMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };

    const gerarCobrancasDoDia = async () => {
      try {
        const now = new Date();
        // Ajusta para horário de Brasília (UTC-3)
        const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaSemanaHoje = diasMap[brDate.getDay()];

        // FIX 2026-07-09: gera cobrança da PRÓXIMA semana (vencimento em 7 dias)
        // Assim quando chega o dia do vencimento, a cobrança já está disponível há
        // uma semana inteira pro motorista pagar antecipadamente.
        // Se hoje é sábado e o motorista tem dia_cobranca=sábado, geramos a cobrança
        // com semana_ref=próximo sábado (7 dias à frente).
        const proxVencimento = new Date(brDate);
        proxVencimento.setDate(brDate.getDate() + 7);
        const semanaRef = proxVencimento.toISOString().split('T')[0];

        console.log(`⏰ CRON: Gerando cobranças ${diaSemanaHoje} c/ vencimento ${semanaRef}...`);

        // Motoristas cujo dia de vencimento é HOJE (mesmo dia da semana → 7 dias à frente)
        const drivers = await pool.query(`
          SELECT dp.id, dp.car_id, c.valor_semanal
          FROM driver_profiles dp
          JOIN cars c ON c.id = dp.car_id
          WHERE dp.status = 'ativo' AND dp.car_id IS NOT NULL AND dp.dia_cobranca = $1
        `, [diaSemanaHoje]);

        if (drivers.rows.length === 0) {
          console.log(`⏰ CRON: Nenhum motorista com dia_cobranca=${diaSemanaHoje}.`);
          return;
        }

        let geradas = 0;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const drv of drivers.rows) {
            // Não duplica
            const exists = await client.query(
              'SELECT id FROM weekly_charges WHERE driver_id = $1 AND semana_ref = $2',
              [drv.id, semanaRef]
            );
            if (exists.rows.length > 0) continue;

            // Crédito real disponível (sobrepagamento em pagas - já aplicado)
            const creditoTotalQ = await client.query(
              `SELECT COALESCE(SUM(valor_pago_total - valor_final), 0) AS total
                 FROM weekly_charges
                WHERE driver_id = $1 AND pago = true
                  AND valor_pago_total > valor_final + 0.01`,
              [drv.id]
            );
            const jaAplicadoQ = await client.query(
              `SELECT COALESCE(SUM(-credito_anterior), 0) AS ja_aplicado
                 FROM weekly_charges
                WHERE driver_id = $1 AND credito_anterior < 0`,
              [drv.id]
            );
            const creditoDisponivel =
              parseFloat(creditoTotalQ.rows[0].total) -
              parseFloat(jaAplicadoQ.rows[0].ja_aplicado);
            const creditoAnterior = creditoDisponivel > 0.01 ? -creditoDisponivel : 0;

            const base = parseFloat(drv.valor_semanal);
            const valorFinal = Math.max(base + creditoAnterior, 0);

            await client.query(`
              INSERT INTO weekly_charges (driver_id, semana_ref, valor_base, credito_anterior, valor_final, observacoes)
              VALUES ($1, $2, $3, $4, $5, 'Gerada automaticamente')
            `, [drv.id, semanaRef, base, creditoAnterior, valorFinal]);
            geradas++;
          }
          await client.query('COMMIT');
        } catch (cronErr) {
          await client.query('ROLLBACK');
          throw cronErr;
        } finally {
          client.release();
        }

        if (geradas > 0) {
          console.log(`✅ CRON: ${geradas} cobrança(s) gerada(s) c/ vencimento ${semanaRef}`);
        } else {
          console.log(`⏰ CRON: Cobranças para vencimento ${semanaRef} já existiam.`);
        }
      } catch (err) {
        console.error('❌ CRON erro:', err.message);
      }
    };

    // Roda imediatamente ao iniciar o servidor
    setTimeout(gerarCobrancasDoDia, 5000);

    // Depois roda a cada 1 hora (verifica se precisa gerar)
    _chargeIntervalId = setInterval(gerarCobrancasDoDia, 60 * 60 * 1000);

    console.log('⏰ CRON de cobranças automáticas ativo (verifica a cada 1h)');
  };

  // Shutdown gracioso — limpa CRON antes do processo morrer
  process.on('SIGTERM', () => {
    if (_chargeIntervalId) clearInterval(_chargeIntervalId);
    console.log('SIGTERM recebido, encerrando…');
    process.exit(0);
  });

  startChargeCron();
}

start();
module.exports = app;
