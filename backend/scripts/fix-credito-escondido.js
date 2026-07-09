// Correção retroativa do bug de crédito escondido em abatimentos.
//
// Bug: aprovação de abatimento em cobrança já paga só recalculava valor_final,
// deixando valor_pago_total > valor_final sem propagar como crédito na próxima
// semana. Motorista pagava a mais e o sistema esquecia.
//
// Este script:
//  1. Detecta todo motorista com sobrepagamento em cobrança paga
//  2. Aplica o crédito acumulado como credito_anterior negativo na cobrança
//     em aberto mais antiga (se houver)
//  3. Se cobrança em aberto virou totalmente coberta, marca como paga
//  4. Reporta cada correção
//
// Uso:
//   node backend/scripts/fix-credito-escondido.js           (dry-run, só mostra)
//   node backend/scripts/fix-credito-escondido.js --apply   (aplica de verdade)
//
// Uso Railway:
//   railway run node backend/scripts/fix-credito-escondido.js --apply

require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../src/config/database');

const APPLY = process.argv.includes('--apply');

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n${APPLY ? '[APLICANDO]' : '[DRY-RUN]'} correção de crédito escondido\n`);

    const drivers = await client.query(`
      SELECT dp.id, u.nome, u.email
        FROM driver_profiles dp
        JOIN users u ON u.id = dp.user_id
       WHERE EXISTS (
         SELECT 1 FROM weekly_charges w
          WHERE w.driver_id = dp.id AND w.pago = true
            AND w.valor_pago_total > w.valor_final + 0.01
       )
       ORDER BY u.nome
    `);

    if (drivers.rows.length === 0) {
      console.log('Nenhum motorista com crédito escondido. Nada a corrigir.');
      return;
    }

    console.log(`Motoristas afetados: ${drivers.rows.length}\n`);
    let totalCreditosAplicados = 0;
    let totalCobrancasFechadas = 0;

    for (const d of drivers.rows) {
      const creditoQ = await client.query(
        `SELECT COALESCE(SUM(valor_pago_total - valor_final), 0) AS total
           FROM weekly_charges
          WHERE driver_id = $1 AND pago = true
            AND valor_pago_total > valor_final + 0.01`,
        [d.id]
      );
      const jaAplQ = await client.query(
        `SELECT COALESCE(SUM(-credito_anterior), 0) AS ja
           FROM weekly_charges
          WHERE driver_id = $1 AND credito_anterior < 0`,
        [d.id]
      );
      const disponivel =
        parseFloat(creditoQ.rows[0].total) - parseFloat(jaAplQ.rows[0].ja);

      if (disponivel <= 0.01) {
        console.log(`  [${d.email}] crédito já consumido anteriormente — skip`);
        continue;
      }

      console.log(`\n=== ${d.nome} (${d.email}) ===`);
      console.log(`  Crédito escondido disponível: R$ ${disponivel.toFixed(2)}`);

      const abertaQ = await client.query(
        `SELECT id, semana_ref, valor_base, credito_anterior, abatimentos, multa,
                valor_final, valor_pago_total
           FROM weekly_charges
          WHERE driver_id = $1 AND pago = false
          ORDER BY semana_ref ASC LIMIT 1`,
        [d.id]
      );

      if (abertaQ.rows.length === 0) {
        console.log(
          `  Sem cobrança em aberto — crédito permanece no sobrepagamento das ` +
          `cobranças pagas até próxima geração de semana.`
        );
        continue;
      }

      const a = abertaQ.rows[0];
      const novoCredAnt = parseFloat(a.credito_anterior) - disponivel;
      const novoFinal = Math.max(
        parseFloat(a.valor_base) - parseFloat(a.abatimentos) +
          novoCredAnt + parseFloat(a.multa),
        0
      );
      const jaPago = parseFloat(a.valor_pago_total || 0);
      const fechaAgora = jaPago >= novoFinal - 0.01;
      const saldoDev = Math.max(novoFinal - jaPago, 0);

      console.log(
        `  Aplicando em semana ${a.semana_ref}:`
      );
      console.log(
        `    valor_final: ${parseFloat(a.valor_final).toFixed(2)} → ${novoFinal.toFixed(2)}`
      );
      console.log(
        `    credito_anterior: ${parseFloat(a.credito_anterior).toFixed(2)} → ${novoCredAnt.toFixed(2)}`
      );
      if (fechaAgora) {
        console.log(`    → cobrança PASSA A PAGA (pagamento já cobria)`);
      } else {
        console.log(`    saldo_devedor: → ${saldoDev.toFixed(2)}`);
      }

      if (APPLY) {
        if (fechaAgora) {
          await client.query(
            `UPDATE weekly_charges
                SET credito_anterior = $1, valor_final = $2,
                    pago = true, saldo_devedor = $3,
                    data_pagamento = NOW(), updated_at = NOW()
              WHERE id = $4`,
            [novoCredAnt, novoFinal, saldoDev, a.id]
          );
          totalCobrancasFechadas++;
        } else {
          await client.query(
            `UPDATE weekly_charges
                SET credito_anterior = $1, valor_final = $2,
                    saldo_devedor = $3, updated_at = NOW()
              WHERE id = $4`,
            [novoCredAnt, novoFinal, saldoDev, a.id]
          );
        }
        totalCreditosAplicados += disponivel;
      }
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Motoristas verificados: ${drivers.rows.length}`);
    if (APPLY) {
      console.log(`Total creditado: R$ ${totalCreditosAplicados.toFixed(2)}`);
      console.log(`Cobranças fechadas automaticamente: ${totalCobrancasFechadas}`);
    } else {
      console.log(`\nNada foi aplicado. Rode novamente com --apply para persistir.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
