// Audita crédito escondido de um motorista específico
// (bug: aprovação de abatimento não gera crédito quando cobrança já foi paga).
//
// Uso local:
//   node backend/scripts/audit-driver-credits.js gabriel.h.gomes9@gmail.com
//
// Uso Railway:
//   railway run node backend/scripts/audit-driver-credits.js gabriel.h.gomes9@gmail.com

require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../src/config/database');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Uso: node audit-driver-credits.js <email>');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const driver = await client.query(
      `SELECT id, nome, email FROM driver_profiles WHERE email = $1`,
      [email]
    );
    if (driver.rows.length === 0) {
      console.error(`Motorista não encontrado: ${email}`);
      process.exit(1);
    }
    const d = driver.rows[0];
    console.log(`\n=== MOTORISTA ===`);
    console.log(`ID:    ${d.id}`);
    console.log(`Nome:  ${d.nome}`);
    console.log(`Email: ${d.email}`);

    const openCharges = await client.query(
      `SELECT id, semana_ref, valor_base, abatimentos, credito_anterior, multa,
              valor_final, valor_pago_total,
              (valor_final - COALESCE(valor_pago_total, 0)) AS falta
         FROM weekly_charges
        WHERE driver_id = $1 AND pago = false
        ORDER BY semana_ref ASC`,
      [d.id]
    );
    console.log(`\n=== COBRANÇAS ABERTAS (${openCharges.rows.length}) ===`);
    let somaAbertoFinal = 0, somaAbertoPago = 0;
    for (const c of openCharges.rows) {
      console.log(
        `${c.semana_ref} | base=${fmt(c.valor_base)} abat=${fmt(c.abatimentos)} ` +
        `credAnt=${fmt(c.credito_anterior)} multa=${fmt(c.multa)} | ` +
        `final=${fmt(c.valor_final)} pago=${fmt(c.valor_pago_total)} → FALTA ${fmt(c.falta)}`
      );
      somaAbertoFinal += Number(c.valor_final);
      somaAbertoPago += Number(c.valor_pago_total || 0);
    }
    console.log(
      `TOTAL EM ABERTO: final=${fmt(somaAbertoFinal)} pago=${fmt(somaAbertoPago)} falta=${fmt(somaAbertoFinal - somaAbertoPago)}`
    );

    const overpaid = await client.query(
      `SELECT id, semana_ref, valor_base, abatimentos, credito_anterior, multa,
              valor_final, valor_pago_total,
              (valor_pago_total - valor_final) AS credito_gerado
         FROM weekly_charges
        WHERE driver_id = $1 AND pago = true
          AND valor_pago_total > valor_final + 0.01
        ORDER BY semana_ref ASC`,
      [d.id]
    );
    console.log(`\n=== COBRANÇAS PAGAS COM SOBREPAGAMENTO (crédito escondido) ===`);
    let somaCredito = 0;
    if (overpaid.rows.length === 0) {
      console.log(`Nenhuma. Motorista não tem crédito escondido em cobranças quitadas.`);
    } else {
      for (const c of overpaid.rows) {
        console.log(
          `${c.semana_ref} | final=${fmt(c.valor_final)} pago=${fmt(c.valor_pago_total)} ` +
          `→ CRÉDITO GERADO ${fmt(c.credito_gerado)}`
        );
        somaCredito += Number(c.credito_gerado);
      }
      console.log(`TOTAL CRÉDITO ESCONDIDO: R$ ${fmt(somaCredito)}`);
    }

    const abats = await client.query(
      `SELECT a.id, a.charge_id, a.descricao, a.valor, a.aprovado, a.created_at,
              w.semana_ref AS semana, w.pago AS semana_paga
         FROM abatimentos a
    LEFT JOIN weekly_charges w ON w.id = a.charge_id
        WHERE a.driver_id = $1
        ORDER BY a.created_at DESC
        LIMIT 20`,
      [d.id]
    );
    console.log(`\n=== ABATIMENTOS DO MOTORISTA (últimos 20) ===`);
    for (const a of abats.rows) {
      const flag = a.aprovado ? '[APROV]' : '[PEND ]';
      const pgFlag = a.semana_paga ? '(semana já paga)' : '(semana em aberto)';
      console.log(
        `${flag} ${a.created_at.toISOString().slice(0,10)} | semana=${a.semana} ` +
        `${pgFlag} | R$ ${fmt(a.valor)} | ${a.descricao}`
      );
    }

    console.log(`\n=== DIAGNÓSTICO ===`);
    const balanceQuery = await client.query(
      `SELECT SUM(CASE WHEN pago = false
                        THEN GREATEST(valor_final - COALESCE(valor_pago_total, 0), 0)
                        ELSE 0 END) AS saldo_devedor_visivel
         FROM weekly_charges WHERE driver_id = $1`,
      [d.id]
    );
    const saldoVisivel = Number(balanceQuery.rows[0].saldo_devedor_visivel || 0);
    console.log(`Sistema mostra HOJE: dívida de R$ ${fmt(saldoVisivel)}`);
    console.log(`Crédito escondido:   R$ ${fmt(somaCredito)}`);
    console.log(`Dívida REAL:         R$ ${fmt(saldoVisivel - somaCredito)}`);
    if (somaCredito > 0.01) {
      const nextOpen = openCharges.rows[0];
      if (nextOpen) {
        console.log(`\n=== FIX MANUAL SUGERIDO ===`);
        console.log(`-- Aplicar o crédito de R$ ${fmt(somaCredito)} na cobrança aberta mais antiga (${nextOpen.semana_ref})`);
        const novoCredAnt = Number(nextOpen.credito_anterior) - somaCredito;
        const novoFinal = Math.max(
          Number(nextOpen.valor_base) - Number(nextOpen.abatimentos) +
          novoCredAnt + Number(nextOpen.multa), 0
        );
        console.log(
          `UPDATE weekly_charges SET credito_anterior = ${novoCredAnt}, ` +
          `valor_final = ${novoFinal}, updated_at = NOW() WHERE id = ${nextOpen.id};`
        );
      } else {
        console.log(`Sem cobrança em aberto pra aplicar. Precisa esperar próxima semana OU pagar em dinheiro pro motorista.`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

main().catch(e => { console.error(e); process.exit(1); });
