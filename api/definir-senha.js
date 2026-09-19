// Define usuario e senha do login do app, gravando no .env.
//
//   node definir-senha.js <usuario>          pergunta a senha
//   node definir-senha.js <usuario> --gerar  gera uma senha aleatoria e mostra
//
// Depois: sudo systemctl restart gastos-api. Trocar a senha derruba todas as
// sessoes abertas (o celular volta para a tela de login).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

process.env.API_TOKEN = process.env.API_TOKEN || 'x'.repeat(16); // config exige
const { hashSenha } = require('./src/services/sessao');

const ARQ = path.join(__dirname, '.env');

function grava(usuario, senha) {
  let env = fs.existsSync(ARQ) ? fs.readFileSync(ARQ, 'utf8') : '';
  const define = (nome, valor) => {
    const linha = `${nome}=${valor}`;
    const re = new RegExp(`^${nome}=.*$`, 'm');
    env = re.test(env) ? env.replace(re, linha) : `${env.replace(/\n*$/, '\n')}${linha}\n`;
  };
  define('LOGIN_USUARIO', usuario.trim().toLowerCase());
  define('LOGIN_SENHA_HASH', hashSenha(senha));
  if (!/^SESSAO_SEGREDO=.+$/m.test(env)) define('SESSAO_SEGREDO', crypto.randomBytes(32).toString('hex'));
  fs.writeFileSync(ARQ, env, { mode: 0o600 });
}

const [usuario, flag] = process.argv.slice(2);
if (!usuario) {
  console.error('uso: node definir-senha.js <usuario> [--gerar]');
  process.exit(1);
}

if (flag === '--gerar') {
  const senha = crypto.randomBytes(9).toString('base64url');
  grava(usuario, senha);
  console.log(`usuario: ${usuario.trim().toLowerCase()}\nsenha:   ${senha}`);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('senha (min. 8): ', (senha) => {
    rl.close();
    if (senha.length < 8) { console.error('senha curta demais'); process.exit(1); }
    grava(usuario, senha);
    console.log('gravado. Reinicie: sudo systemctl restart gastos-api');
  });
}
