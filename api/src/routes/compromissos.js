// CRUD de renda, contas fixas e parcelamentos, mais as visoes derivadas
// (compromissos do mes e projecao).
const express = require('express');
const servico = require('../services/compromissosService');
const { calcularSaldo } = require('../services/saldoService');
const { ErroApi, inteiroPositivo } = require('../utils/validacao');
const { mesValido } = require('../utils/data');
const { cicloAtual } = require('../utils/ciclo');

const router = express.Router();

// Le e valida o :id da rota.
function lerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroApi(400, 'O id deve ser um inteiro positivo.');
  return id;
}

// Mes da query string, com o mes corrente como padrao.
function lerMes(req, campo = 'mes') {
  const bruto = req.query[campo];
  if (bruto === undefined || bruto === '') return cicloAtual();
  if (!mesValido(bruto)) {
    throw new ErroApi(400, `Parametro "${campo}" deve estar no formato YYYY-MM.`);
  }
  return bruto;
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

// --------------------------------------------------------------------------
// Rendas
// --------------------------------------------------------------------------

router.get('/rendas', rota((req, res) => {
  const mes = lerMes(req);
  const { total, definida, entradas } = servico.totalRenda(mes);
  res.json({ mes_referencia: mes, renda_definida: definida, renda_total: total, rendas: entradas });
}));

router.post('/rendas', rota((req, res) => {
  const renda = servico.criarRenda(req.body || {});
  res.status(201).json({ renda, saldo: calcularSaldo(renda.mes_referencia) });
}));

router.patch('/rendas/:id', rota((req, res) => {
  const renda = servico.atualizarRenda(lerId(req), req.body || {});
  res.json({ renda, saldo: calcularSaldo(renda.mes_referencia) });
}));

router.delete('/rendas/:id', rota((req, res) => {
  const renda = servico.removerRenda(lerId(req));
  res.json({ removido: true, renda, saldo: calcularSaldo(renda.mes_referencia) });
}));

// --------------------------------------------------------------------------
// Contas fixas
// --------------------------------------------------------------------------

router.get('/contas-fixas', rota((req, res) => {
  const incluirInativas = req.query.incluir_inativas === 'true';
  const contas = servico.listarContasFixas({ incluirInativas });
  res.json({
    total_retornado: contas.length,
    total_mensal: contas
      .filter((c) => c.ativa === 1)
      .reduce((a, c) => a + c.valor, 0),
    contas_fixas: contas,
  });
}));

router.post('/contas-fixas', rota((req, res) => {
  const conta = servico.criarContaFixa(req.body || {});
  res.status(201).json({ conta_fixa: conta, saldo: calcularSaldo(cicloAtual()) });
}));

router.patch('/contas-fixas/:id', rota((req, res) => {
  const conta = servico.atualizarContaFixa(lerId(req), req.body || {});
  res.json({ conta_fixa: conta, saldo: calcularSaldo(cicloAtual()) });
}));

router.delete('/contas-fixas/:id', rota((req, res) => {
  const conta = servico.removerContaFixa(lerId(req));
  res.json({ removido: true, conta_fixa: conta, saldo: calcularSaldo(cicloAtual()) });
}));

// --------------------------------------------------------------------------
// Parcelamentos
// --------------------------------------------------------------------------

router.get('/parcelamentos', rota((req, res) => {
  const mes = lerMes(req);
  const parcelamentos = servico.listarParcelamentos(mes);
  res.json({
    mes_referencia: mes,
    total_retornado: parcelamentos.length,
    total_no_mes: parcelamentos
      .filter((p) => p.incide_no_mes)
      .reduce((a, p) => a + p.valor_parcela, 0),
    parcelamentos,
  });
}));

router.post('/parcelamentos', rota((req, res) => {
  const parcelamento = servico.criarParcelamento(req.body || {});
  res.status(201).json({ parcelamento, saldo: calcularSaldo(cicloAtual()) });
}));

router.patch('/parcelamentos/:id', rota((req, res) => {
  const parcelamento = servico.atualizarParcelamento(lerId(req), req.body || {});
  res.json({ parcelamento, saldo: calcularSaldo(cicloAtual()) });
}));

router.delete('/parcelamentos/:id', rota((req, res) => {
  const parcelamento = servico.removerParcelamento(lerId(req));
  res.json({ removido: true, parcelamento, saldo: calcularSaldo(cicloAtual()) });
}));

// --------------------------------------------------------------------------
// Visoes derivadas
// --------------------------------------------------------------------------

// GET /api/compromissos?mes=YYYY-MM
// Contas fixas + parcelas que incidem naquele mes, ja resolvidas.
router.get('/compromissos', rota((req, res) => {
  res.json(servico.compromissosDoMes(lerMes(req)));
}));

// GET /api/projecao?meses=6&mes=YYYY-MM
// Comprometido projetado, marcando os meses em que um parcelamento termina.
router.get('/projecao', rota((req, res) => {
  const meses = inteiroPositivo(req.query.meses, 6, 36);
  res.json(servico.projetar({ mes: lerMes(req), meses }));
}));

module.exports = router;
