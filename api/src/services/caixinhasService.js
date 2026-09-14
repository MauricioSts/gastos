// Caixinhas: divisao da sobra do ciclo entre objetivos.
//
// Nada aqui move dinheiro. O dinheiro fisico fica todo numa unica Caixinha
// Turbo do Nubank; as caixinhas do app sao etiquetas sobre esse saldo, para a
// pessoa saber quanto dele e reserva e quanto e viagem. Por isso o unico teto
// fisico que importa e o da Caixinha Turbo, e ele vale para a SOMA das caixas.
//
// A sobra dividida e a de um ciclo FECHADO. Dividir o ciclo aberto gravaria
// hoje uma sobra que o gasto dos proximos dias ainda vai comer, e as caixas
// passariam a guardar dinheiro que nao existe.
const db = require('../db');
const config = require('../config');
const ciclo = require('../utils/ciclo');
const { hoje, mesValido, mesSomar, agoraIso } = require('../utils/data');
const { ErroApi, normalizarValor, emCentavos, limparTexto } = require('../utils/validacao');
const { calcularSaldo } = require('./saldoService');
const configRuntime = require('./configService');

// Fatia da sobra que vai para a reserva. Abaixo da meta a regra pede 70-80%:
// fica no meio. Com a meta batida, 20% so cobre a flutuacao das despesas.
const PCT_RESERVA_ABAIXO_DA_META = 75;
const PCT_RESERVA_NA_META = 20;
// Quantos ciclos fechados entram na media de despesas da meta da reserva.
const CICLOS_NA_MEDIA = 6;
const MULTIPLICADOR_MIN = 1;
const MULTIPLICADOR_MAX = 6;
const LIMITE_NOME = 60;
const ALOCACOES_NO_RESUMO = 12;

