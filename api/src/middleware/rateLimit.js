// Rate limit por IP, em memoria (single-process, sem Redis).
const config = require('../config');

const { janelaMs, maxReqs } = config.rateLimit;

// Mapa ip -> { contador, expiraEm }
const buckets = new Map();

// Limpeza periodica para o mapa nao crescer sem limite.
// unref() evita segurar o event loop no shutdown.
const limpeza = setInterval(() => {
  const agora = Date.now();
  for (const [ip, b] of buckets) {
    if (b.expiraEm <= agora) buckets.delete(ip);
  }
}, janelaMs);
limpeza.unref();

function rateLimit(req, res, next) {
  // req.ip ja respeita X-Forwarded-For quando trust proxy esta ligado.
  const ip = req.ip || 'desconhecido';
  const agora = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || bucket.expiraEm <= agora) {
    bucket = { contador: 0, expiraEm: agora + janelaMs };
    buckets.set(ip, bucket);
  }

  bucket.contador += 1;

  const restantes = Math.max(0, maxReqs - bucket.contador);
  res.set('X-RateLimit-Limit', String(maxReqs));
  res.set('X-RateLimit-Remaining', String(restantes));

  if (bucket.contador > maxReqs) {
    const esperaS = Math.ceil((bucket.expiraEm - agora) / 1000);
    res.set('Retry-After', String(esperaS));
    return res.status(429).json({
      erro: `Muitas requisicoes. Tente de novo em ${esperaS}s.`,
    });
  }

  return next();
}

module.exports = rateLimit;
