// Testes das caixinhas. Rodar depois de mexer em
// src/services/caixinhasService.js ou nas tabelas de objetivos.
//
// Banco proprio, criado do zero e apagado no fim. NUNCA aponta para
// data/gastos.db: a divisao soma nos saldos dos objetivos e deixaria caixas
// com dinheiro que nunca sobrou.
const fs = require('fs');
const path = require('path');

const ARQUIVO = 'data/teste-caixinhas.db';
process.env.DB_PATH = ARQUIVO;

const absoluto = path.resolve(__dirname, ARQUIVO);
function apagarBanco() {
  for (const sufixo of ['', '-shm', '-wal']) {
    if (fs.existsSync(absoluto + sufixo)) fs.unlinkSync(absoluto + sufixo);
  }
}
apagarBanco();

const db = require('./src/db');
const config = require('./src/config');
const caixinhas = require('./src/services/caixinhasService');
const compromissos = require('./src/services/compromissosService');
const ciclo = require('./src/utils/ciclo');
const { mesSomar } = require('./src/utils/data');

let ok = 0;
let total = 0;
function conferir(rotulo, obtido, esperado) {
  total += 1;
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${rotulo}: ${JSON.stringify(obtido)}${bom ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

// Espera um ErroApi com o status dado.
function falha(rotulo, fn, status) {
  try {
    fn();
    conferir(rotulo, 'nao falhou', status);
  } catch (e) {
    conferir(rotulo, e.status || e.message, status);
  }
}

// --------------------------------------------------------------------------
// Regra de divisao, sem banco
// --------------------------------------------------------------------------

const reserva = (saldo, meta) => ({ id: 1, e_reserva: true, saldo_atual: saldo, meta, peso: null });
const obj = (id, saldo = 0, meta = null, peso = null) => ({ id, e_reserva: false, saldo_atual: saldo, meta, peso });
const reais = (r) => Object.fromEntries([...r.centavos].map(([id, c]) => [id, c / 100]));

let r = caixinhas.dividir(1000, [reserva(0, null)]);
conferir('sem outros objetivos: tudo na reserva', [r.regra, reais(r)], ['so_reserva', { 1: 1000 }]);

r = caixinhas.dividir(1000, [reserva(0, 5000), obj(2), obj(3)]);
conferir('reserva abaixo da meta: 75% reserva, resto igual', [r.regra, reais(r)], ['reserva_abaixo_da_meta', { 1: 750, 2: 125, 3: 125 }]);

r = caixinhas.dividir(1000, [reserva(0, null), obj(2), obj(3)]);
conferir('reserva sem meta conhecida conta como abaixo', reais(r), { 1: 750, 2: 125, 3: 125 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2), obj(3)]);
conferir('reserva na meta: 20% manutencao, 80% objetivos', [r.regra, reais(r)], ['reserva_na_meta', { 1: 200, 2: 400, 3: 400 }]);

r = caixinhas.dividir(1000, [reserva(4950, 5000), obj(2), obj(3)]);
conferir('falta pouco para a meta: reserva nunca abaixo da manutencao', reais(r), { 1: 200, 2: 400, 3: 400 });

r = caixinhas.dividir(1000, [reserva(4500, 5000), obj(2), obj(3)]);
conferir('reserva recebe so o que falta (500), nao 75%', reais(r), { 1: 500, 2: 250, 3: 250 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2, 0, null, 3), obj(3, 0, null, 1)]);
conferir('pesos 3:1 dividem os 80%', reais(r), { 1: 200, 2: 600, 3: 200 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2, 0, null, 2), obj(3)]);
conferir('objetivo sem peso entra com a media dos pesos', reais(r), { 1: 200, 2: 400, 3: 400 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2, 970, 1000), obj(3)]);
conferir('objetivo nao passa da meta; excedente vai para o outro', reais(r), { 1: 200, 2: 30, 3: 770 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2, 970, 1000), obj(3, 480, 500)]);
conferir('todos os objetivos cheios: sobra volta para a reserva', reais(r), { 1: 950, 2: 30, 3: 20 });

r = caixinhas.dividir(1000, [reserva(5000, 5000), obj(2, 1000, 1000)]);
conferir('objetivo ja completo fica de fora', [r.regra, reais(r)], ['so_reserva', { 1: 1000, 2: 0 }]);

r = caixinhas.dividir(100.01, [reserva(5000, 5000), obj(2), obj(3), obj(4)]);
conferir('centavos somam exatamente o total', [...r.centavos.values()].reduce((a, c) => a + c, 0), 10001);

