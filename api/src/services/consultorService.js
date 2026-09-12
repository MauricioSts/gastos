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

// Piso da parcela sugerida por conta propria. Sem ele a busca "achava jeito" de
// aprovar qualquer coisa esticando o numero de parcelas: com o ciclo apertado,
// uma compra de R$ 120 saia como "10x de R$ 12,00", que nenhuma loja faz e
// ninguem quer. Parcelamento pedido pelo usuario nao passa por aqui -- se ele
// pediu 12x, o trabalho e responder sobre 12x.
const PARCELA_MINIMA = 50;

// Numeros de parcelas que fazem sentido para este valor.
const parcelasViaveis = (valor) => PARCELAS_USUAIS.filter((n) => valor / n >= PARCELA_MINIMA);

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

// Piso de dinheiro livre por mes dito na propria pergunta: "quero ter pelo menos
// 700 reais no mes para gastar livre", "deixando 500 livres", "sem mexer nos 300
// do mes". Sem isto, a restricao era simplesmente ignorada -- a resposta chegava
// com um numero de parcelas que consumia justamente o dinheiro que a pessoa
// pediu para preservar.
const RE_RESERVA = new RegExp([
  '(?:pelo menos|no m[ií]nimo|m[ií]nimo de|deixa(?:r|ndo)|sobra(?:r|ndo)',
  '|guarda(?:r|ndo)|manter|mantendo|reserva(?:r|ndo)?|sem mexer (?:n)?(?:os|as|o|a))',
  '\\s*(?:de\\s*)?(?:r\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?|\\d+(?:[.,]\\d{1,2})?)',
  '\\s*(?:mil\\b)?',
].join(''), 'i');

// Só conta como piso se a frase disser que o dinheiro é para gastar/ficar livre,
// ou for por mês. "pelo menos 1600" falando do preço não é piso.
const RE_CONTEXTO_RESERVA = /\b(livre|livres|gastar|sobrar|sobrando|por m[eê]s|no m[eê]s|mensal|guardad[oa]s?|intocad[oa]s?)\b/i;

// Piso mensal de gasto livre lido da pergunta. Devolve { reserva, texto } com o
// texto já sem o número do piso, para ele não concorrer com o preço na leitura
// do valor da compra ("pelo menos 2000 livres" num fone de 1600 faria o preço
// virar 2000, porque o preço é o MAIOR número da frase).
function lerReserva(texto) {
  const m = texto.match(RE_RESERVA);
  if (!m) return { reserva: null, texto };

  const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 40);
  if (!RE_CONTEXTO_RESERVA.test(m[0]) && !RE_CONTEXTO_RESERVA.test(depois)) {
    return { reserva: null, texto };
  }

  let n = normalizarValor(m[1]);
  if (n === null || n <= 0) return { reserva: null, texto };
  if (/mil\b/i.test(m[0])) n = emCentavos(n * 1000);

  return {
    reserva: n,
    texto: `${texto.slice(0, m.index)} ${texto.slice(m.index + m[0].length)}`,
  };
}

