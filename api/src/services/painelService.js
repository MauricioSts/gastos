// Painel do mes: o retrato do gasto livre dentro do ciclo.
//
// Nada aqui entra em `saldo` ou `resumo`: sao numeros de leitura, nao de
// decisao. O comprometido fica de fora de proposito -- ele nao acontece "por
// dia" nem foi escolha deste mes, entao poluiria a curva e a rosca.
const db = require('../db');
const ciclo = require('../utils/ciclo');
const { hoje, mesSomar } = require('../utils/data');
const { emCentavos } = require('../utils/validacao');
const { resolverMes } = require('./saldoService');

const stmtGastosDoCiclo = db.prepare(`
  SELECT id, valor, categoria, descricao, data_gasto, criado_em
  FROM gastos
  WHERE data_gasto BETWEEN ? AND ?
  ORDER BY data_gasto DESC, id DESC
`);
const stmtTotalCiclo = db.prepare(
  'SELECT COALESCE(SUM(valor), 0) AS total FROM gastos WHERE data_gasto BETWEEN ? AND ?',
);

// Todos os dias da janela, do primeiro ao ultimo. Dia sem gasto continua na
// lista com zero: buraco no eixo mentiria sobre o ritmo.
function diasDaJanela(janela) {
  const dias = [];
  let d = janela.inicio;
  while (d <= janela.fim) {
    dias.push(d);
    d = ciclo.somarDias(d, 1);
  }
  return dias;
}

function calcularPainel(mesBruto) {
  const mes = resolverMes(mesBruto);
  const janela = ciclo.janela(mes);
  const gastos = stmtGastosDoCiclo.all(janela.inicio, janela.fim);

  const porDia = new Map(diasDaJanela(janela).map((data) => [data, 0]));
  const porCategoria = new Map();
  let total = 0;

  for (const g of gastos) {
    total += g.valor;
    porDia.set(g.data_gasto, (porDia.get(g.data_gasto) || 0) + g.valor);
    const atual = porCategoria.get(g.categoria) || { total: 0, quantidade: 0 };
    porCategoria.set(g.categoria, { total: atual.total + g.valor, quantidade: atual.quantidade + 1 });
  }

  const diaAdia = [...porDia.entries()].map(([data, valor]) => ({
    data,
    dia: Number(data.slice(8, 10)),
    valor: emCentavos(valor),
  }));

  const comGasto = diaAdia.filter((d) => d.valor > 0);
  const maiorDia = diaAdia.reduce(
    (a, b) => (b.valor > a.valor ? b : a),
    { data: janela.inicio, dia: Number(janela.inicio.slice(8, 10)), valor: 0 },
  );

  // Semanas de 7 dias corridos a partir da abertura do ciclo -- nao semanas do
  // calendario, que cortariam o ciclo em pedacos desalinhados.
  const semanas = [];
  for (let i = 0; i < diaAdia.length; i += 7) {
    const fatia = diaAdia.slice(i, i + 7);
    semanas.push({
      rotulo: `S${semanas.length + 1}`,
      inicio: fatia[0].data,
      fim: fatia[fatia.length - 1].data,
      valor: emCentavos(fatia.reduce((s, d) => s + d.valor, 0)),
    });
  }

  const totalCiclo = emCentavos(total);
  const mesAnterior = mesSomar(mes, -1);
  const janelaAnterior = ciclo.janela(mesAnterior);
  const anterior = emCentavos(stmtTotalCiclo.get(janelaAnterior.inicio, janelaAnterior.fim).total);

  return {
    mes_referencia: mes,
    ciclo: janela,
    total: totalCiclo,
    quantidade_gastos: gastos.length,
    // Media sobre os dias em que houve gasto: dividir pelo ciclo inteiro
    // esconderia o tamanho do dia tipico de quem gasta em rajadas.
    media_diaria: comGasto.length ? emCentavos(totalCiclo / comGasto.length) : 0,
    maior_dia: maiorDia,
    dias_com_gasto: comGasto.length,
    dias_no_ciclo: diaAdia.length,
    por_categoria: [...porCategoria.entries()]
      .map(([categoria, v]) => ({
        categoria,
        valor: emCentavos(v.total),
        quantidade: v.quantidade,
        percentual: totalCiclo > 0 ? emCentavos((v.total / totalCiclo) * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor),
    dia_a_dia: diaAdia,
    semanas,
    maiores: gastos
      .slice()
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((g) => ({
        id: g.id,
        descricao: g.descricao,
        valor: emCentavos(g.valor),
        categoria: g.categoria,
        data_gasto: g.data_gasto,
        criado_em: g.criado_em,
      })),
    comparativo: {
      mes_anterior: mesAnterior,
      total_anterior: anterior,
      // Sem base no ciclo anterior a comparacao seria ruido, entao vem null e
      // o cliente diz "sem base" em vez de inventar 100%.
      variacao: anterior > 0 ? emCentavos(((totalCiclo - anterior) / anterior) * 100) : null,
    },
    hoje: hoje(),
  };
}

module.exports = { calcularPainel };
