// Lista as perguntas do consultor que o usuario marcou como "errou" no app,
// com o que foi entendido na hora e o que a leitura ATUAL entende da mesma
// frase. E a fila de trabalho: cada caso vira um teste em teste-consultor.js
// antes de o conserto ser feito, como foi com "1500 em 10x" virando 12x.
//
//   node casos-reclamados.js            -> so as marcadas como erradas
//   node casos-reclamados.js --todas    -> todas as perguntas registradas
//
// Nao grava nada: a consulta usa conexao somente leitura. (Carregar lerCompra
// abre o banco pelo modulo db, que so aplica o esquema IF NOT EXISTS.)
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { lerCompra } = require('./src/services/consultorService');

const arquivo = path.resolve(__dirname, process.env.DB_PATH || 'data/gastos.db');
const db = new Database(arquivo, { readonly: true, fileMustExist: true });

const todas = process.argv.includes('--todas');
const linhas = db.prepare(`
  SELECT * FROM consultas ${todas ? '' : 'WHERE nota = -1'} ORDER BY id DESC
`).all();

if (!linhas.length) {
  console.log(todas ? 'Nenhuma pergunta registrada ainda.' : 'Nenhuma resposta marcada como errada.');
  process.exit(0);
}

const nota = { 1: 'ajudou', '-1': 'ERROU' };
for (const c of linhas) {
  const hoje = lerCompra(c.pergunta);
  const naHora = { valor: c.valor, parcelas: c.parcelas, reserva: c.reserva };
  const agora = { valor: hoje.valor, parcelas: hoje.parcelas, reserva: hoje.reserva };
  console.log(`#${c.id} ${c.criado_em.slice(0, 16)} ciclo ${c.mes} [${nota[c.nota] || 'sem nota'}]`);
  console.log(`  pergunta:   ${c.pergunta}`);
  console.log(`  entendido:  ${JSON.stringify(naHora)} -> ${c.veredito}`);
  if (JSON.stringify(naHora) !== JSON.stringify(agora)) {
    console.log(`  leitura hoje: ${JSON.stringify(agora)}`);
  }
  console.log(`  resposta:   ${c.texto || '(sem texto)'}`);
  if (c.comentario) console.log(`  comentario: ${c.comentario}`);
  console.log('');
}