conferir('maior resto distribui o centavo', caixinhas.repartirCentavos(100, [1, 1, 1]), [34, 33, 33]);
conferir('percentuais fecham 100', caixinhas.percentuaisDe(100, [34, 33, 33]).reduce((a, p) => a + p, 0), 100);
conferir('percentuais de 1/3', caixinhas.percentuaisDe(300, [100, 100, 100]), [33.34, 33.33, 33.33]);

// --------------------------------------------------------------------------
// Com banco
// --------------------------------------------------------------------------

const ATUAL = ciclo.cicloAtual();
const FECHADO = mesSomar(ATUAL, -1);

const reservas = db.prepare('SELECT * FROM objetivos WHERE e_reserva = 1').all();
conferir('reserva criada no boot, uma so', reservas.length, 1);
db.exec(fs.readFileSync(path.join(__dirname, 'src/db/schema.sql'), 'utf8'));
conferir('reaplicar o schema nao duplica a reserva', db.prepare('SELECT COUNT(*) AS n FROM objetivos WHERE e_reserva = 1').get().n, 1);
const ID_RESERVA = reservas[0].id;

conferir('sem dados: despesa media sem base', caixinhas.despesaMedia().base, 'sem_dados');

// Ciclo fechado com renda 2000 e 500 de gasto livre -> sobra 1500.
compromissos.criarRenda({ mes_referencia: FECHADO, descricao: 'Renda', valor: 2000 });
db.prepare(`
  INSERT INTO gastos (valor, categoria, descricao, mensagem_original, data_gasto, criado_em)
  VALUES (500, 'outros', 'teste', 'teste', ?, ?)
`).run(ciclo.janela(FECHADO).inicio, new Date().toISOString());

const media = caixinhas.despesaMedia();
conferir('despesa media vem do ciclo fechado', [media.base, media.valor, media.ciclos_considerados], ['ciclos_fechados', 500, 1]);

let resumo = caixinhas.getResumoCaixas();
conferir('meta da reserva = 2x despesa media', resumo.reserva.meta, 1000);
conferir('sobra do ultimo ciclo fechado', [resumo.sobra.mes_referencia, resumo.sobra.sobra, resumo.sobra.pode_dividir], [FECHADO, 1500, true]);

const viagem = caixinhas.criarObjetivo({ nome: 'Viagem' });
const curso = caixinhas.criarObjetivo({ nome: 'Curso', valor_meta: '300' });

const sug = caixinhas.calcularSugestaoDivisao(1500);
conferir(
  'sugestao sobre 1500: reserva leva o que falta (1000), resto igual',
  sug.divisao.map((d) => [d.nome, d.percentual, d.valor]),
  [['Reserva de emergência', 66.66, 1000], ['Viagem', 16.67, 250], ['Curso', 16.67, 250]],
);
falha('sugestao com valor zero', () => caixinhas.calcularSugestaoDivisao(0), 400);

const divisao = sug.divisao.map((d) => ({ objetivo_id: d.objetivo_id, valor: d.valor }));
falha('ciclo aberto nao pode ser dividido', () => caixinhas.confirmarDivisao(ATUAL, divisao), 409);
falha('percentuais que nao fecham 100', () => caixinhas.confirmarDivisao(FECHADO, [{ objetivo_id: ID_RESERVA, percentual: 90 }]), 400);
falha('objetivo inexistente', () => caixinhas.confirmarDivisao(FECHADO, [{ objetivo_id: 999, percentual: 100 }]), 400);
falha('objetivo repetido', () => caixinhas.confirmarDivisao(FECHADO, [
  { objetivo_id: ID_RESERVA, percentual: 50 }, { objetivo_id: ID_RESERVA, percentual: 50 },
]), 400);
falha('valores que nao somam a sobra', () => caixinhas.confirmarDivisao(FECHADO, divisao.map((d, i) => (i ? d : { ...d, valor: d.valor - 0.01 }))), 400);
falha('valor em uns itens e percentual em outros', () => caixinhas.confirmarDivisao(FECHADO, [
  { objetivo_id: ID_RESERVA, valor: 1500 }, { objetivo_id: viagem.id, percentual: 0 },
]), 400);
falha('ciclo sem renda', () => caixinhas.confirmarDivisao(mesSomar(ATUAL, -2), divisao), 422);

