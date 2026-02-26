const PDFDocument = require('pdfkit');

/**
 * Gera contrato de locação de veículo em PDF
 * @param {Object} data - Dados do contrato (locador, locatário, veículo, valores)
 * @param {Array} clauses - Cláusulas do contrato [{titulo, conteudo}] vindas do banco
 */
async function gerarContrato(data, clauses) {
  const {
    locador_nome, locador_rg, locador_cpf, locador_endereco, locador_email,
    locatario_nome, locatario_rg, locatario_cpf, locatario_endereco,
    veiculo_marca_modelo, veiculo_cor, veiculo_ano, veiculo_placa, veiculo_renavam,
    valor_semanal, valor_semanal_extenso, dia_pagamento, valor_caucao, valor_caucao_extenso,
    cidade_comarca, data_contrato
  } = data;

  // Mapa de substituição de placeholders
  const replacements = {
    '{VEICULO}': `Veiculo: ${veiculo_marca_modelo}, Cor ${veiculo_cor}, Ano ${veiculo_ano}, Placa ${veiculo_placa}, Renavam ${veiculo_renavam || '___'}`,
    '{VALOR_SEMANAL}': `R$ ${valor_semanal} (${valor_semanal_extenso})`,
    '{VALOR_CAUCAO}': `R$ ${valor_caucao} (${valor_caucao_extenso})`,
    '{DIA_PAGAMENTO}': dia_pagamento || 'quinta',
    '{CIDADE_COMARCA}': cidade_comarca || 'JARAGUA DO SUL - SC',
    '{LOCADOR_NOME}': locador_nome,
    '{LOCATARIO_NOME}': locatario_nome,
  };

  const replaceAll = (text) => {
    let result = text;
    for (const [key, val] of Object.entries(replacements)) {
      result = result.split(key).join(val);
    }
    return result;
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      bufferPages: true,
      info: { Title: 'Contrato de Locacao de Veiculo Automotor', Author: locador_nome }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fs = 10;
    const chk = (n = 80) => { if (doc.y + n > doc.page.height - 60) doc.addPage(); };

    // ======= CABECALHO =======
    doc.font('Helvetica-Bold').fontSize(14).text('CONTRATO DE LOCACAO DE VEICULO AUTOMOTOR', { align: 'center' });
    doc.moveDown(1);

    // ======= PARTES =======
    doc.font('Helvetica-Bold').fontSize(fs).text(locador_nome, { continued: true, align: 'justify', lineGap: 2 });
    doc.font('Helvetica').text(', com documento de identidade no ' + locador_rg + ', inscrito no CPF no ' + locador_cpf + ', residente e domiciliado em ' + locador_endereco + ', e-mail ' + locador_email + ', ', { continued: true });
    doc.font('Helvetica-Bold').text('ora denominado LOCADOR', { continued: true });
    doc.font('Helvetica').text(' e ', { continued: true });
    doc.font('Helvetica-Bold').text(locatario_nome, { continued: true });
    doc.font('Helvetica').text(', com documento de identidade no ' + (locatario_rg || '_______________') + ', inscrito no CPF no ' + locatario_cpf + ', residente e domiciliado em ' + (locatario_endereco || '_______________________________________________') + ', ', { continued: true });
    doc.font('Helvetica-Bold').text('ora denominado LOCATARIO', { continued: true });
    doc.font('Helvetica').text(', vem, atraves do presente instrumento, celebrar CONTRATO DE LOCACAO DE VEICULO AUTOMOTOR, que sera regido pelas clausulas e condicoes abaixo dispostas.');
    doc.moveDown(0.5);

    // ======= CLAUSULAS DINAMICAS =======
    for (const clause of clauses) {
      chk(100);
      // Título
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).text(clause.titulo, { align: 'justify' });
      doc.moveDown(0.3);

      // Conteúdo — substituir placeholders e renderizar
      const content = replaceAll(clause.conteudo);
      const lines = content.split('\n');

      for (const line of lines) {
        chk(20);
        const trimmed = line.trim();
        if (!trimmed) { doc.moveDown(0.2); continue; }

        if (trimmed.startsWith('•')) {
          doc.font('Helvetica').fontSize(fs).text(trimmed, { align: 'justify', lineGap: 2, indent: 10 });
        } else if (trimmed.startsWith('-') || trimmed.startsWith('  -')) {
          doc.font('Helvetica').fontSize(fs).text('  ' + trimmed, { align: 'justify', lineGap: 2, indent: 20 });
        } else {
          doc.font('Helvetica').fontSize(fs).text(trimmed, { align: 'justify', lineGap: 2 });
        }
        doc.moveDown(0.15);
      }
    }

    // ======= ASSINATURA =======
    chk(120);
    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(fs).text((cidade_comarca || 'Jaragua do Sul') + ', ' + data_contrato + '.');

    doc.moveDown(2);
    doc.text('________________________________________');
    doc.font('Helvetica').text('LOCADOR - ', { continued: true });
    doc.font('Helvetica-Bold').text(locador_nome);

    doc.moveDown(1.5);
    doc.font('Helvetica').text('________________________________________');
    doc.font('Helvetica').text('LOCATARIO - ', { continued: true });
    doc.font('Helvetica-Bold').text(locatario_nome);

    doc.end();
  });
}

module.exports = { gerarContrato };
