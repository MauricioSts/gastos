// Matriz de classificacao do LLM. Chama o modelo direto, sem passar pelo
// atalho deterministico: o que se mede aqui e a qualidade do PROMPT_SISTEMA,
// do SCHEMA_GASTO e do modelo. Rodar depois de mexer em qualquer um dos tres.
const { chatEstruturado } = require('./src/services/ollama');
const { validarSaida, SCHEMA_GASTO, PROMPT_SISTEMA } = require('./src/services/extrator');

const CASOS = [
  ['almoço 24 reais', 'gasto_avulso'],
  ['mercado 187,40', 'gasto_avulso'],
  ['uber 32', 'gasto_avulso'],
  ['gastei 32 no uber', 'gasto_avulso'],
  ['paguei 120 de luz', 'gasto_avulso'],
  ['torrei 45 pila no mercado ontem', 'gasto_avulso'],
  ['pix de 30 pro joao', 'gasto_avulso'],
  ['bom dia, tudo bem?', 'gasto_avulso'],
  ['recebi um pix de 10 reais', 'entrada'],
  ['me mandaram 50', 'entrada'],
  ['me pagaram 120', 'entrada'],
  ['caiu meu salario de 1700', 'entrada'],
  ['vendi a bike por 300', 'entrada'],
  ['recebi um pix de 80 do carlos', 'entrada'],
  ['comprei um fone em 6x de 90', 'parcelamento'],
  ['comprei uma tv de 2160 em 12x', 'parcelamento'],
  ['todo mes pago 99 de internet', 'conta_fixa'],
  ['meu aluguel e 800 e vence dia 5', 'conta_fixa'],
];

(async () => {
  let ok = 0;
  let somaMs = 0;
  for (const [mensagem, esperado] of CASOS) {
    const inicio = Date.now();
    const resposta = await chatEstruturado({
      mensagens: [
        { role: 'system', content: PROMPT_SISTEMA },
        { role: 'user', content: mensagem },
      ],
      schema: SCHEMA_GASTO,
    });
    const ms = Date.now() - inicio;
    somaMs += ms;
    const v = validarSaida(resposta.objeto);
    const tipo = v.ok ? v.dados.tipo : `INVALIDO(${v.motivo})`;
    const bom = tipo === esperado;
    if (bom) ok += 1;
    console.log(`${bom ? ' ok  ' : 'FALHA'} ${String(ms).padStart(6)}ms  ${tipo.padEnd(14)} esperado ${esperado.padEnd(14)} <- ${mensagem}`);
  }
  console.log(`\n${ok}/${CASOS.length}  |  media ${(somaMs / CASOS.length / 1000).toFixed(1)}s por chamada`);
  process.exit(ok === CASOS.length ? 0 : 1);
})();
