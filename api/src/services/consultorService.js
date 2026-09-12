// Consultor de decisao de compra.
//
// A pergunta que este modulo responde e "quando vale a pena comprar X por Y",
// e a resposta NAO vem do LLM. O veredito, os meses e todos os valores sao
// calculados aqui em JavaScript; o modelo local so escreve a frase em cima
// deste resultado. Modelo de 3B erra conta e erra conclusao -- num app de
// dinheiro, conselho errado e pior que conselho nenhum.
//
// A conta central e a FOLGA, nao o disponivel. Disponivel e
// renda - comprometido - gasto livre, e gastar o disponivel inteiro numa
// compra quebra o mes: a pessoa ainda vai almocar ate a fatura fechar. Entao:
//
//   necessidade = media diaria de gasto livre x dias que faltam no ciclo
//   folga       = disponivel - necessidade
//
// Folga e o que sobra depois de manter o proprio ritmo de vida. E dela que
// sai qualquer compra nova.
const ciclo = require('../utils/ciclo');
const { mesSomar } = require('../utils/data');
const { emCentavos, normalizarValor } = require('../utils/validacao');
const { calcularSaldo, calcularResumo } = require('./saldoService');
const compromissos = require('./compromissosService');

// Horizonte da projecao. 12 meses cobre parcelamento de um ano, que e o teto
// pratico do cartao; alem disso a renda estimada vira ficcao.
const HORIZONTE = 12;

// Parcelamentos comuns no varejo brasileiro, na ordem em que valem a pena
// (menos parcelas primeiro: menos meses de compromisso travado).
const PARCELAS_USUAIS = [2, 3, 4, 5, 6, 10, 12];

// Margem de seguranca sobre a folga mensal. Deixar a folga bater exatamente no
// valor da parcela e planejar para o mes dar certo no limite -- qualquer
// imprevisto estoura. 15% da folga fica de fora da conta.
const MARGEM = 0.15;

// -------------------------------------------------------------------------
// Leitura da pergunta sem LLM
// -------------------------------------------------------------------------

// Valor em reais dentro de uma frase: "um monitor de 1.200,00", "custa 890",
// "R$ 2mil". Pega o MAIOR numero da frase quando ha varios, porque numero
// pequeno em pergunta de compra costuma ser quantidade de parcelas
// ("3x de 400" -> o preco e 400 x 3, tratado pelo casamento de parcela).
const RE_PARCELA = /(\d{1,2})\s*(?:x|vezes)(?:\s*(?:de|por)?\s*(?:r\$\s*)?([\d.,]+))?/i;
const RE_MIL = /(\d+(?:[.,]\d+)?)\s*mil\b/i;
const RE_NUMERO = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?|\d+(?:\.\d{2})?)/gi;

// Extrai valor total e numero de parcelas de uma pergunta em portugues.
// Devolve { valor, parcelas } com null quando a frase nao tem numero de preco.
function lerCompra(pergunta) {
  const texto = String(pergunta || '');

  const mParcela = texto.match(RE_PARCELA);
  const parcelas = mParcela ? Number(mParcela[1]) : null;

  // "6x de 90" da o valor da PARCELA, nao o total: o total e 540.
  if (mParcela && mParcela[2]) {
    const porParcela = normalizarValor(mParcela[2]);
    if (porParcela !== null && porParcela > 0 && parcelas > 0) {
      return { valor: emCentavos(porParcela * parcelas), parcelas, valor_parcela: porParcela };
    }
  }

  const mMil = texto.match(RE_MIL);
  if (mMil) {
    const n = normalizarValor(mMil[1]);
    if (n !== null && n > 0) return { valor: emCentavos(n * 1000), parcelas, valor_parcela: null };
  }

  // Numeros candidatos a preco, tirando o que ja foi lido como "Nx".
  const semParcela = mParcela ? texto.replace(mParcela[0], ' ') : texto;
  const numeros = [...semParcela.matchAll(RE_NUMERO)]
    .map((m) => normalizarValor(m[1]))
    .filter((n) => n !== null && n > 0);

  if (!numeros.length) return { valor: null, parcelas, valor_parcela: null };
  return { valor: emCentavos(Math.max(...numeros)), parcelas, valor_parcela: null };
}

// -------------------------------------------------------------------------
// Fotografia financeira
// -------------------------------------------------------------------------

