// Traduz uma mensagem em linguagem natural em um lancamento estruturado,
// usando o LLM local com saida forcada por JSON Schema.
//
// A mensagem pode virar quatro coisas diferentes:
//   gasto_avulso  -> gravado direto (afeta so um mes)
//   entrada       -> gravado direto como renda do mes (a operacao inversa)
//   conta_fixa    -> sugestao, exige confirmacao do usuario
//   parcelamento  -> sugestao, exige confirmacao do usuario
// Compromisso errado contamina varios meses, nao um registro. Por isso nada
// recorrente e gravado sem o usuario confirmar. Gasto e entrada afetam so o
// mes corrente e tem desfazer, entao vao direto.
const { chatEstruturado } = require('./ollama');
const { tentarAtalho } = require('./atalho');
const {
  CATEGORIAS, LIMITE_DESCRICAO, normalizarValor, emCentavos,
  categoriaValida, limparTexto,
} = require('../utils/validacao');

const TIPOS = ['gasto_avulso', 'entrada', 'conta_fixa', 'parcelamento'];
const DATAS_RELATIVAS = ['hoje', 'ontem', 'outro'];

// Schema entregue ao Ollama no parametro `format`. O decoder do modelo fica
// restrito a ele, entao tipo e categoria sempre caem dentro do enum.
// Todos os campos sao required: modelo pequeno lida melhor com "preencha 0
// quando nao se aplica" do que com campo ausente.
const SCHEMA_GASTO = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: TIPOS },
    // Chaves curtas de proposito: cada caractere gerado custa ~0,23s em CPU
    // ARM, e a geracao e 95% do tempo total. Os valores do enum de tipo
    // continuam por extenso -- encurtar tambem os valores foi medido e
    // destruiu a acuracia (o modelo precisa da palavra inteira para
    // raciocinar). `expandirChaves` traduz de volta antes da validacao, para
    // nada fora deste arquivo enxergar `v` e `c`.
    v: { type: 'number' },
    c: { type: 'string', enum: CATEGORIAS },
    d: { type: 'string' },
    // O LLM nunca escreve data absoluta; quem resolve a data real e o backend,
    // que conhece o fuso America/Sao_Paulo.
    q: { type: 'string', enum: DATAS_RELATIVAS },
    n: { type: 'number' },
    p: { type: 'number' },
    dv: { type: 'number' },
  },
  // n, p e dv ficam fora do required para o modelo omiti-los no caso comum,
  // que e gasto avulso. O valor total da compra nao e um campo: quando a
  // mensagem so da o total, ele chega em `v` e o backend divide.
  required: ['tipo', 'v', 'c', 'd', 'q'],
};

// Mapa das chaves curtas do schema para os nomes usados no resto do codigo.
const CHAVES = { v: 'valor', c: 'categoria', d: 'descricao', q: 'data_relativa',
  n: 'total_parcelas', p: 'valor_parcela', dv: 'dia_vencimento' };

// Aceita tanto a saida curta do modelo quanto o formato por extenso, para o
// validador continuar servindo a chamadas antigas e aos testes.
function expandirChaves(objeto) {
  if (!objeto || typeof objeto !== 'object') return objeto;
  const saida = { tipo: objeto.tipo };
  for (const [curta, longa] of Object.entries(CHAVES)) {
    saida[longa] = objeto[curta] !== undefined ? objeto[curta] : objeto[longa];
  }
  return saida;
}

