// Regras de negocio e acesso a dados da tabela `gastos`.
const db = require('../db');
const { agoraIso, resolverDataRelativa, mesValido, dataValida } = require('../utils/data');
const ciclo = require('../utils/ciclo');
const {
  ErroApi, LIMITE_DESCRICAO, limparTexto, normalizarValor,
  emCentavos, categoriaValida, CATEGORIAS,
} = require('../utils/validacao');

const stmtInserir = db.prepare(`
  INSERT INTO gastos (valor, categoria, descricao, mensagem_original, data_gasto, criado_em)
  VALUES (@valor, @categoria, @descricao, @mensagem_original, @data_gasto, @criado_em)
`);
const stmtPorId = db.prepare('SELECT * FROM gastos WHERE id = ?');
const stmtRemover = db.prepare('DELETE FROM gastos WHERE id = ?');

// Grava um gasto ja extraido e validado.
// `extraido` vem do extrator; `mensagem` e o texto original do usuario.
function criarGasto(extraido, mensagem) {
  const { data, incerta } = resolverDataRelativa(extraido.data_relativa);

  const info = stmtInserir.run({
    valor: extraido.valor,
    categoria: extraido.categoria,
    descricao: extraido.descricao || null,
    mensagem_original: mensagem,
    data_gasto: data,
    criado_em: agoraIso(),
  });

  return { gasto: stmtPorId.get(info.lastInsertRowid), data_incerta: incerta };
}

// Lista gastos com filtros opcionais de ciclo, categoria e limite.
// O filtro `mes` e o rotulo do ciclo da fatura: recorta pela janela de datas
// do ciclo (29/08 a 28/09, por exemplo), nao pelo mes do calendario.
function listarGastos({ mes, categoria, limite = 50 }) {
  const condicoes = [];
  const params = {};

  if (mes !== undefined) {
    if (!mesValido(mes)) throw new ErroApi(400, 'Parametro "mes" deve estar no formato YYYY-MM.');
    const janela = ciclo.janela(mes);
    condicoes.push('data_gasto BETWEEN @inicio AND @fim');
    params.inicio = janela.inicio;
    params.fim = janela.fim;
  }
  if (categoria !== undefined) {
    if (!categoriaValida(categoria)) {
      throw new ErroApi(400, `Categoria invalida. Use uma de: ${CATEGORIAS.join(', ')}.`);
    }
    condicoes.push('categoria = @categoria');
    params.categoria = categoria;
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  // Parametros sao sempre bound; o unico trecho interpolado e SQL fixo.
  const sql = `
    SELECT * FROM gastos ${onde}
    ORDER BY data_gasto DESC, id DESC
    LIMIT @limite
  `;
  return db.prepare(sql).all({ ...params, limite });
}

function buscarGasto(id) {
  const gasto = stmtPorId.get(id);
  if (!gasto) throw new ErroApi(404, `Gasto ${id} nao encontrado.`);
  return gasto;
}

// Atualiza campos informados de um gasto. Usado para corrigir erro do LLM.
function atualizarGasto(id, corpo) {
  buscarGasto(id); // 404 se nao existir

  const campos = {};

  if (corpo.valor !== undefined) {
    const valor = normalizarValor(corpo.valor);
    if (valor === null || valor <= 0) {
      throw new ErroApi(400, 'Campo "valor" deve ser um numero maior que zero.');
    }
    campos.valor = emCentavos(valor);
  }

  if (corpo.categoria !== undefined) {
    if (!categoriaValida(corpo.categoria)) {
      throw new ErroApi(400, `Categoria invalida. Use uma de: ${CATEGORIAS.join(', ')}.`);
    }
    campos.categoria = corpo.categoria;
  }

  if (corpo.descricao !== undefined) {
    campos.descricao = limparTexto(corpo.descricao, LIMITE_DESCRICAO) || null;
  }

  if (corpo.data_gasto !== undefined) {
    if (!dataValida(corpo.data_gasto)) {
      throw new ErroApi(400, 'Campo "data_gasto" deve ser uma data real no formato YYYY-MM-DD.');
    }
    campos.data_gasto = corpo.data_gasto;
  }

  const chaves = Object.keys(campos);
  if (!chaves.length) {
    throw new ErroApi(400, 'Informe ao menos um campo: valor, categoria, descricao ou data_gasto.');
  }

  // Nomes de coluna vem de uma lista fechada acima, nunca do input cru.
  const set = chaves.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE gastos SET ${set} WHERE id = @id`).run({ ...campos, id });

  return stmtPorId.get(id);
}

function removerGasto(id) {
  const gasto = buscarGasto(id);
  stmtRemover.run(id);
  return gasto;
}

module.exports = { criarGasto, listarGastos, buscarGasto, atualizarGasto, removerGasto };
