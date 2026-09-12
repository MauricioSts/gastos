// Handlers finais: 404 e erro. Toda resposta da API e JSON com campo `erro`.
const { ErroApi } = require('../utils/validacao');

function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota nao encontrada: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars -- Express exige os 4 argumentos
function tratarErro(err, req, res, next) {
  // Erro de dominio: mensagem ja e segura para exibir ao cliente.
  if (err instanceof ErroApi) {
    return res.status(err.status).json({ erro: err.message, ...err.extra });
  }

  // JSON malformado no corpo da requisicao.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisicao nao e JSON valido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Corpo da requisicao grande demais.' });
  }

  // Erro inesperado: loga completo no servidor, devolve generico ao cliente.
  console.error('[erro]', err);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
}

module.exports = { naoEncontrado, tratarErro };
