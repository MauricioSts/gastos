// Transforma a analise calculada em uma frase de conselho.
//
// Divisao de trabalho deliberada: `consultorService` decide, este arquivo
// escreve. O prompt entrega o veredito JA DECIDIDO e proibe o modelo de
// recalcular -- um modelo de 3B em CPU erra aritmetica com frequencia, e aqui
// o numero errado sai como recomendacao financeira. O modelo tem uma unica
// tarefa: explicar em portugues o que a conta ja concluiu.
const { chatTextoStream, ErroOllama } = require('./ollama');
const { nomeMes } = require('../utils/data');
const { normalizarValor } = require('../utils/validacao');

const real = (n) => (n === null || n === undefined
  ? '—'
  : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// O prompt e curto de proposito. Em CPU, o prompt custa ~25ms por token so
// para ser lido: cada linha de instrucao aqui atrasa a primeira palavra que o
// usuario ve. Regra que nao muda a saida foi cortada.
const PROMPT_SISTEMA = `Consultor financeiro de um app de gastos brasileiro.

- O VEREDITO ja foi decidido por calculo. Explique-o, nunca contradiga.
- Use SO os numeros da lista. Nunca calcule nem invente valor.
- Maximo 3 frases curtas, portugues brasileiro, sem emoji. Trate a pessoa por voce,
  mas nunca comece a frase com "Voce,".
- Parcela que esta terminando nao e o item da pergunta, e alivio no orcamento.
- Sem conselho generico: so este caso.`;

// Rotulos de veredito, em primeira pessoa do app. O texto do modelo vem DEPOIS
// disto na tela, entao aqui fica a decisao e la a justificativa.
const VEREDITOS = {
  cabe_agora: 'Cabe agora, a vista.',
  cabe_parcelado: 'So cabe parcelado.',
  esperar: 'Melhor esperar.',
  nao_cabe: 'Nao cabe no seu orcamento hoje.',
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
    `Disponivel ${real(f.disponivel)}, mas o ritmo de ${real(f.media_diaria)}/dia ainda vai consumir ${real(f.necessidade_ate_fechar)}.`,
    `Folga real para gastar fora do ritmo: ${real(a.a_vista.folga_util)}.`,
  ];

  if (a.a_vista.cabe) {
    linhas.push(`A vista cabe e sobram ${real(a.a_vista.sobra_depois)} de folga.`);
  } else {
    linhas.push(`A vista faltam ${real(Math.abs(a.a_vista.sobra_depois))}.`);
  }

  // Parcelamento entra no briefing quando muda a decisao: ou porque foi o que
  // o usuario perguntou, ou porque e a saida que o calculo encontrou.
  const parc = a.parcelado_pedido || a.parcelado_sugerido;
  if (parc) {
    linhas.push(parc.cabe
      ? `Em ${parc.parcelas}x de ${real(parc.valor_parcela)} cabe nos ${parc.parcelas} meses; o mes mais apertado (${nomeMes(parc.mes_mais_apertado.mes_referencia)}) ainda sobra ${real(parc.mes_mais_apertado.sobra_depois)}.`
      : `Em ${parc.parcelas}x de ${real(parc.valor_parcela)} nao cabe: em ${nomeMes(parc.mes_mais_apertado.mes_referencia)} faltariam ${real(Math.abs(parc.mes_mais_apertado.sobra_depois))}.`);
  }

  if (a.esperar_ate) {
    linhas.push(`Cabe a vista sem aperto a partir de ${nomeMes(a.esperar_ate.mes_referencia)} (folga ${real(a.esperar_ate.folga_util)}).`);
  }

  if (a.juntando && a.juntando.meses) {
    linhas.push(`Guardando a folga, junta em ${a.juntando.meses} ${a.juntando.meses === 1 ? 'mes' : 'meses'}, ${real(a.juntando.por_mes)}/mes.`);
  } else if (a.juntando && a.juntando.meses === null) {
    linhas.push('Guardando a folga, nao junta esse valor em 12 meses.');
  }

  // So o proximo alivio: o segundo e o terceiro nunca mudaram a frase e
  // custavam prompt.
  const alivio = a.alivios[0];
  if (alivio) {
    linhas.push(`Alivio no orcamento: em ${nomeMes(alivio.mes_referencia)} acaba a ultima parcela de ${alivio.itens.map((i) => i.descricao).join(', ')}, o que devolve ${real(alivio.valor)}/mes de folga.`);
  }

  linhas.push(`VEREDITO: ${VEREDITOS[a.veredito]} Justifique em 3 frases.`);

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
    `Disponivel ${real(f.disponivel)}, ritmo ${real(f.media_diaria)}/dia, folga real ${real(f.folga_atual)}.`,
    `Pode gastar hoje sem estourar o ritmo: ${real(f.cabe_hoje)} (ja gastou ${real(f.gasto_hoje)} hoje).`,
    ...(alivio ? [`Alivio no orcamento: em ${nomeMes(alivio.mes_referencia)} acaba a ultima parcela de ${alivio.parcelamentos_terminando.map((p) => p.descricao).join(', ')}, o que devolve ${real(alivio.parcelamentos_terminando.reduce((s2, p) => s2 + p.valor, 0))}/mes de folga.`] : []),
    'Responda em 3 frases, usando so estes numeros.',
  ].join('\n');
}