const confirmada = caixinhas.confirmarDivisao(FECHADO, divisao);
resumo = confirmada.resumo;
conferir('divisao gravada com o total da sobra', confirmada.alocacao.total_sobra, 1500);
conferir('saldos somados', resumo.objetivos.map((o) => o.saldo_atual), [1000, 250, 250]);
conferir('total guardado', resumo.total_guardado, 1500);
conferir('reserva atingida', resumo.reserva.atingida, true);
conferir('curso com 83,3% da meta', resumo.objetivos[2].percentual_concluido, 83.3);
conferir('sobra marcada como dividida', [resumo.sobra.dividida, resumo.sobra.pode_dividir], [true, false]);
falha('dividir a mesma sobra de novo', () => caixinhas.confirmarDivisao(FECHADO, divisao), 409);

// Percentual editado a mao, com a folga de 3 x 33,33.
db.prepare('DELETE FROM alocacoes_mensais').run();
db.prepare('UPDATE objetivos SET saldo_atual = 0').run();
const manual = caixinhas.confirmarDivisao(FECHADO, [
  { objetivo_id: ID_RESERVA, percentual: 33.33 },
  { objetivo_id: viagem.id, percentual: 33.33 },
  { objetivo_id: curso.id, percentual: 33.33 },
]);
conferir('99,99% aceito e sem centavo perdido', manual.alocacao.divisoes.reduce((a, d) => a + Math.round(d.valor * 100), 0), 150000);

// Limite da Caixinha Turbo: alerta so ACIMA de 80% (4000 no padrao).
const { limite } = config.caixinhaTurbo;
const ajustarTotal = (alvo) => {
  const outros = caixinhas.getResumoCaixas().objetivos
    .filter((o) => o.id !== viagem.id)
    .reduce((a, o) => a + o.saldo_atual, 0);
  caixinhas.atualizarObjetivo(viagem.id, { saldo_atual: Math.round((alvo - outros) * 100) / 100 });
};
ajustarTotal(limite * 0.8);
conferir('exatamente 80% do limite nao alerta', caixinhas.verificarLimiteCaixinhaTurbo().perto_do_limite, false);
ajustarTotal(limite * 0.8 + 0.01);
conferir('um centavo acima de 80% alerta', caixinhas.verificarLimiteCaixinhaTurbo().perto_do_limite, true);
ajustarTotal(limite + 250);
const acima = caixinhas.verificarLimiteCaixinhaTurbo();
conferir('acima do limite com excedente', [acima.acima_do_limite, acima.excedente, acima.folga_ate_limite], [true, 250, 0]);

// Desfazer.
ajustarTotal(1500);
const saldoViagem = () => caixinhas.getResumoCaixas().objetivos.find((o) => o.id === viagem.id).saldo_atual;
caixinhas.atualizarObjetivo(viagem.id, { saldo_atual: 1 });
falha('desfazer recusa saldo que ficaria negativo', () => caixinhas.desfazerDivisao(FECHADO), 409);
caixinhas.atualizarObjetivo(viagem.id, { saldo_atual: 800 });
const antes = saldoViagem();
const desfeito = caixinhas.desfazerDivisao(FECHADO);
const parteViagem = manual.alocacao.divisoes.find((d) => d.objetivo_id === viagem.id).valor;
conferir('desfazer tira exatamente a parte de cada um', Math.round((antes - saldoViagem()) * 100) / 100, parteViagem);
conferir('sobra volta a poder ser dividida', desfeito.resumo.sobra.pode_dividir, true);
falha('desfazer o que nao existe', () => caixinhas.desfazerDivisao(FECHADO), 404);

// Cadastro.
falha('reserva nao se remove', () => caixinhas.removerObjetivo(ID_RESERVA), 400);
falha('reserva nao aceita meta manual', () => caixinhas.atualizarObjetivo(ID_RESERVA, { valor_meta: 10 }), 400);
falha('objetivo com saldo nao se remove', () => caixinhas.removerObjetivo(viagem.id), 409);
falha('nome vazio', () => caixinhas.criarObjetivo({ nome: '  ' }), 400);
falha('meta negativa', () => caixinhas.criarObjetivo({ nome: 'x', valor_meta: -1 }), 400);
caixinhas.atualizarObjetivo(curso.id, { saldo_atual: 0 });
conferir('objetivo zerado se remove', caixinhas.removerObjetivo(curso.id).nome, 'Curso');

falha('multiplicador fora de 1-6', () => caixinhas.definirMultiplicadorReserva(7), 400);
conferir('multiplicador 3 muda a meta', caixinhas.definirMultiplicadorReserva(3).reserva.meta, 1500);

console.log(`\n${ok}/${total} ok`);
db.close();
apagarBanco();
process.exit(ok === total ? 0 : 1);
