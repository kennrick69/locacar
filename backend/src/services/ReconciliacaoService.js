// Reconciliação financeira — modelo v2 (2026-07-09)
//
// Regras:
//  1. valor_final = valor_base − abatimentos + acrescimos + multa_efetiva + juros_efetivo
//     onde multa_efetiva = 0 se multa_diferida=true (só cobra na rescisão)
//     e   juros_efetivo  = 0 se juros_diferido=true (idem)
//  2. Sobrepagamento (valor_pago_total > valor_final numa cobrança paga)
//     vira PAYMENT_ENTRY na próxima cobrança em aberto — não reduz valor_final
//     da próxima (ela mantém o valor cheio, mas com "pago R$ X" adiantado)
//  3. Idempotência: payment_entries.origem_charge_id aponta pra cobrança de
//     origem; ao rodar de novo, não duplica
//  4. Reverte credito_anterior negativo pré-existente pro novo modelo:
//     zera credito_anterior, recalcula valor_final (volta ao cheio), e o
//     valor liberado é redistribuído via payment_entries.

async function runReconciliacao(pool, { driverId = null, apply = true, log = console.log } = {}) {
  const client = await pool.connect();
  const resumo = {
    cobrancas_recalculadas: 0,
    credito_convertido_em_pagamento: 0,
    payment_entries_criadas: 0,
    motoristas_afetados: 0,
  };
  try {
    // Settings
    const settingsQ = await client.query(
      `SELECT chave, valor FROM settings WHERE chave IN ('multa_diferida', 'juros_diferido')`
    );
    const settings = {};
    settingsQ.rows.forEach((r) => { settings[r.chave] = r.valor; });
    const multaDiferida = settings.multa_diferida === 'true';
    const jurosDiferido = settings.juros_diferido === 'true';
    log(`[reconcilia] multa_diferida=${multaDiferida} juros_diferido=${jurosDiferido} apply=${apply}`);

    const filtro = driverId
      ? { where: 'driver_id = $1', params: [driverId] }
      : { where: '1=1', params: [] };

    const drivers = await client.query(
      `SELECT DISTINCT driver_id FROM weekly_charges WHERE ${filtro.where} ORDER BY driver_id`,
      filtro.params
    );
    resumo.motoristas_afetados = drivers.rows.length;

    for (const drv of drivers.rows) {
      const drvId = drv.driver_id;

      // Cobranças do motorista em ordem cronológica
      const chargesQ = await client.query(
        `SELECT id, semana_ref, valor_base, abatimentos, credito_anterior, multa,
                COALESCE(juros_acumulados, 0) AS juros_acumulados, pago, data_pagamento,
                (SELECT COALESCE(SUM(valor), 0) FROM acrescimos WHERE charge_id = weekly_charges.id) AS acrescimos_total
           FROM weekly_charges
          WHERE driver_id = $1
          ORDER BY semana_ref ASC`,
        [drvId]
      );

      for (const c of chargesQ.rows) {
        // Se tem credito_anterior negativo, vamos convertê-lo em payment_entry
        const credAnt = parseFloat(c.credito_anterior || 0);
        const multaEf = multaDiferida ? 0 : parseFloat(c.multa || 0);
        const jurosEf = jurosDiferido ? 0 : parseFloat(c.juros_acumulados || 0);
        const acresc = parseFloat(c.acrescimos_total || 0);

        const novoFinal = Math.max(
          parseFloat(c.valor_base) - parseFloat(c.abatimentos) + acresc + multaEf + jurosEf,
          0
        );

        // Ler soma real de pagamentos
        const pagosQ = await client.query(
          `SELECT COALESCE(SUM(valor_pago), 0) AS total
             FROM payment_entries WHERE charge_id = $1`,
          [c.id]
        );
        const pagosMPQ = await client.query(
          `SELECT COALESCE(SUM(valor), 0) AS total
             FROM payments WHERE charge_id = $1 AND status = 'pago'`,
          [c.id]
        );
        const totalPago =
          parseFloat(pagosQ.rows[0].total) + parseFloat(pagosMPQ.rows[0].total);
        const novoSaldo = Math.max(novoFinal - totalPago, 0);
        const pago = totalPago >= novoFinal - 0.01;

        // Se tinha credito_anterior negativo, agora ele será tratado como
        // "pagamento adiantado" via payment_entry mais adiante — aqui zeramos
        const zeraCred = credAnt < 0;

        if (apply) {
          await client.query(
            `UPDATE weekly_charges
                SET valor_final = $1,
                    valor_pago_total = $2,
                    saldo_devedor = $3,
                    pago = $4,
                    credito_anterior = $5,
                    data_pagamento = CASE
                      WHEN $4 = true AND data_pagamento IS NULL THEN NOW()
                      WHEN $4 = false THEN NULL
                      ELSE data_pagamento
                    END,
                    updated_at = NOW()
              WHERE id = $6`,
            [
              novoFinal,
              totalPago,
              novoSaldo,
              pago,
              zeraCred ? 0 : credAnt,
              c.id,
            ]
          );
          resumo.cobrancas_recalculadas++;
          if (zeraCred) resumo.credito_convertido_em_pagamento += Math.abs(credAnt);
        }
      }

      // Segunda passada: sobrepagamento em pagas vira payment_entry na próxima
      const pagasSobrepagoQ = await client.query(
        `SELECT id, semana_ref, valor_final, valor_pago_total,
                (valor_pago_total - valor_final) AS excedente
           FROM weekly_charges
          WHERE driver_id = $1
            AND pago = true
            AND valor_pago_total > valor_final + 0.01
          ORDER BY semana_ref ASC`,
        [drvId]
      );

      for (const origem of pagasSobrepagoQ.rows) {
        // Próxima cobrança em aberto após esta
        const proxQ = await client.query(
          `SELECT id, valor_base, abatimentos, credito_anterior, multa,
                  COALESCE(juros_acumulados, 0) AS juros_acumulados,
                  valor_final, valor_pago_total, data_pagamento,
                  (SELECT COALESCE(SUM(valor), 0) FROM acrescimos WHERE charge_id = weekly_charges.id) AS acrescimos_total
             FROM weekly_charges
            WHERE driver_id = $1 AND pago = false AND semana_ref > $2
            ORDER BY semana_ref ASC LIMIT 1`,
          [drvId, origem.semana_ref]
        );
        if (proxQ.rows.length === 0) continue;
        const p = proxQ.rows[0];

        // Verifica idempotência
        const jaExisteQ = await client.query(
          `SELECT id, valor_pago FROM payment_entries
            WHERE charge_id = $1 AND origem_charge_id = $2`,
          [p.id, origem.id]
        );

        const excedente = parseFloat(origem.excedente);

        if (apply) {
          if (jaExisteQ.rows.length === 0) {
            // Cria payment_entry novo
            await client.query(
              `INSERT INTO payment_entries (driver_id, charge_id, valor_pago, data_pagamento, observacoes, origem_charge_id)
               VALUES ($1, $2, $3, NOW(), $4, $5)`,
              [
                drvId,
                p.id,
                excedente,
                `Crédito da semana ${origem.semana_ref} (pagamento antecipado)`,
                origem.id,
              ]
            );
            resumo.payment_entries_criadas++;
          } else if (Math.abs(parseFloat(jaExisteQ.rows[0].valor_pago) - excedente) > 0.01) {
            // Já existe mas com valor diferente — atualiza (não duplica)
            await client.query(
              `UPDATE payment_entries SET valor_pago = $1, data_pagamento = NOW() WHERE id = $2`,
              [excedente, jaExisteQ.rows[0].id]
            );
          }

          // Recalcula valor_pago_total da próxima cobrança
          const pagosQ = await client.query(
            `SELECT COALESCE(SUM(valor_pago), 0) AS total FROM payment_entries WHERE charge_id = $1`,
            [p.id]
          );
          const pagosMPQ = await client.query(
            `SELECT COALESCE(SUM(valor), 0) AS total FROM payments WHERE charge_id = $1 AND status = 'pago'`,
            [p.id]
          );
          const totalPagoP =
            parseFloat(pagosQ.rows[0].total) + parseFloat(pagosMPQ.rows[0].total);
          const multaEfP = multaDiferida ? 0 : parseFloat(p.multa || 0);
          const jurosEfP = jurosDiferido ? 0 : parseFloat(p.juros_acumulados || 0);
          const acrescP = parseFloat(p.acrescimos_total || 0);
          const novoFinalP = Math.max(
            parseFloat(p.valor_base) - parseFloat(p.abatimentos) + acrescP + multaEfP + jurosEfP,
            0
          );
          const novoSaldoP = Math.max(novoFinalP - totalPagoP, 0);
          const pagoP = totalPagoP >= novoFinalP - 0.01;
          await client.query(
            `UPDATE weekly_charges
                SET valor_final = $1,
                    valor_pago_total = $2,
                    saldo_devedor = $3,
                    pago = $4,
                    data_pagamento = CASE
                      WHEN $4 = true AND data_pagamento IS NULL THEN NOW()
                      WHEN $4 = false THEN NULL
                      ELSE data_pagamento
                    END,
                    updated_at = NOW()
              WHERE id = $5`,
            [novoFinalP, totalPagoP, novoSaldoP, pagoP, p.id]
          );
        }
      }
    }

    log(`[reconcilia] resumo: ${JSON.stringify(resumo)}`);
    return resumo;
  } finally {
    client.release();
  }
}

module.exports = { runReconciliacao };
