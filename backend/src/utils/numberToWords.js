/**
 * Converte número em valor por extenso em Português (BRL)
 * Ex: 550.00 → "quinhentos e cinquenta reais"
 * Ex: 1800.00 → "um mil e oitocentos reais"
 */

const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function grupoParaExtenso(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;

  let partes = [];

  if (c > 0) partes.push(centenas[c]);

  if (d === 1) {
    partes.push(especiais[u]);
  } else {
    if (d > 1) partes.push(dezenas[d]);
    if (u > 0) partes.push(unidades[u]);
  }

  return partes.join(' e ');
}

function valorPorExtenso(valor) {
  if (typeof valor === 'string') valor = parseFloat(valor.replace(',', '.'));
  if (isNaN(valor) || valor === 0) return 'zero reais';

  const inteiro = Math.floor(Math.abs(valor));
  const centavos = Math.round((Math.abs(valor) - inteiro) * 100);

  let partes = [];

  if (inteiro > 0) {
    if (inteiro >= 1000000) {
      const milhoes = Math.floor(inteiro / 1000000);
      partes.push(grupoParaExtenso(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
      const resto = inteiro % 1000000;
      if (resto > 0) {
        if (resto < 100) {
          partes.push('e ' + grupoParaExtenso(resto));
        } else {
          const milhares = Math.floor(resto / 1000);
          const unidadesResto = resto % 1000;
          if (milhares > 0) {
            partes.push(milhares === 1 ? 'mil' : grupoParaExtenso(milhares) + ' mil');
          }
          if (unidadesResto > 0) {
            partes.push((unidadesResto < 100 ? 'e ' : '') + grupoParaExtenso(unidadesResto));
          }
        }
      }
    } else if (inteiro >= 1000) {
      const milhares = Math.floor(inteiro / 1000);
      if (milhares === 1) {
        partes.push('mil');
      } else {
        partes.push(grupoParaExtenso(milhares) + ' mil');
      }
      const resto = inteiro % 1000;
      if (resto > 0) {
        partes.push((resto < 100 ? 'e ' : '') + grupoParaExtenso(resto));
      }
    } else {
      partes.push(grupoParaExtenso(inteiro));
    }

    partes.push(inteiro === 1 ? 'real' : 'reais');
  }

  if (centavos > 0) {
    if (inteiro > 0) partes.push('e');
    partes.push(grupoParaExtenso(centavos));
    partes.push(centavos === 1 ? 'centavo' : 'centavos');
  }

  return partes.join(' ');
}

module.exports = { valorPorExtenso };
