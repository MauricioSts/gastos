// Calculos de saldo e resumo mensal.
//
// O saldo nao e "orcamento menos gasto". Ele se decompoe em:
//   renda - comprometido (contas fixas + parcelas) - gasto livre = disponivel
// O `disponivel` devolvido aqui e sempre esse ultimo numero. Mostrar a renda
// bruta como disponivel seria mentir: no dia 1 do mes as parcelas ja sairam.
const db = require('../db');
const { mesValido, hoje } = require('../utils/data');
const ciclo = require('../utils/ciclo');
const { ErroApi, normalizarValor, emCentavos, CATEGORIAS } = require('../utils/validacao');
const compromissos = require('./compromissosService');
const configRuntime = require('./configService');

const stmtOrcamento = db.prepare('SELECT * FROM orcamentos WHERE mes_referencia = ?');
// Gasto pertence ao ciclo pela janela de datas, nao pelo mes do calendario:
// um gasto de 29/09 e da fatura que fecha em 28/10.
const stmtTotalMes = db.prepare(
  'SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd FROM gastos WHERE data_gasto BETWEEN ? AND ?',
);
const stmtPorCategoria = db.prepare(`
  SELECT categoria, COALESCE(SUM(valor), 0) AS total, COUNT(*) AS quantidade
  FROM gastos
  WHERE data_gasto BETWEEN ? AND ?
  GROUP BY categoria
  ORDER BY total DESC
`);
const stmtLimites = db.prepare('SELECT * FROM limites_categoria WHERE mes_referencia = ?');
const stmtTotalDia = db.prepare(
  'SELECT COALESCE(SUM(valor), 0) AS total FROM gastos WHERE data_gasto = ?',
);
const stmtUpsertOrcamento = db.prepare(`
  INSERT INTO orcamentos (mes_referencia, valor_total) VALUES (@mes, @valor)
  ON CONFLICT (mes_referencia) DO UPDATE SET valor_total = @valor
`);
const stmtUpsertLimite = db.prepare(`
  INSERT INTO limites_categoria (categoria, mes_referencia, valor_limite)
  VALUES (@categoria, @mes, @valor)
  ON CONFLICT (categoria, mes_referencia) DO UPDATE SET valor_limite = @valor
`);

// Normaliza o parametro de mes: usa o ciclo corrente quando ausente.
// O rotulo continua YYYY-MM, mas identifica o ciclo da fatura.
function resolverMes(mes) {
  if (mes === undefined || mes === '') return ciclo.cicloAtual();
  if (!mesValido(mes)) throw new ErroApi(400, 'Parametro "mes" deve estar no formato YYYY-MM.');
  return mes;
}

// Saldo do mes: renda, comprometido, gasto livre e disponivel de fato.
// Sem renda cadastrada, `disponivel` fica null e `renda_definida` avisa o
// cliente. Nao assumimos zero: sem renda o numero nao significa nada.
function calcularSaldo(mesBruto) {
  const mes = resolverMes(mesBruto);

  const janela = ciclo.janela(mes);
  const { total, qtd } = stmtTotalMes.get(janela.inicio, janela.fim);
  const gastoLivre = emCentavos(total);

  const comp = compromissos.compromissosDoMes(mes);
  const renda = compromissos.totalRenda(mes);
  const diasRestantes = ciclo.diasRestantes(mes);

  // Teto opcional de gasto livre. Independente da renda: serve para o usuario
  // se limitar a menos do que poderia gastar.
  const orcamento = stmtOrcamento.get(mes);

  // Gasto de hoje so faz sentido quando hoje esta dentro da janela: em um
  // ciclo passado ou futuro o numero seria de outro periodo.
  const agora = hoje();
  const hojeNoCiclo = agora >= janela.inicio && agora <= janela.fim;
  const gastoHoje = hojeNoCiclo ? emCentavos(stmtTotalDia.get(agora).total) : 0;

  const base = {
    mes_referencia: mes,
    // Datas concretas do ciclo, para o app poder dizer "29/08 a 28/09,
    // fatura em 05/10" em vez de fingir que o mes fecha dia 30.
    ciclo: janela,
    renda_definida: renda.definida,
    renda_total: renda.definida ? renda.total : null,
    comprometido_total: comp.total,
    comprometido_contas_fixas: comp.total_contas_fixas,
    comprometido_parcelas: comp.total_parcelas,
    gasto_livre: gastoLivre,
    // Nome antigo do gasto livre, mantido para nao quebrar quem ja consome.
    total_gasto: gastoLivre,
    quantidade_gastos: qtd,
    dias_restantes: diasRestantes,
    orcamento_definido: Boolean(orcamento),
    orcamento_gasto_livre: orcamento ? emCentavos(orcamento.valor_total) : null,
    orcamento: orcamento ? emCentavos(orcamento.valor_total) : null,
    gasto_hoje: gastoHoje,
    // Tudo que ja pesa nesta fatura: comprometido do ciclo + gasto livre.
    fatura: {
      dia_fechamento: Number(janela.fim.slice(8, 10)),
      dia_vencimento: Number(janela.vencimento_fatura.slice(8, 10)),
      fecha_em: janela.fim,
      vence_em: janela.vencimento_fatura,
      dias_para_fechar: hojeNoCiclo ? ciclo.diffDias(agora, janela.fim) : null,
      total_ciclo: emCentavos(comp.total + gastoLivre),
      notificar: configRuntime.notificarFatura(),
    },
  };

  if (!renda.definida) {
    return {
      ...base,
      disponivel: null,
      percentual_consumido: null,
      ritmo_diario: null,
      ritmo_restante_hoje: null,
    };
  }

  const disponivel = emCentavos(renda.total - comp.total - gastoLivre);
  return {
    ...base,
    disponivel,
    // Consumido inclui o comprometido: ele ja saiu da renda, mesmo que o
    // usuario nao tenha "gastado" nada ainda no dia a dia.
    percentual_consumido: renda.total > 0
      ? emCentavos(((comp.total + gastoLivre) / renda.total) * 100)
      : null,
    // Quanto da para gastar por dia ate o fim do mes. Negativo quando o mes
    // ja estourou: o sinal e informacao, nao erro.
    ritmo_diario: diasRestantes > 0 ? emCentavos(disponivel / diasRestantes) : null,
    // Quanto ainda cabe hoje dentro do ritmo. Negativo quer dizer que o dia
    // estourou -- o sinal e a informacao, nao um erro a esconder.
    ritmo_restante_hoje: diasRestantes > 0
      ? emCentavos(disponivel / diasRestantes - gastoHoje)
      : null,
  };
}

