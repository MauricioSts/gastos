// Renda, contas fixas e parcelamentos.
//
// Regra central do projeto: comprometido != gasto. Contas fixas e parcelas em
// aberto sao obrigacoes ja travadas antes do mes comecar, entao saem da renda
// junto com o gasto livre para formar o disponivel de fato.
//
// Parcelas nunca sao materializadas no banco. Quais parcelas incidem em um mes
// e sempre calculado a partir de (mes_inicio, parcela_inicial, total_parcelas),
// de forma que corrigir o cadastro recalcula o historico inteiro e a parcela
// para de contar sozinha quando acaba.
const db = require('../db');
const { agoraIso, mesValido, mesSomar, diffMeses } = require('../utils/data');
const {
  ErroApi, LIMITE_DESCRICAO, limparTexto, normalizarValor,
  emCentavos, categoriaValida, CATEGORIAS,
} = require('../utils/validacao');

// --------------------------------------------------------------------------
// Validacao compartilhada
// --------------------------------------------------------------------------

function exigirMes(mes, campo = 'mes_referencia') {
  if (!mesValido(mes)) {
    throw new ErroApi(400, `Campo "${campo}" e obrigatorio no formato YYYY-MM.`);
  }
  return mes;
}

function exigirValor(bruto, campo) {
  const valor = normalizarValor(bruto);
  if (valor === null || valor <= 0) {
    throw new ErroApi(400, `Campo "${campo}" deve ser um numero maior que zero.`);
  }
  return emCentavos(valor);
}

function exigirDescricao(bruto) {
  const texto = limparTexto(bruto, LIMITE_DESCRICAO);
  if (!texto) throw new ErroApi(400, 'Campo "descricao" e obrigatorio.');
  return texto;
}

function exigirCategoria(bruto) {
  if (!categoriaValida(bruto)) {
    throw new ErroApi(400, `Categoria invalida. Use uma de: ${CATEGORIAS.join(', ')}.`);
  }
  return bruto;
}

function exigirInteiro(bruto, campo, min, max) {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErroApi(400, `Campo "${campo}" deve ser um inteiro entre ${min} e ${max}.`);
  }
  return n;
}