// Numeros do ciclo aberto + os proximos HORIZONTE meses, todos com a folga
// calculada. O ciclo corrente usa gasto real; os futuros, o ritmo medio.
function retrato(mesBase) {
  const saldo = calcularSaldo(mesBase);
  const resumo = calcularResumo(mesBase);
  const janela = ciclo.janela(mesBase);
  const diasRestantes = ciclo.diasRestantes(mesBase);

  // Ritmo de vida: quanto esta pessoa gasta por dia, em media, neste ciclo.
  // Sem historico no ciclo (comeco de mes), cai na media do ciclo anterior
  // para nao tratar "ainda nao gastei" como "nao preciso de nada".
  let mediaDiaria = resumo.media_diaria || 0;
  if (mediaDiaria <= 0) {
    const anterior = calcularResumo(mesSomar(mesBase, -1));
    mediaDiaria = anterior.media_diaria || 0;
  }

  const necessidade = emCentavos(mediaDiaria * diasRestantes);
  const folgaAtual = saldo.disponivel === null
    ? null
    : emCentavos(saldo.disponivel - necessidade);

  const meses = [];
  for (let i = 1; i <= HORIZONTE; i += 1) {
    const m = mesSomar(mesBase, i);
    const comp = compromissos.compromissosDoMes(m);
    const renda = compromissos.totalRenda(m);
    const base = renda.definida ? renda : compromissos.totalRenda(mesBase);
    const dias = ciclo.janela(m).dias_no_ciclo;
    // Mes futuro inteiro: a necessidade cobre o ciclo todo, nao o resto dele.
    const necessidadeMes = emCentavos(mediaDiaria * dias);

    meses.push({
      mes_referencia: m,
      renda_total: base.definida ? base.total : null,
      renda_estimada: !renda.definida && base.definida,
      comprometido_total: comp.total,
      necessidade: necessidadeMes,
      folga: base.definida
        ? emCentavos(base.total - comp.total - necessidadeMes)
        : null,
      parcelamentos_terminando: comp.parcelamentos
        .filter((p) => p.ultima_parcela)
        .map((p) => ({ descricao: p.descricao, valor: p.valor })),
    });
  }

  return {
    mes_referencia: mesBase,
    ciclo: janela,
    dias_restantes: diasRestantes,
    renda_definida: saldo.renda_definida,
    renda_total: saldo.renda_total,
    comprometido_total: saldo.comprometido_total,
    gasto_livre: saldo.gasto_livre,
    disponivel: saldo.disponivel,
    media_diaria: emCentavos(mediaDiaria),
    necessidade_ate_fechar: necessidade,
    folga_atual: folgaAtual,
    ritmo_diario: saldo.ritmo_diario,
    // Quanto ainda cabe HOJE dentro do ritmo. E a pergunta mais frequente do
    // app ("quanto posso gastar hoje"), e sem este numero pronto o modelo
    // tentava calcula-lo -- e errava.
    cabe_hoje: saldo.ritmo_restante_hoje,
    gasto_hoje: saldo.gasto_hoje,
    meses_futuros: meses,
  };
}

// -------------------------------------------------------------------------
// Simulacao da compra
// -------------------------------------------------------------------------

// Folga descontando a margem de seguranca. E contra este numero que a compra
// e testada: usar a folga cheia aprova compra que so cabe no mes perfeito.
const folgaUtil = (folga) => (folga === null ? null : emCentavos(folga * (1 - MARGEM)));

// Linha do tempo de folgas, do ciclo aberto ate o fim do horizonte. Indice 0 e
// o ciclo aberto (folga parcial, so o que resta dele); 1 em diante sao os meses
// projetados inteiros. Existe para que a simulacao possa comecar em qualquer
// mes sem duplicar a conta do ciclo corrente.
function linhaDeFolgas(foto) {
  return [
    { mes_referencia: foto.mes_referencia, folga: foto.folga_atual },
    ...foto.meses_futuros.map((m) => ({ mes_referencia: m.mes_referencia, folga: m.folga })),
  ];
}

