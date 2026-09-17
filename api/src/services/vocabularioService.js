// Vocabulario aprendido: o jeito do usuario de chamar as coisas.
//
// O app nao treina o modelo -- numa VM ARM sem GPU, com poucas dezenas de
// mensagens, ajuste fino decoraria os exemplos e pioraria o resto. O que
// aprende e esta tabela: toda vez que o usuario corrige a categoria de um
// lancamento, o termo da mensagem original fica gravado com a categoria certa,
// e o proximo lancamento com o mesmo termo ja sai certo, sem LLM.
//
// Exemplo: "3 halls" foi para "outros"; o usuario troca para alimentacao.
// Grava "halls" -> alimentacao. Amanha "2,50 halls" sai em alimentacao em ~1ms.
const db = require('../db');
const { agoraIso } = require('../utils/data');
const {
  ErroApi, LIMITE_DESCRICAO, limparTexto, categoriaValida, CATEGORIAS,
} = require('../utils/validacao');

// Palavras que nao identificam a coisa comprada. Ficam fora do termo para
// "11 reais uber", "uber 11" e "gastei 11 no uber" darem a mesma chave.
const VAZIAS = new Set([
  'r', 'reais', 'real', 'conto', 'contos', 'pila', 'pilas',
  'hoje', 'ontem', 'agora',
  'gastei', 'paguei', 'comprei', 'pedi', 'peguei', 'tomei', 'comi', 'bebi',
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com',
  'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'pra', 'pro', 'para', 'por',
  'meu', 'minha', 'mais',
]);

// Termo com mais palavras que isso e frase, nao nome de coisa: aprender
// "almoco com o pessoal do trabalho" nao ajuda o proximo lancamento.
const MAX_PALAVRAS = 4;

function semAcento(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Palavras significativas de um texto, em ordem.
function palavrasDe(texto) {
  return semAcento(texto)
    .replace(/r\$/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !/\d/.test(p) && !VAZIAS.has(p));
}

// Chave normalizada de um texto, ou null quando nao sobra nada que preste.
function chave(texto) {
  const palavras = palavrasDe(texto);
  if (!palavras.length || palavras.length > MAX_PALAVRAS) return null;
  return palavras.join(' ');
}

// `agulha` aparece como sequencia contigua dentro de `palheiro`?
function contem(palheiro, agulha) {
  for (let i = 0; i + agulha.length <= palheiro.length; i += 1) {
    if (agulha.every((p, j) => palheiro[i + j] === p)) return true;
  }
  return false;
}

const stmtTodos = db.prepare('SELECT * FROM vocabulario ORDER BY atualizado_em DESC, id DESC');
const stmtPorId = db.prepare('SELECT * FROM vocabulario WHERE id = ?');
const stmtPorTermo = db.prepare('SELECT * FROM vocabulario WHERE termo = ?');
const stmtRemover = db.prepare('DELETE FROM vocabulario WHERE id = ?');
const stmtUso = db.prepare('UPDATE vocabulario SET usos = usos + 1 WHERE id = ?');
const stmtGravar = db.prepare(`
  INSERT INTO vocabulario (termo, categoria, descricao, origem, vezes, usos, criado_em, atualizado_em)
  VALUES (@termo, @categoria, @descricao, @origem, 1, 0, @agora, @agora)
  ON CONFLICT (termo) DO UPDATE SET
    categoria = excluded.categoria,
    descricao = COALESCE(excluded.descricao, vocabulario.descricao),
    origem = excluded.origem,
    vezes = vocabulario.vezes + 1,
    atualizado_em = excluded.atualizado_em
`);

// Termo aprendido que aparece na mensagem. Ganha o mais especifico (mais
// palavras): "coca zero" -> assinaturas nao pode ser vencido por "coca".
// Empate vai para o mais recente, porque a correcao nova desfaz a velha.
function buscar(mensagem) {
  const palavras = palavrasDe(mensagem);
  if (!palavras.length) return null;
  let melhor = null;
  let tamanho = 0;
  for (const linha of stmtTodos.all()) {
    const termo = linha.termo.split(' ');
    if (termo.length > tamanho && contem(palavras, termo)) {
      melhor = linha;
      tamanho = termo.length;
    }
  }
  if (!melhor) return null;
  return {
    id: melhor.id,
    termo: melhor.termo,
    categoria: melhor.categoria,
    descricao: melhor.descricao || melhor.termo,
  };
}

function registrarUso(id) {
  stmtUso.run(id);
}

function gravar({ termo, categoria, descricao, origem }) {
  stmtGravar.run({ termo, categoria, descricao: descricao || null, origem, agora: agoraIso() });
  return stmtPorTermo.get(termo);
}

// Chamado quando o usuario troca a categoria de um lancamento. Grava a
// mensagem inteira ("morango cravejado") e, se a descricao for um pedaco dela
// ("morango"), grava tambem o pedaco -- e ele que se repete na proxima vez.
// Devolve o que foi aprendido, ou null.
function aprenderDeEdicao(gasto, categoria) {
  if (!categoriaValida(categoria)) return null;
  const termo = chave(gasto.mensagem_original);
  if (!termo) return null;

  const aprendidos = [gravar({
    termo, categoria, descricao: gasto.descricao, origem: 'edicao',
  })];

  const termoDescricao = chave(gasto.descricao);
  if (termoDescricao && termoDescricao !== termo
    && contem(termo.split(' '), termoDescricao.split(' '))) {
    aprendidos.push(gravar({
      termo: termoDescricao, categoria, descricao: gasto.descricao, origem: 'edicao',
    }));
  }
  return aprendidos[aprendidos.length - 1];
}

function listar() {
  return stmtTodos.all();
}

// Ensinar direto pela tela de ajustes: "halls e alimentacao".
function criar(corpo) {
  const termo = chave(limparTexto(corpo.termo, LIMITE_DESCRICAO));
  if (!termo) {
    throw new ErroApi(400, `Campo "termo" deve ter de 1 a ${MAX_PALAVRAS} palavras, sem numero.`);
  }
  if (!categoriaValida(corpo.categoria)) {
    throw new ErroApi(400, `Categoria invalida. Use uma de: ${CATEGORIAS.join(', ')}.`);
  }
  const descricao = limparTexto(corpo.descricao, LIMITE_DESCRICAO) || null;
  return gravar({
    termo, categoria: corpo.categoria, descricao, origem: 'manual',
  });
}

function remover(id) {
  const linha = stmtPorId.get(id);
  if (!linha) throw new ErroApi(404, `Termo ${id} nao encontrado.`);
  stmtRemover.run(id);
  return linha;
}

module.exports = {
  chave, buscar, registrarUso, aprenderDeEdicao, listar, criar, remover, MAX_PALAVRAS,
};
