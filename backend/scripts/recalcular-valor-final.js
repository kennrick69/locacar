// Recalcula weekly_charges.valor_final respeitando o setting multa_diferida.
//
// Motivo: bug do fix anterior (aprovação de abatimento) somava multa no
// valor_final mesmo quando multa_diferida='true'. Este script percorre TODAS
// as cobranças e recalcula do zero:
//
//   valor_final = MAX(valor_base - abatimentos + credito_anterior + multa_efetiva, 0)
//
// onde multa_efetiva = 0 se multa_diferida='true', senão = multa.
//
// Se cobrança fechada com pagamento >= novo valor_final, mantém paga (e a diferença
// vira sobrepagamento pro fluxo normal de crédito). Se estava marcada paga mas o
// novo valor_final ficou acima do pagamento, o script mantém pago=true (não reabre —
// se JOs quiser reabrir, faz manual).
//
// Uso:
//   node backend/scripts/recalcular-valor-final.js           (dry-run)
//   node backend/scripts/recalcular-valor-final.js --apply   (aplica)
//
//   node backend/scripts/recalcular-valor-final.js --driver <id>          (só um)
//   node backend/scripts/recalcular-valor-final.js --driver <id> --apply

require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const driverArgIdx = process.argv.indexOf('--driver');
const DRIVER_FILTER = driverArgIdx > -1 ? process.argv[driverArgIdx + 1] : null;

