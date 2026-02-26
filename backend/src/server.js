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
app.use('/api/contract-clauses', require('./routes/contractClauses'));

// ========== HEALTH ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ========== RAIZ / FRONTEND ==========
const fs = require('fs');
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
    res.json({ app: 'LocaCar API', version: '1.0', health: '/api/health' });
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
          ar_condicionado BOOLEAN DEFAULT false, combustivel VARCHAR(30) DEFAULT 'Flex',
          transmissao VARCHAR(30) DEFAULT 'Manual', direcao VARCHAR(30) DEFAULT 'Hidráulica',
          consumo_medio VARCHAR(30), portas INTEGER DEFAULT 4, descricao TEXT,
          fotos_extras TEXT DEFAULT '[]', renavam VARCHAR(30),
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
        // Juros column on weekly_charges
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS juros_acumulados DECIMAL(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS valor_pago_total DECIMAL(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE weekly_charges ADD COLUMN IF NOT EXISTS saldo_devedor DECIMAL(10,2) DEFAULT 0`);

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

    // Seed cláusulas do contrato (só se tabela vazia)
    const clauseCount = await pool.query('SELECT COUNT(*) FROM contract_clauses');
    if (parseInt(clauseCount.rows[0].count) === 0) {
      const clauses = [
        [1, 'CLAUSULA 1a - DO OBJETO DO CONTRATO', '• O objeto do presente contrato e o seguinte veiculo automotor:\n• {VEICULO}\n• O veiculo, objeto deste contrato, e de uso exclusivo do LOCATARIO. Este se compromete a nao transferir ou ceder os direitos concedidos por este contrato a terceiros, nem permitir que o veiculo seja conduzido por outra pessoa sem a previa, inequivoca e expressa autorizacao do LOCADOR.\nNa eventualidade de o veiculo ser conduzido por terceiro sem a devida autorizacao do LOCADOR, o LOCATARIO estara sujeito a imediata rescisao deste contrato, sem prejuizo de uma multa no valor de R$ 550,00 (quinhentos e cinquenta reais) e assumira total responsabilidade por quaisquer danos causados ao veiculo.'],
        [2, 'CLAUSULA 2a - DO HORARIO DO ALUGUEL E LOCAL DE COLETA E DEVOLUCAO DO VEICULO', '• O veiculo objeto do presente contrato permanecera na posse do locatario por periodo integral, de segunda a domingo. O LOCATARIO tem o direito de manter a posse e o uso exclusivo do veiculo 24 horas por dia, 7 dias por semana.\n• O LOCATARIO se compromete a disponibilizar o veiculo para vistoria pelo LOCADOR uma vez por semana.\nNa eventualidade de o LOCATARIO falhar por duas vezes em apresentar o veiculo para vistoria sem justificativa valida, tal omissao podera ser considerada violacao contratual.\nO LOCADOR, ao receber o automovel, tem o prazo de 24 horas para enviar para o LOCATARIO, via WhatsApp, fotos de todos os detalhes, imperfeicoes, riscos, avarias, defeitos no painel, defeitos nos bancos, etc.\n• Em caso de nao apresentacao do veiculo para vistoria, sera aplicada multa de R$ 50,00 por dia de atraso.'],
        [3, 'CLAUSULA 3a - DAS OBRIGACOES DO LOCADOR E LOCATARIO', '3.1 O veiculo sera submetido a manutencoes periodicas, realizadas por profissional expressamente designado pelo LOCADOR.\n3.3 Custos de manutencao por mal uso serao 100% do LOCATARIO.\n• Danos na bomba de combustivel por negligencia: responsabilidade do LOCATARIO.\n• LOCADOR mantera Seguro contratado.\n• IPVA e Seguro: responsabilidade do LOCADOR.\n• Multas de transito: responsabilidade do LOCATARIO, pagamento imediato.\n• LOCATARIO concorda em ser indicado como condutor/infrator (art. 257 CTB).\n• Multas sem cadastro na CDT: pena de R$ 400,00.\n• Reboque por estacionamento irregular: todos custos + R$ 70,00/dia no deposito.\n• Vedado acionar seguro sem permissao: multa R$ 200,00.\n• LOCATARIO responsavel por acessorios do veiculo.\n• Vedado sair do Estado sem autorizacao: multa R$ 300,00.\n• Vedado reparos sem anuencia do LOCADOR.\n• Roubo/furto: avisar LOCADOR e registrar ocorrencia.\n• Sinistro sob alcool: arcar com valor FIPE se seguro negar.'],
        [4, 'CLAUSULA 4a - DAS OBRIGACOES DECORRENTES DE COLISOES E AVARIAS', '• Reboque, taxas e reparos nao cobertos pelo seguro: responsabilidade do LOCATARIO.\n• Franquia do Seguro: integralmente do LOCATARIO.'],
        [5, 'CLAUSULA 5a - DO PAGAMENTO EM RAZAO DA LOCACAO', '• O LOCATARIO pagara ao LOCADOR o valor de {VALOR_SEMANAL} semanalmente, ate as {DIA_PAGAMENTO}-feiras.\n• Atraso: acrescimo de R$ 30,00 por dia.\n• Comprovante deve ser enviado ate 23:59 da {DIA_PAGAMENTO}-feira.'],
        [6, 'CLAUSULA 6a - DA QUANTIA CAUCAO', '• QUANTIA CAUCAO: {VALOR_CAUCAO}, integralizada na retirada do veiculo.\n• Restituicao em 40 dias uteis, conforme condicoes:\n  - Devolucao em perfeito estado\n  - Inexistencia de debitos pendentes\n  - Apos manutencao necessaria\n  - Apos descontar debitos\n• Combustivel por conta do LOCATARIO.\n• Carro devolvido sujo: cobrada lavagem.'],
        [7, 'CLAUSULA 7a - DA VIGENCIA E RESCISAO', '• Vigencia minima: 3 meses.\n• Resilicao: aviso com 15 dias de antecedencia.\n• Rescisao automatica quando:\n  - Carro nao devolvido na data ajustada\n  - Acidente ou dano doloso/culposo\n  - Uso inadequado\n  - Apreensao por autoridades\n  - Debitos nao quitados\n  - Divida de R$ 800,00 nao quitada em 48h: multa R$ 150,00/dia\n• Inexistencia de vinculo trabalhista.'],
        [8, 'CLAUSULA 8a - DO FORO', '• Foro: cidade e Comarca de {CIDADE_COMARCA}.'],
        [9, 'CLAUSULA 9a - DA DEVOLUCAO DO VEICULO', '• Devolucao em 24h apos termino, no local indicado. Multa: R$ 200,00/dia.\n• Nao devolucao configura APROPRIACAO INDEBITA (art. 168 CP).'],
        [10, 'CLAUSULA 10a - DA DISPONIBILIZACAO DE CARRO RESERVA', '• O LOCADOR nao e obrigado a disponibilizar carro reserva.'],
        [11, 'CLAUSULA 11a - DAS NOTIFICACOES', '• Quaisquer notificacoes e comunicacoes devem ser escritas.\n\nE, por estarem assim justas e contratadas, as PARTES firmam o presente instrumento em 02 (duas) vias de igual teor e forma.'],
      ];
      for (const [ordem, titulo, conteudo] of clauses) {
        await pool.query('INSERT INTO contract_clauses (ordem, titulo, conteudo) VALUES ($1, $2, $3)', [ordem, titulo, conteudo]);
      }
      console.log('✅ Cláusulas do contrato seedadas.');
    }

    console.log('✅ Settings e taxas OK.');
  } catch (seedErr) {
    console.error('⚠️ Seed erro:', seedErr.message);
  }

  // 4) Inicia servidor
  app.listen(PORT, () => {
    console.log('🚗 LocaCar API porta ' + PORT + ' | ' + (process.env.NODE_ENV || 'development'));
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
