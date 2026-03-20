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
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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

// ========== HEALTH ==========
app.get('/api/health', async (req, res) => {
  try {
    const pool = require('./config/database');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'error', timestamp: new Date().toISOString() });
  }
});

// ========== RAIZ / FRONTEND ==========
const publicPath = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicPath, 'index.html');

if (fs.existsSync(indexPath)) {
  console.log('📁 Frontend encontrado em /public. Servindo SPA...');
  app.use(express.static(publicPath));
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

        // Indexes para performance
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON driver_profiles (user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON driver_profiles (status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_weekly_charges_driver_id ON weekly_charges (driver_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_driver_id ON payments (driver_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id)`);

        // Constraint para evitar cobranças duplicadas
        try {
          await pool.query(`ALTER TABLE weekly_charges ADD CONSTRAINT unique_driver_week UNIQUE (driver_id, semana_ref)`);
        } catch (_) { /* já existe */ }

        // Fixação de documentos pelo admin
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS fixado BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS descricao TEXT`);

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
      console.log(`✅ ${clauses.length} cláusulas do contrato seedadas (v3 com checklist, LGPD, reajuste).`);
    }

    console.log('✅ Settings e taxas OK.');
  } catch (seedErr) {
    console.error('⚠️ Seed erro:', seedErr.message);
  }

  // 4) Inicia servidor
  app.listen(PORT, () => {
    console.log('🚗 IMP Locadora API porta ' + PORT + ' | ' + (process.env.NODE_ENV || 'development'));
  });

  // 5) CRON: Gerar cobranças automáticas diariamente
  const startChargeCron = () => {
    const diasMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };

    const gerarCobrancasDoDia = async () => {
      try {
        const now = new Date();
        // Ajusta para horário de Brasília (UTC-3)
        const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaSemana = diasMap[brDate.getDay()];
        const semanaRef = brDate.toISOString().split('T')[0];

        console.log(`⏰ CRON: Verificando cobranças para ${diaSemana} (${semanaRef})...`);

        // Busca motoristas ativos com carro nesse dia
        const drivers = await pool.query(`
          SELECT dp.id, dp.car_id, c.valor_semanal
          FROM driver_profiles dp
          JOIN cars c ON c.id = dp.car_id
          WHERE dp.status = 'ativo' AND dp.car_id IS NOT NULL AND dp.dia_cobranca = $1
        `, [diaSemana]);

        if (drivers.rows.length === 0) {
          console.log(`⏰ CRON: Nenhum motorista para cobrar na ${diaSemana}.`);
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

            // Crédito anterior
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
          console.log(`✅ CRON: ${geradas} cobrança(s) gerada(s) para ${diaSemana} (${semanaRef})`);
        } else {
          console.log(`⏰ CRON: Cobranças de ${diaSemana} já existiam.`);
        }
      } catch (err) {
        console.error('❌ CRON erro:', err.message);
      }
    };

    // Roda imediatamente ao iniciar o servidor
    setTimeout(gerarCobrancasDoDia, 5000);

    // Depois roda a cada 1 hora (verifica se precisa gerar)
    setInterval(gerarCobrancasDoDia, 60 * 60 * 1000);

    console.log('⏰ CRON de cobranças automáticas ativo (verifica a cada 1h)');
  };

  startChargeCron();
}

start();
module.exports = app;