const PROMPT_SISTEMA = `Extraia lancamentos financeiros de mensagens em portugues brasileiro.

tipo: decida NESTA ORDEM e pare na primeira que servir.

1. "parcelamento": a mensagem cita parcelas ou vezes ("6x de 90", "12x", "parcelei em 10 vezes").
   Esta regra vem primeiro e vale mesmo com verbo de gasto: "comprei um fone em 6x de 90"
   e parcelamento, NAO gasto_avulso.
2. "conta_fixa": cobranca que se repete todo mes ("todo mes pago 99 de internet",
   "aluguel de 800 vence dia 5", "assinatura mensal de 30").
3. "entrada": SO se a mensagem tiver um verbo explicito de dinheiro entrando:
   recebi, me mandaram, me pagaram, caiu, entrou, vendi, me transferiram,
   reembolsaram, estornaram, me deram.
   Ex: "recebi um pix de 10", "me mandaram 50", "caiu meu salario", "vendi a bike por 300".
4. "gasto_avulso": todo o resto. Este e o padrao.
   Vale tanto com verbo de saida (gastei, paguei, comprei, torrei, coloquei) quanto
   SEM verbo nenhum: "almoco 24 reais", "mercado 187,40", "uber 32" sao gastos.
   Na duvida, escolha gasto_avulso.

Atencao a direcao do dinheiro entre 3 e 4: "paguei 120" e gasto; "me pagaram 120" e entrada.
"pix de 30 pro joao" e gasto; "pix de 30 do joao" e entrada.

v (valor): em reais, numero. Girias: pila, conto, mangos, paus. "45 pila"=45. "18,50"=18.5. "1.250,00"=1250.
Se a mensagem nao descreve lancamento nenhum, use tipo "gasto_avulso" e valor 0.

Em entrada, use c "outros".

n: total de parcelas, SO em parcelamento. Omita nos outros tipos.
p: valor de CADA parcela quando a mensagem der ("12x de 180" -> 180).
  Se der so o total da compra ("2160 em 12x"), omita p e ponha 2160 em v. Omita nos outros tipos.
dv: dia de vencimento, SO em conta_fixa, dia 1 a 31. Omita nos outros tipos.

c (categoria, escolha uma):
alimentacao=comida, mercado, restaurante, ifood, padaria, bar
transporte=uber, onibus, metro, gasolina, taxi, estacionamento, pedagio
lazer=cinema, viagem, jogos, festa, passeio
saude=farmacia, remedio, medico, exame, plano de saude, academia
compras=roupa, eletronico, moveis, presente, item de casa
contas=luz, agua, gas, aluguel, internet, telefone, condominio, imposto
assinaturas=netflix, spotify, disney, servicos mensais
educacao=curso, livro, faculdade, escola, material escolar
outros=o que nao encaixar

d (descricao): ate 4 palavras, minusculas. Use SOMENTE palavras que aparecem na mensagem.
Nunca invente nome de pessoa, loja, meio de pagamento ou lugar que o usuario nao escreveu:
"recebi um pix de 10" vira "pix"; "me mandaram 50" vira "transferencia recebida",
nao "pix do joao". Se a mensagem citar quem mandou, ai sim inclua.
q (data): "ontem" se disser ontem; "outro" se citar outra data (anteontem, semana passada, dia 5); senao "hoje". Em conta_fixa e parcelamento use "hoje".

Exemplos (siga exatamente esta forma):
"comprei um fone em 6x de 90" -> {"tipo":"parcelamento","v":90,"c":"compras","d":"fone","q":"hoje","n":6,"p":90}
"todo mes pago 99 de internet" -> {"tipo":"conta_fixa","v":99,"c":"contas","d":"internet","q":"hoje"}
"vendi a bike por 300" -> {"tipo":"entrada","v":300,"c":"outros","d":"bike","q":"hoje"}
"recebi um pix de 10" -> {"tipo":"entrada","v":10,"c":"outros","d":"pix","q":"hoje"}
"pix de 30 pro joao" -> {"tipo":"gasto_avulso","v":30,"c":"outros","d":"pix pro joao","q":"hoje"}
"almoco 24 reais" -> {"tipo":"gasto_avulso","v":24,"c":"alimentacao","d":"almoco","q":"hoje"}

Responda apenas o JSON, sem quebras de linha, com as chaves tipo, v, c, d, q
e, so quando o tipo exigir, n, p e dv.`;

// Le um numero opcional vindo do modelo; 0 e ausencia significam "nao informado".
function numeroOpcional(bruto) {
  const n = normalizarValor(bruto);
  if (n === null || n <= 0) return null;
  return emCentavos(n);
}

