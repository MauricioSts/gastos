// Rotas de CRUD de gastos, incluindo a extracao via LLM local.
const express = require('express');
const gastosService = require('../services/gastosService');
const { calcularSaldo } = require('../services/saldoService');
const { extrairGasto } = require('../services/extrator');
const { ErroOllama } = require('../services/ollama');
const {
  ErroApi, LIMITE_MENSAGEM, limparTexto, inteiroPositivo,
} = require('../utils/validacao');
const { cicloAtual } = require('../utils/ciclo');
const compromissosService = require('../services/compromissosService');

const router = express.Router();

// Rotulos acentuados apenas para exibicao. No banco a categoria continua
// sendo o valor do enum, sem acento, para nao complicar filtros e comparacoes.
const ROTULO_CATEGORIA = {
  alimentacao: 'alimentação',
  transporte: 'transporte',
  lazer: 'lazer',
  saude: 'saúde',
  compras: 'compras',
  contas: 'contas',
  assinaturas: 'assinaturas',
  educacao: 'educação',
  outros: 'outros',
};

// Formata um numero como moeda brasileira para a mensagem de retorno.
function formatarBRL(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Monta a frase de confirmacao exibida ao usuario.
// O numero mostrado e sempre o disponivel de fato (renda - comprometido -
// gasto livre), nunca a renda bruta.
function montarResposta(gasto, saldo) {
  const rotulo = ROTULO_CATEGORIA[gasto.categoria] || gasto.categoria;
  const base = `Anotei: ${formatarBRL(gasto.valor)} em ${rotulo}.`;
  if (!saldo.renda_definida) {
    return `${base} Nenhuma renda cadastrada para ${saldo.mes_referencia}; gasto livre no mês: ${formatarBRL(saldo.gasto_livre)}`;
  }
  return `${base} Disponível no mês: ${formatarBRL(saldo.disponivel)}`;
}

// Monta a frase de confirmacao de uma entrada de dinheiro.
function montarRespostaEntrada(renda, saldo) {
  const base = `Entrou: ${formatarBRL(renda.valor)} (${renda.descricao}).`;
  if (!saldo.renda_definida) return base;
  return `${base} Disponível no mês: ${formatarBRL(saldo.disponivel)}`;
}

// Monta a sugestao de cadastro de um compromisso recorrente.
// Nada e gravado aqui: um erro do LLM em conta fixa ou parcelamento
// contamina varios meses, entao o usuario confirma na interface antes.
function montarSugestao(extraido, mensagem) {
  const rotulo = ROTULO_CATEGORIA[extraido.categoria] || extraido.categoria;

  if (extraido.tipo === 'conta_fixa') {
    return {
      tipo: 'conta_fixa',
      resposta: `Isso parece uma conta fixa de ${formatarBRL(extraido.valor)} em ${rotulo}, que vai se repetir todo mês. Confere antes de eu salvar.`,
      requer_confirmacao: true,
      confirmar_em: 'POST /api/contas-fixas',
      sugestao: {
        descricao: extraido.descricao,
        valor: extraido.valor,
        // null quando o modelo nao achou o dia: a interface pergunta.
        dia_vencimento: extraido.dia_vencimento,
        categoria: extraido.categoria,
        ativa: true,
      },
      mensagem_original: mensagem,
      llm: extraido._meta,
    };
  }

  const total = extraido.valor_total_compra
    ?? Math.round(extraido.valor_parcela * extraido.total_parcelas * 100) / 100;

  return {
    tipo: 'parcelamento',
    resposta: `Isso parece uma compra parcelada: ${extraido.total_parcelas}x de ${formatarBRL(extraido.valor_parcela)} em ${rotulo}. Confere antes de eu salvar.`,
    requer_confirmacao: true,
    confirmar_em: 'POST /api/parcelamentos',
    sugestao: {
      descricao: extraido.descricao,
      valor_parcela: extraido.valor_parcela,
      total_parcelas: extraido.total_parcelas,
      valor_total: total,
      // Assume compra nova comecando agora; a interface deixa corrigir para
      // um parcelamento ja em andamento (ex: ja paguei 8 de 12).
      parcela_inicial: 1,
      mes_inicio: cicloAtual(),
      categoria: extraido.categoria,
    },
    mensagem_original: mensagem,
    llm: extraido._meta,
  };
}

// POST /api/gastos -> interpreta a mensagem, grava e devolve gasto + saldo.
router.post('/', async (req, res, next) => {
  try {
    const mensagem = limparTexto(req.body?.mensagem, LIMITE_MENSAGEM);
    if (!mensagem) {
      throw new ErroApi(400, 'Campo "mensagem" e obrigatorio e deve ser um texto nao vazio.');
    }

    let extraido;
    try {
      extraido = await extrairGasto(mensagem);
    } catch (e) {
      // LLM fora do ar ou lento demais -> 503; saida invalida -> 502.
      if (e instanceof ErroOllama) throw new ErroApi(503, e.message);
      if (e.tipoExtracao === 'saida_invalida') throw new ErroApi(502, e.message);
      throw e;
    }

    // valor <= 0 significa "isso nao e um gasto": nada e gravado.
    if (extraido.valor <= 0) {
      return res.status(422).json({
        erro: 'Nao consegui identificar um gasto nessa mensagem. Tente algo como "gastei 20 reais no almoco".',
        interpretado: false,
        mensagem_original: mensagem,
      });
    }

    // Compromisso recorrente: devolve sugestao para o usuario confirmar,
    // sem gravar nada. HTTP 200 porque a mensagem foi entendida.
    if (extraido.tipo === 'conta_fixa' || extraido.tipo === 'parcelamento') {
      return res.status(200).json(montarSugestao(extraido, mensagem));
    }

    // Entrada de dinheiro: a operacao inversa do gasto. Vira uma linha de
    // renda do mes corrente, entao aumenta o disponivel em vez de reduzir.
    // Grava direto como o gasto avulso: afeta so um mes e tem desfazer.
    if (extraido.tipo === 'entrada') {
      const mes = cicloAtual();
      const renda = compromissosService.criarRenda({
        mes_referencia: mes,
        descricao: extraido.descricao || 'entrada',
        valor: extraido.valor,
      });
      const saldoEntrada = calcularSaldo(mes);
      return res.status(201).json({
        tipo: 'entrada',
        requer_confirmacao: false,
        resposta: montarRespostaEntrada(renda, saldoEntrada),
        entrada: renda,
        mensagem_original: mensagem,
        saldo: saldoEntrada,
        llm: extraido._meta,
      });
    }

    const { gasto, data_incerta } = gastosService.criarGasto(extraido, mensagem);
    const saldo = calcularSaldo(gasto.data_gasto.slice(0, 7));

    return res.status(201).json({
      tipo: 'gasto_avulso',
      requer_confirmacao: false,
      resposta: montarResposta(gasto, saldo),
      gasto,
      // Avisa quando o modelo indicou uma data que ele nao sabe resolver:
      // gravamos como hoje e o usuario corrige via PATCH se precisar.
      data_incerta,
      saldo,
      llm: extraido._meta,
    });
  } catch (e) {
    return next(e);
  }
});

// GET /api/gastos?mes=YYYY-MM&categoria=x&limite=50
router.get('/', (req, res, next) => {
  try {
    const limite = inteiroPositivo(req.query.limite, 50, 500);
    const gastos = gastosService.listarGastos({
      mes: req.query.mes,
      categoria: req.query.categoria,
      limite,
    });
    res.json({ total_retornado: gastos.length, limite, gastos });
  } catch (e) {
    next(e);
  }
});

// Le e valida o :id da rota.
function lerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroApi(400, 'O id deve ser um inteiro positivo.');
  return id;
}

// PATCH /api/gastos/:id -> correcao manual quando o LLM erra.
router.patch('/:id', (req, res, next) => {
  try {
    const gasto = gastosService.atualizarGasto(lerId(req), req.body || {});
    res.json({ gasto, saldo: calcularSaldo(gasto.data_gasto.slice(0, 7)) });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/gastos/:id
router.delete('/:id', (req, res, next) => {
  try {
    const gasto = gastosService.removerGasto(lerId(req));
    res.json({
      removido: true,
      gasto,
      saldo: calcularSaldo(gasto.data_gasto.slice(0, 7)),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
