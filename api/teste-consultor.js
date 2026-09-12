// Testes do consultor de compras. Rodar depois de mexer em
// src/services/consultorService.js ou src/services/conselho.js.
//
// Nada aqui chama o LLM: o que se testa e a DECISAO, que e calculada em
// JavaScript, e o briefing que o modelo recebe. O texto em portugues sai do
// modelo e nao e deterministico -- o que precisa ser garantido e que o veredito
// esteja certo e que o briefing nao entregue numero com sinal invertido nem
// alternativa que compita com o veredito.
//
// Banco proprio, criado do zero e apagado no fim. NUNCA aponta para
// data/gastos.db: rodar contra o banco real mudaria a folga e, com ela, todos
// os vereditos esperados abaixo.
const fs = require('fs');
const path = require('path');

const ARQUIVO = 'data/teste-consultor.db';
process.env.DB_PATH = ARQUIVO;

const absoluto = path.resolve(__dirname, 'src', '..', ARQUIVO);
for (const sufixo of ['', '-shm', '-wal']) {
  if (fs.existsSync(absoluto + sufixo)) fs.unlinkSync(absoluto + sufixo);
}

const compromissos = require('./src/services/compromissosService');
const { analisarCompra, retrato } = require('./src/services/consultorService');
const gastos = require('./src/services/gastosService');
const { briefing, textoDeReserva, mesesDe, mesesConferem, numerosDe, numerosConferem } = require('./src/services/conselho');
const ciclo = require('./src/utils/ciclo');

const MES = ciclo.cicloAtual();
const { mesSomar } = require('./src/utils/data');

