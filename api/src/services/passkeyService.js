// Passkeys: entrar com Face ID / Touch ID em vez de senha.
//
// O cadastro so acontece com sessao aberta (quem ja provou a senha), e o
// login devolve a mesma sessao HMAC do login por senha -- o resto da API nao
// sabe como a pessoa entrou.
//
// As credenciais sao "descobriveis" (residentKey required): o aparelho guarda
// quem e o usuario, entao o login nao pede nome nenhum, so o rosto.
//
// Desafios ficam em memoria, valem 5 minutos e sao de uso unico. O desafio
// volta dentro do clientDataJSON assinado pelo aparelho, entao basta procurar
// por ele no mapa -- nao precisa de id extra na ida e volta.
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('../db');
const config = require('../config');
const { ErroApi } = require('../utils/validacao');

const DESAFIO_MS = 5 * 60000;
const desafios = { registro: new Map(), login: new Map() }; // desafio -> expiraEm

const limpeza = setInterval(() => {
  const agora = Date.now();
  for (const mapa of Object.values(desafios)) {
    for (const [d, exp] of mapa) if (exp <= agora) mapa.delete(d);
  }
}, DESAFIO_MS);
limpeza.unref();

function guardaDesafio(tipo, desafio) {
  desafios[tipo].set(desafio, Date.now() + DESAFIO_MS);
}

// Consome o desafio: aceito uma vez so, e so dentro do prazo.
function consomeDesafio(tipo) {
  return (desafio) => {
    const exp = desafios[tipo].get(desafio);
    desafios[tipo].delete(desafio);
    return exp !== undefined && exp > Date.now();
  };
}

const { rpId } = config.passkey;

// A chave vale para o dominio do app. Origem aceita = origem do CORS cujo
// host e o rpID ou subdominio dele (e o que o navegador tambem exige).
function origensEsperadas() {
  return config.corsOrigens.filter((o) => {
    try {
      const host = new URL(o).hostname;
      return host === rpId || host.endsWith(`.${rpId}`);
    } catch {
      return false;
    }
  });
}

const agoraIso = () => new Date().toISOString();

function listar() {
  return db.prepare('SELECT id, nome, criado_em, usado_em FROM passkeys ORDER BY criado_em').all();
}

function remover(id) {
  return db.prepare('DELETE FROM passkeys WHERE id = ?').run(String(id)).changes > 0;
}

function transportesDe(linha) {
  try { return JSON.parse(linha.transportes || '[]'); } catch { return []; }
}

async function opcoesRegistro() {
  const existentes = db.prepare('SELECT id, transportes FROM passkeys').all();
  const opcoes = await generateRegistrationOptions({
    rpName: config.passkey.rpNome,
    rpID: rpId,
    userName: config.login.usuario || 'minimau',
    // Usuario unico: id fixo, para o aparelho substituir a passkey antiga
    // deste app em vez de acumular uma nova a cada cadastro.
    userID: new TextEncoder().encode('minimau'),
    attestationType: 'none',
    excludeCredentials: existentes.map((p) => ({ id: p.id, transports: transportesDe(p) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  guardaDesafio('registro', opcoes.challenge);
  return opcoes;
}

async function registrar(resposta, nome) {
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: consomeDesafio('registro'),
      expectedOrigin: origensEsperadas(),
      expectedRPID: rpId,
      requireUserVerification: true,
    });
  } catch (e) {
    throw new ErroApi(400, `Não consegui validar a passkey: ${e.message}`);
  }
  if (!v.verified) throw new ErroApi(400, 'Passkey recusada.');

  const { credential } = v.registrationInfo;
  const rotulo = String(nome || '').trim().slice(0, 60) || 'Aparelho';
  db.prepare(`INSERT OR REPLACE INTO passkeys (id, chave_publica, contador, transportes, nome, criado_em)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(credential.id, Buffer.from(credential.publicKey), credential.counter,
      JSON.stringify(credential.transports || []), rotulo, agoraIso());
  return { id: credential.id, nome: rotulo };
}

async function opcoesLogin() {
  // allowCredentials vazio: o aparelho oferece a passkey que tiver para o
  // dominio, sem o servidor revelar quais existem.
  const opcoes = await generateAuthenticationOptions({ rpID: rpId, userVerification: 'required' });
  guardaDesafio('login', opcoes.challenge);
  return opcoes;
}

// Devolve true se a resposta prova posse de uma passkey cadastrada.
async function autenticar(resposta) {
  const linha = resposta && typeof resposta.id === 'string'
    ? db.prepare('SELECT * FROM passkeys WHERE id = ?').get(resposta.id)
    : null;
  if (!linha) return false;

  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: consomeDesafio('login'),
      expectedOrigin: origensEsperadas(),
      expectedRPID: rpId,
      credential: {
        id: linha.id,
        publicKey: new Uint8Array(linha.chave_publica),
        counter: linha.contador,
        transports: transportesDe(linha),
      },
      requireUserVerification: true,
    });
  } catch {
    return false;
  }
  if (!v.verified) return false;

  db.prepare('UPDATE passkeys SET contador = ?, usado_em = ? WHERE id = ?')
    .run(v.authenticationInfo.newCounter, agoraIso(), linha.id);
  return true;
}

module.exports = { listar, remover, opcoesRegistro, registrar, opcoesLogin, autenticar };
