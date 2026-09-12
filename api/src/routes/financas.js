// Rotas de saldo, resumo e orcamento.
const express = require('express');
const {
  calcularSaldo, calcularResumo, definirOrcamento, definirLimiteCategoria,
} = require('../services/saldoService');
const { calcularPainel } = require('../services/painelService');
const configRuntime = require('../services/configService');
const ciclo = require('../utils/ciclo');
const { ErroApi } = require('../utils/validacao');

const router = express.Router();

// GET /api/ciclo?mes=YYYY-MM -> janela do ciclo da fatura.
// O app precisa disso ANTES de pedir qualquer numero: o periodo de referencia
// nao e o mes do calendario, entao o cliente nao consegue deduzir sozinho qual
// ciclo esta aberto hoje (dia 29 ja e o ciclo seguinte).
router.get('/ciclo', (req, res, next) => {
  try {
    const alvo = req.query.mes === undefined || req.query.mes === ''
      ? ciclo.cicloAtual()
      : req.query.mes;
    if (!ciclo.cicloValido(alvo)) {
      const e = new Error('Parametro "mes" deve estar no formato YYYY-MM.');
      e.status = 400;
      throw e;
    }
    res.json({
      ...ciclo.janela(alvo),
      ciclo_atual: ciclo.cicloAtual(),
      dias_decorridos: ciclo.diasDecorridos(alvo),
      dias_restantes: ciclo.diasRestantes(alvo),
      configuracao: configuracaoFatura(),
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/saldo?mes=YYYY-MM (padrao: mes corrente)
router.get('/saldo', (req, res, next) => {
  try {
    res.json(calcularSaldo(req.query.mes));
  } catch (e) {
    next(e);
  }
});

// GET /api/dashboard?mes=YYYY-MM -> retrato do gasto livre do ciclo.
// Existe separado de /resumo porque o publico e outro: /resumo alimenta
// decisao (quanto sobra, o que estourou), /dashboard alimenta leitura
// (curva do dia a dia, semanas, maiores gastos, comparacao com o ciclo
// anterior). Juntar os dois faria toda tela pagar por agregacao que nao usa.
router.get('/dashboard', (req, res, next) => {
  try {
    res.json(calcularPainel(req.query.mes));
  } catch (e) {
    next(e);
  }
});

// GET /api/resumo?mes=YYYY-MM -> agregado por categoria + media diaria
router.get('/resumo', (req, res, next) => {
  try {
    res.json(calcularResumo(req.query.mes));
  } catch (e) {
    next(e);
  }
});

// POST /api/orcamento { mes_referencia, valor_total }
router.post('/orcamento', (req, res, next) => {
  try {
    res.json({ definido: true, saldo: definirOrcamento(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

// POST /api/limite-categoria { categoria, mes_referencia, valor_limite }
router.post('/limite-categoria', (req, res, next) => {
  try {
    res.json({ definido: true, limite: definirLimiteCategoria(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Fatura: os dias do ciclo e o aviso de fechamento.
// ---------------------------------------------------------------------------

function configuracaoFatura() {
  const p = configRuntime.parametrosCiclo();
  return {
    dia_fechamento: p.diaFechamento,
    dia_recebimento: p.diaRecebimento,
    dia_pagamento: p.diaPagamento,
    notificar: configRuntime.notificarFatura(),
  };
}

// GET /api/fatura -> configuracao efetiva + a janela que ela produz hoje.
router.get('/fatura', (req, res, next) => {
  try {
    const atual = ciclo.cicloAtual();
    res.json({
      configuracao: configuracaoFatura(),
      ciclo_atual: atual,
      janela: ciclo.janela(atual),
      dias_restantes: ciclo.diasRestantes(atual),
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/fatura { dia_fechamento?, dia_recebimento?, dia_pagamento?, notificar? }
//
// Mudar um dia do ciclo reescreve o passado: nenhum gasto guarda a que mes
// pertence, entao a janela nova vale para o historico inteiro na proxima
// consulta. E o comportamento desejado -- quem cadastrou o fechamento errado
// conserta aqui e os meses passados param de estar errados junto.
router.patch('/fatura', (req, res, next) => {
  try {
    const corpo = req.body || {};
    const dias = ['dia_fechamento', 'dia_recebimento', 'dia_pagamento'];
    const mudancas = [];

    for (const campo of dias) {
      if (corpo[campo] === undefined) continue;
      const n = Number(corpo[campo]);
      // Fora da faixa e recusado, nunca aparado para 31: aparar em silencio
      // gravaria um ciclo que o usuario nao pediu.
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        throw new ErroApi(400, `Campo "${campo}" deve ser um dia inteiro entre 1 e 31.`);
      }
      mudancas.push([`ciclo_${campo}`, n]);
    }

    if (corpo.notificar !== undefined) {
      if (typeof corpo.notificar !== 'boolean') {
        throw new ErroApi(400, 'Campo "notificar" deve ser true ou false.');
      }
      mudancas.push(['fatura_notificar', corpo.notificar]);
    }

    if (!mudancas.length) {
      throw new ErroApi(400, 'Envie ao menos um campo: dia_fechamento, dia_recebimento, dia_pagamento ou notificar.');
    }

    for (const [chave, valor] of mudancas) configRuntime.gravar(chave, valor);

    const atual = ciclo.cicloAtual();
    res.json({
      atualizado: true,
      configuracao: configuracaoFatura(),
      ciclo_atual: atual,
      janela: ciclo.janela(atual),
      saldo: calcularSaldo(atual),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
