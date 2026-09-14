// Caixinhas: objetivos, sugestao e registro da divisao da sobra do ciclo, e o
// alerta de teto da Caixinha Turbo. Tudo logico -- nenhuma rota move dinheiro.
const express = require('express');
const servico = require('../services/caixinhasService');
const { ErroApi } = require('../utils/validacao');
const { mesValido } = require('../utils/data');

const router = express.Router();

function lerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroApi(400, 'O id deve ser um inteiro positivo.');
  return id;
}

// Envolve um handler sincrono, encaminhando erro para o middleware.
function rota(handler) {
  return (req, res, next) => {
    try {
      handler(req, res);
    } catch (e) {
      next(e);
    }
  };
}

// GET /api/caixinhas -> objetivos com progresso, meta da reserva, limite da
// Caixinha Turbo, sobra do ultimo ciclo fechado e historico de divisoes.
router.get('/caixinhas', rota((req, res) => {
  res.json(servico.getResumoCaixas());
}));

// GET /api/caixinhas/limite -> so o alerta de teto.
router.get('/caixinhas/limite', rota((req, res) => {
  res.json(servico.verificarLimiteCaixinhaTurbo());
}));

// POST /api/caixinhas/sugestao { valor? , mes_referencia? }
// Sem `valor`, sugere sobre a sobra do ciclo pedido (padrao: ultimo fechado).
// Nao grava nada; com `valor` serve para simular a previsao do ciclo aberto.
router.post('/caixinhas/sugestao', rota((req, res) => {
  const corpo = req.body || {};
  if (corpo.valor !== undefined) {
    res.json({ mes_referencia: corpo.mes_referencia || null, ...servico.calcularSugestaoDivisao(corpo.valor) });
    return;
  }
  const mes = corpo.mes_referencia || servico.situacaoDaSobra().mes_referencia;
  if (!mesValido(mes)) throw new ErroApi(400, 'Campo "mes_referencia" deve estar no formato YYYY-MM.');
  const sobra = servico.sobraDoCiclo(mes);
  if (sobra === null || sobra <= 0) {
    throw new ErroApi(422, `O ciclo ${mes} nao tem sobra para dividir.`, { sobra });
  }
  res.json({ mes_referencia: mes, ...servico.calcularSugestaoDivisao(sobra) });
}));

// POST /api/caixinhas/divisoes { mes_referencia, divisao: [{ objetivo_id, valor | percentual }] }
// `valor` e o caminho exato; os valores precisam somar a sobra ao centavo.
router.post('/caixinhas/divisoes', rota((req, res) => {
  const corpo = req.body || {};
  res.status(201).json(servico.confirmarDivisao(corpo.mes_referencia, corpo.divisao));
}));

// DELETE /api/caixinhas/divisoes/:mes -> desfaz a divisao daquele ciclo.
router.delete('/caixinhas/divisoes/:mes', rota((req, res) => {
  res.json(servico.desfazerDivisao(req.params.mes));
}));

// PATCH /api/caixinhas/reserva { multiplicador } -> meses de despesa da meta.
router.patch('/caixinhas/reserva', rota((req, res) => {
  res.json(servico.definirMultiplicadorReserva((req.body || {}).multiplicador));
}));

// CRUD de objetivos. Toda resposta traz o resumo novo, para a tela repintar
// sem uma segunda ida ao servidor.
router.post('/objetivos', rota((req, res) => {
  const objetivo = servico.criarObjetivo(req.body || {});
  res.status(201).json({ objetivo, resumo: servico.getResumoCaixas() });
}));

router.patch('/objetivos/:id', rota((req, res) => {
  const objetivo = servico.atualizarObjetivo(lerId(req), req.body || {});
  res.json({ objetivo, resumo: servico.getResumoCaixas() });
}));

router.delete('/objetivos/:id', rota((req, res) => {
  const objetivo = servico.removerObjetivo(lerId(req));
  res.json({ removido: true, objetivo, resumo: servico.getResumoCaixas() });
}));

module.exports = router;
