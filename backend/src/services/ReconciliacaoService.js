// Reconciliação financeira:
//  1. Recalcula valor_final respeitando multa_diferida (tira multa embutida
//     pelo bug antigo)
//  2. Propaga sobrepagamento como credito_anterior negativo na próxima
//     cobrança em aberto
//  3. Se recalculo cobre pagamento, marca cobrança paga
//
// Usada tanto pelo script CLI quanto pelo boot do server (uma vez).

async function runReconciliacao(pool, { driverId = null, apply = true, log = console.log } = {}) {
  const client = await pool.connect();
  const resumo = {
    cobrancas_recalculadas: 0,
    delta_valor_final: 0,
    credito_propagado: 0,
    cobrancas_com_credito: 0,
    motoristas_afetados: 0,
  };
  try {
    const settingQ = await client.query(
      `SELECT valor FROM settings WHERE chave = 'multa_diferida'`
    );
    const multaDiferida = settingQ.rows[0]?.valor === 'true';
    log(`[reconcilia] multa_diferida = ${multaDiferida}, apply = ${apply}`);

    const filtro = driverId ? { where: 'driver_id = $1', params: [driverId] } : { where: '1=1', params: [] };
    const charges = await client.query(
      `SELECT id, driver_id, semana_ref, valor_base, abatimentos, credito_anterior,
              multa, valor_final, valor_pago_total, pago
         FROM weekly_charges
        WHERE ${filtro.where}
        ORDER BY driver_id, semana_ref`,
      filtro.params
    );

    // Passo 1: recalcular valor_final
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

      resumo.cobrancas_recalculadas++;
      resumo.delta_valor_final += delta;

      if (apply) {
        const vPago = parseFloat(c.valor_pago_total || 0);
        const cobreAgora = vPago >= novoFinal - 0.01;
        const marcaPaga = !c.pago && cobreAgora;
        const novoSaldo = Math.max(novoFinal - vPago, 0);
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

    // Passo 2: propagar crédito por motorista
    if (apply) {
      const driverIds = [...new Set(charges.rows.map((c) => c.driver_id))];
      resumo.motoristas_afetados = driverIds.length;

      for (const drvId of driverIds) {
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

        const abertaQ = await client.query(
          `SELECT id, semana_ref, valor_base, credito_anterior, abatimentos, multa, valor_pago_total
             FROM weekly_charges
            WHERE driver_id = $1 AND pago = false
            ORDER BY semana_ref ASC LIMIT 1`,
          [drvId]
        );
        if (abertaQ.rows.length === 0) continue;

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
        resumo.credito_propagado += disponivel;
        resumo.cobrancas_com_credito++;
        log(`[reconcilia] driver ${drvId}: R$ ${disponivel.toFixed(2)} → semana ${a.semana_ref}`);
      }
    }

    log(`[reconcilia] resumo: ${JSON.stringify(resumo)}`);
    return resumo;
  } finally {
    client.release();
  }
}

module.exports = { runReconciliacao };
