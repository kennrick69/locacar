const PDFDocument = require('pdfkit');

/**
 * Gera contrato de locação de veículo em PDF
 * Formatação próxima ao DOCX original (~12-13 páginas)
 */
async function gerarContrato(data, clauses) {
  const {
    locador_nome, locador_rg, locador_cpf, locador_endereco, locador_email,
    locatario_nome, locatario_rg, locatario_cpf, locatario_endereco,
    veiculo_marca_modelo, veiculo_cor, veiculo_ano, veiculo_placa, veiculo_renavam,
    valor_semanal, valor_semanal_extenso, dia_pagamento, valor_caucao, valor_caucao_extenso,
    cidade_comarca, data_contrato
  } = data;

  const replacements = {
    '{VEICULO}': `Veículo de marca ${veiculo_marca_modelo}, Cor ${veiculo_cor}, Ano modelo ${veiculo_ano}, Placa ${veiculo_placa}, Renavam nº ${veiculo_renavam || '_______________'}`,
    '{VALOR_SEMANAL}': `R$ ${valor_semanal} (${valor_semanal_extenso})`,
    '{VALOR_CAUCAO}': `R$ ${valor_caucao} (${valor_caucao_extenso})`,
    '{DIA_PAGAMENTO}': dia_pagamento || 'quinta',
    '{CIDADE_COMARCA}': cidade_comarca || 'JARAGUÁ DO SUL - SC',
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
      margins: { top: 70, bottom: 70, left: 70, right: 70 },
      bufferPages: true,
      info: {
        Title: 'Contrato de Locação de Veículo Automotor',
        Author: locador_nome
      }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Formatação próxima ao DOCX original (fonte 12, espaçamento 1.5)
    const bodySize = 12;
    const titleSize = 13;
    const headerSize = 16;
    const lineGap = 5;      // espaçamento entre linhas (~1.5 no Word)
    const paraSpacing = 0.8; // espaço entre parágrafos

    const chk = (n = 120) => { if (doc.y + n > doc.page.height - 80) doc.addPage(); };

    // ======= CABEÇALHO =======
    doc.font('Helvetica-Bold').fontSize(headerSize)
       .text('CONTRATO DE LOCAÇÃO DE VEÍCULO AUTOMOTOR', { align: 'center', lineGap: 4 });
    doc.moveDown(2);

    // ======= PARTES =======
    doc.font('Helvetica-Bold').fontSize(bodySize)
       .text(locador_nome, { continued: true, align: 'justify', lineGap });
    doc.font('Helvetica')
       .text(', com documento de identidade nº ' + locador_rg + ', inscrito no CPF nº ' + locador_cpf + ', residente e domiciliado em ' + locador_endereco + ', e-mail ' + locador_email + ', ', { continued: true });
    doc.font('Helvetica-Bold')
       .text('ora denominado LOCADOR', { continued: true });
    doc.font('Helvetica')
       .text(' e ', { continued: true });
    doc.font('Helvetica-Bold')
       .text(locatario_nome, { continued: true });
    doc.font('Helvetica')
       .text(', com documento de identidade nº ' + (locatario_rg || '_______________') + ', inscrito no CPF nº ' + locatario_cpf + ', residente e domiciliado em ' + (locatario_endereco || '_______________________________________________') + ', ', { continued: true });
    doc.font('Helvetica-Bold')
       .text('ora denominado LOCATÁRIO', { continued: true });
    doc.font('Helvetica')
       .text(', vêm, através do presente instrumento, celebrar CONTRATO DE LOCAÇÃO DE VEÍCULO AUTOMOTOR, que será regido pelas cláusulas e condições abaixo dispostas.');
    doc.moveDown(1.5);

    // ======= CLÁUSULAS DINÂMICAS =======
    for (const clause of clauses) {
      chk(140);

      // Título da cláusula
      doc.moveDown(paraSpacing);
      doc.font('Helvetica-Bold').fontSize(titleSize)
         .text(clause.titulo, { align: 'justify', lineGap: 4 });
      doc.moveDown(0.8);

      // Conteúdo — substituir placeholders e renderizar
      const content = replaceAll(clause.conteudo);
      const lines = content.split('\n');

      for (const line of lines) {
        chk(30);
        const trimmed = line.trim();
        if (!trimmed) { doc.moveDown(paraSpacing); continue; }

        if (trimmed.startsWith('•')) {
          doc.font('Helvetica').fontSize(bodySize)
             .text(trimmed, { align: 'justify', lineGap, indent: 20 });
        } else if (trimmed.startsWith('-') || trimmed.startsWith('  -')) {
          doc.font('Helvetica').fontSize(bodySize)
             .text(trimmed.replace(/^\s*-\s*/, '  – '), { align: 'justify', lineGap, indent: 30 });
        } else {
          doc.font('Helvetica').fontSize(bodySize)
             .text(trimmed, { align: 'justify', lineGap });
        }
        doc.moveDown(paraSpacing);
      }
    }

    // ======= LOCAL E DATA =======
    chk(200);
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(bodySize)
       .text((cidade_comarca || 'Jaraguá do Sul') + ', ' + data_contrato + '.', { align: 'center', lineGap });

    // ======= ASSINATURAS =======
    doc.moveDown(4);
    doc.font('Helvetica').fontSize(bodySize)
       .text('________________________________________', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold')
       .text(locador_nome + ' - LOCADOR', { align: 'center' });

    doc.moveDown(3);
    doc.font('Helvetica')
       .text('________________________________________', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold')
       .text(locatario_nome + ' - LOCATÁRIO', { align: 'center' });

    doc.end();
  });
}

module.exports = { gerarContrato };
