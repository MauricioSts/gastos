// CORS. O frontend roda em outro dominio (Vercel), entao o navegador so
// deixa o app chamar esta API se ela autorizar a origem explicitamente.
//
// A lista de origens vem de CORS_ORIGENS no .env, separada por virgula.
// Vazia = nenhuma origem de navegador liberada (a API continua respondendo
// a curl e a apps nativos, que nao aplicam CORS).
const config = require('../config');

// Sem origem = mesma origem, curl, ou app nativo: nada a fazer.
// Com origem, so responde se ela estiver na lista.
function cors(req, res, next) {
  const origem = req.headers.origin;

  if (origem && config.corsOrigens.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    // A resposta varia conforme a origem: sem isto um cache intermediario
    // pode servir o cabecalho de uma origem para outra.
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-API-Token,Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  // Preflight: o navegador manda OPTIONS antes de qualquer requisicao com
  // header customizado (o nosso X-API-Token). Responde e encerra.
  if (req.method === 'OPTIONS') {
    return res.status(origem && config.corsOrigens.includes(origem) ? 204 : 403).end();
  }

  return next();
}

module.exports = cors;
