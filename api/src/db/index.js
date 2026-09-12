// Conexao unica com o SQLite. better-sqlite3 e sincrono, o que simplifica
// muito o codigo e e suficiente para a carga de um sistema single-user.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Garante que a pasta do arquivo .db existe antes de abrir.
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);

// WAL melhora leitura concorrente; foreign_keys por higiene.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Espera ate 5s em caso de lock em vez de estourar erro na hora.
db.pragma('busy_timeout = 5000');

// Aplica o esquema (todas as instrucoes sao IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