async function main() {
  const client = await pool.connect();
  try {
    const settingQ = await client.query(
      `SELECT valor FROM settings WHERE chave = 'multa_diferida'`
    );
    const multaDiferida = settingQ.rows[0]?.valor === 'true';

    console.log(`\n${APPLY ? '[APLICANDO]' : '[DRY-RUN]'} recalc valor_final`);
    console.log(`  multa_diferida = ${multaDiferida}\n`);

    const filtro = DRIVER_FILTER
      ? { where: 'driver_id = $1', params: [DRIVER_FILTER] }
      : { where: '1=1', params: [] };

    const charges = await client.query(
      `SELECT id, driver_id, semana_ref, valor_base, abatimentos, credito_anterior,
              multa, valor_final, valor_pago_total, pago
         FROM weekly_charges
        WHERE ${filtro.where}
        ORDER BY driver_id, semana_ref`,
      filtro.params
    );

    let alteradas = 0;
    let totalAntes = 0;
    let totalDepois = 0;

    for (const c of charges.rows) {
      const multaEfetiva = multaDiferida ? 0 : parseFloat(c.multa);
      const novoFinal = Math.max(
        parseFloat(c.valor_base) - parseFloat(c.abatimentos) +
          parseFloat(c.credito_anterior) + multaEfetiva,
        0
      );
      const finalAtual = parseFloat(c.valor_final);
      const delta = novoFinal - finalAtual;

      if (Math.abs(delta) < 0.01) continue;

      alteradas++;
      totalAntes += finalAtual;
      totalDepois += novoFinal;

      console.log(
        `driver ${c.driver_id} · ${c.semana_ref} · base ${fmt(c.valor_base)} ` +
        `- abat ${fmt(c.abatimentos)} + credAnt ${fmt(c.credito_anterior)} ` +
        `+ multa(ef) ${fmt(multaEfetiva)}  →  ${fmt(finalAtual)} → ${fmt(novoFinal)} ` +
        `(Δ ${fmt(delta)})${c.pago ? ' [PAGA]' : ''}`
      );

      if (APPLY) {
        const vPago = parseFloat(c.valor_pago_total || 0);
        const jaEstavaPaga = c.pago;
        const cobreAgora = vPago >= novoFinal - 0.01;
        const novoSaldo = Math.max(novoFinal - vPago, 0);
        // Se a cobrança agora ficou totalmente coberta pelo pagamento, marca paga.
        const marcaPaga = !jaEstavaPaga && cobreAgora;
        await client.query(
          `UPDATE weekly_charges
              SET valor_final = $1,
                  saldo_devedor = $2,
                  pago = CASE WHEN $3 THEN true ELSE pago END,
                  data_pagamento = CASE WHEN $3 THEN NOW() ELSE data_pagamento END,
                  updated_at = NOW()
            WHERE id = $4`,
          [novoFinal, novoSaldo, marcaPaga, c.id]
        );
      }
    }

    // ===================================================================
    // Passo 2 — propagar crédito (sobrepagamento) por motorista afetado
    // ===================================================================
    if (APPLY) {
      console.log(`\n=== PROPAGANDO CRÉDITO ===`);
      const driverIds = [...new Set(charges.rows.map((c) => c.driver_id))];
      let creditoAplicado = 0;
      let cobrancasAtualizadas = 0;

      for (const drvId of driverIds) {
        // Crédito disponível = sobrepagamento em pagas MENOS já propagado
        const totalQ = await client.query(
          `SELECT COALESCE(SUM(valor_pago_total - valor_final), 0) AS total
             FROM weekly_charges
            WHERE driver_id = $1 AND pago = true
              AND valor_pago_total > valor_final + 0.01`,
          [drvId]
        );
        const jaQ = await client.query(
          `SELECT COALESCE(SUM(-credito_anterior), 0) AS ja
             FROM weekly_charges
            WHERE driver_id = $1 AND credito_anterior < 0`,
          [drvId]
        );
        const disponivel = parseFloat(totalQ.rows[0].total) - parseFloat(jaQ.rows[0].ja);
        if (disponivel <= 0.01) continue;

        // Próxima cobrança em aberto
        const abertaQ = await client.query(
          `SELECT id, semana_ref, valor_base, credito_anterior, abatimentos, multa, valor_pago_total
             FROM weekly_charges
            WHERE driver_id = $1 AND pago = false
            ORDER BY semana_ref ASC LIMIT 1`,
          [drvId]
        );
        if (abertaQ.rows.length === 0) {
          console.log(`  driver ${drvId}: R$ ${fmt(disponivel)} disponível mas sem cobrança em aberto`);
          continue;
        }
        const a = abertaQ.rows[0];
        const novoCredAnt = parseFloat(a.credito_anterior) - disponivel;
        const multaEfetivaProx = multaDiferida ? 0 : parseFloat(a.multa);
        const novoFinalProx = Math.max(
          parseFloat(a.valor_base) - parseFloat(a.abatimentos) +
            novoCredAnt + multaEfetivaProx,
          0
        );
        const vPagoProx = parseFloat(a.valor_pago_total || 0);
        const cobreAgora = vPagoProx >= novoFinalProx - 0.01;
        const novoSaldoProx = Math.max(novoFinalProx - vPagoProx, 0);
        await client.query(
          `UPDATE weekly_charges
              SET credito_anterior = $1,
                  valor_final = $2,
                  saldo_devedor = $3,
                  pago = CASE WHEN $4 THEN true ELSE pago END,
                  data_pagamento = CASE WHEN $4 THEN NOW() ELSE data_pagamento END,
                  updated_at = NOW()
            WHERE id = $5`,
          [novoCredAnt, novoFinalProx, novoSaldoProx, cobreAgora, a.id]
        );
        console.log(
          `  driver ${drvId} · aplicou R$ ${fmt(disponivel)} na semana ${a.semana_ref} ` +
          `(cobrança ${cobreAgora ? 'passou a paga' : 'ainda em aberto'})`
        );
        creditoAplicado += disponivel;
        cobrancasAtualizadas++;
      }
      console.log(`Total crédito propagado: R$ ${fmt(creditoAplicado)} em ${cobrancasAtualizadas} cobrança(s)`);
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Cobranças alteradas: ${alteradas}`);
    console.log(`Total antes:  R$ ${fmt(totalAntes)}`);
    console.log(`Total depois: R$ ${fmt(totalDepois)}`);
    console.log(`Delta:        R$ ${fmt(totalDepois - totalAntes)}`);
    if (!APPLY) console.log(`\nNada foi aplicado. Rode com --apply para persistir.`);
  } finally {
    client.release();
    await pool.end();
  }
}

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

main().catch(e => { console.error(e); process.exit(1); });
