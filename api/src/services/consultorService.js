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

// Um parcelamento de N vezes cabe se TODOS os N ciclos afetados suportam a
// parcela. Testar so o primeiro mes e o erro classico: a parcela 9 cai num mes
// que talvez ja esteja cheio de outra coisa.
function testarParcelamento(foto, valor, n) {
  const parcela = emCentavos(valor / n);
  const afetados = [];

  // Parcela 1 entra no ciclo aberto; as seguintes, nos meses projetados.
  const primeira = folgaUtil(foto.folga_atual);
  afetados.push({
    mes_referencia: foto.mes_referencia,
    folga_util: primeira,
    sobra_depois: primeira === null ? null : emCentavos(primeira - parcela),
  });

  for (let i = 0; i < n - 1; i += 1) {
    const m = foto.meses_futuros[i];
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
    cabe: afetados.every((m) => m.sobra_depois !== null && m.sobra_depois >= 0),
    mes_mais_apertado: apertado,
    meses_afetados: afetados,
  };
}

// Primeiro mes futuro cuja folga sozinha paga a compra a vista.
function primeiroMesQueCabe(foto, valor) {
  for (const m of foto.meses_futuros) {
    const util = folgaUtil(m.folga);
    if (util !== null && util >= valor) {
      return { mes_referencia: m.mes_referencia, folga_util: util, sobra_depois: emCentavos(util - valor) };
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
  else if (pedido && pedido.cabe) veredito = 'cabe_parcelado';
  else if (sugerido) veredito = 'cabe_parcelado';
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
    parcelado_pedido: pedido,
    parcelado_sugerido: sugerido,
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
