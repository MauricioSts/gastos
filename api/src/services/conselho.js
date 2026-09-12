// Transforma a analise calculada em uma frase de conselho.
//
// Divisao de trabalho deliberada: `consultorService` decide, este arquivo
// escreve. O prompt entrega o veredito JA DECIDIDO e proibe o modelo de
// recalcular -- um modelo de 3B em CPU erra aritmetica com frequencia, e aqui
// o numero errado sai como recomendacao financeira. O modelo tem uma unica
// tarefa: explicar em portugues o que a conta ja concluiu.
const { chatTextoStream, ErroOllama } = require('./ollama');
const { nomeMes, mesSomar } = require('../utils/data');
const ciclo = require('../utils/ciclo');
const { normalizarValor } = require('../utils/validacao');

// "2026-09-29" -> "29/09". O rotulo do ciclo ("out/2026") e jargao interno: quem
// pergunta "quando eu posso comprar" quer a data em que pode comprar, e o ciclo
// de outubro abre no dia 29 de setembro.
const diaMes = (data) => {
  const [, mes, dia] = String(data).split('-');
  return `${dia}/${mes}`;
};

const real = (n) => (n === null || n === undefined
  ? '—'
  : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// O prompt e curto de proposito. Em CPU, o prompt custa ~25ms por token so
// para ser lido: cada linha de instrucao aqui atrasa a primeira palavra que o
// usuario ve. Regra que nao muda a saida foi cortada.
// O modelo nao escreve a decisao: ela ja foi escrita por `fraseDoVeredito` e o
// app ja a mostrou. O trabalho dele e UMA frase de porque, e o prompt diz isso
// de forma direta -- pedir menos a um modelo de 3B e o que faz a resposta
// parecer inteligente, porque sobra menos superficie para ele errar.
const PROMPT_SISTEMA = `Consultor financeiro de um app de gastos brasileiro.

- A decisao ja foi dada ao usuario. Escreva SO o motivo dela, em UMA frase curta.
- Nao repita a decisao, o mes nem o numero de parcelas: isso ja esta na tela.
- Nao repita que nao cabe agora: isso tambem ja foi dito. Diga o NUMERO que causa
  isso, ou o que muda no mes indicado.
- Use SO os numeros da lista. Nunca calcule nem invente valor.
- Portugues brasileiro, sem emoji, sem rotulo ("Decisao:", "Motivo:").
- Trate a pessoa por voce, mas nunca comece a frase com "Voce,".
- Folga negativa ou "nenhuma" = o ciclo ja estourou. Nunca diga que existe folga.
- Parcela que esta terminando nao e o item da pergunta, e alivio no orcamento.
- Sem conselho generico: so este caso.
- Frase completa, com verbo, como quem conversa. Nao copie o estilo de rotulo do
  briefing ("Folga negativa, ciclo estourado" nao e frase).

Exemplos do que e uma boa frase de motivo:
"O seu ritmo de gasto deste mes ja consome tudo o que sobrou da renda, e por isso
nem uma parcela caberia agora."
"A partir do mes que vem a ultima parcela do celular sai da conta e abre espaco
para a nova."
"O valor e pequeno perto do que ainda cabe no seu dia, entao nao muda o mes."`;

// Rotulos de veredito, em primeira pessoa do app. O texto do modelo vem DEPOIS
// disto na tela, entao aqui fica a decisao e la a justificativa.
const VEREDITOS = {
  cabe_agora: 'Cabe agora, à vista.',
  cabe_no_ritmo: 'Cabe hoje, dentro do seu ritmo.',
  cabe_parcelado: 'Só cabe parcelado.',
  esperar: 'Melhor esperar.',
  cabe_parcelado_depois: 'Cabe parcelado, começando mais para frente.',
  nao_cabe: 'Não cabe no seu orçamento hoje.',
  sem_renda: 'Falta cadastrar sua renda.',
  contexto: null,
};

// Briefing de compra: fatos em linhas curtas, e so os que sustentam ESTE
// veredito. Formato de lista porque modelo pequeno segue lista melhor que
// paragrafo, e cada linha e um numero que ele esta autorizado a repetir.
//
// O tamanho e restricao de projeto, nao estetica: em CPU cada token de prompt
// custa ~25ms de leitura antes da primeira palavra aparecer. Mandar o retrato
// financeiro inteiro em toda pergunta dobrava a espera sem mudar a resposta.
function briefingCompra(a, pergunta) {
  const f = a.retrato;
  const linhas = [
    `Pergunta: "${pergunta}"`,
    `Compra: ${real(a.valor)}`,
    `Ciclo ${nomeMes(f.mes_referencia)}, faltam ${f.dias_restantes} dias para a fatura fechar.`,
    // Disponivel negativo tambem nao vai com sinal, pela mesma razao da folga:
    // o modelo le "R$ -100,00" e escreve "voce tem R$ 100,00 disponiveis".
    f.disponivel !== null && f.disponivel < 0
      ? `Disponivel: nada -- o ciclo ja esta ${real(Math.abs(f.disponivel))} no negativo, e o ritmo de ${real(f.media_diaria)}/dia ainda vai consumir ${real(f.necessidade_ate_fechar)} ate a fatura fechar.`
      : `Disponivel ${real(f.disponivel)}, e o ritmo de ${real(f.media_diaria)}/dia ainda vai consumir ${real(f.necessidade_ate_fechar)} ate a fatura fechar.`,
    // Folga negativa NAO vai como numero com sinal: medido no 3b, "R$ -16,55"
    // saia da frase como "apenas R$ 16,55 de folga" -- o modelo perdia o sinal
    // e o aviso virava permissao. Em palavra ele nao tem como inverter.
    a.a_vista.folga_util !== null && a.a_vista.folga_util < 0
      ? `Folga para gastar fora do ritmo: nenhuma -- o ritmo atual ja estoura este ciclo em ${real(Math.abs(a.a_vista.folga_util))}.`
      : `Folga real para gastar fora do ritmo: ${real(a.a_vista.folga_util)}.`,
  ];

  if (a.veredito === 'cabe_no_ritmo') {
    linhas.push(`Cabe dentro do gasto de hoje: ainda pode gastar ${real(a.dentro_do_ritmo.cabe_hoje)} hoje sem estourar o ritmo (ja gastou ${real(a.dentro_do_ritmo.gasto_hoje)} hoje).`);
    linhas.push(`DECISAO JA DADA: ${VEREDITOS[a.veredito]} Escreva so o motivo, em uma frase.`);
    return linhas.join('\n');
  }

  if (a.a_vista.cabe) {
    linhas.push(`A vista cabe e sobram ${real(a.a_vista.sobra_depois)} de folga.`);
  } else {
    linhas.push(`A vista faltam ${real(Math.abs(a.a_vista.sobra_depois))}.`);
  }

  // Parcelamento entra no briefing quando muda a decisao: ou porque foi o que
  // o usuario perguntou, ou porque e a saida que o calculo encontrou.
  const parc = a.parcelado_pedido || a.parcelado_sugerido;
  if (parc) {
    // Sem o detalhe do mes mais apertado: medido no 3b, o "ainda sobram R$ 14,67"
    // saia da frase como "faltam R$ 14,67 para a proxima parcela". Numero que o
    // modelo inverte e pior que numero ausente.
    linhas.push(parc.cabe
      ? `Em ${parc.parcelas}x de ${real(parc.valor_parcela)} cabe em todos os ${parc.parcelas} meses.`
      : `Em ${parc.parcelas}x de ${real(parc.valor_parcela)} nao cabe comecando neste ciclo.`);
  }

  // Resposta de "quando e em quantas vezes": o mes em que da para comecar o
  // parcelamento. Sem esta linha a pergunta ficava sem resposta no briefing e o
  // modelo preenchia o vazio com frase vaga.
  // Quando da para pagar a vista no mesmo mes (ou antes) em que o parcelamento
  // comecaria, a linha do parcelamento so duplica a resposta e gasta prompt.
  const aPartirVale = a.parcelado_a_partir
    && (!a.esperar_ate || a.parcelado_a_partir.mes_inicio < a.esperar_ate.mes_referencia);
  if (aPartirVale) {
    const ap = a.parcelado_a_partir;
    linhas.push(`Comecando em ${nomeMes(ap.mes_inicio)} da para pagar em ${ap.parcelas}x de ${real(ap.valor_parcela)}, e cabe nos ${ap.parcelas} meses.`);
  }

  if (a.esperar_ate) {
    linhas.push(`Cabe a vista sem aperto a partir de ${nomeMes(a.esperar_ate.mes_referencia)} (folga ${real(a.esperar_ate.folga_util)}).`);
  }

  // Juntar dinheiro so interessa quando nao ha parcelamento que resolva: com
  // uma saida parcelada na mesa, "junta em 5 meses" e uma terceira alternativa
  // competindo com o veredito, e o modelo misturava as duas na mesma frase.
  const temSaidaParcelada = a.veredito === 'cabe_parcelado' || a.veredito === 'cabe_parcelado_depois';
  if (!temSaidaParcelada) {
    if (a.juntando && a.juntando.meses) {
      linhas.push(`Guardando a folga, junta em ${a.juntando.meses} ${a.juntando.meses === 1 ? 'mes' : 'meses'}, ${real(a.juntando.por_mes)}/mes.`);
    } else if (a.juntando && a.juntando.meses === null) {
      linhas.push('Guardando a folga, nao junta esse valor em 12 meses.');
    }
  }

  // O alivio entra so quando ele e o argumento da espera. Com o veredito ja
  // resolvido em parcelas, medido no 3b, ele virava frase errada -- "a compra
  // deixa a ultima parcela do Monitor Gamer sem folga" -- porque o modelo lia
  // o item que esta ACABANDO como se fosse a compra da pergunta.
  const alivio = temSaidaParcelada ? null : a.alivios[0];
  if (alivio) {
    linhas.push(`Alivio no orcamento: em ${nomeMes(alivio.mes_referencia)} acaba a ultima parcela de ${alivio.itens.map((i) => i.descricao).join(', ')}, o que devolve ${real(alivio.valor)}/mes de folga.`);
  }

  linhas.push(`DECISAO JA DADA: ${VEREDITOS[a.veredito]} Escreva so o motivo, em uma frase.`);

  return linhas.join('\n');
}

// Briefing de pergunta sem compra: so a fotografia do ciclo.
function briefingGeral(a, pergunta) {
  const f = a.retrato;
  const alivio = f.meses_futuros.find((m) => m.parcelamentos_terminando.length);
  return [
    `Pergunta: "${pergunta}"`,
    `Ciclo ${nomeMes(f.mes_referencia)}, faltam ${f.dias_restantes} dias para a fatura fechar.`,
    `Renda ${real(f.renda_total)}, comprometido ${real(f.comprometido_total)}, ja gastou ${real(f.gasto_livre)}.`,
    ...(f.disponivel !== null && f.disponivel < 0
      ? [`O ciclo ja esta ${real(Math.abs(f.disponivel))} no negativo.`] : []),
    f.folga_atual !== null && f.folga_atual < 0
      ? `Ritmo ${real(f.media_diaria)}/dia e nenhuma folga: o ritmo atual estoura o ciclo em ${real(Math.abs(f.folga_atual))}.`
      : `Disponivel ${real(f.disponivel)}, ritmo ${real(f.media_diaria)}/dia, folga real ${real(f.folga_atual)}.`,
    `Pode gastar hoje sem estourar o ritmo: ${real(f.cabe_hoje)} (ja gastou ${real(f.gasto_hoje)} hoje).`,
    ...(alivio ? [`Alivio no orcamento: em ${nomeMes(alivio.mes_referencia)} acaba a ultima parcela de ${alivio.parcelamentos_terminando.map((p) => p.descricao).join(', ')}, o que devolve ${real(alivio.parcelamentos_terminando.reduce((s2, p) => s2 + p.valor, 0))}/mes de folga.`] : []),
    'Escreva uma frase curta de contexto, usando so estes numeros.',
  ].join('\n');
}

function briefing(analise, pergunta) {
  return analise.tipo === 'compra'
    ? briefingCompra(analise, pergunta)
    : briefingGeral(analise, pergunta);
}

// A FRASE DA DECISAO. E a primeira frase de toda resposta e nao passa pelo
// modelo -- ela e escrita aqui, com o mes e o numero de parcelas que a conta
// achou.
//
// Isso deixou de ser opcional depois do teste do usuario: perguntado "em que mes
// eu poderei comprar um fone de 1600 e em quantas parcelas?", o qwen2.5:3b
// respondeu tres vezes seguidas de tres formas -- "cabendo nos proximos 10
// meses" (sem mes), "em outubro" (sem ano) e so uma vez com o mes certo. O
// briefing tinha a informacao nas tres. Pedir ao modelo para repetir um dado
// e apostar que ele repita; o dado que responde a pergunta nao pode ser aposta.
//
// Tambem e a resposta inteira quando o Ollama esta fora do ar: o app nunca fica
// sem conselho, so sem a justificativa em prosa.
function fraseDoVeredito(a) {
  if (a.tipo !== 'compra') {
    return `Você pode gastar ${real(a.retrato.cabe_hoje)} hoje sem estourar o seu ritmo de ${real(a.retrato.media_diaria)} por dia.`;
  }
  if (a.veredito === 'sem_renda') return 'Cadastre a sua renda do ciclo para eu poder responder.';
  if (a.veredito === 'cabe_no_ritmo') {
    return `Cabe: ${real(a.valor)} entra no gasto de hoje, que ainda tem ${real(a.dentro_do_ritmo.cabe_hoje)} de espaço.`;
  }
  if (a.veredito === 'cabe_agora') {
    return `Cabe agora: depois de gastar ${real(a.valor)} ainda sobram ${real(a.a_vista.sobra_depois)} de folga no ciclo.`;
  }
  const parc = a.parcelado_pedido?.cabe ? a.parcelado_pedido : a.parcelado_sugerido;
  if (parc) {
    return `Dá para comprar hoje, em ${parc.parcelas}x de ${real(parc.valor_parcela)}: a parcela cabe em cada um dos ${parc.parcelas} meses. À vista, não.`;
  }
  // Ordem pelo veredito, nao pela ordem dos campos: quando o parcelamento
  // comeca antes do mes em que daria a vista, e ele a resposta.
  if (a.esperar_ate && a.veredito !== 'cabe_parcelado_depois') {
    const janela = ciclo.janela(a.esperar_ate.mes_referencia);
    return `Agora faltam ${real(Math.abs(a.a_vista.sobra_depois))} de folga. Dá a partir de ${diaMes(janela.inicio)}, na fatura de ${nomeMes(a.esperar_ate.mes_referencia)}, quando a folga do mês chega a ${real(a.esperar_ate.folga_util)}.`;
  }
  if (a.parcelado_a_partir) {
    const ap = a.parcelado_a_partir;
    const janela = ciclo.janela(ap.mes_inicio);
    const inicio = `Dá a partir de ${diaMes(janela.inicio)}, na fatura de ${nomeMes(ap.mes_inicio)}: ${ap.parcelas}x de ${real(ap.valor_parcela)}.`;
    // Por que nao antes: com o parcelamento comecando no ciclo seguinte, o
    // impedimento e o ciclo aberto e da para dizer a data exata. Mais adiante, o
    // impedimento e a folga de algum mes do meio -- afirmar "por causa deste
    // ciclo" ali seria falso.
    const proximo = mesSomar(a.retrato.mes_referencia, 1) === ap.mes_inicio;
    return proximo
      ? `${inicio} Neste ciclo não, porque ele fecha em ${diaMes(ciclo.janela(a.retrato.mes_referencia).fim)} e a folga dele já está negativa.`
      : `${inicio} Começando mais cedo, alguma das parcelas cairia num mês sem folga para ela.`;
  }
  if (a.juntando && a.juntando.meses) {
    return `${real(a.valor)} não cabe em nenhum mês dos próximos 12, nem parcelado: guardando ${real(a.juntando.por_mes)} por mês, dá em ${a.juntando.meses} ${a.juntando.meses === 1 ? 'mês' : 'meses'}.`;
  }
  return `${real(a.valor)} não cabe em nenhum mês dos próximos 12, nem parcelado nem guardando a folga inteira.`;
}

// -------------------------------------------------------------------------
// Trava de numero inventado
// -------------------------------------------------------------------------
//
// O prompt proibe o modelo de calcular, mas proibicao em prompt nao e garantia:
// medido em qwen2.5:3b, a pergunta "quanto posso gastar hoje" produziu
// "R$ 224,81" -- um valor que nao existia em lugar nenhum do briefing. Num app
// de dinheiro isso nao e ruido, e conselho falso.
//
// Entao a frase passa por conferencia antes de chegar ao usuario: todo numero
// que ela cita tem que estar no briefing. Frase com numero desconhecido e
// descartada e a geracao e cortada ali.

// Dia do mes, quantidade de parcelas e ano nao precisam estar no briefing:
// sao contagens, nao valores em reais, e barra-las reprovaria frase correta.
const seguro = (n) => (Number.isInteger(n) && n >= 0 && n <= 31)
  || (Number.isInteger(n) && n >= 2020 && n <= 2035);

// Duas chaves por numero: centavos exatos e reais arredondados. A segunda
// aceita o modelo escrever "R$ 527" para um briefing que dizia "R$ 526,97" --
// arredondar nao e inventar.
function chaves(n) {
  const abs = Math.abs(n);
  return [`c${Math.round(abs * 100)}`, `r${Math.round(abs)}`];
}

function numerosDe(texto) {
  const set = new Set();
  for (const m of texto.matchAll(/\d[\d.,]*/g)) {
    const n = normalizarValor(m[0].replace(/[.,]+$/, ''));
    if (n === null) continue;
    for (const k of chaves(n)) set.add(k);
  }
  return set;
}

// -------------------------------------------------------------------------
// Trava de mes inventado
// -------------------------------------------------------------------------
//
// Mesma classe de erro que o numero inventado, e igualmente caro: medido em
// qwen2.5:3b, um briefing que dizia "Comecando em out/2026" virou "comecando
// em novembro de 2026" na frase. A conferencia de numero nao pega isso -- mes
// por nome nao tem digito -- e "compre em novembro" quando a conta diz outubro
// e um mes de parcela errado.
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Tira acento para comparar "marco" e "março" sem depender de como o modelo
// escreveu.
const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Todo mes citado, no formato do briefing ("out/2026") ou como o modelo tende a
// escrever ("outubro de 2026", "outubro"). Devolve indices 0-11.
function mesesDe(texto) {
  const t = semAcento(texto);
  const achados = new Set();
  for (let i = 0; i < 12; i += 1) {
    const curto = new RegExp(`\\b${MESES_CURTOS[i]}\\b`);
    const longo = new RegExp(`\\b${MESES_LONGOS[i]}\\b`);
    if (curto.test(t) || longo.test(t)) achados.add(i);
  }
  return achados;
}

// Mes citado na frase que nao esta no briefing = mes inventado.
function mesesConferem(frase, permitidos) {
  for (const i of mesesDe(frase)) {
    if (!permitidos.has(i)) return false;
  }
  return true;
}

// Todo numero da frase existe no briefing?
function numerosConferem(frase, permitidos) {
  for (const m of frase.matchAll(/\d[\d.,]*/g)) {
    const n = normalizarValor(m[0].replace(/[.,]+$/, ''));
    if (n === null) continue;
    if (seguro(n)) continue;
    if (!chaves(n).some((k) => permitidos.has(k))) return false;
  }
  return true;
}

// -------------------------------------------------------------------------
// Geracao
// -------------------------------------------------------------------------

// Gera o conselho em streaming, frase por frase.
//
// A granularidade e a frase, nao o token, porque a conferencia de numero so
// faz sentido em frase fechada -- "R$ 22" pode ainda virar "R$ 224,81". Uma
// frase leva ~2s para sair, entao o texto continua aparecendo escrevendo.
//
// A resposta comeca pela frase calculada (`fraseDoVeredito`), emitida antes de
// o modelo ser chamado: ela chega em microssegundos, carrega o mes e o numero de
// parcelas, e nao pode ser perdida por uma escolha de palavra do modelo. A prosa
// do modelo vem depois, so com o motivo.
//
// Devolve { texto, modelo, prosa }. `prosa` falso quer dizer que so a frase
// calculada saiu: modelo fora do ar, ou frase reprovada na conferencia. Nao e
// erro -- a decisao nunca dependeu do modelo.
async function escrever({ analise, pergunta, aoPedaco, sinal }) {
  const instrucao = briefing(analise, pergunta);
  const permitidos = numerosDe(instrucao);
  const mesesPermitidos = mesesDe(instrucao);

  // Controlador proprio: na primeira frase reprovada a geracao e cortada, em
  // vez de queimar CPU escrevendo texto que nao vai ser mostrado.
  const corte = new AbortController();
  if (sinal) sinal.addEventListener('abort', () => corte.abort(), { once: true });

  let buffer = '';
  let emitido = '';
  let reprovou = false;
  let doModelo = '';

  // O rotulo do briefing vazando na frase ja aconteceu: "VEREDITO: Cabe
  // parcelado...". A regra no prompt reduziu, nao eliminou -- modelo pequeno
  // copia o formato do que leu. Entao o rotulo cai aqui tambem.
  const RE_ROTULO = /^\s*(veredito|decisao|decis[aã]o|justificativa|explica[cç][aã]o|resposta|an[aá]lise)\s*:\s*/i;
  const semRotulo = (frase) => frase.replace(RE_ROTULO, '');

  const soltar = (frase0) => {
    const frase = semRotulo(frase0);
    emitido += frase;
    if (aoPedaco) aoPedaco(frase);
  };

  // A decisao, antes de qualquer token de modelo.
  const decisao = `${fraseDoVeredito(analise)} `;
  emitido += decisao;
  if (aoPedaco) aoPedaco(decisao);

  const portao = (pedaco) => {
    if (reprovou || doModelo) return;
    buffer += pedaco;
    // Quebra em frases fechadas; o pedaco final fica no buffer.
    const partes = buffer.split(/(?<=[.!?])\s+/);
    buffer = partes.pop() || '';
    for (const frase of partes) {
      if (!numerosConferem(frase, permitidos) || !mesesConferem(frase, mesesPermitidos)) {
        reprovou = true;
        corte.abort();
        return;
      }
      doModelo += frase;
      soltar(`${frase} `);
      // O motivo e UMA frase, e a geracao para na primeira: em CPU cada frase a
      // mais custa ~4s de espera, e o modelo continuava escrevendo variacao da
      // mesma coisa depois de ja ter respondido.
      corte.abort();
      return;
    }
  };

  let modelo = null;
  try {
    const r = await chatTextoStream({ mensagens: [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: instrucao },
    ], aoPedaco: portao, sinal: corte.signal });
    modelo = r.modelo;
  } catch (e) {
    // Modelo fora do ar ou corte proprio nao derrubam a resposta: a frase da
    // decisao ja saiu. Qualquer outro erro sobe, porque ai e bug.
    if (!(e instanceof ErroOllama)) throw e;
    modelo = null;
  }

  // Sobra do buffer: o modelo pode terminar sem pontuacao final.
  if (!reprovou && !doModelo && buffer.trim() && numerosConferem(buffer, permitidos)
    && mesesConferem(buffer, mesesPermitidos)) {
    doModelo += buffer;
    soltar(buffer);
  }

  return { texto: emitido.trim(), modelo, prosa: Boolean(doModelo.trim()) };
}

module.exports = {
  escrever, briefing, fraseDoVeredito,
  numerosConferem, numerosDe, mesesConferem, mesesDe,
  VEREDITOS,
};