function briefing(analise, pergunta) {
  return analise.tipo === 'compra'
    ? briefingCompra(analise, pergunta)
    : briefingGeral(analise, pergunta);
}

// Frase de reserva quando o Ollama esta fora do ar. O app nao pode ficar sem
// resposta: a analise inteira ja existe sem o modelo, so a prosa se perde.
function textoDeReserva(a) {
  if (a.tipo !== 'compra') {
    return `Sua folga neste ciclo e de ${real(a.retrato.folga_atual)}, mantendo o ritmo de ${real(a.retrato.media_diaria)} por dia.`;
  }
  if (a.veredito === 'sem_renda') return 'Cadastre sua renda do ciclo para eu poder responder.';
  if (a.veredito === 'cabe_agora') {
    return `Cabe: depois de gastar ${real(a.valor)} ainda sobram ${real(a.a_vista.sobra_depois)} de folga no ciclo.`;
  }
  const parc = a.parcelado_pedido?.cabe ? a.parcelado_pedido : a.parcelado_sugerido;
  if (parc) {
    return `A vista nao cabe, mas ${parc.parcelas}x de ${real(parc.valor_parcela)} cabe em todos os meses afetados.`;
  }
  if (a.esperar_ate) {
    return `A vista faltam ${real(Math.abs(a.a_vista.sobra_depois))} de folga. Em ${nomeMes(a.esperar_ate.mes_referencia)} a compra cabe sem aperto.`;
  }
  return `Sua folga e de ${real(a.a_vista.folga_util)} e a compra e de ${real(a.valor)}: nao cabe sem comprometer o dia a dia.`;
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
// Devolve { texto, modelo, bloqueado }. `bloqueado` verdadeiro quer dizer que
// nada do modelo passou na conferencia e quem chamou deve usar `textoDeReserva`.
async function escrever({ analise, pergunta, aoPedaco, sinal }) {
  const instrucao = briefing(analise, pergunta);
  const permitidos = numerosDe(instrucao);

  // Controlador proprio: na primeira frase reprovada a geracao e cortada, em
  // vez de queimar CPU escrevendo texto que nao vai ser mostrado.
  const corte = new AbortController();
  if (sinal) sinal.addEventListener('abort', () => corte.abort(), { once: true });

  let buffer = '';
  let emitido = '';
  let reprovou = false;

  const soltar = (frase) => {
    emitido += frase;
    if (aoPedaco) aoPedaco(frase);
  };

  const portao = (pedaco) => {
    if (reprovou) return;
    buffer += pedaco;
    // Quebra em frases fechadas; o pedaco final fica no buffer.
    const partes = buffer.split(/(?<=[.!?])\s+/);
    buffer = partes.pop() || '';
    for (const frase of partes) {
      if (!numerosConferem(frase, permitidos)) {
        reprovou = true;
        corte.abort();
        return;
      }
      soltar(`${frase} `);
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
    // Corte proprio nao e falha: e a trava funcionando.
    if (!(reprovou && e instanceof ErroOllama)) throw e;
  }

  // Sobra do buffer: o modelo pode terminar sem pontuacao final.
  if (!reprovou && buffer.trim() && numerosConferem(buffer, permitidos)) soltar(buffer);

  return { texto: emitido.trim(), modelo, bloqueado: !emitido.trim() };
}

module.exports = { escrever, briefing, textoDeReserva, numerosConferem, numerosDe, VEREDITOS };