// Aplica um UPDATE apenas com as colunas presentes em `campos`.
// Os nomes de coluna vem sempre de lista fechada no chamador, nunca do input.
function aplicarUpdate(tabela, id, campos) {
  const chaves = Object.keys(campos);
  if (!chaves.length) {
    throw new ErroApi(400, 'Informe ao menos um campo para atualizar.');
  }
  const set = chaves.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE ${tabela} SET ${set} WHERE id = @id`).run({ ...campos, id });
}

function buscarOu404(tabela, rotulo, id) {
  const linha = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
  if (!linha) throw new ErroApi(404, `${rotulo} ${id} nao encontrado.`);
  return linha;
}

// --------------------------------------------------------------------------
// Rendas
// --------------------------------------------------------------------------

const stmtRendasDoMes = db.prepare(
  'SELECT * FROM rendas WHERE mes_referencia = ? ORDER BY valor DESC, id ASC',
);
const stmtInserirRenda = db.prepare(`
  INSERT INTO rendas (mes_referencia, descricao, valor, criado_em)
  VALUES (@mes_referencia, @descricao, @valor, @criado_em)
`);

function listarRendas(mes) {
  return stmtRendasDoMes.all(exigirMes(mes));
}

// Soma da renda do mes. Sem nenhuma entrada, `definida` fica false e o saldo
// nao assume zero: sem renda o disponivel nao significa nada.
function totalRenda(mes) {
  const linhas = stmtRendasDoMes.all(mes);
  const total = linhas.reduce((acc, l) => acc + l.valor, 0);
  return { total: emCentavos(total), definida: linhas.length > 0, entradas: linhas };
}

function criarRenda(corpo) {
  const dados = {
    mes_referencia: exigirMes(corpo.mes_referencia),
    descricao: exigirDescricao(corpo.descricao),
    valor: exigirValor(corpo.valor, 'valor'),
    criado_em: agoraIso(),
  };
  const info = stmtInserirRenda.run(dados);
  return buscarOu404('rendas', 'Renda', info.lastInsertRowid);
}

function atualizarRenda(id, corpo) {
  buscarOu404('rendas', 'Renda', id);
  const campos = {};
  if (corpo.mes_referencia !== undefined) campos.mes_referencia = exigirMes(corpo.mes_referencia);
  if (corpo.descricao !== undefined) campos.descricao = exigirDescricao(corpo.descricao);
  if (corpo.valor !== undefined) campos.valor = exigirValor(corpo.valor, 'valor');
  aplicarUpdate('rendas', id, campos);
  return buscarOu404('rendas', 'Renda', id);
}

function removerRenda(id) {
  const renda = buscarOu404('rendas', 'Renda', id);
  db.prepare('DELETE FROM rendas WHERE id = ?').run(id);
  return renda;
}

// --------------------------------------------------------------------------
// Contas fixas
// --------------------------------------------------------------------------

const stmtInserirContaFixa = db.prepare(`
  INSERT INTO contas_fixas (descricao, valor, dia_vencimento, categoria, ativa, criado_em)
  VALUES (@descricao, @valor, @dia_vencimento, @categoria, @ativa, @criado_em)
`);

function listarContasFixas({ incluirInativas = false } = {}) {
  const onde = incluirInativas ? '' : 'WHERE ativa = 1';
  return db.prepare(
    `SELECT * FROM contas_fixas ${onde} ORDER BY dia_vencimento ASC, id ASC`,
  ).all();
}

function criarContaFixa(corpo) {
  const dados = {
    descricao: exigirDescricao(corpo.descricao),
    valor: exigirValor(corpo.valor, 'valor'),
    dia_vencimento: exigirInteiro(corpo.dia_vencimento, 'dia_vencimento', 1, 31),
    categoria: exigirCategoria(corpo.categoria),
    ativa: corpo.ativa === false || corpo.ativa === 0 ? 0 : 1,
    criado_em: agoraIso(),
  };
  const info = stmtInserirContaFixa.run(dados);
  return buscarOu404('contas_fixas', 'Conta fixa', info.lastInsertRowid);
}

function atualizarContaFixa(id, corpo) {
  buscarOu404('contas_fixas', 'Conta fixa', id);
  const campos = {};
  if (corpo.descricao !== undefined) campos.descricao = exigirDescricao(corpo.descricao);
  if (corpo.valor !== undefined) campos.valor = exigirValor(corpo.valor, 'valor');
  if (corpo.dia_vencimento !== undefined) {
    campos.dia_vencimento = exigirInteiro(corpo.dia_vencimento, 'dia_vencimento', 1, 31);
  }
  if (corpo.categoria !== undefined) campos.categoria = exigirCategoria(corpo.categoria);
  if (corpo.ativa !== undefined) {
    if (typeof corpo.ativa !== 'boolean' && corpo.ativa !== 0 && corpo.ativa !== 1) {
      throw new ErroApi(400, 'Campo "ativa" deve ser true ou false.');
    }
    campos.ativa = corpo.ativa === true || corpo.ativa === 1 ? 1 : 0;
  }
  aplicarUpdate('contas_fixas', id, campos);
  return buscarOu404('contas_fixas', 'Conta fixa', id);
}

function removerContaFixa(id) {
  const conta = buscarOu404('contas_fixas', 'Conta fixa', id);
  db.prepare('DELETE FROM contas_fixas WHERE id = ?').run(id);
  return conta;
}

// --------------------------------------------------------------------------
// Parcelamentos
// --------------------------------------------------------------------------

const stmtInserirParcelamento = db.prepare(`
  INSERT INTO parcelamentos
    (descricao, valor_parcela, total_parcelas, parcela_inicial, mes_inicio, categoria, criado_em)
  VALUES
    (@descricao, @valor_parcela, @total_parcelas, @parcela_inicial, @mes_inicio, @categoria, @criado_em)
`);
const stmtTodosParcelamentos = db.prepare(
  'SELECT * FROM parcelamentos ORDER BY mes_inicio ASC, id ASC',
);

// Mes da ultima parcela. Derivado, nunca gravado: se o cadastro mudar,
// o fim muda junto.
function mesFinal(p) {
  return mesSomar(p.mes_inicio, p.total_parcelas - p.parcela_inicial);
}

// Como um parcelamento se comporta em um mes especifico.
// `incide` false = ou o mes e anterior ao cadastro, ou as parcelas ja acabaram.
function situacaoNoMes(p, mes) {
  const deslocamento = diffMeses(p.mes_inicio, mes);
  const parcelaAtual = p.parcela_inicial + deslocamento;
  return {
    parcela_atual: parcelaAtual,
    incide: deslocamento >= 0 && parcelaAtual <= p.total_parcelas,
    mes_fim: mesFinal(p),
    parcelas_restantes: Math.max(0, p.total_parcelas - parcelaAtual),
  };
}

// Lista com os campos derivados resolvidos para um mes de referencia.
function listarParcelamentos(mesBruto) {
  const mes = mesBruto === undefined ? undefined : exigirMes(mesBruto, 'mes');
  return stmtTodosParcelamentos.all().map((p) => {
    const base = { ...p, mes_fim: mesFinal(p) };
    if (!mes) return base;
    const s = situacaoNoMes(p, mes);
    return {
      ...base,
      mes_referencia: mes,
      parcela_atual: s.incide ? s.parcela_atual : null,
      parcelas_restantes: s.parcelas_restantes,
      incide_no_mes: s.incide,
      quitado: diffMeses(p.mes_inicio, mes) >= 0 && s.parcela_atual > p.total_parcelas,
    };
  });
}

function criarParcelamento(corpo) {
  const totalParcelas = exigirInteiro(corpo.total_parcelas, 'total_parcelas', 1, 480);
  const parcelaInicial = exigirInteiro(corpo.parcela_inicial ?? 1, 'parcela_inicial', 1, 480);
  if (parcelaInicial > totalParcelas) {
    throw new ErroApi(400, 'Campo "parcela_inicial" nao pode ser maior que "total_parcelas".');
  }

  // Aceita cadastro pelo valor total da compra: o backend divide.
  let valorParcela;
  if (corpo.valor_parcela !== undefined && corpo.valor_parcela !== null && corpo.valor_parcela !== '') {
    valorParcela = exigirValor(corpo.valor_parcela, 'valor_parcela');
  } else if (corpo.valor_total !== undefined) {
    valorParcela = emCentavos(exigirValor(corpo.valor_total, 'valor_total') / totalParcelas);
  } else {
    throw new ErroApi(400, 'Informe "valor_parcela" ou "valor_total".');
  }

  const dados = {
    descricao: exigirDescricao(corpo.descricao),
    valor_parcela: valorParcela,
    total_parcelas: totalParcelas,
    parcela_inicial: parcelaInicial,
    mes_inicio: exigirMes(corpo.mes_inicio, 'mes_inicio'),
    categoria: exigirCategoria(corpo.categoria),
    criado_em: agoraIso(),
  };
  const info = stmtInserirParcelamento.run(dados);
  const criado = buscarOu404('parcelamentos', 'Parcelamento', info.lastInsertRowid);
  return { ...criado, mes_fim: mesFinal(criado) };
}

function atualizarParcelamento(id, corpo) {
  const atual = buscarOu404('parcelamentos', 'Parcelamento', id);
  const campos = {};

  if (corpo.descricao !== undefined) campos.descricao = exigirDescricao(corpo.descricao);
  if (corpo.categoria !== undefined) campos.categoria = exigirCategoria(corpo.categoria);
  if (corpo.mes_inicio !== undefined) campos.mes_inicio = exigirMes(corpo.mes_inicio, 'mes_inicio');
  if (corpo.total_parcelas !== undefined) {
    campos.total_parcelas = exigirInteiro(corpo.total_parcelas, 'total_parcelas', 1, 480);
  }
  if (corpo.parcela_inicial !== undefined) {
    campos.parcela_inicial = exigirInteiro(corpo.parcela_inicial, 'parcela_inicial', 1, 480);
  }
  if (corpo.valor_parcela !== undefined) {
    campos.valor_parcela = exigirValor(corpo.valor_parcela, 'valor_parcela');
  } else if (corpo.valor_total !== undefined) {
    const total = campos.total_parcelas ?? atual.total_parcelas;
    campos.valor_parcela = emCentavos(exigirValor(corpo.valor_total, 'valor_total') / total);
  }

  // A checagem roda contra o estado final, nao so contra o que veio no corpo.
  const totalFinal = campos.total_parcelas ?? atual.total_parcelas;
  const inicialFinal = campos.parcela_inicial ?? atual.parcela_inicial;
  if (inicialFinal > totalFinal) {
    throw new ErroApi(400, 'Campo "parcela_inicial" nao pode ser maior que "total_parcelas".');
  }

  aplicarUpdate('parcelamentos', id, campos);
  const novo = buscarOu404('parcelamentos', 'Parcelamento', id);
  return { ...novo, mes_fim: mesFinal(novo) };
}

function removerParcelamento(id) {
  const p = buscarOu404('parcelamentos', 'Parcelamento', id);
  db.prepare('DELETE FROM parcelamentos WHERE id = ?').run(id);
  return { ...p, mes_fim: mesFinal(p) };
}

// --------------------------------------------------------------------------
// Compromissos resolvidos de um mes
// --------------------------------------------------------------------------

// Contas fixas ativas + parcelas que realmente incidem no mes pedido.
// E daqui que sai o `comprometido` do saldo, do resumo e da projecao.
function compromissosDoMes(mes) {
  const contas = listarContasFixas().map((c) => ({
    id: c.id,
    tipo: 'conta_fixa',
    descricao: c.descricao,
    valor: emCentavos(c.valor),
    dia_vencimento: c.dia_vencimento,
    categoria: c.categoria,
  }));

  const parcelas = [];
  for (const p of stmtTodosParcelamentos.all()) {
    const s = situacaoNoMes(p, mes);
    if (!s.incide) continue;
    parcelas.push({
      id: p.id,
      tipo: 'parcelamento',
      descricao: p.descricao,
      valor: emCentavos(p.valor_parcela),
      categoria: p.categoria,
      parcela_atual: s.parcela_atual,
      total_parcelas: p.total_parcelas,
      parcelas_restantes: s.parcelas_restantes,
      mes_fim: s.mes_fim,
      // Ultima parcela: e o mes em que o comprometido cai.
      ultima_parcela: s.parcela_atual === p.total_parcelas,
    });
  }

  const totalContas = emCentavos(contas.reduce((a, c) => a + c.valor, 0));
  const totalParcelas = emCentavos(parcelas.reduce((a, p) => a + p.valor, 0));

  return {
    mes_referencia: mes,
    contas_fixas: contas,
    parcelamentos: parcelas,
    total_contas_fixas: totalContas,
    total_parcelas: totalParcelas,
    total: emCentavos(totalContas + totalParcelas),
  };
}

// Agrega o comprometido do mes por categoria (para o resumo separar
// compromisso de gasto livre em vez de somar tudo numa barra so).
function comprometidoPorCategoria(mes) {
  const { contas_fixas: contas, parcelamentos: parcelas } = compromissosDoMes(mes);
  const mapa = new Map();
  for (const item of [...contas, ...parcelas]) {
    const atual = mapa.get(item.categoria) || { total: 0, quantidade: 0 };
    mapa.set(item.categoria, {
      total: atual.total + item.valor,
      quantidade: atual.quantidade + 1,
    });
  }
  return mapa;
}

// --------------------------------------------------------------------------
// Projecao
// --------------------------------------------------------------------------

// Comprometido projetado dos proximos N meses, comecando no mes informado.
// Marca os meses em que um parcelamento termina: e o alivio que o usuario
// quer antecipar.
function projetar({ mes, meses }) {
  const linhas = [];
  for (let i = 0; i < meses; i += 1) {
    const m = mesSomar(mes, i);
    const comp = compromissosDoMes(m);
    const renda = totalRenda(m);
    // Sem renda cadastrada para um mes futuro, repete a do mes base para a
    // projecao nao virar uma linha vazia; a flag diz que foi estimativa.
    const rendaBase = renda.definida ? renda : totalRenda(mes);

    linhas.push({
      mes_referencia: m,
      comprometido_total: comp.total,
      comprometido_contas_fixas: comp.total_contas_fixas,
      comprometido_parcelas: comp.total_parcelas,
      renda_total: rendaBase.definida ? rendaBase.total : null,
      renda_estimada: !renda.definida && rendaBase.definida,
      sobra_projetada: rendaBase.definida ? emCentavos(rendaBase.total - comp.total) : null,
      // Parcelamentos cuja ultima parcela cai neste mes.
      parcelamentos_terminando: comp.parcelamentos
        .filter((p) => p.ultima_parcela)
        .map((p) => ({ id: p.id, descricao: p.descricao, valor: p.valor })),
      quantidade_parcelamentos: comp.parcelamentos.length,
    });
  }

  // Quanto o comprometido cai de um mes para o seguinte.
  for (let i = 0; i < linhas.length - 1; i += 1) {
    linhas[i].queda_no_mes_seguinte = emCentavos(
      linhas[i].comprometido_total - linhas[i + 1].comprometido_total,
    );
  }

  return { mes_inicial: mes, meses, projecao: linhas };
}

module.exports = {
  listarRendas, totalRenda, criarRenda, atualizarRenda, removerRenda,
  listarContasFixas, criarContaFixa, atualizarContaFixa, removerContaFixa,
  listarParcelamentos, criarParcelamento, atualizarParcelamento, removerParcelamento,
  compromissosDoMes, comprometidoPorCategoria, situacaoNoMes, mesFinal, projetar,
};