// Extrai valor total e numero de parcelas de uma pergunta em portugues.
// Devolve { valor, parcelas } com null quando a frase nao tem numero de preco.
function lerCompra(pergunta) {
  const { reserva, texto } = lerReserva(String(pergunta || ''));

  const mParcela = texto.match(RE_PARCELA);
  const parcelas = mParcela ? Number(mParcela[1]) : null;

  // "6x de 90" da o valor da PARCELA, nao o total: o total e 540.
  if (mParcela && mParcela[2]) {
    const porParcela = normalizarValor(mParcela[2]);
    if (porParcela !== null && porParcela > 0 && parcelas > 0) {
      return { valor: emCentavos(porParcela * parcelas), parcelas, valor_parcela: porParcela, reserva };
    }
  }

  const mMil = texto.match(RE_MIL);
  if (mMil) {
    const n = normalizarValor(mMil[1]);
    if (n !== null && n > 0) return { valor: emCentavos(n * 1000), parcelas, valor_parcela: null, reserva };
  }

  // Numeros candidatos a preco, tirando o que ja foi lido como "Nx".
  const semParcela = mParcela ? texto.replace(mParcela[0], ' ') : texto;
  const numeros = [...semParcela.matchAll(RE_NUMERO)]
    .map((m) => normalizarValor(m[1]))
    .filter((n) => n !== null && n > 0);

  if (!numeros.length) return { valor: null, parcelas, valor_parcela: null, reserva };
  return { valor: emCentavos(Math.max(...numeros)), parcelas, valor_parcela: null, reserva };
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
// Com um piso explicito na pergunta ("quero ter 700 livres"), a margem de 15%
// sai: o numero que a pessoa deu JA e a reserva dela, e descontar os dois seria
// cobrar duas vezes pela mesma seguranca.
const folgaUtil = (folga, margem = MARGEM) => (
  folga === null ? null : emCentavos(folga * (1 - margem))
);

// Fotografia reescrita em torno do piso mensal pedido: a folga de cada mes passa
// a ser "o que sobra DEPOIS de garantir o piso", em vez de "o que sobra depois do
// ritmo medido". No ciclo aberto o piso e proporcional ao que falta dele -- no
// dia 12 de um ciclo de 31 nao faz sentido exigir os 700 inteiros do que resta.
function comReserva(foto, reserva) {
  const prorata = emCentavos(reserva * (foto.dias_restantes / foto.ciclo.dias_no_ciclo));
  return {
    ...foto,
    reserva,
    reserva_no_ciclo: prorata,
    folga_atual: foto.disponivel === null ? null : emCentavos(foto.disponivel - prorata),
    meses_futuros: foto.meses_futuros.map((m) => ({
      ...m,
      folga: m.renda_total === null ? null : emCentavos(m.renda_total - m.comprometido_total - reserva),
    })),
  };
}

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
function testarParcelamento(foto, valor, n, inicio = 0, margem = MARGEM) {
  const parcela = emCentavos(valor / n);
  const linha = linhaDeFolgas(foto);
  const afetados = [];

  for (let i = 0; i < n; i += 1) {
    const m = linha[inicio + i];
    if (!m) break;
    const util = folgaUtil(m.folga, margem);
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
function parceladoAPartirDe(foto, valor, preferidas = PARCELAS_USUAIS, margem = MARGEM) {
  const linha = linhaDeFolgas(foto);
  // Comeca em 1: o indice 0 e o "compro agora", que quem chama ja testou.
  for (let inicio = 1; inicio < linha.length; inicio += 1) {
    for (const n of preferidas) {
      if (inicio + n > linha.length) continue;
      const t = testarParcelamento(foto, valor, n, inicio, margem);
      if (t.cabe) {
        // Por que nao um mes antes: o mesmo numero de parcelas comecando no mes
        // anterior, e o mes exato em que ele estoura. E o motivo da resposta, e
        // precisa ser calculado -- o modelo, quando tentava explicar isso,
        // inventava nome de compromisso que nao existia no briefing.
        const antes = testarParcelamento(foto, valor, n, inicio - 1, margem);
        const pior = antes.meses_afetados
          .filter((m) => m.sobra_depois !== null && m.sobra_depois < 0)
          .sort((x, y) => x.sobra_depois - y.sobra_depois)[0] || antes.mes_mais_apertado;
        const mesInicio = linha[inicio].mes_referencia;
        // A data em que a compra pode ser feita, nao so o rotulo do ciclo: o
        // ciclo "out/2026" abre em 29/09, e foi exatamente isso que o usuario
        // nao entendeu na resposta.
        return {
          ...t,
          mes_inicio: mesInicio,
          primeiro_dia: ciclo.janela(mesInicio).inicio,
          // O impedimento de comecar um mes antes.
          bloqueio: pior && pior.sobra_depois !== null && pior.sobra_depois < 0
            ? { mes_referencia: pior.mes_referencia, faltam: emCentavos(Math.abs(pior.sobra_depois)) }
            : null,
        };
      }
    }
  }
  return null;
}

// Primeiro mes futuro cuja folga sozinha paga a compra a vista.
function primeiroMesQueCabe(foto, valor, margem = MARGEM) {
  for (const m of foto.meses_futuros) {
    const util = folgaUtil(m.folga, margem);
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
function mesesGuardando(foto, valor, margem = MARGEM) {
  let acumulado = folgaUtil(foto.folga_atual, margem) || 0;
  if (acumulado >= valor) return { meses: 0, por_mes: null };
  for (let i = 0; i < foto.meses_futuros.length; i += 1) {
    const util = folgaUtil(foto.meses_futuros[i].folga, margem);
    if (util === null || util <= 0) continue;
    acumulado = emCentavos(acumulado + util);
    if (acumulado >= valor) {
      return { meses: i + 1, mes_referencia: foto.meses_futuros[i].mes_referencia, por_mes: emCentavos(valor / (i + 1)) };
    }
  }
  return { meses: null, por_mes: null };
}

// Analise completa de uma compra. Tudo que a frase do LLM pode citar sai daqui.
function analisarCompra({ valor, parcelas = null, mes, reserva = null }) {
  const mesBase = mes || ciclo.cicloAtual();
  const real = retrato(mesBase);

  // Piso explicito troca a base da conta: em vez de "o que sobra depois do meu
  // ritmo medido", a folga passa a ser "o que sobra garantindo o piso". E a
  // margem de 15% sai, porque o piso ja e a folga que a pessoa quer.
  const piso = reserva !== null && Number.isFinite(reserva) && reserva > 0 ? reserva : null;
  const foto = piso ? comReserva(real, piso) : real;
  const margem = piso ? 0 : MARGEM;

  if (!foto.renda_definida) {
    return {
      tipo: 'compra',
      valor,
      veredito: 'sem_renda',
      motivo: 'Sem renda cadastrada nao da para dizer se a compra cabe.',
      retrato: foto,
    };
  }

  const folgaUtilAtual = folgaUtil(foto.folga_atual, margem);
  const cabeAgora = folgaUtilAtual !== null && folgaUtilAtual >= valor;

  // Compra pequena e outro problema: um cafe de R$ 8 nao e gasto EXTRA, e o
  // ritmo do dia. Testar o cafe contra a folga (o que sobra DEPOIS do ritmo)
  // reprovava qualquer compra sempre que o ciclo estava apertado, e a resposta
  // saia absurda para a pergunta mais comum do app.
  // Com piso pedido a regra do cafe nao vale: "cabe no ritmo de hoje" e uma
  // afirmacao sobre o ritmo medido, e a pessoa acabou de dizer que quer outro.
  const cabeHoje = foto.cabe_hoje;
  const cabeNoRitmo = !piso && !cabeAgora && cabeHoje !== null && cabeHoje > 0 && valor <= cabeHoje;

  // Parcelamento: testa o que o usuario pediu e, se ele nao pediu nada, o
  // menor numero de parcelas que cabe -- menos meses travados e melhor.
  const pedido = parcelas && parcelas > 1
    ? testarParcelamento(foto, valor, Math.min(parcelas, HORIZONTE), 0, margem)
    : null;
  let sugerido = null;
  if (!cabeAgora && (!pedido || !pedido.cabe)) {
    for (const n of parcelasViaveis(valor)) {
      const t = testarParcelamento(foto, valor, n, 0, margem);
      if (t.cabe) { sugerido = t; break; }
    }
  }

  // Nada cabe comecando agora: procura o primeiro mes em que da para COMECAR
  // parcelado. Se o usuario disse um numero de parcelas, esse numero e testado
  // primeiro -- respeitar o que ele pediu vale mais que economizar um mes.
  const aPartir = (cabeAgora || (pedido && pedido.cabe) || sugerido)
    ? null
    : parceladoAPartirDe(foto, valor, pedido
      ? [pedido.parcelas, ...parcelasViaveis(valor).filter((n) => n !== pedido.parcelas)]
      : parcelasViaveis(valor), margem);

  const proximoMes = cabeAgora ? null : primeiroMesQueCabe(foto, valor, margem);
  const juntando = cabeAgora ? null : mesesGuardando(foto, valor, margem);

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

  // Maior folga mensal do horizonte: quando nada cabe, e o numero que explica
  // por que nada cabe.
  const melhorMes = foto.meses_futuros
    .map((m) => ({ mes_referencia: m.mes_referencia, folga_util: folgaUtil(m.folga, margem) }))
    .filter((m) => m.folga_util !== null)
    .sort((x, y) => y.folga_util - x.folga_util)[0] || null;

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
    // O piso pedido, e o quanto dele e exigido do ciclo aberto (proporcional ao
    // que falta dele). null quando a pergunta nao pediu piso nenhum.
    melhor_mes: melhorMes,
    reserva: piso,
    reserva_no_ciclo: piso ? foto.reserva_no_ciclo : null,
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
    // O retrato sai SEM o ajuste do piso: e a fotografia do dinheiro de verdade,
    // e a tela mostra esses numeros. O piso vive em `reserva` e ja esta embutido
    // nas folgas testadas acima.
    retrato: real,
  };
}

// Pergunta sem valor ("devo cortar assinatura?"): sem compra para simular, o
// que o LLM recebe e a fotografia do ciclo.
function analisarGeral({ mes }) {
  const mesBase = mes || ciclo.cicloAtual();
  return { tipo: 'geral', veredito: 'contexto', retrato: retrato(mesBase) };
}

module.exports = {
  lerCompra, lerReserva, analisarCompra, analisarGeral, retrato, HORIZONTE, MARGEM,
};
