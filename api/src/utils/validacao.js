// Validacao e sanitizacao de tudo que entra na API ou volta do LLM.

// Enum fixo de categorias. Fonte unica de verdade: usado no JSON Schema
// enviado ao Ollama e na validacao antes de gravar.
const CATEGORIAS = [
  'alimentacao', 'transporte', 'lazer', 'saude',
  'compras', 'contas', 'assinaturas', 'educacao', 'outros',
];

const LIMITE_MENSAGEM = 500;
const LIMITE_DESCRICAO = 120;

// Erro de dominio com status HTTP; o middleware de erro le esses campos.
class ErroApi extends Error {
  constructor(status, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    this.extra = extra;
  }
}

// Remove caracteres de controle e espacos duplicados, e corta no limite.
function limparTexto(valor, limite) {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

// Normaliza numero em formato brasileiro: "25,50" -> 25.5, "1.250,00" -> 1250.
// Aceita tambem numero puro vindo do JSON Schema do LLM.
function normalizarValor(bruto) {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto !== 'string') return null;

  let texto = bruto.trim().replace(/r\$|reais?/gi, '').replace(/\s/g, '');
  if (!texto) return null;

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  if (temVirgula && temPonto) {
    // "1.250,00" -> ponto e separador de milhar, virgula e decimal.
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    // "25,50" -> virgula decimal.
    texto = texto.replace(',', '.');
  } else if (temPonto) {
    // "1.250" com 3 casas depois do ponto e milhar, nao decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

// Arredonda para centavos, evitando lixo de ponto flutuante.
function emCentavos(n) {
  return Math.round(n * 100) / 100;
}

function categoriaValida(cat) {
  return typeof cat === 'string' && CATEGORIAS.includes(cat);
}

// Le um inteiro positivo de query string, com padrao e teto.
function inteiroPositivo(bruto, padrao, maximo) {
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n <= 0) return padrao;
  return Math.min(n, maximo);
}

module.exports = {
  CATEGORIAS, LIMITE_MENSAGEM, LIMITE_DESCRICAO,
  ErroApi, limparTexto, normalizarValor, emCentavos,
  categoriaValida, inteiroPositivo,
};
