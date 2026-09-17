// Rotas do consultor financeiro.
//
// Duas formas da mesma coisa:
//   POST /api/consultor        -> JSON fechado (analise + texto). Simples de
//                                 testar via curl e de consumir por script.
//   POST /api/consultor/stream -> SSE. Manda a analise no primeiro evento, em
//                                 milissegundos, e depois o texto por pedacos.
//
// O streaming existe porque a analise e instantanea e a prosa nao: em CPU o
// modelo gera ~10 tokens/s. Esperar o texto para so entao mostrar os numeros
// desperdicaria os 10s em que a decisao ja esta pronta.
const express = require('express');
const { lerCompra, analisarCompra, analisarGeral } = require('../services/consultorService');
const { escrever, fraseDoVeredito, VEREDITOS } = require('../services/conselho');
const { ErroOllama } = require('../services/ollama');
const consultas = require('../services/consultasService');
const {
  ErroApi, limparTexto, LIMITE_MENSAGEM, inteiroPositivo,
} = require('../utils/validacao');
const ciclo = require('../utils/ciclo');

const router = express.Router();

// Valida o corpo e monta a analise. Roda inteira sem LLM: e so banco e conta.
function prepararAnalise(corpo) {
  const pergunta = limparTexto(corpo.pergunta ?? corpo.mensagem, LIMITE_MENSAGEM);
  if (!pergunta || pergunta.length < 3) {
    throw new ErroApi(400, 'Campo "pergunta" e obrigatorio (minimo 3 caracteres).');
  }

  const mes = corpo.mes === undefined || corpo.mes === '' ? ciclo.cicloAtual() : corpo.mes;
  if (!ciclo.cicloValido(mes)) {
    throw new ErroApi(400, 'Campo "mes" deve estar no formato YYYY-MM.');
  }

  // Valor explicito no corpo tem prioridade sobre o que a frase diz: o app
  // pode oferecer um campo de valor separado no futuro sem mudar nada aqui.
  const lido = lerCompra(pergunta);
  const valor = corpo.valor !== undefined && corpo.valor !== null && corpo.valor !== ''
    ? Number(corpo.valor)
    : lido.valor;
  const parcelas = corpo.parcelas ?? lido.parcelas;
  // Piso de gasto livre por mes: o corpo manda, ou a propria frase diz
  // ("quero ter pelo menos 700 reais no mes para gastar livre").
  const reserva = corpo.reserva !== undefined && corpo.reserva !== null && corpo.reserva !== ''
    ? Number(corpo.reserva)
    : lido.reserva;

  const analise = valor && Number.isFinite(valor) && valor > 0
    ? analisarCompra({ valor, parcelas, mes, reserva })
    : analisarGeral({ mes });

  // Toda pergunta fica registrada. Falha no registro nao pode derrubar a
  // resposta: sem id, o app so nao mostra os botoes de avaliar.
  let consultaId = null;
  try {
    consultaId = consultas.registrar({ pergunta, mes, analise });
  } catch (e) {
    console.warn(`[consultor] nao registrei a consulta: ${e.message}`);
  }

  return { pergunta, analise, consultaId };
}

function concluir(consultaId, texto) {
  if (!consultaId) return;
  try {
    consultas.concluir(consultaId, texto);
  } catch (e) {
    console.warn(`[consultor] nao gravei o texto da consulta ${consultaId}: ${e.message}`);
  }
}

// Resposta so com a analise, sem uma palavra de LLM. O app pinta a tela com
// isto antes de o modelo comecar a escrever.
function corpoAnalise(pergunta, analise, consultaId) {
  return {
    consulta_id: consultaId,
    pergunta,
    tipo: analise.tipo,
    veredito: analise.veredito,
    titulo: VEREDITOS[analise.veredito],
    analise,
  };
}

// POST /api/consultor { pergunta, mes?, valor?, parcelas? }
router.post('/consultor', async (req, res, next) => {
  try {
    const { pergunta, analise, consultaId } = prepararAnalise(req.body || {});
    // `escrever` ja comeca pela frase calculada e nao levanta ErroOllama: o
    // pior caso e a resposta sair so com ela, sem a prosa do motivo.
    const r = await escrever({ analise, pergunta, sinal: req.signal });
    concluir(consultaId, r.texto);
    res.json({
      ...corpoAnalise(pergunta, analise, consultaId), texto: r.texto, modelo: r.modelo, prosa: r.prosa,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/consultor/stream -> text/event-stream
//
// Eventos: `analise` (uma vez, imediato), `pedaco` (N vezes), `fim`, `erro`.
router.post('/consultor/stream', async (req, res, next) => {
  let preparado;
  try {
    preparado = prepararAnalise(req.body || {});
  } catch (e) {
    // Erro de validacao acontece ANTES de abrir o stream: vai como HTTP normal
    // para o cliente poder tratar como qualquer outro 400.
    next(e);
    return;
  }

  const { pergunta, analise, consultaId } = preparado;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // O Caddy nao bufferiza por padrao, mas proxy no caminho pode; o cabecalho
    // e a forma padrao de pedir para nao segurar os eventos.
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const enviar = (evento, dados) => {
    if (res.writableEnded) return;
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  };

  enviar('analise', corpoAnalise(pergunta, analise, consultaId));

  try {
    // O primeiro `pedaco` e a frase da decisao, que sai antes de o modelo ser
    // chamado: no app o veredito aparece escrito na hora e so o motivo demora.
    const r = await escrever({
      analise,
      pergunta,
      sinal: req.signal,
      aoPedaco: (pedaco) => enviar('pedaco', { texto: pedaco }),
    });
    concluir(consultaId, r.texto);
    enviar('fim', { texto: r.texto, modelo: r.modelo, prosa: r.prosa });
  } catch (e) {
    if (e instanceof ErroOllama) {
      // Nao deve acontecer: `escrever` engole ErroOllama. Se acontecer, a frase
      // calculada ja foi enviada como pedaco, entao so fecha o stream.
      concluir(consultaId, fraseDoVeredito(analise));
      enviar('fim', { texto: fraseDoVeredito(analise), modelo: null, prosa: false });
    } else {
      enviar('erro', { erro: e.message || 'Falha ao gerar o conselho.' });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// GET /api/consultor/historico?limite=50&nota=-1
router.get('/consultor/historico', (req, res, next) => {
  try {
    const limite = inteiroPositivo(req.query.limite, 50, 500);
    let nota;
    if (req.query.nota !== undefined) {
      nota = Number(req.query.nota);
      if (nota !== 1 && nota !== -1) throw new ErroApi(400, 'Parametro "nota" deve ser 1 ou -1.');
    }
    res.json({ consultas: consultas.listar({ limite, nota }) });
  } catch (e) {
    next(e);
  }
});

// POST /api/consultor/:id/avaliacao { nota: 1 | -1 | null, comentario? }
router.post('/consultor/:id/avaliacao', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErroApi(400, 'O id deve ser um inteiro positivo.');
    res.json({ consulta: consultas.avaliar(id, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
