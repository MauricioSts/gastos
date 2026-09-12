// O mes de referencia deste app e o ciclo da fatura, nao o mes do calendario.
//
// O usuario recebe no dia 30, o cartao fecha no dia 28 e a fatura e paga no
// dia 5 do mes seguinte. Um gasto feito em 29/09 nao pertence a setembro:
// ele entra na fatura que fecha em 28/10 e vence em 05/11. Somar por
// `substr(data_gasto, 1, 7)` colocaria esse gasto no mes errado e mostraria um
// disponivel que nao existe.
//
// Rotulo do ciclo continua sendo YYYY-MM (o mes em que ele FECHA), para nao
// quebrar quem ja consome `mes_referencia` nem os cadastros existentes de
// renda, conta fixa, parcelamento, orcamento e limite.
//
//   ciclo "2026-09": abre 29/08, fecha 28/09, renda em 30/08, fatura em 05/10
const { hoje, diasNoMes, mesSomar, mesValido } = require('./data');
// Os dias do ciclo sao editaveis em tempo de execucao (PATCH /api/fatura).
// Ler a cada uso, e nao uma vez no boot, e o que faz a mudanca valer na hora.
const { parametrosCiclo } = require('../services/configService');

// Um dia que nao existe no mes (31 em fevereiro) vira o ultimo dia do mes.
// Sem isso o ciclo simplesmente sumiria nos meses curtos.
function diaNoMes(mes, dia) {
  return Math.min(dia, diasNoMes(mes));
}

function dataDe(mes, dia) {
  return `${mes}-${String(diaNoMes(mes, dia)).padStart(2, '0')}`;
}

// Soma dias a uma data YYYY-MM-DD. Aritmetica em UTC de proposito: a data aqui
// e um rotulo, nao um instante, entao fuso nao entra na conta.
function somarDias(data, n) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return d.toISOString().slice(0, 10);
}

function diffDias(de, ate) {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// A que ciclo pertence uma data. Ate o dia do fechamento, o ciclo e o do
// proprio mes; depois dele, ja e o ciclo seguinte.
function cicloDaData(data) {
  const { diaFechamento } = parametrosCiclo();
  const mes = data.slice(0, 7);
  const dia = Number(data.slice(8, 10));
  return dia <= diaNoMes(mes, diaFechamento) ? mes : mesSomar(mes, 1);
}

function cicloAtual() {
  return cicloDaData(hoje());
}

// Datas concretas de um ciclo. Tudo derivado do rotulo: nada disso e gravado,
// entao mudar o dia de fechamento no .env recalcula o historico inteiro.
function janela(ciclo) {
  const { diaFechamento, diaRecebimento, diaPagamento } = parametrosCiclo();
  const mesAnterior = mesSomar(ciclo, -1);
  const fim = dataDe(ciclo, diaFechamento);
  const inicio = somarDias(dataDe(mesAnterior, diaFechamento), 1);
  // Renda que banca o ciclo: a que cai dentro da janela. Com recebimento (30)
  // depois do fechamento (28), ela chega ainda no mes anterior ao rotulo.
  const mesDaRenda = diaRecebimento > diaFechamento ? mesAnterior : ciclo;
  // Em fevereiro o dia 30 nao existe e o clamp jogaria a renda para fora da
  // janela; nesse caso ela vale como recebida na abertura do ciclo.
  const recebimento = dataDe(mesDaRenda, diaRecebimento);
  return {
    ciclo,
    inicio,
    fim,
    data_recebimento: recebimento < inicio ? inicio : recebimento,
    vencimento_fatura: dataDe(mesSomar(ciclo, 1), diaPagamento),
    dias_no_ciclo: diffDias(inicio, fim) + 1,
  };
}

// Quantos dias do ciclo ja passaram, contando hoje.
// Ciclo passado -> o ciclo inteiro; ciclo futuro -> 0.
function diasDecorridos(ciclo) {
  const { inicio, fim, dias_no_ciclo: total } = janela(ciclo);
  const agora = hoje();
  if (agora < inicio) return 0;
  if (agora > fim) return total;
  return diffDias(inicio, agora) + 1;
}

// Quantos dias ainda restam, contando hoje. Contar hoje evita divisao por zero
// no ritmo diario no ultimo dia do ciclo.
function diasRestantes(ciclo) {
  const { inicio, fim, dias_no_ciclo: total } = janela(ciclo);
  const agora = hoje();
  if (agora < inicio) return total;
  if (agora > fim) return 0;
  return diffDias(agora, fim) + 1;
}

module.exports = {
  cicloDaData, cicloAtual, janela, diasDecorridos, diasRestantes,
  cicloValido: mesValido, somarDias, diffDias,
};