let ok = 0;
let total = 0;
function conferir(rotulo, obtido, esperado) {
  total += 1;
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${rotulo}: ${JSON.stringify(obtido)}${bom ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}
function conferirQue(rotulo, condicao, detalhe = '') {
  total += 1;
  if (condicao) ok += 1;
  console.log(`${condicao ? ' ok  ' : 'FALHA'} ${rotulo}${condicao || !detalhe ? '' : ` -> ${detalhe}`}`);
}

// -------------------------------------------------------------------------
// Cenario 1: renda folgada, nenhum compromisso. Sem gasto no ciclo, o ritmo
// diario e zero, entao a folga e a renda inteira.
// -------------------------------------------------------------------------
compromissos.criarRenda({ mes_referencia: MES, descricao: 'salario', valor: 2000 });

const folgado = analisarCompra({ valor: 200, mes: MES });
conferir('renda 2000 sem compromisso, compra de 200', folgado.veredito, 'cabe_agora');
conferirQue('sobra positiva depois da compra', folgado.a_vista.sobra_depois > 0, String(folgado.a_vista.sobra_depois));

// Compra maior que a folga inteira nao pode virar "cabe agora".
const grande = analisarCompra({ valor: 9000, mes: MES });
conferirQue('compra de 9000 nao cabe agora', grande.veredito !== 'cabe_agora', grande.veredito);

// -------------------------------------------------------------------------
// Cenario 2: o ciclo aberto estourado e os meses seguintes com folga pequena.
// Uma conta fixa de 1200 sobre 2000 de renda deixa 800/mes para sempre, e uma
// ultima parcela de 900 neste ciclo joga a folga do ciclo aberto para negativo.
// E o cenario em que o consultor errava: nenhum mes paga 1600 a vista, mas
// parcelado a partir do mes que vem cabe.
// -------------------------------------------------------------------------
compromissos.criarContaFixa({
  descricao: 'aluguel', categoria: 'contas', valor: 1200, dia_vencimento: 10,
});
const geladeira = compromissos.criarParcelamento({
  descricao: 'geladeira', categoria: 'compras',
  valor_parcela: 900, total_parcelas: 1, parcela_inicial: 1, mes_inicio: MES,
});

const apertado = analisarCompra({ valor: 1600, mes: MES });
conferir('ciclo aberto estourado, 1600 so parcelado depois', apertado.veredito, 'cabe_parcelado_depois');
conferirQue('folga util do ciclo aberto e negativa', apertado.a_vista.folga_util < 0, String(apertado.a_vista.folga_util));
conferirQue('nenhum mes paga 1600 a vista', apertado.esperar_ate === null, JSON.stringify(apertado.esperar_ate));

// A pergunta "quando e em quantas parcelas" tem que ter resposta mesmo com o
// ciclo aberto estourado: o parcelamento comeca depois. Antes desta conta o
// veredito caia em nao_cabe e a pergunta ficava sem responder.
conferirQue('acha mes de inicio para o parcelado', apertado.parcelado_a_partir !== null,
  JSON.stringify(apertado.parcelado_a_partir));
if (apertado.parcelado_a_partir) {
  const ap = apertado.parcelado_a_partir;
  conferir('parcelamento comeca no ciclo seguinte', ap.mes_inicio, mesSomar(MES, 1));
  conferirQue('parcela cabe em todos os meses simulados',
    ap.meses_afetados.length === ap.parcelas && ap.meses_afetados.every((m) => m.sobra_depois >= 0),
    JSON.stringify(ap.meses_afetados.map((m) => m.sobra_depois)));
  conferirQue('as parcelas somam a compra',
    Math.round(ap.valor_parcela * ap.parcelas) >= 1600, String(ap.valor_parcela * ap.parcelas));
}

// Numero de parcelas pedido explicitamente e testado antes dos usuais.
const pedido12 = analisarCompra({ valor: 1600, parcelas: 12, mes: MES });
conferir('respeita as 12x pedidas', pedido12.parcelado_a_partir?.parcelas, 12);

// Parcelamento que nao cabe em mes nenhum nao pode virar promessa.
const inviavel = analisarCompra({ valor: 90000, mes: MES });
conferir('90 mil nao cabe de jeito nenhum', inviavel.veredito, 'nao_cabe');
conferirQue('sem parcelamento inventado para 90 mil', inviavel.parcelado_a_partir === null,
  JSON.stringify(inviavel.parcelado_a_partir));

// -------------------------------------------------------------------------
// Briefing: o que o modelo le. Cada conferencia aqui corresponde a um erro
// observado na saida do qwen2.5:3b.
// -------------------------------------------------------------------------
const textoApertado = briefing(apertado, 'quando posso comprar um fone de 1600 e em quantas parcelas?');

conferirQue('folga negativa nao vai como numero com sinal',
  !/-\s*R\$/.test(textoApertado) && !/R\$\s*-/.test(textoApertado), textoApertado);
conferirQue('folga negativa vai em palavra', /nenhuma/.test(textoApertado), textoApertado);
conferirQue('briefing diz o mes de inicio e as parcelas',
  /Comecando em \w+\/\d{4} da para pagar em \d+x/.test(textoApertado), textoApertado);
conferirQue('briefing nao oferece "juntar" competindo com o parcelado',
  !/Guardando a folga/.test(textoApertado), textoApertado);
conferirQue('briefing nao cita alivio quando o veredito ja e parcelar',
  !/Alivio no orcamento/.test(textoApertado), textoApertado);

// -------------------------------------------------------------------------
// Cenario 3: compra pequena. Um cafe nao e gasto EXTRA, e o ritmo do dia --
// testa-lo contra a folga (o que sobra DEPOIS do ritmo) reprovava qualquer
// compra sempre que o ciclo estava apertado, e a resposta saia absurda para a
// pergunta mais comum do app.
//
// Os numeros sao derivados do dia em que o teste roda, senao o cenario muda de
// significado conforme a posicao dentro do ciclo: ritmo de R$ 30/dia gasto ate
// aqui, e disponivel equivalente a R$ 20/dia do que falta. Assim a folga e
// sempre negativa (o ritmo nao cabe) e o espaco de hoje e sempre R$ 20.
// -------------------------------------------------------------------------
const decorridos = ciclo.diasDecorridos(MES);
const restantes = ciclo.diasRestantes(MES);
const gastoLivre = 30 * decorridos;
const RENDA_3 = 9000;

compromissos.removerParcelamento(geladeira.id);
compromissos.criarRenda({ mes_referencia: MES, descricao: 'bonus', valor: RENDA_3 - 2000 });
compromissos.criarContaFixa({
  descricao: 'consorcio',
  categoria: 'contas',
  valor: RENDA_3 - 1200 - gastoLivre - 20 * restantes,
  dia_vencimento: 15,
});
gastos.criarGasto({ valor: gastoLivre, categoria: 'alimentacao', descricao: 'mercado', data_relativa: 'ontem' }, `mercado ${gastoLivre} ontem`);

const foto3 = retrato(MES);
conferir('espaco de hoje e de R$ 20', foto3.cabe_hoje, 20);
conferirQue('folga do ciclo e negativa neste cenario', foto3.folga_atual < 0, String(foto3.folga_atual));

const cafe = analisarCompra({ valor: 5, mes: MES });
conferir('cafe de 5 reais cabe no ritmo do dia', cafe.veredito, 'cabe_no_ritmo');
conferir('gasto de hoje ainda esta zerado', cafe.dentro_do_ritmo.gasto_hoje, 0);
conferirQue('briefing do cafe e curto: 7 linhas contando pergunta e veredito',
  briefing(cafe, 'posso tomar um cafe?').split('\n').length <= 7,
  String(briefing(cafe, 'posso tomar um cafe?').split('\n').length));

// Acima do espaco do dia a regra tem que parar de valer, senao ela aprova
// qualquer coisa em ciclo estourado.
conferirQue('R$ 21 nao cabe mais no ritmo do dia',
  analisarCompra({ valor: 21, mes: MES }).veredito !== 'cabe_no_ritmo',
  analisarCompra({ valor: 21, mes: MES }).veredito);

// -------------------------------------------------------------------------
// Travas de invencao. Sao elas que impedem o modelo de transformar a analise
// correta em conselho errado.
// -------------------------------------------------------------------------
const mesesPermitidos = mesesDe(textoApertado);
const numerosPermitidos = numerosDe(textoApertado);
const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesDoInicio = Number(apertado.parcelado_a_partir.mes_inicio.slice(5)) - 1;
const mesForaDoBriefing = [...Array(12).keys()].find((i) => !mesesPermitidos.has(i));

conferirQue('mes citado no briefing passa',
  mesesConferem(`Cabe parcelado comecando em ${CURTOS[mesDoInicio]}.`, mesesPermitidos));
conferirQue('mesmo mes por nome inteiro passa',
  mesesConferem(`Cabe parcelado comecando em ${['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][mesDoInicio]} de 2026.`, mesesPermitidos));
conferirQue('mes que nao esta no briefing e barrado',
  !mesesConferem(`Compre em ${CURTOS[mesForaDoBriefing]} que fica melhor.`, mesesPermitidos),
  `mes ${CURTOS[mesForaDoBriefing]} passou sem estar no briefing`);
conferirQue('frase sem mes nenhum passa', mesesConferem('Nao cabe hoje.', mesesPermitidos));
conferirQue('valor inventado e barrado',
  !numerosConferem('Voce pode gastar R$ 224,81 hoje.', numerosPermitidos));
conferirQue('quantidade de parcelas nao e tratada como valor inventado',
  numerosConferem('Da em 10x tranquilo.', numerosPermitidos));

// Texto de reserva: e o que o app mostra quando o Ollama esta fora do ar, e
// tem que responder a mesma pergunta que o veredito.
const reserva = textoDeReserva(apertado);
conferirQue('reserva cita as parcelas e o mes de inicio',
  /\d+x de R\$/.test(reserva) && /\w+\/\d{4}/.test(reserva), reserva);
conferirQue('reserva do cabe_agora fala em sobra',
  /sobra/.test(textoDeReserva(folgado)), textoDeReserva(folgado));

// -------------------------------------------------------------------------
for (const sufixo of ['', '-shm', '-wal']) {
  if (fs.existsSync(absoluto + sufixo)) fs.unlinkSync(absoluto + sufixo);
}

console.log(`\n${ok}/${total}`);
process.exit(ok === total ? 0 : 1);