// Resumo por categoria. Compromisso e gasto livre ficam em colunas separadas:
// somar os dois numa barra so esconde que a fatia comprometida nao e escolha
// do mes corrente.
function calcularResumo(mesBruto) {
  const mes = resolverMes(mesBruto);
  const saldo = calcularSaldo(mes);

  const janela = ciclo.janela(mes);
  const livrePorCategoria = new Map(
    stmtPorCategoria.all(janela.inicio, janela.fim).map((l) => [l.categoria, l]),
  );
  const compPorCategoria = compromissos.comprometidoPorCategoria(mes);
  const limites = new Map(stmtLimites.all(mes).map((l) => [l.categoria, l.valor_limite]));

  const totalGeral = emCentavos(saldo.gasto_livre + saldo.comprometido_total);
  const nomes = new Set([...livrePorCategoria.keys(), ...compPorCategoria.keys()]);

  const categorias = [...nomes].map((nome) => {
    const livre = livrePorCategoria.get(nome);
    const comp = compPorCategoria.get(nome);
    const gastoLivre = livre ? emCentavos(livre.total) : 0;
    const comprometido = comp ? emCentavos(comp.total) : 0;
    const total = emCentavos(gastoLivre + comprometido);
    const limite = limites.has(nome) ? emCentavos(limites.get(nome)) : null;

    return {
      categoria: nome,
      total,
      gasto_livre: gastoLivre,
      comprometido,
      quantidade_gastos: livre ? livre.quantidade : 0,
      quantidade_compromissos: comp ? comp.quantidade : 0,
      percentual_do_total: totalGeral > 0 ? emCentavos((total / totalGeral) * 100) : 0,
      limite,
      // O limite de categoria e um teto de gasto livre: comparar contra o
      // total puniria o usuario por uma conta fixa que ele nao escolheu.
      limite_estourado: limite !== null ? gastoLivre > limite : null,
    };
  }).sort((a, b) => b.total - a.total);

  const diasDecorridos = ciclo.diasDecorridos(mes);

  return {
    mes_referencia: mes,
    ciclo: janela,
    renda_definida: saldo.renda_definida,
    renda_total: saldo.renda_total,
    comprometido_total: saldo.comprometido_total,
    comprometido_contas_fixas: saldo.comprometido_contas_fixas,
    comprometido_parcelas: saldo.comprometido_parcelas,
    gasto_livre: saldo.gasto_livre,
    total_gasto: saldo.gasto_livre,
    total_geral: totalGeral,
    quantidade_gastos: saldo.quantidade_gastos,
    disponivel: saldo.disponivel,
    percentual_consumido: saldo.percentual_consumido,
    dias_considerados: diasDecorridos,
    dias_restantes: saldo.dias_restantes,
    ritmo_diario: saldo.ritmo_diario,
    // Media so do gasto livre: o comprometido nao acontece "por dia".
    media_diaria: diasDecorridos > 0 ? emCentavos(saldo.gasto_livre / diasDecorridos) : 0,
    orcamento_definido: saldo.orcamento_definido,
    orcamento: saldo.orcamento,
    categorias,
  };
}

// Teto opcional de gasto livre do mes. Nao substitui a renda.
function definirOrcamento(corpo) {
  const mes = corpo.mes_referencia;
  if (!mesValido(mes)) {
    throw new ErroApi(400, 'Campo "mes_referencia" e obrigatorio no formato YYYY-MM.');
  }
  const valor = normalizarValor(corpo.valor_total);
  if (valor === null || valor < 0) {
    throw new ErroApi(400, 'Campo "valor_total" deve ser um numero maior ou igual a zero.');
  }
  stmtUpsertOrcamento.run({ mes, valor: emCentavos(valor) });
  return calcularSaldo(mes);
}

// Cria ou substitui o limite de uma categoria em um mes.
function definirLimiteCategoria(corpo) {
  const mes = corpo.mes_referencia;
  if (!mesValido(mes)) {
    throw new ErroApi(400, 'Campo "mes_referencia" e obrigatorio no formato YYYY-MM.');
  }
  if (!CATEGORIAS.includes(corpo.categoria)) {
    throw new ErroApi(400, `Categoria invalida. Use uma de: ${CATEGORIAS.join(', ')}.`);
  }
  const valor = normalizarValor(corpo.valor_limite);
  if (valor === null || valor < 0) {
    throw new ErroApi(400, 'Campo "valor_limite" deve ser um numero maior ou igual a zero.');
  }
  stmtUpsertLimite.run({ categoria: corpo.categoria, mes, valor: emCentavos(valor) });
  return { categoria: corpo.categoria, mes_referencia: mes, valor_limite: emCentavos(valor) };
}

module.exports = { calcularSaldo, calcularResumo, definirOrcamento, definirLimiteCategoria, resolverMes };
