// Testes do ciclo da fatura. Rodar depois de mexer em src/utils/ciclo.js ou
// nos dias configurados em CICLO_* no .env.
//
// Os casos assumem a configuracao real do usuario: fecha 28, recebe 30, paga 5.
const ciclo = require('./src/utils/ciclo');
const config = require('./src/config');

const { diaFechamento, diaRecebimento, diaPagamento } = config.ciclo;
if (diaFechamento !== 28 || diaRecebimento !== 30 || diaPagamento !== 5) {
  console.log(`AVISO: .env tem fechamento ${diaFechamento}, recebimento ${diaRecebimento}, pagamento ${diaPagamento}; os casos abaixo assumem 28/30/5.`);
}

let ok = 0;
let total = 0;
function conferir(rotulo, obtido, esperado) {
  total += 1;
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${rotulo}: ${JSON.stringify(obtido)}${bom ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

// A que ciclo pertence cada data. O dia do fechamento ainda e do ciclo; o
// seguinte ja e do proximo -- e essa a regra que o mes do calendario errava.
conferir('28/08 pertence a', ciclo.cicloDaData('2026-08-28'), '2026-08');
conferir('29/08 pertence a', ciclo.cicloDaData('2026-08-29'), '2026-09');
conferir('30/08 (dia da renda) pertence a', ciclo.cicloDaData('2026-08-30'), '2026-09');
conferir('01/09 pertence a', ciclo.cicloDaData('2026-09-01'), '2026-09');
conferir('28/09 pertence a', ciclo.cicloDaData('2026-09-28'), '2026-09');
conferir('29/09 pertence a', ciclo.cicloDaData('2026-09-29'), '2026-10');
conferir('05/10 (dia do pagamento) pertence a', ciclo.cicloDaData('2026-10-05'), '2026-10');

// Janela do ciclo de setembro, o caso que o usuario descreveu.
const setembro = ciclo.janela('2026-09');
conferir('setembro abre em', setembro.inicio, '2026-08-29');
conferir('setembro fecha em', setembro.fim, '2026-09-28');
conferir('renda de setembro cai em', setembro.data_recebimento, '2026-08-30');
conferir('fatura de setembro vence em', setembro.vencimento_fatura, '2026-10-05');
conferir('setembro tem dias', setembro.dias_no_ciclo, 31);

// Fevereiro: o dia 30 nao existe e o clamp nao pode jogar a renda para fora.
const marco = ciclo.janela('2027-03');
conferir('marco/2027 abre em', marco.inicio, '2027-03-01');
conferir('marco/2027 fecha em', marco.fim, '2027-03-28');
conferir('renda de marco/2027 dentro da janela', marco.data_recebimento >= marco.inicio, true);

// Ciclos consecutivos nao podem ter buraco nem sobreposicao: o dia seguinte ao
// fim de um e o inicio do proximo. Se isso quebrar, um gasto some do app.
let contiguo = true;
let m = '2026-01';
for (let i = 0; i < 36; i += 1) {
  const atual = ciclo.janela(m);
  const proximo = ciclo.janela(require('./src/utils/data').mesSomar(m, 1));
  if (ciclo.somarDias(atual.fim, 1) !== proximo.inicio) {
    contiguo = false;
    console.log(`  buraco entre ${m} (fim ${atual.fim}) e o proximo (inicio ${proximo.inicio})`);
  }
  m = require('./src/utils/data').mesSomar(m, 1);
}
conferir('36 ciclos seguidos sem buraco nem sobreposicao', contiguo, true);

console.log(`\n${ok}/${total}`);
process.exit(ok === total ? 0 : 1);
