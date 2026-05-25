/**
 * LOCACAR - Migração do Banco de Dados
 * Executa: npm run migrate
 */
const pool = require('./database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ========== ENUM TYPES ==========
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'motorista');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE driver_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'reprovado', 'ativo', 'inadimplente', 'rescindido', 'recolhido');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_status AS ENUM ('pendente', 'pago', 'expirado', 'cancelado', 'estornado');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_type AS ENUM ('caucao', 'semanal', 'multa', 'acerto_final');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_method AS ENUM ('pix', 'cartao');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== TABELA: users ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        nome          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        senha_hash    VARCHAR(255) NOT NULL,
        cpf           VARCHAR(14) UNIQUE,
        telefone      VARCHAR(20),
        role          user_role NOT NULL DEFAULT 'motorista',
        ativo         BOOLEAN DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: cars ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS cars (
        id              SERIAL PRIMARY KEY,
        marca           VARCHAR(100) NOT NULL,
        modelo          VARCHAR(100) NOT NULL,
        ano             INTEGER,
        placa           VARCHAR(10) UNIQUE NOT NULL,
        cor             VARCHAR(50),
        foto_url        VARCHAR(500),
        valor_semanal   DECIMAL(10,2) NOT NULL,
        valor_caucao    DECIMAL(10,2) NOT NULL DEFAULT 0,
        disponivel      BOOLEAN DEFAULT true,
        observacoes     TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: driver_profiles ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_profiles (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        car_id          INTEGER REFERENCES cars(id) ON DELETE SET NULL,
        status          driver_status DEFAULT 'pendente',
        cnh_url         VARCHAR(500),
        comprovante_url VARCHAR(500),
        selfie_url      VARCHAR(500),
        contrato_url    VARCHAR(500),
        contrato_confirmado BOOLEAN DEFAULT false,
        caucao_pago     BOOLEAN DEFAULT false,
        caucao_liberada BOOLEAN DEFAULT false,
        token_externo   VARCHAR(20),
        cadastro_externo BOOLEAN DEFAULT false,
        data_inicio     DATE,
        data_rescisao   DATE,
        motivo_reprovacao TEXT,
        observacoes     TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: documents ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tipo            VARCHAR(50) NOT NULL,
        nome_arquivo    VARCHAR(255) NOT NULL,
        caminho         VARCHAR(500) NOT NULL,
        mime_type       VARCHAR(100),
        tamanho         INTEGER,
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: weekly_charges ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_charges (
        id              SERIAL PRIMARY KEY,
        driver_id       INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
        semana_ref      DATE NOT NULL,
        valor_base      DECIMAL(10,2) NOT NULL,
        abatimentos     DECIMAL(10,2) DEFAULT 0,
        credito_anterior DECIMAL(10,2) DEFAULT 0,
        multa           DECIMAL(10,2) DEFAULT 0,
        valor_final     DECIMAL(10,2) NOT NULL,
        pago            BOOLEAN DEFAULT false,
        data_pagamento  TIMESTAMP,
        observacoes     TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: abatimentos ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS abatimentos (
        id              SERIAL PRIMARY KEY,
        charge_id       INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
        driver_id       INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
        descricao       VARCHAR(255),
        valor           DECIMAL(10,2) NOT NULL,
        nota_url        VARCHAR(500),
        aprovado        BOOLEAN DEFAULT false,
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: payments ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
        driver_id           INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
        charge_id           INTEGER REFERENCES weekly_charges(id) ON DELETE SET NULL,
        tipo                payment_type NOT NULL,
        metodo              payment_method,
        valor               DECIMAL(10,2) NOT NULL,
        parcelas            INTEGER DEFAULT 1,
        juros               DECIMAL(10,2) DEFAULT 0,
        valor_total         DECIMAL(10,2) NOT NULL,
        status              payment_status DEFAULT 'pendente',
        mp_payment_id       VARCHAR(100),
        mp_preference_id    VARCHAR(100),
        mp_qr_code          TEXT,
        mp_qr_code_base64   TEXT,
        mp_ticket_url       VARCHAR(500),
        mp_expiration       TIMESTAMP,
        data_pagamento      TIMESTAMP,
        justificativa       TEXT,
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: settings ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id              SERIAL PRIMARY KEY,
        chave           VARCHAR(100) UNIQUE NOT NULL,
        valor           TEXT NOT NULL,
        descricao       VARCHAR(255),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: installment_fees (juros por parcela) ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS installment_fees (
        id              SERIAL PRIMARY KEY,
        parcelas        INTEGER UNIQUE NOT NULL,
        taxa_percentual DECIMAL(5,2) NOT NULL,
        ativo           BOOLEAN DEFAULT true,
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: acrescimos (acréscimos nas cobranças) ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS acrescimos (
        id          SERIAL PRIMARY KEY,
        charge_id   INTEGER REFERENCES weekly_charges(id) ON DELETE CASCADE,
        driver_id   INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
        descricao   VARCHAR(255) NOT NULL,
        valor       DECIMAL(10,2) NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== TABELA: final_settlements (acerto final) ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS final_settlements (
        id                  SERIAL PRIMARY KEY,
        driver_id           INTEGER REFERENCES driver_profiles(id) ON DELETE CASCADE,
        debitos_pendentes   DECIMAL(10,2) DEFAULT 0,
        multas_acumuladas   DECIMAL(10,2) DEFAULT 0,
        danos               DECIMAL(10,2) DEFAULT 0,
        outros_descontos    DECIMAL(10,2) DEFAULT 0,
        valor_caucao        DECIMAL(10,2) DEFAULT 0,
        saldo_final         DECIMAL(10,2) DEFAULT 0,
        observacoes         TEXT,
        pdf_url             VARCHAR(500),
        created_at          TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== ÍNDICES ==========
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_user ON driver_profiles(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON driver_profiles(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_weekly_charges_driver ON weekly_charges(driver_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_mp ON payments(mp_payment_id);`);

    // ========== TABELA: car_maintenance ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS car_maintenance (
        id              SERIAL PRIMARY KEY,
        car_id          INTEGER REFERENCES cars(id) ON DELETE CASCADE,
        tipo            VARCHAR(100) NOT NULL,
        descricao       TEXT,
        data_realizacao DATE NOT NULL,
        km_realizacao   INTEGER,
        valor           DECIMAL(10,2) DEFAULT 0,
        fornecedor      VARCHAR(200),
        observacoes     TEXT,
        abatimento_id   INTEGER REFERENCES abatimentos(id) ON DELETE SET NULL,
        nota_url        TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ========== MIGRAÇÕES INCREMENTAIS ==========
    await client.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS caucao_liberada BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'semanal';`);
    await client.query(`ALTER TABLE car_maintenance ADD COLUMN IF NOT EXISTS abatimento_id INTEGER REFERENCES abatimentos(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE car_maintenance ADD COLUMN IF NOT EXISTS nota_url TEXT;`);

    // ========== MIGRAÇÕES da Auditoria (2026-05-25) ==========
    // Soft-delete: adiciona deleted_at em tabelas críticas pra preservar histórico.
    // Queries de leitura devem incluir "AND deleted_at IS NULL" (ver routes/drivers.js).
    await client.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE abatimentos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE acrescimos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
    await client.query(`ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);

    // Tokens de Magic Link (login admin por link email).
    // token_hash = sha256 do token entregue ao admin; nunca armazenamos o token cru.
    await client.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id          SERIAL PRIMARY KEY,
        email       VARCHAR(255) NOT NULL,
        token_hash  VARCHAR(128) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        used_at     TIMESTAMP,
        ip_origem   VARCHAR(64),
        ua_origem   TEXT,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires ON magic_link_tokens(expires_at);`);

    // Audit log — toda mudança em settings (e ações sensíveis) fica registrada.
    await client.query(`
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
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_recurso ON audit_log(recurso);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);`);

    // UNIQUE em mp_payment_id (anti-duplicação de pagamento).
    // Limpa duplicatas existentes ANTES de aplicar (idempotente: NÃO falha se já existir).
    // ON CONFLICT impossível em ALTER, usamos DO bloco com EXCEPTION pra não quebrar boot.
    await client.query(`
      DO $$
      BEGIN
        -- Apaga duplicatas mantendo o MIN(id) por mp_payment_id (mais antigo = primeiro processado)
        DELETE FROM payments WHERE id IN (
          SELECT id FROM payments p1
          WHERE mp_payment_id IS NOT NULL
            AND id > (SELECT MIN(id) FROM payments p2 WHERE p2.mp_payment_id = p1.mp_payment_id)
        );
        -- Tenta criar constraint; se já existir, ignora
        BEGIN
          ALTER TABLE payments ADD CONSTRAINT uq_payments_mp_payment_id UNIQUE (mp_payment_id);
        EXCEPTION WHEN duplicate_object THEN
          NULL;
        END;
      END
      $$;
    `);

    await client.query('COMMIT');
    console.log('✅ Migração concluída com sucesso!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
