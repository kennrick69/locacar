/**
 * Verificação de assinatura digital em PDFs (ICP-Brasil / Gov.br)
 * Extrai certificado e compara CPF/nome com dados do motorista.
 */
const forge = require('node-forge');

/**
 * Extrai assinaturas digitais de um PDF buffer.
 * Retorna array de objetos com info do certificado.
 */
function extractSignatures(pdfBuffer) {
  const pdf = pdfBuffer.toString('binary');
  const signatures = [];

  // Procura por objetos de assinatura PKCS#7 no PDF
  // O padrão PDF armazena assinaturas em campos /Type /Sig com /Contents hex
  const sigRegex = /\/Type\s*\/Sig[\s\S]*?\/Contents\s*<([0-9a-fA-F]+)>/g;
  let match;

  while ((match = sigRegex.exec(pdf)) !== null) {
    try {
      const hexContent = match[1];
      // Remove padding zeros
      const cleanHex = hexContent.replace(/0+$/, '');
      if (cleanHex.length < 100) continue;

      const derBytes = forge.util.hexToBytes(cleanHex);
      const asn1 = forge.asn1.fromDer(derBytes);
      const pkcs7 = forge.pkcs7.messageFromAsn1(asn1);

      if (pkcs7.certificates && pkcs7.certificates.length > 0) {
        for (const cert of pkcs7.certificates) {
          const subject = cert.subject;
          const sigInfo = {
            nome: null,
            cpf: null,
            email: null,
            emissor: null,
            valido_de: cert.validity.notBefore,
            valido_ate: cert.validity.notAfter,
            serial: cert.serialNumber,
          };

          // Extrai nome do subject (CN = Common Name)
          const cn = subject.getField('CN');
          if (cn) sigInfo.nome = cn.value;

          // Extrai email
          const emailField = subject.getField('E') || subject.getField({ shortName: 'E' });
          if (emailField) sigInfo.email = emailField.value;

          // Extrai emissor
          const issuerCn = cert.issuer.getField('CN');
          if (issuerCn) sigInfo.emissor = issuerCn.value;

          // CPF pode estar no CN (formato "NOME:CPF") ou em OID específico
          // ICP-Brasil usa OID 2.16.76.1.3.1 para dados do titular
          // Também pode estar no CN como "NOME DO TITULAR:12345678901"
          if (cn && cn.value) {
            const cpfMatch = cn.value.match(/(\d{11})/);
            if (cpfMatch) sigInfo.cpf = cpfMatch[1];
          }

          // Procura CPF nas extensions (otherName / subjectAltName)
          if (cert.extensions) {
            for (const ext of cert.extensions) {
              if (ext.name === 'subjectAltName' && ext.altNames) {
                for (const alt of ext.altNames) {
                  // otherName com OID ICP-Brasil
                  if (alt.value && typeof alt.value === 'string') {
                    const cpfInAlt = alt.value.match(/(\d{11})/);
                    if (cpfInAlt && !sigInfo.cpf) sigInfo.cpf = cpfInAlt[1];
                  }
                }
              }
              // Busca em todo o valor da extensão
              if (ext.value && typeof ext.value === 'string') {
                const cpfInExt = ext.value.match(/(\d{11})/);
                if (cpfInExt && !sigInfo.cpf) sigInfo.cpf = cpfInExt[1];
              }
            }
          }

          signatures.push(sigInfo);
        }
      }
    } catch (err) {
      // Pode haver blocos que não são assinaturas válidas, ignora
      console.warn('[ASSINATURA] Erro ao parsear bloco:', err.message);
    }
  }

  return signatures;
}

/**
 * Verifica se um PDF está assinado digitalmente e se bate com o motorista.
 * @param {Buffer} pdfBuffer - Buffer do arquivo PDF
 * @param {Object} driver - { nome, cpf } dados do motorista
 * @returns {{ assinado, valido, assinaturas, alertas }}
 */
function verificarAssinatura(pdfBuffer, driver) {
  const result = {
    assinado: false,
    cpf_confere: false,
    nome_confere: false,
    assinaturas: [],
    alertas: [],
  };

  try {
    const sigs = extractSignatures(pdfBuffer);
    result.assinaturas = sigs;
    result.assinado = sigs.length > 0;

    if (!result.assinado) {
      result.alertas.push('O PDF NÃO contém assinatura digital');
      return result;
    }

    const driverCpf = (driver.cpf || '').replace(/\D/g, '');
    const driverNome = (driver.nome || '').toUpperCase().trim();

    for (const sig of sigs) {
      // Verifica CPF
      if (sig.cpf && driverCpf) {
        if (sig.cpf === driverCpf) {
          result.cpf_confere = true;
        } else {
          result.alertas.push(`CPF na assinatura (${sig.cpf}) NÃO confere com o cadastro (${driverCpf})`);
        }
      }

      // Verifica nome (busca parcial)
      if (sig.nome && driverNome) {
        const sigNome = sig.nome.toUpperCase();
        // Verifica se pelo menos o primeiro e último nome batem
        const nomeParts = driverNome.split(/\s+/);
        const primeiro = nomeParts[0];
        const ultimo = nomeParts[nomeParts.length - 1];

        if (sigNome.includes(primeiro) && sigNome.includes(ultimo)) {
          result.nome_confere = true;
        } else {
          result.alertas.push(`Nome na assinatura ("${sig.nome}") pode não conferir com o cadastro ("${driver.nome}")`);
        }
      }

      // Verifica validade do certificado
      const agora = new Date();
      if (sig.valido_ate && new Date(sig.valido_ate) < agora) {
        result.alertas.push(`Certificado expirado em ${new Date(sig.valido_ate).toLocaleDateString('pt-BR')}`);
      }
    }

    if (!result.cpf_confere && sigs.some(s => s.cpf)) {
      result.alertas.push('CPF da assinatura digital não confere com o motorista cadastrado');
    }

  } catch (err) {
    console.error('[ASSINATURA] Erro na verificação:', err.message);
    result.alertas.push('Erro ao verificar assinatura: ' + err.message);
  }

  return result;
}

module.exports = { verificarAssinatura, extractSignatures };
