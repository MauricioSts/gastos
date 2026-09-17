// Registro do consultor: toda pergunta fica gravada com o que foi entendido
// dela (valor, parcelas, piso) e a resposta dada. O usuario marca a resposta
// como "ajudou" ou "errou"; as marcadas como erradas sao a fila de casos para
// virar teste (node casos-reclamados.js). Foi assim que o erro do 10x virou
// 12x foi achado -- por reclamacao -- e e assim que o proximo deve ser achado.
const db = require('../db');
const { agoraIso } = require('../utils/data');
const { ErroApi, limparTexto, LIMITE_MENSAGEM } = require('../utils/validacao');

const stmtInserir = db.prepare(`
  INSERT INTO consultas (pergunta, mes, tipo, valor, parcelas, reserva, veredito, analise, criado_em)
  VALUES (@pergunta, @mes, @tipo, @valor, @parcelas, @reserva, @veredito, @analise, @criado_em)
`);
const stmtTexto = db.prepare('UPDATE consultas SET texto = ? WHERE id = ?');
const stmtPorId = db.prepare('SELECT * FROM consultas WHERE id = ?');
const stmtAvaliar = db.prepare(`
  UPDATE consultas SET nota = @nota, comentario = @comentario, avaliado_em = @agora WHERE id = @id
`);

// Campos leves para listagem: a analise inteira fica so no banco.
const COLUNAS_LISTA = 'id, pergunta, mes, tipo, valor, parcelas, reserva, veredito, texto, nota, comentario, criado_em, avaliado_em';

function registrar({ pergunta, mes, analise }) {
  const info = stmtInserir.run({
    pergunta,
    mes,
    tipo: analise.tipo,
    valor: analise.valor ?? null,
    parcelas: analise.parcelado_pedido ? analise.parcelado_pedido.parcelas : null,
    reserva: analise.reserva ?? null,
    veredito: analise.veredito,
    analise: JSON.stringify(analise),
    criado_em: agoraIso(),
  });
  return Number(info.lastInsertRowid);
}

function concluir(id, texto) {
  stmtTexto.run(texto || null, id);
}

// nota: 1 = ajudou, -1 = errou, null = limpa a avaliacao.
function avaliar(id, corpo) {
  if (!stmtPorId.get(id)) throw new ErroApi(404, `Consulta ${id} nao encontrada.`);
  const nota = corpo.nota === null ? null : Number(corpo.nota);
  if (nota !== null && nota !== 1 && nota !== -1) {
    throw new ErroApi(400, 'Campo "nota" deve ser 1 (ajudou), -1 (errou) ou null.');
  }
  const comentario = nota === null ? null : (limparTexto(corpo.comentario, LIMITE_MENSAGEM) || null);
  stmtAvaliar.run({
    id, nota, comentario, agora: nota === null ? null : agoraIso(),
  });
  return listarUma(id);
}

function listarUma(id) {
  return db.prepare(`SELECT ${COLUNAS_LISTA} FROM consultas WHERE id = ?`).get(id);
}

function listar({ limite = 50, nota } = {}) {
  if (nota !== undefined) {
    return db.prepare(`SELECT ${COLUNAS_LISTA} FROM consultas WHERE nota = ? ORDER BY id DESC LIMIT ?`).all(nota, limite);
  }
  return db.prepare(`SELECT ${COLUNAS_LISTA} FROM consultas ORDER BY id DESC LIMIT ?`).all(limite);
}

// Com a analise completa, para reproduzir o caso fora do app.
function buscarCompleta(id) {
  const linha = stmtPorId.get(id);
  return linha ? { ...linha, analise: JSON.parse(linha.analise) } : null;
}

module.exports = {
  registrar, concluir, avaliar, listar, buscarCompleta,
};
