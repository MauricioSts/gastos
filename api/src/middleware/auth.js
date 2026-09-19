// Autenticacao: token de sessao do login (o app) ou token estatico no header
// X-API-Token (scripts e testes). A API fica exposta na internet pelo Caddy,
// entao nenhuma rota /api e aberta alem de health e login.
const crypto = require('crypto');
const config = require('../config');
const { sessaoValida } = require('../services/sessao');

const tokenEsperado = Buffer.from(config.apiToken, 'utf8');

// Comparacao em tempo constante para nao vazar o token por timing.
function tokenConfere(recebido) {
  if (typeof recebido !== 'string' || !recebido) return false;
  const buf = Buffer.from(recebido, 'utf8');
  if (buf.length !== tokenEsperado.length) return false;
  return crypto.timingSafeEqual(buf, tokenEsperado);
}

function auth(req, res, next) {
  // Aceita tambem "Authorization: Bearer <token>" por conveniencia.
  const header = req.get('X-API-Token')
    || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');

  if (!tokenConfere(header) && !sessaoValida(header)) {
    return res.status(401).json({ erro: 'Token invalido ou ausente. Envie o header X-API-Token.' });
  }
  return next();
}

module.exports = auth;
