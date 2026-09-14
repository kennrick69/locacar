// Cleanup retroativo das observações de crédito antecipado com Date.toString() cru.
//
// Bug: ReconciliacaoService.js:202 antes do fix concatenava `origem.semana_ref` direto
// no template string, gerando "Crédito da semana Sat Aug 29 2026 00:00:00 GMT+0000
// (Coordinated Universal Time) (pagamento antecipado)" na coluna
// payment_entries.observacoes.
//
// Este script normaliza cada uma dessas observações pra "Crédito da semana DD/MM/AAAA
// (pagamento antecipado)".
//
// Uso:
//   node backend/scripts/fix-observacoes-credito-formato.js           (dry-run)
//   node backend/scripts/fix-observacoes-credito-formato.js --apply   (aplica)
//
// Railway:
//   railway run node backend/scripts/fix-observacoes-credito-formato.js --apply

require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../src/config/database');

const APPLY = process.argv.includes('--apply');

const MESES_EN = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function normalizar(obs) {
  // Padrão: "Crédito da semana Sat Aug 29 2026 00:00:00 GMT+0000 (Coordinated Universal Time) (pagamento antecipado)"
  const re = /^Crédito da semana [A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) (\d{4}) \d{2}:\d{2}:\d{2} GMT\+0000 \(Coordinated Universal Time\) \(pagamento antecipado\)$/;
  const m = obs.match(re);
  if (!m) return null;
  const [, mesEn, dia, ano] = m;
  const mes = MESES_EN[mesEn];
  if (!mes) return null;
  const dd = String(dia).padStart(2, '0');
  const mm = String(mes).padStart(2, '0');
  return `Crédito da semana ${dd}/${mm}/${ano} (pagamento antecipado)`;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n${APPLY ? '[APLICANDO]' : '[DRY-RUN]'} cleanup de observações de crédito antecipado\n`);

    const rows = await client.query(
      `SELECT id, observacoes
         FROM payment_entries
        WHERE observacoes LIKE 'Crédito da semana%GMT+0000%'
        ORDER BY id`
    );

    if (rows.rows.length === 0) {
      console.log('Nenhum registro com formato antigo. Nada a corrigir.');
      return;
    }

    console.log(`Registros afetados: ${rows.rows.length}\n`);
    let aplicados = 0;
    let semParse = 0;

    for (const r of rows.rows) {
      const nova = normalizar(r.observacoes);
      if (!nova) {
        console.log(`  [id=${r.id}] regex não bateu — skip`);
        console.log(`    ${r.observacoes}`);
        semParse++;
        continue;
      }
      console.log(`  [id=${r.id}]`);
      console.log(`    antes:  ${r.observacoes}`);
      console.log(`    depois: ${nova}`);

      if (APPLY) {
        await client.query(
          `UPDATE payment_entries SET observacoes = $1 WHERE id = $2`,
          [nova, r.id]
        );
        aplicados++;
      }
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Total encontrados: ${rows.rows.length}`);
    console.log(`Sem parse: ${semParse}`);
    if (APPLY) {
      console.log(`Corrigidos: ${aplicados}`);
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
