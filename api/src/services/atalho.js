// Atalho deterministico para o lancamento cotidiano.
//
// A extracao pelo LLM local leva ~16s, e 95% disso e geracao de token em CPU.
// Mensagens como "almoco 24" ou "uber 32" nao tem ambiguidade nenhuma: um
// numero, uma palavra conhecida, nenhuma marca de parcela ou recorrencia.
// Resolver essas aqui derruba o tempo para ~0,05s.
//
// Este modulo e conservador de proposito: na menor duvida devolve null e o
// LLM decide. Errar rapido e pior que acertar devagar.
const { CATEGORIAS } = require('../utils/validacao');

// Palavras que identificam categoria sem ambiguidade. Manter curto e obvio:
// termo duvidoso aqui vira gasto categorizado errado sem o usuario perceber.
const TERMOS = {
  alimentacao: ['almoço', 'almoco', 'janta', 'jantar', 'café', 'cafe', 'lanche',
    'mercado', 'feira', 'restaurante', 'padaria', 'pizza', 'ifood', 'hamburguer',
    'açaí', 'acai', 'sorvete', 'pão', 'pao', 'bar', 'cerveja', 'supermercado',
    'marmita', 'pastel', 'sushi', 'churrasco'],
  transporte: ['uber', 'ônibus', 'onibus', 'metrô', 'metro', 'gasolina',
    'combustível', 'combustivel', 'álcool', 'alcool', 'etanol', 'táxi', 'taxi',
    'estacionamento', 'pedágio', 'pedagio', 'passagem', 'bilhete', 'recarga'],
  lazer: ['cinema', 'show', 'viagem', 'jogo', 'festa', 'passeio', 'parque',
    'teatro', 'balada'],
  saude: ['farmácia', 'farmacia', 'remédio', 'remedio', 'médico', 'medico',
    'dentista', 'academia', 'exame', 'consulta', 'psicólogo', 'psicologo'],
  compras: ['roupa', 'tênis', 'tenis', 'camisa', 'calça', 'calca', 'presente',
    'shopping', 'notebook'],
  contas: ['luz', 'água', 'agua', 'internet', 'aluguel', 'condomínio',
    'condominio', 'gás', 'telefone', 'iptu'],
  assinaturas: ['spotify', 'netflix', 'disney', 'icloud'],
  educacao: ['curso', 'livro', 'faculdade', 'escola', 'apostila'],
};

const PARCELA = /\d+\s*(x|vezes)\b|parcel\w+|dividid\w+/i;
const RECORRENTE = /\btodo(s)? (o(s)? )?m[êe]s\b|\bmensal\w*\b|\bvence dia\b|\bassinatura\b/i;
const ENTRADA = /\b(recebi|receberam|me mandaram|me mandou|me pagaram|me pagou|caiu|entrou|vendi|me transferiu|me transferiram|reembols\w*|estorn\w*|me deram|me deu)\b/i;
const DATA_ESTRANHA = /\banteontem\b|\bsemana passada\b|\bm[êe]s passado\b|\bdia \d+\b|\bsegunda\b|\bter[çc]a\b|\bquarta\b|\bquinta\b|\bsexta\b|\bs[áa]bado\b|\bdomingo\b/i;

// Remove acento para comparar "almoço" com "almoco".
function semAcento(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Indice palavra -> categoria, montado uma vez.
const INDICE = new Map();
for (const [categoria, termos] of Object.entries(TERMOS)) {
  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`Categoria "${categoria}" do atalho nao existe no enum.`);
  }
  for (const termo of termos) INDICE.set(semAcento(termo), categoria);
}

// Devolve o mesmo formato que `extrairGasto`, ou null quando nao tem certeza.
function tentarAtalho(mensagem) {
  const texto = String(mensagem || '').trim();
  if (texto.length > 60) return null;
  if (PARCELA.test(texto) || RECORRENTE.test(texto)) return null;
  if (ENTRADA.test(texto)) return null;
  if (DATA_ESTRANHA.test(texto)) return null;

  // Exatamente um numero. Dois costumam ser parcela, data ou troco.
  const numeros = texto.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numeros.length !== 1) return null;
  const valor = Number(numeros[0].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;

  const palavras = semAcento(texto).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let categoria = null;
  let encontrada = null;
  for (const palavra of palavras) {
    if (INDICE.has(palavra)) { categoria = INDICE.get(palavra); encontrada = palavra; break; }
  }
  if (!categoria) return null;

  return {
    tipo: 'gasto_avulso',
    valor: Math.round(valor * 100) / 100,
    categoria,
    descricao: encontrada,
    data_relativa: /\bontem\b/i.test(texto) ? 'ontem' : 'hoje',
    total_parcelas: null,
    valor_parcela: null,
    valor_total_compra: null,
    dia_vencimento: null,
    _meta: { tentativas: 0, duracao_ms: 0, modelo: 'atalho' },
  };
}

module.exports = { tentarAtalho, TERMOS };
