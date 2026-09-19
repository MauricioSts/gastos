// Login do app: usuario + senha, sessao assinada sem estado no servidor.
//
// O app e de uma pessoa so, entao o usuario e a senha vivem no .env
// (LOGIN_USUARIO e LOGIN_SENHA_HASH, gerado por `node definir-senha.js`), sem
// tabela de usuarios. A sessao e um token "v1.<expira_em>.<assinatura>" com
// HMAC: nao ha nada a guardar nem a limpar no banco.
//
// A chave do HMAC mistura o segredo com o hash da senha. Trocar a senha
// derruba todas as sessoes abertas sem mais nenhum mecanismo -- e e isso que
// se espera de trocar a senha depois de perder o celular.
const crypto = require('crypto');
const config = require('../config');

const SCRYPT_N = 16384;

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 32, { N: SCRYPT_N });
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function senhaConfere(senha, guardado) {
  const [alg, salHex, hashHex] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const hash = crypto.scryptSync(String(senha), Buffer.from(salHex, 'hex'), esperado.length, { N: SCRYPT_N });
  return crypto.timingSafeEqual(hash, esperado);
}

function iguais(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function chave() {
  return crypto.createHash('sha256')
    .update(`${config.sessao.segredo}\n${config.login.senhaHash}`)
    .digest();
}

function assina(corpo) {
  return crypto.createHmac('sha256', chave()).update(corpo).digest('base64url');
}

function criarSessao() {
  const expiraEm = Date.now() + config.sessao.dias * 86400000;
  const corpo = `v1.${expiraEm}`;
  return { token: `${corpo}.${assina(corpo)}`, expira_em: new Date(expiraEm).toISOString() };
}

function sessaoValida(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return false;
  const expiraEm = Number(partes[1]);
  if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) return false;
  return iguais(partes[2], assina(`v1.${partes[1]}`));
}

// Confere usuario e senha. Sempre roda o scrypt, mesmo com usuario errado,
// para o tempo de resposta nao revelar qual dos dois estava errado.
function autenticar(usuario, senha) {
  if (!config.login.senhaHash) return false;
  const senhaOk = senhaConfere(senha, config.login.senhaHash);
  return iguais(String(usuario || '').trim().toLowerCase(), config.login.usuario) && senhaOk;
}

module.exports = { hashSenha, senhaConfere, criarSessao, sessaoValida, autenticar };
