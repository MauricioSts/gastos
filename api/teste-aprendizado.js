// Testes do aprendizado: vocabulario aprendido com as correcoes do usuario e
// registro/avaliacao das perguntas do consultor.
//
// Sobe uma instancia propria da API (porta 3401, banco descartavel) e fala com
// ela por HTTP, porque o que precisa ser garantido e o caminho inteiro: corrigir
// a categoria no PATCH faz o PROXIMO POST sair certo. Nenhum caso chama o LLM --
// todas as mensagens resolvem no atalho ou no vocabulario.
//
// NUNCA aponta para data/gastos.db.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ARQUIVO = 'data/teste-aprendizado.db';
const PORTA = 3401;
const BASE = `http://127.0.0.1:${PORTA}`;
const TOKEN = process.env.API_TOKEN;
const absoluto = path.join(__dirname, ARQUIVO);

function apagarBanco() {
  for (const sufixo of ['', '-shm', '-wal']) {
    if (fs.existsSync(absoluto + sufixo)) fs.unlinkSync(absoluto + sufixo);
  }
}

let ok = 0;
let total = 0;
function conferir(rotulo, obtido, esperado) {
  total += 1;
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${rotulo}: ${JSON.stringify(obtido)}${bom ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

async function api(metodo, rota, corpo) {
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-API-Token': TOKEN },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: r.status, json };
}

async function esperarServidor() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((res) => { setTimeout(res, 100); });
  }
  throw new Error('instancia de teste nao subiu');
}

