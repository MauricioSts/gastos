const { tentarAtalho } = require('./src/services/atalho');

const CASOS = [
  // devem resolver sem LLM: [mensagem, valor, categoria, data_relativa]
  ['almoço 24 reais', 24, 'alimentacao', 'hoje'],
  ['uber 32', 32, 'transporte', 'hoje'],
  ['mercado 187,40', 187.4, 'alimentacao', 'hoje'],
  ['gastei 32 no uber', 32, 'transporte', 'hoje'],
  ['paguei 120 de luz', 120, 'contas', 'hoje'],
  ['farmacia 45', 45, 'saude', 'hoje'],
  ['cinema 60 ontem', 60, 'lazer', 'ontem'],
  ['gasolina 200', 200, 'transporte', 'hoje'],
  ['torrei 45 pila no mercado ontem', 45, 'alimentacao', 'ontem'],
  // devem cair no LLM (null)
  ['recebi um pix de 10 reais', null],
  ['me pagaram 120', null],
  ['comprei um fone em 6x de 90', null],
  ['todo mes pago 99 de internet', null],
  ['meu aluguel e 800 e vence dia 5', null],
  ['bom dia, tudo bem?', null],
  ['pix de 30 pro joao', null],
  ['farmacia 32 reais anteontem', null],
  ['gastei 50 naquele lugar novo', null],
  ['vendi a bike por 300', null],
];

let ok = 0;
for (const [mensagem, valor, categoria, data] of CASOS) {
  const r = tentarAtalho(mensagem);
  const bom = valor === null
    ? r === null
    : Boolean(r) && r.valor === valor && r.categoria === categoria && r.data_relativa === data;
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${r ? `${r.valor} ${r.categoria} ${r.data_relativa}` : 'LLM'}  <- ${mensagem}`);
}
console.log(`\n${ok}/${CASOS.length}`);
process.exit(ok === CASOS.length ? 0 : 1);