const stmtObjetivos = db.prepare('SELECT * FROM objetivos ORDER BY e_reserva DESC, id ASC');
const stmtObjetivo = db.prepare('SELECT * FROM objetivos WHERE id = ?');
const stmtInserirObjetivo = db.prepare(`
  INSERT INTO objetivos (nome, valor_meta, saldo_atual, peso, e_reserva, criado_em)
  VALUES (@nome, @valor_meta, @saldo_atual, @peso, 0, @criado_em)
`);
const stmtSomarSaldo = db.prepare('UPDATE objetivos SET saldo_atual = ROUND(saldo_atual + ?, 2) WHERE id = ?');
const stmtRemoverObjetivo = db.prepare('DELETE FROM objetivos WHERE id = ?');
const stmtTotalGuardado = db.prepare('SELECT COALESCE(SUM(saldo_atual), 0) AS total FROM objetivos');
const stmtAlocacao = db.prepare('SELECT * FROM alocacoes_mensais WHERE mes_referencia = ?');
const stmtAlocacoes = db.prepare('SELECT * FROM alocacoes_mensais ORDER BY mes_referencia DESC LIMIT ?');
const stmtDivisoes = db.prepare('SELECT * FROM alocacao_divisoes WHERE alocacao_id = ? ORDER BY id');
const stmtInserirAlocacao = db.prepare(
  'INSERT INTO alocacoes_mensais (mes_referencia, total_sobra, criado_em) VALUES (?, ?, ?)',
);
const stmtInserirDivisao = db.prepare(`
  INSERT INTO alocacao_divisoes (alocacao_id, objetivo_id, objetivo_nome, percentual, valor)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtRemoverAlocacao = db.prepare('DELETE FROM alocacoes_mensais WHERE id = ?');

// --------------------------------------------------------------------------
// Meta da reserva
// --------------------------------------------------------------------------

// Despesa media por ciclo: comprometido + gasto livre. Entram so ciclos
// fechados com renda lancada -- ciclo sem renda e anterior ao uso do app e
// entraria como despesa zero, puxando a meta para baixo.
//
// Sem nenhum ciclo fechado (app novo), a base e o ciclo aberto com o gasto
// livre projetado pelo ritmo ate agora, e `base` avisa que e estimativa.
function despesaMedia() {
  const atual = ciclo.cicloAtual();
  const despesas = [];
  for (let i = 1; i <= CICLOS_NA_MEDIA; i += 1) {
    const s = calcularSaldo(mesSomar(atual, -i));
    if (s.renda_definida) despesas.push(s.comprometido_total + s.gasto_livre);
  }
  if (despesas.length) {
    return {
      valor: emCentavos(despesas.reduce((a, d) => a + d, 0) / despesas.length),
      base: 'ciclos_fechados',
      ciclos_considerados: despesas.length,
    };
  }

  const s = calcularSaldo(atual);
  const decorridos = ciclo.diasDecorridos(atual);
  const gastoProjetado = decorridos > 0 ? (s.gasto_livre / decorridos) * s.ciclo.dias_no_ciclo : 0;
  const valor = emCentavos(s.comprometido_total + gastoProjetado);
  return { valor, base: valor > 0 ? 'estimativa_ciclo_aberto' : 'sem_dados', ciclos_considerados: 0 };
}

function multiplicadorReserva() {
  return configRuntime.ler('reserva_multiplicador');
}

// Objetivos com a meta efetiva ja resolvida. A da reserva e calculada; sem
// despesa conhecida ela fica null, e null conta como "abaixo da meta" -- a
// alternativa seria tratar a reserva como cheia justamente quando nao se sabe.
function objetivosComMeta() {
  const media = despesaMedia();
  const multiplicador = multiplicadorReserva();
  const metaReserva = media.valor > 0 ? emCentavos(media.valor * multiplicador) : null;
  const objetivos = stmtObjetivos.all().map((o) => ({
    ...o,
    e_reserva: o.e_reserva === 1,
    meta: o.e_reserva === 1 ? metaReserva : o.valor_meta,
  }));
  return { objetivos, reserva: { multiplicador, despesa_media: media, meta: metaReserva } };
}

// --------------------------------------------------------------------------
// Regra de divisao (pura: recebe objetivos, devolve centavos)
// --------------------------------------------------------------------------

function faltaEmCentavos(o) {
  if (o.meta == null) return Infinity;
  return Math.max(0, Math.round((o.meta - o.saldo_atual) * 100));
}

// Reparte `total` centavos na proporcao dos pesos sem perder nem criar
// centavo: arredonda todos para baixo e entrega o que sobrou a quem tinha a
// maior fracao (metodo do maior resto). Empate vai para quem vem primeiro.
function repartirCentavos(total, pesos) {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (total <= 0 || soma <= 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * p) / soma);
  const partes = brutos.map(Math.floor);
  let resto = total - partes.reduce((a, p) => a + p, 0);
  const ordem = brutos
    .map((b, i) => [b - Math.floor(b), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; resto > 0; k += 1, resto -= 1) partes[ordem[k % ordem.length][1]] += 1;
  return partes;
}

// Peso de cada objetivo na parte que nao e da reserva. Ninguem com peso:
// divide igual. Alguns com peso: quem nao tem entra com a media dos que tem,
// para um objetivo novo nao ficar de fora so por nao ter sido configurado.
function pesosEfetivos(objetivos) {
  const definidos = objetivos.map((o) => o.peso).filter((p) => p != null);
  if (!definidos.length || definidos.every((p) => p === 0)) return objetivos.map(() => 1);
  const media = definidos.reduce((a, p) => a + p, 0) / definidos.length;
  const pesos = objetivos.map((o) => (o.peso == null ? media : o.peso));
  return pesos.some((p) => p > 0) ? pesos : objetivos.map(() => 1);
}

// Divide `valor` entre os objetivos. Devolve centavos por objetivo e a regra
// aplicada, para a tela poder dizer por que a sugestao e aquela.
//
//   reserva abaixo da meta -> 75% reserva, 25% demais objetivos
//   reserva na meta        -> 20% reserva (manutencao), 80% demais objetivos
//   nenhum outro objetivo  -> 100% reserva
//
// Dois ajustes sobre a regra seca, ambos para nao guardar dinheiro onde ele
// nao cabe: a reserva abaixo da meta recebe no maximo o que falta para batê-la
// (nunca menos que a fatia de manutencao), e objetivo com meta nao passa da
// meta -- o excedente vai para os outros e, por ultimo, volta para a reserva.
function dividir(valor, objetivos) {
  const total = Math.round(valor * 100);
  const reserva = objetivos.find((o) => o.e_reserva);
  const abertos = objetivos.filter((o) => !o.e_reserva && faltaEmCentavos(o) > 0);
  const centavos = new Map(objetivos.map((o) => [o.id, 0]));

  let regra;
  let paraReserva;
  if (!abertos.length) {
    regra = 'so_reserva';
    paraReserva = total;
  } else if (faltaEmCentavos(reserva) > 0) {
    regra = 'reserva_abaixo_da_meta';
    paraReserva = Math.min(
      Math.round((total * PCT_RESERVA_ABAIXO_DA_META) / 100),
      Math.max(faltaEmCentavos(reserva), Math.round((total * PCT_RESERVA_NA_META) / 100)),
    );
  } else {
    regra = 'reserva_na_meta';
    paraReserva = Math.round((total * PCT_RESERVA_NA_META) / 100);
  }

  // Enche os objetivos em rodadas: quem bateria a meta recebe so o que falta,
  // sai da rodada, e o resto e repartido de novo entre os que sobraram.
  let restante = total - paraReserva;
  let rodada = abertos;
  while (restante > 0 && rodada.length) {
    const partes = repartirCentavos(restante, pesosEfetivos(rodada));
    const cheios = rodada.filter((o, i) => partes[i] >= faltaEmCentavos(o));
    if (!cheios.length) {
      rodada.forEach((o, i) => centavos.set(o.id, partes[i]));
      restante = 0;
      break;
    }
    for (const o of cheios) {
      centavos.set(o.id, faltaEmCentavos(o));
      restante -= faltaEmCentavos(o);
    }
    rodada = rodada.filter((o) => !cheios.includes(o));
  }
  centavos.set(reserva.id, paraReserva + restante);

  return { regra, total, centavos };
}

// Percentuais com duas casas que somam exatamente 100. A diferenca do
// arredondamento vai para a maior fatia, onde ela e menos visivel.
function percentuaisDe(total, lista) {
  if (total <= 0) return lista.map(() => 0);
  const pcts = lista.map((c) => Math.round((c / total) * 10000) / 100);
  const diferenca = Math.round((100 - pcts.reduce((a, p) => a + p, 0)) * 100) / 100;
  if (diferenca !== 0) {
    const maior = lista.indexOf(Math.max(...lista));
    pcts[maior] = Math.round((pcts[maior] + diferenca) * 100) / 100;
  }
  return pcts;
}

// --------------------------------------------------------------------------
// Sobra do ciclo
// --------------------------------------------------------------------------

function cicloFechado(mes) {
  return ciclo.janela(mes).fim < hoje();
}

// A sobra de um ciclo e o disponivel de fato dele: renda - comprometido -
// gasto livre. Sem renda o numero nao existe (null), igual ao saldo.
function sobraDoCiclo(mes) {
  return calcularSaldo(mes).disponivel;
}

// O que a tela precisa para o botao "Dividir sobra do mes": o ultimo ciclo
// fechado (e se ja foi dividido) e a previsao do ciclo aberto, que so libera
// no dia seguinte ao fechamento.
function situacaoDaSobra() {
  const atual = ciclo.cicloAtual();
  const fechado = mesSomar(atual, -1);
  const saldoFechado = calcularSaldo(fechado);
  const dividida = Boolean(stmtAlocacao.get(fechado));
  const janelaAberta = ciclo.janela(atual);
  return {
    mes_referencia: fechado,
    ciclo: saldoFechado.ciclo,
    renda_definida: saldoFechado.renda_definida,
    sobra: saldoFechado.disponivel,
    dividida,
    pode_dividir: !dividida && saldoFechado.disponivel !== null && saldoFechado.disponivel > 0,
    ciclo_aberto: {
      mes_referencia: atual,
      fecha_em: janelaAberta.fim,
      libera_em: ciclo.somarDias(janelaAberta.fim, 1),
      previsao: calcularSaldo(atual).disponivel,
    },
  };
}

// --------------------------------------------------------------------------
// Funcoes publicas
// --------------------------------------------------------------------------

// Sugestao de divisao de um valor. Nao grava nada: serve tanto para a sobra
// real de um ciclo fechado quanto para simular a previsao do ciclo aberto.
function calcularSugestaoDivisao(valorSobra) {
  const valor = normalizarValor(valorSobra);
  if (valor === null || valor <= 0) {
    throw new ErroApi(400, 'O valor da sobra deve ser um numero maior que zero.');
  }
  const { objetivos, reserva } = objetivosComMeta();
  const { regra, total, centavos } = dividir(emCentavos(valor), objetivos);
  const lista = objetivos.map((o) => centavos.get(o.id));
  const pcts = percentuaisDe(total, lista);

  return {
    valor: emCentavos(valor),
    regra,
    reserva,
    divisao: objetivos.map((o, i) => ({
      objetivo_id: o.id,
      nome: o.nome,
      e_reserva: o.e_reserva,
      percentual: pcts[i],
      valor: lista[i] / 100,
    })),
  };
}

// Grava a divisao da sobra de um ciclo fechado e soma cada parte no saldo do
// objetivo. Cada item traz `valor` (exato) ou `percentual`; o total e sempre a
// sobra calculada aqui, nunca um total vindo da tela.
function confirmarDivisao(mes, divisaoFinal) {
  if (!mesValido(mes)) {
    throw new ErroApi(400, 'Campo "mes_referencia" e obrigatorio no formato YYYY-MM.');
  }
  if (!cicloFechado(mes)) {
    const libera = ciclo.somarDias(ciclo.janela(mes).fim, 1);
    throw new ErroApi(409, `O ciclo ${mes} ainda nao fechou. A sobra so pode ser dividida a partir de ${libera}.`);
  }
  if (stmtAlocacao.get(mes)) {
    throw new ErroApi(409, `A sobra do ciclo ${mes} ja foi dividida. Desfaca a divisao antes de refazer.`);
  }

  const sobra = sobraDoCiclo(mes);
  if (sobra === null) throw new ErroApi(422, `O ciclo ${mes} nao tem renda lancada, entao nao ha sobra calculavel.`);
  if (sobra <= 0) throw new ErroApi(422, `O ciclo ${mes} nao teve sobra para dividir.`);

  if (!Array.isArray(divisaoFinal) || !divisaoFinal.length) {
    throw new ErroApi(400, 'Campo "divisao" deve ser uma lista de { objetivo_id, percentual }.');
  }

  const vistos = new Set();
  const itens = divisaoFinal.map((item) => {
    const id = Number(item && item.objetivo_id);
    const objetivo = Number.isInteger(id) ? stmtObjetivo.get(id) : null;
    if (!objetivo) throw new ErroApi(400, `Objetivo ${item && item.objetivo_id} nao existe.`);
    if (vistos.has(id)) throw new ErroApi(400, `Objetivo ${id} aparece mais de uma vez na divisao.`);
    vistos.add(id);
    if (item.valor !== undefined) {
      const valor = normalizarValor(item.valor);
      if (valor === null || valor < 0) {
        throw new ErroApi(400, `Valor do objetivo "${objetivo.nome}" deve ser maior ou igual a zero.`);
      }
      return { objetivo, centavos: Math.round(valor * 100) };
    }
    const percentual = normalizarValor(item.percentual);
    if (percentual === null || percentual < 0 || percentual > 100) {
      throw new ErroApi(400, `Percentual do objetivo "${objetivo.nome}" deve estar entre 0 e 100.`);
    }
    return { objetivo, percentual };
  });

  const total = Math.round(sobra * 100);
  const comValor = itens.filter((i) => i.centavos !== undefined).length;
  if (comValor && comValor !== itens.length) {
    throw new ErroApi(400, 'Mande "valor" em todos os itens da divisao ou em nenhum.');
  }

  let centavos;
  let percentuais;
  if (comValor) {
    // Valor exato e o caminho da tela: percentual com duas casas perde
    // precisao (0,01% de 1.500 sao 15 centavos) e a reserva que a sugestao
    // fechava em 1.000 seria gravada com 999,90. A soma tem de bater com a
    // sobra ao centavo -- se um gasto do ciclo mudou depois da sugestao, a
    // tela precisa pedir outra em vez de gravar a conta velha.
    centavos = itens.map((i) => i.centavos);
    const soma = centavos.reduce((a, c) => a + c, 0);
    if (soma !== total) {
      throw new ErroApi(400, `Os valores somam ${soma / 100}, mas a sobra do ciclo ${mes} e ${sobra}. Peca uma nova sugestao.`, { sobra });
    }
    percentuais = percentuaisDe(total, centavos);
  } else {
    const soma = itens.reduce((a, i) => a + i.percentual, 0);
    // Folga de 0,05 ponto: com duas casas, 3 x 33,33 da 99,99.
    if (Math.abs(soma - 100) > 0.05) {
      throw new ErroApi(400, `Os percentuais somam ${emCentavos(soma)}%. A divisao precisa fechar 100%.`);
    }
    centavos = repartirCentavos(total, itens.map((i) => i.percentual));
    percentuais = itens.map((i) => i.percentual);
  }

  const gravar = db.transaction(() => {
    const { lastInsertRowid } = stmtInserirAlocacao.run(mes, sobra, agoraIso());
    itens.forEach((item, i) => {
      if (centavos[i] === 0) return;
      stmtInserirDivisao.run(
        lastInsertRowid, item.objetivo.id, item.objetivo.nome, percentuais[i], centavos[i] / 100,
      );
      stmtSomarSaldo.run(centavos[i] / 100, item.objetivo.id);
    });
  });
  gravar();

  return { alocacao: detalharAlocacao(stmtAlocacao.get(mes)), resumo: getResumoCaixas() };
}

// Desfaz a divisao de um ciclo: tira de cada objetivo o que ele recebeu.
// Recusa se algum saldo ficaria negativo (a pessoa ja baixou o saldo a mao):
// zerar em silencio esconderia que os numeros nao batem mais.
function desfazerDivisao(mes) {
  if (!mesValido(mes)) throw new ErroApi(400, 'O mes deve estar no formato YYYY-MM.');
  const alocacao = stmtAlocacao.get(mes);
  if (!alocacao) throw new ErroApi(404, `Nenhuma divisao registrada para o ciclo ${mes}.`);

  const divisoes = stmtDivisoes.all(alocacao.id);
  for (const d of divisoes) {
    if (d.objetivo_id === null) continue; // objetivo apagado: saldo dele ja era zero
    const objetivo = stmtObjetivo.get(d.objetivo_id);
    if (Math.round(objetivo.saldo_atual * 100) < Math.round(d.valor * 100)) {
      throw new ErroApi(409, `"${objetivo.nome}" tem ${objetivo.saldo_atual} guardado, menos que os ${d.valor} desta divisao. Ajuste o saldo antes de desfazer.`);
    }
  }

  db.transaction(() => {
    for (const d of divisoes) {
      if (d.objetivo_id !== null) stmtSomarSaldo.run(-d.valor, d.objetivo_id);
    }
    stmtRemoverAlocacao.run(alocacao.id);
  })();

  return { removido: true, mes_referencia: mes, resumo: getResumoCaixas() };
}

// Teto fisico: a soma de TODAS as caixas mora numa Caixinha Turbo so.
function verificarLimiteCaixinhaTurbo() {
  const { limite, alerta, rendimentoCdi, rendimentoExcedenteCdi } = config.caixinhaTurbo;
  const total = emCentavos(stmtTotalGuardado.get().total);
  const gatilho = emCentavos(limite * alerta);
  return {
    total_guardado: total,
    limite,
    gatilho_alerta: gatilho,
    percentual_do_limite: limite > 0 ? emCentavos((total / limite) * 100) : null,
    perto_do_limite: total > gatilho,
    acima_do_limite: total > limite,
    folga_ate_limite: emCentavos(Math.max(0, limite - total)),
    excedente: emCentavos(Math.max(0, total - limite)),
    rendimento_cdi: rendimentoCdi,
    rendimento_excedente_cdi: rendimentoExcedenteCdi,
  };
}

function detalharAlocacao(a) {
  return {
    mes_referencia: a.mes_referencia,
    total_sobra: emCentavos(a.total_sobra),
    criado_em: a.criado_em,
    divisoes: stmtDivisoes.all(a.id).map((d) => ({
      objetivo_id: d.objetivo_id,
      nome: d.objetivo_nome,
      percentual: d.percentual,
      valor: emCentavos(d.valor),
    })),
  };
}

// Tudo que a tela de caixinhas mostra, em uma resposta.
function getResumoCaixas() {
  const { objetivos, reserva } = objetivosComMeta();
  const limite = verificarLimiteCaixinhaTurbo();
  const reservaLinha = objetivos.find((o) => o.e_reserva);

  return {
    total_guardado: limite.total_guardado,
    objetivos: objetivos.map((o) => ({
      id: o.id,
      nome: o.nome,
      e_reserva: o.e_reserva,
      saldo_atual: emCentavos(o.saldo_atual),
      meta: o.meta,
      falta: o.meta == null ? null : emCentavos(Math.max(0, o.meta - o.saldo_atual)),
      // Pode passar de 100: a barra corta, o numero conta a verdade.
      percentual_concluido: o.meta ? Math.round((o.saldo_atual / o.meta) * 1000) / 10 : null,
      peso: o.peso,
    })),
    reserva: {
      ...reserva,
      multiplicador_min: MULTIPLICADOR_MIN,
      multiplicador_max: MULTIPLICADOR_MAX,
      atingida: reserva.meta !== null && reservaLinha.saldo_atual >= reserva.meta,
    },
    limite,
    sobra: situacaoDaSobra(),
    alocacoes: stmtAlocacoes.all(ALOCACOES_NO_RESUMO).map(detalharAlocacao),
  };
}

// --------------------------------------------------------------------------
// Cadastro de objetivos
// --------------------------------------------------------------------------

function lerNome(bruto) {
  const nome = limparTexto(bruto, LIMITE_NOME);
  if (!nome) throw new ErroApi(400, 'Campo "nome" e obrigatorio.');
  return nome;
}

// null/"" = sem meta. Qualquer outra coisa precisa ser positiva.
function lerMeta(bruto) {
  if (bruto === null || bruto === '') return null;
  const v = normalizarValor(bruto);
  if (v === null || v <= 0) throw new ErroApi(400, 'Campo "valor_meta" deve ser maior que zero, ou null para sem meta.');
  return emCentavos(v);
}

function lerSaldo(bruto) {
  const v = normalizarValor(bruto);
  if (v === null || v < 0) throw new ErroApi(400, 'Campo "saldo_atual" deve ser um numero maior ou igual a zero.');
  return emCentavos(v);
}

function lerPeso(bruto) {
  if (bruto === null || bruto === '') return null;
  const v = normalizarValor(bruto);
  if (v === null || v < 0 || v > 100) throw new ErroApi(400, 'Campo "peso" deve estar entre 0 e 100, ou null para sem preferencia.');
  return v;
}

function buscarObjetivo(id) {
  const o = stmtObjetivo.get(id);
  if (!o) throw new ErroApi(404, `Objetivo ${id} nao encontrado.`);
  return o;
}

function criarObjetivo(corpo) {
  const dados = {
    nome: lerNome(corpo.nome),
    valor_meta: corpo.valor_meta === undefined ? null : lerMeta(corpo.valor_meta),
    saldo_atual: corpo.saldo_atual === undefined ? 0 : lerSaldo(corpo.saldo_atual),
    peso: corpo.peso === undefined ? null : lerPeso(corpo.peso),
    criado_em: agoraIso(),
  };
  const { lastInsertRowid } = stmtInserirObjetivo.run(dados);
  return stmtObjetivo.get(lastInsertRowid);
}

// A reserva aceita so ajuste de saldo: o nome e fixo e a meta e calculada
// (o multiplicador muda em PATCH /api/caixinhas/reserva).
function atualizarObjetivo(id, corpo) {
  const atual = buscarObjetivo(id);
  const campos = {};
  if (atual.e_reserva === 1 && (corpo.nome !== undefined || corpo.valor_meta !== undefined || corpo.peso !== undefined)) {
    throw new ErroApi(400, 'Na reserva de emergencia so o saldo e editavel; a meta vem do multiplicador.');
  }
  if (corpo.nome !== undefined) campos.nome = lerNome(corpo.nome);
  if (corpo.valor_meta !== undefined) campos.valor_meta = lerMeta(corpo.valor_meta);
  if (corpo.saldo_atual !== undefined) campos.saldo_atual = lerSaldo(corpo.saldo_atual);
  if (corpo.peso !== undefined) campos.peso = lerPeso(corpo.peso);
  const chaves = Object.keys(campos);
  if (!chaves.length) throw new ErroApi(400, 'Envie ao menos um campo: nome, valor_meta, saldo_atual ou peso.');

  db.prepare(`UPDATE objetivos SET ${chaves.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
    .run({ ...campos, id });
  return stmtObjetivo.get(id);
}

// Objetivo com saldo nao se apaga: o dinheiro continua na Caixinha Turbo, e
// sumir com a etiqueta faria o total guardado mentir para o alerta de limite.
function removerObjetivo(id) {
  const atual = buscarObjetivo(id);
  if (atual.e_reserva === 1) throw new ErroApi(400, 'A reserva de emergencia nao pode ser removida.');
  if (atual.saldo_atual > 0) {
    throw new ErroApi(409, `"${atual.nome}" ainda tem ${atual.saldo_atual} guardado. Zere o saldo antes de remover.`);
  }
  stmtRemoverObjetivo.run(id);
  return atual;
}

function definirMultiplicadorReserva(bruto) {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < MULTIPLICADOR_MIN || n > MULTIPLICADOR_MAX) {
    throw new ErroApi(400, `Campo "multiplicador" deve ser um inteiro de ${MULTIPLICADOR_MIN} a ${MULTIPLICADOR_MAX}.`);
  }
  configRuntime.gravar('reserva_multiplicador', n);
  return getResumoCaixas();
}

module.exports = {
  calcularSugestaoDivisao, confirmarDivisao, desfazerDivisao,
  getResumoCaixas, verificarLimiteCaixinhaTurbo, sobraDoCiclo, situacaoDaSobra,
  criarObjetivo, atualizarObjetivo, removerObjetivo, definirMultiplicadorReserva,
  // Expostos para teste.
  dividir, repartirCentavos, percentuaisDe, despesaMedia,
};
