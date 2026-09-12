// Configuracao que o app pode mudar em tempo de execucao.
//
// O .env continua sendo o padrao de fabrica: enquanto ninguem gravar nada, o
// valor efetivo e o dele. Uma vez gravado, o banco vence -- assim o usuario
// muda o dia de fechamento pela tela de Ajustes sem editar arquivo nem
// reiniciar o servico.
//
// O ciclo NAO e materializado em lugar nenhum (nenhuma tabela guarda "de que
// mes e este gasto"), entao mudar o fechamento aqui recalcula o historico
// inteiro na proxima consulta. E de proposito: um fechamento cadastrado errado
// se corrige sem migracao.
const db = require('../db');
const config = require('../config');
const { agoraIso } = require('../utils/data');
const { ErroApi } = require('../utils/validacao');

const stmtLer = db.prepare('SELECT chave, valor FROM configuracoes');
const stmtGravar = db.prepare(`
  INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES (@chave, @valor, @agora)
  ON CONFLICT (chave) DO UPDATE SET valor = @valor, atualizado_em = @agora
`);

// Padroes de fabrica. Toda chave conhecida precisa estar aqui: o que nao esta
// nesta lista e recusado na escrita, para o banco nao virar deposito de lixo.
const PADROES = {
  ciclo_dia_fechamento: config.ciclo.diaFechamento,
  ciclo_dia_recebimento: config.ciclo.diaRecebimento,
  ciclo_dia_pagamento: config.ciclo.diaPagamento,
  // Avisar quando falta um dia para a fatura fechar. Fica no servidor, e nao
  // no navegador, para o ajuste seguir a pessoa entre celular e desktop.
  fatura_notificar: true,
};

// Cache em memoria: estas chaves sao lidas em toda requisicao de saldo e
// mudam uma vez por ano. Invalida na escrita.
let cache = null;

function carregar() {
  if (cache) return cache;
  cache = { ...PADROES };
  for (const linha of stmtLer.all()) {
    if (!(linha.chave in PADROES)) continue; // chave de uma versao antiga
    cache[linha.chave] = typeof PADROES[linha.chave] === 'boolean'
      ? linha.valor === 'true'
      : Number(linha.valor);
  }
  return cache;
}

function ler(chave) {
  return carregar()[chave];
}

function gravar(chave, valor) {
  if (!(chave in PADROES)) throw new ErroApi(400, `Configuracao desconhecida: "${chave}".`);
  stmtGravar.run({ chave, valor: String(valor), agora: agoraIso() });
  cache = null;
  return ler(chave);
}

// Parametros do ciclo, ja com o padrao aplicado. Quem calcula datas chama isto
// a cada uso -- ler uma vez no boot congelaria o valor antigo depois do PATCH.
function parametrosCiclo() {
  return {
    diaFechamento: ler('ciclo_dia_fechamento'),
    diaRecebimento: ler('ciclo_dia_recebimento'),
    diaPagamento: ler('ciclo_dia_pagamento'),
  };
}

function notificarFatura() {
  return ler('fatura_notificar');
}

module.exports = { ler, gravar, parametrosCiclo, notificarFatura, PADROES };