// Um parcelamento de N vezes cabe se TODOS os N ciclos afetados suportam a
// parcela. Testar so o primeiro mes e o erro classico: a parcela 9 cai num mes
// que talvez ja esteja cheio de outra coisa.
//
// `inicio` e o indice na linha de folgas em que a primeira parcela cai: 0 e
// "compro agora", 1 e "compro no ciclo que vem". Cobrar a primeira parcela do
// ciclo aberto quando ele ja esta estourado reprova qualquer numero de
// parcelas, e era por isso que a pergunta "em quantas parcelas eu consigo"
// ficava sem resposta.
function testarParcelamento(foto, valor, n, inicio = 0) {
  const parcela = emCentavos(valor / n);
  const linha = linhaDeFolgas(foto);
  const afetados = [];

  for (let i = 0; i < n; i += 1) {
    const m = linha[inicio + i];
    if (!m) break;
    const util = folgaUtil(m.folga);
    afetados.push({
      mes_referencia: m.mes_referencia,
      folga_util: util,
      sobra_depois: util === null ? null : emCentavos(util - parcela),
    });
  }

  const apertado = afetados
    .filter((m) => m.sobra_depois !== null)
    .sort((a, b) => a.sobra_depois - b.sobra_depois)[0] || null;

  return {
    parcelas: n,
    valor_parcela: parcela,
    // Menos meses simulados que parcelas = a ultima parcela cai fora do
    // horizonte, e ai nao ha como afirmar que cabe.
    cabe: afetados.length === n && afetados.every((m) => m.sobra_depois !== null && m.sobra_depois >= 0),
    mes_mais_apertado: apertado,
    meses_afetados: afetados,
  };
}

// Primeiro mes em que da para COMECAR um parcelamento que cabe inteiro, com o
// menor numero de parcelas possivel. Responde "quando e em quantas vezes" numa
// so resposta -- a pergunta que o usuario faz quando o preco nao cabe hoje.
function parceladoAPartirDe(foto, valor, preferidas = PARCELAS_USUAIS) {
  const linha = linhaDeFolgas(foto);
  // Comeca em 1: o indice 0 e o "compro agora", que quem chama ja testou.
  for (let inicio = 1; inicio < linha.length; inicio += 1) {
    for (const n of preferidas) {
      if (inicio + n > linha.length) continue;
      const t = testarParcelamento(foto, valor, n, inicio);
      if (t.cabe) {
        const mesInicio = linha[inicio].mes_referencia;
        // A data em que a compra pode ser feita, nao so o rotulo do ciclo: o
        // ciclo "out/2026" abre em 29/09, e foi exatamente isso que o usuario
        // nao entendeu na resposta.
        return { ...t, mes_inicio: mesInicio, primeiro_dia: ciclo.janela(mesInicio).inicio };
      }
    }
  }
  return null;
}

// Primeiro mes futuro cuja folga sozinha paga a compra a vista.
function primeiroMesQueCabe(foto, valor) {
  for (const m of foto.meses_futuros) {
    const util = folgaUtil(m.folga);
    if (util !== null && util >= valor) {
      return {
        mes_referencia: m.mes_referencia,
        primeiro_dia: ciclo.janela(m.mes_referencia).inicio,
        folga_util: util,
        sobra_depois: emCentavos(util - valor),
      };
    }
  }
  return null;
}

// Quantos meses guardando a folga inteira ate juntar o valor.
function mesesGuardando(foto, valor) {
  let acumulado = folgaUtil(foto.folga_atual) || 0;
  if (acumulado >= valor) return { meses: 0, por_mes: null };
  for (let i = 0; i < foto.meses_futuros.length; i += 1) {
    const util = folgaUtil(foto.meses_futuros[i].folga);
    if (util === null || util <= 0) continue;
    acumulado = emCentavos(acumulado + util);
    if (acumulado >= valor) {
      return { meses: i + 1, mes_referencia: foto.meses_futuros[i].mes_referencia, por_mes: emCentavos(valor / (i + 1)) };
    }
  }
  return { meses: null, por_mes: null };
}

