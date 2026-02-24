/**
 * LOCACAR - Seed de dados iniciais
 * Executa: npm run seed
 */
const pool = require('./database');
const bcrypt = require('bcryptjs');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Admin padrão
    const senhaHash = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (nome, email, senha_hash, cpf, role)
      VALUES ('Administrador', 'admin@locacar.com', $1, '00000000000', 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [senhaHash]);

    // Configurações padrão
    const configs = [
      ['dia_vencimento', '1', 'Dia da semana para vencimento (0=dom, 1=seg ... 6=sab)'],
      ['multa_tipo', 'percentual', 'Tipo de multa: percentual ou fixo'],
      ['multa_valor', '2', 'Valor da multa (% ou R$ por dia)'],
      ['multa_carencia_dias', '3', 'Dias de carência antes de aplicar multa'],
      ['multa_diferida', 'true', 'Se true, multa só cobrada no acerto final'],
      ['evento_cadastro_externo', 'caucao_pago', 'Evento que dispara cadastro na plataforma externa'],
      ['mp_webhook_url', '', 'URL do webhook Mercado Pago'],
    ];

    for (const [chave, valor, descricao] of configs) {
      await client.query(`
        INSERT INTO settings (chave, valor, descricao)
        VALUES ($1, $2, $3)
        ON CONFLICT (chave) DO NOTHING;
      `, [chave, valor, descricao]);
    }

    // Taxas de parcelas padrão (juros embutidos no pagador)
    const taxas = [
      [1, 0], [2, 5.49], [3, 7.49], [4, 9.49], [5, 11.49], [6, 13.49],
      [7, 15.49], [8, 17.49], [9, 19.49], [10, 21.49], [11, 23.49], [12, 25.49],
    ];

    for (const [parcelas, taxa] of taxas) {
      await client.query(`
        INSERT INTO installment_fees (parcelas, taxa_percentual)
        VALUES ($1, $2)
        ON CONFLICT (parcelas) DO NOTHING;
      `, [parcelas, taxa]);
    }

    // Carros de exemplo
    const carros = [
      ['Fiat', 'Mobi', 2022, 'ABC-1234', 'Branco', 650.00, 2000.00],
      ['Chevrolet', 'Onix', 2023, 'DEF-5678', 'Prata', 750.00, 2500.00],
      ['Volkswagen', 'Gol', 2021, 'GHI-9012', 'Preto', 600.00, 1800.00],
    ];

    for (const [marca, modelo, ano, placa, cor, semanal, caucao] of carros) {
      await client.query(`
        INSERT INTO cars (marca, modelo, ano, placa, cor, valor_semanal, valor_caucao)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (placa) DO NOTHING;
      `, [marca, modelo, ano, placa, cor, semanal, caucao]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed concluído! Admin: admin@locacar.com / admin123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro no seed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