// Le um inteiro opcional dentro de uma faixa.
function inteiroOpcional(bruto, min, max) {
  const n = normalizarValor(bruto);
  if (n === null) return null;
  const i = Math.round(n);
  if (i < min || i > max) return null;
  return i;
}

// Valida e normaliza o objeto devolvido pelo modelo.
// Retorna { ok: true, dados } ou { ok: false, motivo }.
function validarSaida(bruto) {
  if (!bruto || typeof bruto !== 'object') {
    return { ok: false, motivo: 'resposta nao e um objeto' };
  }
  const objeto = expandirChaves(bruto);

  const valor = normalizarValor(objeto.valor);
  if (valor === null) {
    return { ok: false, motivo: `valor invalido: ${JSON.stringify(objeto.valor)}` };
  }

  if (!categoriaValida(objeto.categoria)) {
    return { ok: false, motivo: `categoria fora do enum: ${JSON.stringify(objeto.categoria)}` };
  }

  const tipo = TIPOS.includes(objeto.tipo) ? objeto.tipo : 'gasto_avulso';
  const dataRelativa = DATAS_RELATIVAS.includes(objeto.data_relativa)
    ? objeto.data_relativa
    : 'hoje';

  const totalParcelas = inteiroOpcional(objeto.total_parcelas, 2, 480);
  let valorParcela = numeroOpcional(objeto.valor_parcela);

  // Parcelamento sem numero de parcelas nao e parcelamento: cai para gasto
  // avulso em vez de virar um compromisso pela metade.
  const ehParcelamento = tipo === 'parcelamento' && totalParcelas !== null;

  // valor_parcela vazio significa que a mensagem deu o total da compra:
  // quem divide e o backend, como manda a regra.
  const valorTotalCompra = ehParcelamento && valorParcela === null
    ? emCentavos(valor)
    : null;
  if (ehParcelamento && valorParcela === null) {
    valorParcela = emCentavos(valorTotalCompra / totalParcelas);
  }

  return {
    ok: true,
    dados: {
      tipo: ehParcelamento ? 'parcelamento' : (tipo === 'parcelamento' ? 'gasto_avulso' : tipo),
      valor: emCentavos(valor),
      categoria: objeto.categoria,
      descricao: limparTexto(objeto.descricao, LIMITE_DESCRICAO),
      data_relativa: dataRelativa,
      total_parcelas: ehParcelamento ? totalParcelas : null,
      valor_parcela: ehParcelamento ? valorParcela : null,
      valor_total_compra: ehParcelamento ? valorTotalCompra : null,
      dia_vencimento: tipo === 'conta_fixa'
        ? inteiroOpcional(objeto.dia_vencimento, 1, 31)
        : null,
    },
  };
}

// Extrai o lancamento de uma mensagem. Em caso de saida invalida, tenta
// exatamente mais uma vez antes de desistir (requisito do projeto).
async function extrairGasto(mensagem) {
  // Lancamento cotidiano sai daqui sem tocar no LLM.
  const atalho = tentarAtalho(mensagem);
  if (atalho) return atalho;

  const mensagens = [
    { role: 'system', content: PROMPT_SISTEMA },
    { role: 'user', content: mensagem },
  ];

  let ultimoMotivo = null;

  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    const resposta = await chatEstruturado({ mensagens, schema: SCHEMA_GASTO });
    const validado = validarSaida(resposta.objeto);

    if (validado.ok) {
      return {
        ...validado.dados,
        _meta: {
          tentativas: tentativa,
          duracao_ms: resposta.duracaoMs,
          modelo: resposta.modelo,
        },
      };
    }

    ultimoMotivo = validado.motivo;
    console.warn(
      `[extrator] saida invalida na tentativa ${tentativa}: ${ultimoMotivo} | mensagem: "${mensagem}"`,
    );
  }

  const erro = new Error(
    `O modelo local nao devolveu um lancamento valido apos 2 tentativas (${ultimoMotivo}).`,
  );
  erro.tipoExtracao = 'saida_invalida';
  throw erro;
}

module.exports = { extrairGasto, validarSaida, SCHEMA_GASTO, PROMPT_SISTEMA, TIPOS };