async function main() {
  // --- Unidade: chave e busca, direto no servico ---------------------------
  apagarBanco();
  process.env.DB_PATH = ARQUIVO;
  const vocab = require('./src/services/vocabularioService');
  const { tentarAtalho } = require('./src/services/atalho');

  conferir('chave ignora valor e "reais"', vocab.chave('11 reais uber'), 'uber');
  conferir('chave ignora verbo e preposicao', vocab.chave('gastei 11 no uber'), 'uber');
  conferir('chave ignora valor negativo colado', vocab.chave('docelandia -14,99'), 'docelandia');
  conferir('chave ignora R$ e caixa alta', vocab.chave('R$ 5 SLIME'), 'slime');
  conferir('chave tira acento', vocab.chave('37,94 desodorante açaí'), 'desodorante acai');
  conferir('frase longa nao vira termo', vocab.chave('almoco com o pessoal do trabalho la no centro velho'), null);
  conferir('so numero nao vira termo', vocab.chave('25,90'), null);

  vocab.criar({ termo: 'coca', categoria: 'alimentacao' });
  vocab.criar({ termo: 'coca zero', categoria: 'saude' });
  conferir('termo mais especifico vence', vocab.buscar('6 coca zero').categoria, 'saude');
  conferir('termo curto ainda casa sozinho', vocab.buscar('6 coca').categoria, 'alimentacao');
  conferir('palavra so parecida nao casa', vocab.buscar('6 cocada'), null);

  vocab.criar({ termo: 'uber', categoria: 'lazer' });
  const r = tentarAtalho('uber 12', vocab.buscar('uber 12'));
  conferir('vocabulario vence a lista fixa do atalho', [r.categoria, r._meta.modelo], ['lazer', 'vocabulario']);
  conferir('sem vocabulario a lista fixa continua valendo', tentarAtalho('uber 12').categoria, 'transporte');
  conferir('vocabulario nao fura a trava de parcela', tentarAtalho('uber 12x de 30', vocab.buscar('uber 12x de 30')), null);

  // --- Integracao: instancia propria por HTTP -----------------------------
  // Mesmo arquivo de banco: este processo continua com a conexao aberta (o
  // passo 2 grava por ela), entao apagar o arquivo aqui a deixaria orfa.
  const servidor = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname,
    env: {
      ...process.env, PORT: String(PORTA), DB_PATH: ARQUIVO, CONSELHO_PROSA: '0',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  try {
    await esperarServidor();

    // 1. Lanca, corrige a categoria, lanca de novo: o segundo sai corrigido.
    const primeiro = await api('POST', '/api/gastos', { mensagem: '3 lanche' });
    conferir('lanche entra pela lista fixa', primeiro.json.gasto.categoria, 'alimentacao');

    const soValor = await api('PATCH', `/api/gastos/${primeiro.json.gasto.id}`, { valor: 4, categoria: 'alimentacao' });
    conferir('editar so o valor nao aprende nada', soValor.json.aprendido, null);

    const correcao = await api('PATCH', `/api/gastos/${primeiro.json.gasto.id}`, { categoria: 'lazer' });
    conferir('trocar a categoria aprende o termo', correcao.json.aprendido, { termo: 'lanche', categoria: 'lazer' });

    const segundo = await api('POST', '/api/gastos', { mensagem: 'lanche 7,50 ontem' });
    conferir('proximo lancamento sai com a categoria corrigida',
      [segundo.json.gasto.categoria, segundo.json.llm.modelo], ['lazer', 'vocabulario']);

    // 2. Termo que so o usuario conhece: mensagem inteira e o pedaco da descricao.
    const gastos = require('./src/services/gastosService');
    const { gasto: morango } = gastos.criarGasto({
      valor: 12, categoria: 'outros', descricao: 'morango', data_relativa: 'hoje',
    }, '12 reais morango cravejado');
    const aprendeu = await api('PATCH', `/api/gastos/${morango.id}`, { categoria: 'alimentacao' });
    conferir('aprende o pedaco que se repete', aprendeu.json.aprendido, { termo: 'morango', categoria: 'alimentacao' });
    const lista = await api('GET', '/api/vocabulario');
    conferir('grava a mensagem inteira e o pedaco',
      lista.json.termos.map((t) => t.termo).filter((t) => t.startsWith('morango')).sort(),
      ['morango', 'morango cravejado']);

    const semLlm = await api('POST', '/api/gastos', { mensagem: '8 morango' });
    conferir('termo desconhecido pela lista fixa sai sem LLM',
      [semLlm.json.gasto.categoria, semLlm.json.gasto.descricao, semLlm.json.llm.modelo],
      ['alimentacao', 'morango', 'vocabulario']);

    const usado = (await api('GET', '/api/vocabulario')).json.termos.find((t) => t.termo === 'morango');
    conferir('conta o uso do termo', usado.usos, 1);

    // 3. Ensinar e esquecer pela API.
    const ensinado = await api('POST', '/api/vocabulario', { termo: 'Halls', categoria: 'alimentacao' });
    conferir('ensinar direto normaliza o termo', [ensinado.status, ensinado.json.termo.termo], [201, 'halls']);
    conferir('categoria fora do enum e recusada',
      (await api('POST', '/api/vocabulario', { termo: 'halls', categoria: 'bala' })).status, 400);
    const halls = await api('POST', '/api/gastos', { mensagem: '3 halls' });
    conferir('termo ensinado resolve o lancamento', halls.json.gasto.categoria, 'alimentacao');
    const esquecido = await api('DELETE', `/api/vocabulario/${ensinado.json.termo.id}`);
    conferir('esquecer remove', esquecido.json.removido, true);
    conferir('esquecer de novo e 404',
      (await api('DELETE', `/api/vocabulario/${ensinado.json.termo.id}`)).status, 404);

    // 4. Consultor: registra, guarda o texto, recebe avaliacao.
    await api('POST', '/api/rendas', { mes_referencia: require('./src/utils/ciclo').cicloAtual(), descricao: 'Renda', valor: 2000 });
    const consulta = await api('POST', '/api/consultor', { pergunta: 'posso comprar um fone de 1500 em 10x?' });
    const id = consulta.json.consulta_id;
    conferir('resposta traz o id da consulta', Number.isInteger(id), true);

    const hist = await api('GET', '/api/consultor/historico');
    const registrada = hist.json.consultas.find((c) => c.id === id);
    conferir('registra o que entendeu da pergunta',
      [registrada.valor, registrada.parcelas, registrada.veredito], [1500, 10, consulta.json.veredito]);
    conferir('registra o texto da resposta', registrada.texto, consulta.json.texto);

    const avaliada = await api('POST', `/api/consultor/${id}/avaliacao`, { nota: -1, comentario: 'pedi 10x' });
    conferir('marca como errou com comentario',
      [avaliada.json.consulta.nota, avaliada.json.consulta.comentario], [-1, 'pedi 10x']);
    const erradas = await api('GET', '/api/consultor/historico?nota=-1');
    conferir('filtra as marcadas como erradas', erradas.json.consultas.map((c) => c.id), [id]);
    conferir('nota invalida e recusada',
      (await api('POST', `/api/consultor/${id}/avaliacao`, { nota: 5 })).status, 400);
    const limpa = await api('POST', `/api/consultor/${id}/avaliacao`, { nota: null });
    conferir('nota null limpa a avaliacao',
      [limpa.json.consulta.nota, limpa.json.consulta.comentario], [null, null]);
    conferir('consulta inexistente e 404',
      (await api('POST', '/api/consultor/999999/avaliacao', { nota: 1 })).status, 404);

    // Stream: o id chega no primeiro evento, antes do texto.
    const s = await fetch(`${BASE}/api/consultor/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Token': TOKEN },
      body: JSON.stringify({ pergunta: 'quanto posso gastar hoje?' }),
    });
    const corpo = await s.text();
    const analise = JSON.parse(corpo.split('\n\n')[0].split('\n').find((l) => l.startsWith('data:')).slice(5));
    conferir('stream manda o id no evento analise', Number.isInteger(analise.consulta_id), true);
    const doStream = (await api('GET', '/api/consultor/historico')).json.consultas.find((c) => c.id === analise.consulta_id);
    conferir('stream grava o texto no fim', Boolean(doStream && doStream.texto), true);
  } finally {
    servidor.kill('SIGTERM');
    await new Promise((res) => { servidor.on('exit', res); setTimeout(res, 3000); });
    apagarBanco();
  }

  console.log(`\n${ok}/${total}`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  apagarBanco();
  process.exit(1);
});
