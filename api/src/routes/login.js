// Porta de entrada: troca usuario + senha, ou uma passkey (Face ID), por um
// token de sessao. Publica, como o health: e a rota de quem ainda nao tem token.
const express = require('express');
const { autenticar, criarSessao } = require('../services/sessao');
const passkey = require('../services/passkeyService');

const router = express.Router();

// Limite proprio, bem mais apertado que o geral (60/min): 60 chutes por
// minuto por IP ainda seria forca bruta viavel. So erros contam, e senha e
// passkey dividem o mesmo contador.
const JANELA_MS = 15 * 60000;
const MAX_ERROS = 8;
const erros = new Map(); // ip -> { contador, expiraEm }

const limpeza = setInterval(() => {
  const agora = Date.now();
  for (const [ip, b] of erros) if (b.expiraEm <= agora) erros.delete(ip);
}, JANELA_MS);
limpeza.unref();

// Responde 429 e devolve true se o IP estourou o limite.
function bloqueado(req, res) {
  const agora = Date.now();
  const b = erros.get(req.ip || 'desconhecido');
  if (!b) return false;
  if (b.expiraEm <= agora) { erros.delete(req.ip || 'desconhecido'); return false; }
  if (b.contador < MAX_ERROS) return false;
  const esperaMin = Math.ceil((b.expiraEm - agora) / 60000);
  res.set('Retry-After', String(Math.ceil((b.expiraEm - agora) / 1000)));
  res.status(429).json({ erro: `Muitas tentativas. Tente de novo em ${esperaMin} min.` });
  return true;
}

function contaErro(req) {
  const ip = req.ip || 'desconhecido';
  let b = erros.get(ip);
  if (!b) { b = { contador: 0, expiraEm: Date.now() + JANELA_MS }; erros.set(ip, b); }
  b.contador += 1;
}

router.post('/login', (req, res) => {
  if (bloqueado(req, res)) return undefined;

  const { usuario, senha } = req.body || {};
  if (typeof usuario !== 'string' || typeof senha !== 'string' || !usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  if (!autenticar(usuario, senha)) {
    contaErro(req);
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }

  erros.delete(req.ip || 'desconhecido');
  return res.json(criarSessao());
});

// Passo 1 do Face ID: o desafio que o aparelho vai assinar.
router.post('/login/passkey/opcoes', async (req, res, next) => {
  if (bloqueado(req, res)) return undefined;
  try {
    return res.json(await passkey.opcoesLogin());
  } catch (e) {
    return next(e);
  }
});

// Passo 2: a assinatura volta e vira sessao.
router.post('/login/passkey', async (req, res, next) => {
  if (bloqueado(req, res)) return undefined;
  try {
    if (!(await passkey.autenticar(req.body))) {
      contaErro(req);
      return res.status(401).json({ erro: 'Face ID não reconhecido. Entre com a senha.' });
    }
    erros.delete(req.ip || 'desconhecido');
    return res.json(criarSessao());
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