// Analise completa de uma compra. Tudo que a frase do LLM pode citar sai daqui.
function analisarCompra({ valor, parcelas = null, mes }) {
  const mesBase = mes || ciclo.cicloAtual();
  const foto = retrato(mesBase);

  if (!foto.renda_definida) {
    return {
      tipo: 'compra',
      valor,
      veredito: 'sem_renda',
      motivo: 'Sem renda cadastrada nao da para dizer se a compra cabe.',
      retrato: foto,
    };
  }

  const folgaUtilAtual = folgaUtil(foto.folga_atual);
  const cabeAgora = folgaUtilAtual !== null && folgaUtilAtual >= valor;

  // Compra pequena e outro problema: um cafe de R$ 8 nao e gasto EXTRA, e o
  // ritmo do dia. Testar o cafe contra a folga (o que sobra DEPOIS do ritmo)
  // reprovava qualquer compra sempre que o ciclo estava apertado, e a resposta
  // saia absurda para a pergunta mais comum do app.
  const cabeHoje = foto.cabe_hoje;
  const cabeNoRitmo = !cabeAgora && cabeHoje !== null && cabeHoje > 0 && valor <= cabeHoje;

  // Parcelamento: testa o que o usuario pediu e, se ele nao pediu nada, o
  // menor numero de parcelas que cabe -- menos meses travados e melhor.
  const pedido = parcelas && parcelas > 1 ? testarParcelamento(foto, valor, Math.min(parcelas, HORIZONTE)) : null;
  let sugerido = null;
  if (!cabeAgora && (!pedido || !pedido.cabe)) {
    for (const n of PARCELAS_USUAIS) {
      const t = testarParcelamento(foto, valor, n);
      if (t.cabe) { sugerido = t; break; }
    }
  }

  // Nada cabe comecando agora: procura o primeiro mes em que da para COMECAR
  // parcelado. Se o usuario disse um numero de parcelas, esse numero e testado
  // primeiro -- respeitar o que ele pediu vale mais que economizar um mes.
  const aPartir = (cabeAgora || (pedido && pedido.cabe) || sugerido)
    ? null
    : parceladoAPartirDe(foto, valor, pedido
      ? [pedido.parcelas, ...PARCELAS_USUAIS.filter((n) => n !== pedido.parcelas)]
      : PARCELAS_USUAIS);

  const proximoMes = cabeAgora ? null : primeiroMesQueCabe(foto, valor);
  const juntando = cabeAgora ? null : mesesGuardando(foto, valor);

  // Alivio a caminho: parcelamentos que terminam nos proximos meses. E a
  // informacao que muda a decisao de "nao" para "espera pouco".
  const alivios = foto.meses_futuros
    .filter((m) => m.parcelamentos_terminando.length)
    .slice(0, 3)
    .map((m) => ({
      mes_referencia: m.mes_referencia,
      itens: m.parcelamentos_terminando,
      valor: emCentavos(m.parcelamentos_terminando.reduce((s, p) => s + p.valor, 0)),
    }));

  let veredito;
  if (cabeAgora) veredito = 'cabe_agora';
  else if (cabeNoRitmo) veredito = 'cabe_no_ritmo';
  else if (pedido && pedido.cabe) veredito = 'cabe_parcelado';
  else if (sugerido) veredito = 'cabe_parcelado';
  // Entre esperar para pagar a vista e comecar a parcelar, ganha o que chega
  // primeiro: quem pergunta "quando" quer a data mais proxima em que da.
  else if (aPartir && (!proximoMes || aPartir.mes_inicio < proximoMes.mes_referencia)) veredito = 'cabe_parcelado_depois';
  else if (proximoMes) veredito = 'esperar';
  else veredito = 'nao_cabe';

  return {
    tipo: 'compra',
    valor,
    veredito,
    a_vista: {
      cabe: cabeAgora,
      folga_util: folgaUtilAtual,
      sobra_depois: folgaUtilAtual === null ? null : emCentavos(folgaUtilAtual - valor),
      // Quanto o dia a dia teria que encolher para a compra caber hoje.
      comprime_ritmo: cabeAgora || foto.dias_restantes <= 0
        ? null
        : emCentavos(valor / foto.dias_restantes),
    },
    // Cabe dentro do gasto do dia, sem mexer na folga do ciclo.
    dentro_do_ritmo: {
      cabe: cabeNoRitmo,
      cabe_hoje: cabeHoje,
      gasto_hoje: foto.gasto_hoje,
    },
    parcelado_pedido: pedido,
    parcelado_sugerido: sugerido,
    parcelado_a_partir: aPartir,
    esperar_ate: proximoMes,
    juntando,
    alivios,
    retrato: foto,
  };
}

// Pergunta sem valor ("devo cortar assinatura?"): sem compra para simular, o
// que o LLM recebe e a fotografia do ciclo.
function analisarGeral({ mes }) {
  const mesBase = mes || ciclo.cicloAtual();
  return { tipo: 'geral', veredito: 'contexto', retrato: retrato(mesBase) };
}

module.exports = {
  lerCompra, analisarCompra, analisarGeral, retrato, HORIZONTE, MARGEM,
};
