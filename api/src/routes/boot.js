// GET /api/boot?mes=YYYY-MM -> tudo que o app precisa para pintar a primeira
// tela, em uma resposta.
//
// Por que existe: o app nao consegue pedir numero nenhum antes de saber qual
// ciclo esta aberto (dia 29 ja pertence ao ciclo seguinte), entao o boot era
// `/ciclo` e SO DEPOIS sete chamadas em paralelo -- duas rodadas de rede em
// serie, cada uma custando um RTT completo. No celular em rede movel, com
// DNS + TLS para um terceiro dominio, isso e a diferenca entre abrir na hora e
// ficar em "Ligando o painel...".
//
// Aqui tudo e sincrono e sai do mesmo SQLite local: juntar as sete consultas
// numa resposta custa microssegundos de CPU e economiza um RTT inteiro.
const express = require('express');
const { calcularSaldo, calcularResumo } = require('../services/saldoService');
const { calcularPainel } = require('../services/painelService');
const gastosService = require('../services/gastosService');
const compromissos = require('../services/compromissosService');
const configRuntime = require('../services/configService');
const ciclo = require('../utils/ciclo');
const { ErroApi, inteiroPositivo } = require('../utils/validacao');

const router = express.Router();

const MESES_PROJECAO = 6;
const LIMITE_GASTOS = 200;

router.get('/boot', (req, res, next) => {
  try {
    const atual = ciclo.cicloAtual();
    const mes = req.query.mes === undefined || req.query.mes === '' ? atual : req.query.mes;
    if (!ciclo.cicloValido(mes)) {
      throw new ErroApi(400, 'Parametro "mes" deve estar no formato YYYY-MM.');
    }

    const limite = inteiroPositivo(req.query.limite, LIMITE_GASTOS, 500);
    const meses = inteiroPositivo(req.query.meses, MESES_PROJECAO, 36);
    const p = configRuntime.parametrosCiclo();
    const renda = compromissos.totalRenda(mes);

    res.json({
      // Servido tal como as rotas individuais servem, campo por campo: o
      // cliente usa o mesmo normalizador para as duas origens, e /saldo,
      // /dashboard e companhia continuam existindo sozinhas.
      ciclo: {
        ...ciclo.janela(mes),
        ciclo_atual: atual,
        dias_decorridos: ciclo.diasDecorridos(mes),
        dias_restantes: ciclo.diasRestantes(mes),
        configuracao: {
          dia_fechamento: p.diaFechamento,
          dia_recebimento: p.diaRecebimento,
          dia_pagamento: p.diaPagamento,
          notificar: configRuntime.notificarFatura(),
        },
      },
      saldo: calcularSaldo(mes),
      gastos: gastosService.listarGastos({ mes, limite }),
      dashboard: calcularPainel(mes),
      resumo: calcularResumo(mes),
      compromissos: compromissos.compromissosDoMes(mes),
      projecao: compromissos.projetar({ mes, meses }),
      rendas: {
        mes_referencia: mes,
        renda_definida: renda.definida,
        renda_total: renda.total,
        rendas: renda.entradas,
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
