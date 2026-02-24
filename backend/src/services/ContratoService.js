const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle, TabStopType } = require('docx');

/**
 * Gera contrato de locação de veículo em DOCX
 * @param {Object} data - Dados para preencher o contrato
 */
async function gerarContrato(data) {
  const {
    locador_nome, locador_rg, locador_cpf, locador_endereco, locador_email,
    locatario_nome, locatario_rg, locatario_cpf, locatario_endereco,
    veiculo_marca_modelo, veiculo_cor, veiculo_ano, veiculo_placa, veiculo_renavam,
    valor_semanal, valor_semanal_extenso, dia_pagamento, valor_caucao, valor_caucao_extenso,
    cidade_comarca, data_contrato
  } = data;

  const bold = (text) => new TextRun({ text, bold: true, font: 'Arial', size: 22 });
  const normal = (text) => new TextRun({ text, font: 'Arial', size: 22 });
  const underline = (text) => new TextRun({ text, font: 'Arial', size: 22, underline: {} });
  const boldUnderline = (text) => new TextRun({ text, bold: true, font: 'Arial', size: 22, underline: {} });

  const spacing = { after: 120, line: 276 };
  const spacingBig = { before: 240, after: 120, line: 276 };

  const paragraph = (children, opts = {}) => new Paragraph({
    spacing, alignment: AlignmentType.JUSTIFIED, ...opts, children
  });

  const titulo = (text) => new Paragraph({
    spacing: spacingBig, alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, bold: true, font: 'Arial', size: 22 })]
  });

  const item = (children) => new Paragraph({
    spacing, alignment: AlignmentType.JUSTIFIED,
    indent: { left: 360 },
    children: [normal('• '), ...children]
  });

  const subitem = (text) => new Paragraph({
    spacing, alignment: AlignmentType.JUSTIFIED,
    indent: { left: 720 },
    children: [normal('- ' + text)]
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 }
        }
      },
      children: [
        // === CABEÇALHO ===
        new Paragraph({
          spacing: spacingBig, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'CONTRATO DE LOCAÇÃO DE VEÍCULO AUTOMOTOR', bold: true, font: 'Arial', size: 26 })]
        }),

        // === PARTES ===
        paragraph([
          bold(locador_nome + ', '),
          normal('com documento de identidade nº ' + locador_rg + ', inscrito no CPF nº ' + locador_cpf + ', residente e domiciliado em ' + locador_endereco + ', e-mail ' + locador_email + ', '),
          bold('ora denominado LOCADOR'),
          normal(' e '),
          bold(locatario_nome + ', '),
          normal('com documento de identidade nº ' + (locatario_rg || '_______________') + ', inscrito no CPF nº ' + locatario_cpf + ', residente e domiciliado em ' + (locatario_endereco || '_______________________________________________') + ', '),
          bold('ora denominado LOCATÁRIO'),
          normal(', vêm, através do presente instrumento, celebrar CONTRATO DE LOCAÇÃO DE VEÍCULO AUTOMOTOR, que será regido pelas cláusulas e condições abaixo dispostas.'),
        ]),

        // === CLÁUSULA 1 ===
        titulo('CLÁUSULA 1ª – DO OBJETO DO CONTRATO'),
        item([normal('O objeto do presente contrato é o seguinte veículo automotor:')]),
        item([
          normal('Veículo de marca '), bold(veiculo_marca_modelo),
          normal(', Cor '), bold(veiculo_cor),
          normal(', Ano modelo '), bold(veiculo_ano),
          normal(', Placa '), bold(veiculo_placa),
          normal(', Renavam nº '), bold(veiculo_renavam || '_______________'),
          normal('.')
        ]),
        item([normal('O veículo, objeto deste contrato, é de uso exclusivo do LOCATÁRIO. Este se compromete a não transferir ou ceder os direitos concedidos por este contrato a terceiros, nem permitir que o veículo seja conduzido por outra pessoa sem a prévia, inequívoca e expressa autorização do LOCADOR.')]),
        paragraph([normal('Na eventualidade de o veículo ser conduzido por terceiro sem a devida autorização do LOCADOR, o LOCATÁRIO estará sujeito à imediata rescisão deste contrato, sem prejuízo de uma multa no valor de R$ 550,00 (quinhentos e cinquenta reais) e assumirá total responsabilidade por quaisquer danos causados ao veículo.')]),

        // === CLÁUSULA 2 ===
        titulo('CLÁUSULA 2ª – DO HORÁRIO DO ALUGUEL E LOCAL DE COLETA E DEVOLUÇÃO DO VEÍCULO'),
        item([normal('O veículo objeto do presente contrato permanecerá na posse do locatário por '), bold('período integral,'), normal(' de segunda a domingo. O LOCATÁRIO tem o direito de manter a posse e o uso exclusivo do veículo 24 horas por dia, 7 dias por semana.')]),
        item([normal('O LOCATÁRIO se compromete a disponibilizar o veículo para vistoria pelo LOCADOR uma vez por semana, permitindo assim a verificação de seu estado de conservação e manutenção. A vistoria será agendada pelo LOCADOR com antecedência mínima de 24 (vinte e quatro) horas.')]),
        paragraph([normal('Na eventualidade de o LOCATÁRIO falhar por duas vezes em apresentar o veículo para vistoria sem justificativa válida, tal omissão poderá ser considerada violação contratual, sujeitando o LOCATÁRIO às penalidades previstas neste contrato.')]),
        paragraph([normal('O LOCADOR, ao receber o automóvel, tem o prazo de 24 horas para enviar para o LOCATÁRIO, via WhatsApp, fotos de todos os detalhes, imperfeições, riscos, avarias, defeitos no painel, defeitos nos bancos, etc. Se isentando deste modo de qualquer possível cobrança por parte destes danos.')]),
        item([normal('Em caso de não apresentação do veículo pelo LOCATÁRIO no prazo e local designados para vistoria, será aplicada uma multa de R$ 50,00 (cinquenta reais) por cada dia de atraso na apresentação.')]),

        // === CLÁUSULA 3 ===
        titulo('CLÁUSULA 3ª – DAS OBRIGAÇÕES DO LOCADOR E LOCATÁRIO'),
        paragraph([normal('3.1 O veículo será submetido a manutenções periódicas para garantir seu bom funcionamento e segurança, realizadas por profissional mecânico qualificado, '), underline('expressamente designado pelo LOCADOR'), normal('.')]),
        paragraph([normal('3.3 Os custos decorrentes das manutenções resultantes de mal uso do veículo, incluindo os custos das peças e a mão de obra, serão por conta do LOCATÁRIO, responsável por 100% do total desses custos.')]),
        item([normal('Caso a bomba de combustível venha a sofrer danos diretamente atribuíveis à falta de combustível ou negligência do LOCATÁRIO, este assumirá a responsabilidade total pelos custos associados ao reparo.')]),
        item([normal('O LOCADOR obriga-se a manter Seguro contratado para o veículo.')]),
        item([normal('É de responsabilidade do LOCADOR o pagamento do IPVA e do Seguro.')]),
        item([normal('É de responsabilidade do LOCATÁRIO o pagamento de quaisquer multas inerentes à utilização do veículo sofridas na vigência deste contrato.')]),
        item([normal('O pagamento das multas pelo LOCATÁRIO tem que ser feito imediatamente após a constatação, '), underline('independentemente de qualquer procedimento, seja transferência de pontos ou recurso'), normal('.')]),
        item([normal('O LOCATÁRIO concorda que o LOCADOR irá indicá-lo como condutor/infrator responsável pelas infrações de trânsito, nos termos do artigo 257 do Código de Trânsito.')]),
        item([normal('Na ocorrência de multas, caso o LOCATÁRIO não esteja cadastrado no app Carteira Digital de Trânsito como Principal Condutor, deverá comparecer para assinatura do auto de infração, sob pena de pagar R$ 400,00.')]),
        item([normal('Caso o veículo seja rebocado por estacionamento irregular, o LOCATÁRIO deverá arcar com todos os custos, além de multa contratual de R$ 70,00 por dia no depósito.')]),
        item([normal('Fica vedado ao LOCATÁRIO o acionamento do seguro sem a expressa permissão do LOCADOR, sob pena de multa de R$ 200,00.')]),
        item([normal('O LOCATÁRIO se responsabiliza por quaisquer acessórios do veículo (chave, documento, tapetes, triângulo, macaco, step, rádio, etc).')]),
        item([normal('Fica vedado ao LOCATÁRIO sair do Estado com o veículo sem autorização expressa e por escrito do LOCADOR, sob pena de multa de R$ 300,00.')]),
        item([normal('É vedado ao LOCATÁRIO efetuar qualquer reparo ou serviço no carro sem a prévia anuência do LOCADOR.')]),
        item([normal('Em caso de roubo ou furto, o LOCATÁRIO se compromete a avisar imediatamente o LOCADOR e comparecer à delegacia para registrar ocorrência.')]),
        item([normal('Caso o LOCATÁRIO se envolva em sinistro sob ação de álcool/entorpecentes ou não faça teste de embriaguez, deverá arcar com o valor da tabela FIPE do carro, caso a indenização do seguro seja negada.')]),

        // === CLÁUSULA 4 ===
        titulo('CLÁUSULA 4ª – DAS OBRIGAÇÕES DECORRENTES DE COLISÕES E AVARIAS DO VEÍCULO'),
        item([normal('É de responsabilidade do LOCATÁRIO o pagamento do reboque, taxas e reparos ao veículo na ocorrência de acidentes e colisões não contemplados pela cobertura do seguro.')]),
        item([normal('Na ocorrência de necessidade de pagamento de franquia do Seguro, a quantia será integralmente de responsabilidade do LOCATÁRIO.')]),

        // === CLÁUSULA 5 ===
        titulo('CLÁUSULA 5ª – DO PAGAMENTO EM RAZÃO DA LOCAÇÃO DO VEÍCULO'),
        item([
          normal('O LOCATÁRIO pagará ao LOCADOR o valor de '),
          bold('R$ ' + valor_semanal + ' (' + valor_semanal_extenso + ')'),
          normal(' semanalmente, realizado até às '),
          bold(dia_pagamento + '-feiras'),
          normal(' de cada semana.')
        ]),
        item([normal('Caso o pagamento seja feito após a ' + dia_pagamento + '-feira, o mesmo sofrerá um acréscimo de R$ 30,00 (trinta reais) por dia de atraso a título de juros.')]),
        item([normal('Fica o LOCATÁRIO obrigado a encaminhar o comprovante de pagamento ao LOCADOR, até às 23:59 da ' + dia_pagamento + '-feira de cada semana.')]),

        // === CLÁUSULA 6 ===
        titulo('CLÁUSULA 6ª – DA QUANTIA CAUÇÃO'),
        item([
          normal('Estabelecem as partes, a '), bold('QUANTIA CAUÇÃO'),
          normal(' em valor total de '),
          bold('R$ ' + valor_caucao + ' (' + valor_caucao_extenso + ')'),
          normal(', a ser integralizada no ato de retirada do veículo.')
        ]),
        item([normal('Ao término do contrato caberá ao LOCADOR restituir a integralidade da QUANTIA CAUÇÃO ao LOCATÁRIO no prazo de 40 (quarenta) dias úteis, conforme as seguintes CONDIÇÕES:')]),
        subitem('A devolução do automóvel em perfeito estado, em condição equivalente à observada ao último checklist de vistoria.'),
        subitem('A inexistência de aluguéis, multa de trânsito ou multa por descumprimento contratual pendentes.'),
        subitem('Após feita a manutenção necessária do veículo, caso haja necessidade.'),
        subitem('Após descontados quaisquer outros débitos pendentes.'),
        item([normal('Os gastos com combustível serão arcados integralmente pelo locatário.')]),
        item([normal('Caso o carro seja devolvido sujo, será cobrada a lavagem simples ou especial, dependendo do estado.')]),

        // === CLÁUSULA 7 ===
        titulo('CLÁUSULA 7ª – DA VIGÊNCIA E RESCISÃO'),
        item([normal('O presente contrato terá vigência a contar da data de sua assinatura e irá vigorar por no mínimo 3 meses.')]),
        item([normal('Em caso o LOCATÁRIO queira resilir o contrato, deverá informar com 15 dias de antecedência.')]),
        item([normal('O Contrato será considerado automaticamente rescindido, independentemente de qualquer notificação, quando:')]),
        subitem('O carro não for devolvido na data, hora e local previamente ajustados;'),
        subitem('Ocorrer qualquer acidente ou dano causado dolosa ou culposamente pelo LOCATÁRIO;'),
        subitem('Ocorrer Uso Inadequado do carro;'),
        subitem('Ocorrer apreensão do carro alugado por autoridades competentes;'),
        subitem('O LOCATÁRIO não quitar seus débitos nos respectivos vencimentos;'),
        subitem('Caso o LOCATÁRIO acumule dívida de R$ 800,00 e não quite em 48 horas, o contrato ficará automaticamente rescindido, sob pena de multa de R$ 150,00 por dia.'),
        item([normal('Fica pactuada a total inexistência de vínculo trabalhista entre as partes.')]),

        // === CLÁUSULA 8 ===
        titulo('CLÁUSULA 8ª – DO FORO'),
        item([
          normal('Fica eleito o foro da cidade e Comarca de '),
          bold(cidade_comarca || 'JARAGUÁ DO SUL - SC'),
          normal(', como competente para dirimir quaisquer questões.')
        ]),

        // === CLÁUSULA 9 ===
        titulo('CLÁUSULA 9ª – DA DEVOLUÇÃO DO VEÍCULO APÓS O TÉRMINO DO CONTRATO'),
        item([normal('Após o término do contrato, o veículo deve ser devolvido em local indicado pelo LOCADOR, dentro do prazo de 24 horas, sob pena de multa de R$ 200,00 por dia.')]),
        item([normal('A não devolução do veículo após notificação por escrito do LOCADOR configura crime de APROPRIAÇÃO INDÉBITA conforme artigo 168 do Código Penal Brasileiro.')]),

        // === CLÁUSULA 10 ===
        titulo('CLÁUSULA 10ª – DA DISPONIBILIZAÇÃO DE CARRO RESERVA'),
        item([normal('O LOCADOR '), boldUnderline('não é obrigado'), normal(' a disponibilizar carro reserva.')]),

        // === CLÁUSULA 11 ===
        titulo('CLÁUSULA 11ª – DAS NOTIFICAÇÕES'),
        item([normal('Quaisquer notificações e comunicações enviadas sob esse CONTRATO devem ser escritas.')]),
        paragraph([normal('E, por estarem assim, justas e contratadas, as PARTES firmam o presente instrumento em 02 (duas) vias de igual teor e forma.')]),

        // === ASSINATURA ===
        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({
          spacing: { after: 40 }, alignment: AlignmentType.LEFT,
          children: [normal((cidade_comarca || 'Jaraguá do Sul') + ', ' + data_contrato + '.')]
        }),
        new Paragraph({ spacing: { before: 600, after: 40 } }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [normal('________________________________________')]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [normal('LOCADOR - '), bold(locador_nome)]
        }),
        new Paragraph({ spacing: { before: 400, after: 40 } }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [normal('________________________________________')]
        }),
        new Paragraph({
          children: [normal('LOCATÁRIO - '), bold(locatario_nome)]
        }),
      ]
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = { gerarContrato };
