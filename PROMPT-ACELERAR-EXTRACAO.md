# Prompt de implementação — acelerar o lançamento de gastos

> **Status: as três fases foram implementadas em 01/09/2026.** O que este
> documento planejou já está no código; o que ele previu e a medição desmentiu
> está registrado na seção "Resultado medido" no fim. Leia aquela seção antes
> de reexecutar qualquer coisa daqui.

> Cole tudo a partir da linha `---` na IA que vai implementar.
> As medições deste documento foram feitas na VM real (4 OCPUs ARM, sem GPU,
> `qwen2.5:7b` Q4_K_M via Ollama) em 31/08/2026. Refaça-as antes e depois:
> número que não foi medido nesta máquina não vale.

---

Você vai reduzir o tempo entre o usuário mandar uma mensagem e o gasto aparecer
registrado. Hoje leva **~17 segundos**. O alvo é que o lançamento cotidiano
seja instantâneo, sem perder qualidade nos casos difíceis.

O projeto é o backend em `~/gastos-api` (Node 22 + Express + better-sqlite3,
serviço systemd `gastos-api` em `127.0.0.1:3334`). O frontend em `~/gastos-app`
não precisa mudar.

## 1. O diagnóstico, com números

Medido com quatro mensagens típicas, modelo já quente:

| Etapa | Tempo | Observação |
|---|---|---|
| Carga do modelo | ~1ms | `OLLAMA_KEEP_ALIVE=-1` já resolve isso |
| Prompt eval (1.033 tokens) | 1,3s | cache do Ollama já ajuda |
| **Geração (70 tokens a 4,3 tok/s)** | **16,2s** | **93% do tempo total** |

A conclusão que orienta tudo: **o gargalo é a quantidade de tokens que o modelo
escreve**, não o tamanho do prompt nem o hardware ocioso. Otimizar o prompt do
sistema rende pouco. Fazer o modelo escrever menos rende muito. Não chamar o
modelo rende tudo.

Para reproduzir:

```bash
cd ~/gastos-api
node -e "
const {PROMPT_SISTEMA,SCHEMA_GASTO}=require('./src/services/extrator');
(async()=>{
  const r=await fetch('http://localhost:11434/api/chat',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'qwen2.5:7b',stream:false,format:SCHEMA_GASTO,
      messages:[{role:'system',content:PROMPT_SISTEMA},{role:'user',content:'almoço 24 reais'}],
      options:{temperature:0,num_predict:300}})});
  const d=await r.json();
  console.log('total',(d.total_duration/1e6).toFixed(0)+'ms',
    '| prompt',(d.prompt_eval_duration/1e6).toFixed(0)+'ms('+d.prompt_eval_count+'tok)',
    '| geracao',(d.eval_duration/1e6).toFixed(0)+'ms('+d.eval_count+'tok)');
})();"
```

## 2. Fase 1 — atalho determinístico (obrigatória)

**O que é.** Antes de chamar o Ollama, tentar resolver a mensagem com uma
tabela de palavras e uma regex. Se conseguir, responder em ~0,05s. Se tiver
qualquer dúvida, devolver `null` e deixar o LLM decidir como hoje.

**Por que funciona.** O lançamento do dia a dia é `almoço 24`, `uber 32`,
`mercado 187,40`. Não tem ambiguidade nenhuma: um número, uma palavra
conhecida, nenhuma marca de parcela ou recorrência. Chamar um modelo de 7
bilhões de parâmetros para isso é desperdício de 17 segundos.

**A regra de ouro: o atalho é conservador.** Ele só responde quando *todas* as
condições abaixo valem. Errar rápido é pior do que acertar devagar — e um
compromisso recorrente cadastrado errado contamina vários meses.

1. Mensagem com no máximo 60 caracteres.
2. Exatamente **um** número. Dois números costumam ser parcela, data ou troco.
3. Nenhuma marca de parcelamento: `\d+\s*(x|vezes)`, `parcel…`, `dividid…`.
4. Nenhuma marca de recorrência: `todo mês`, `mensal`, `vence dia`, `assinatura`.
5. Nenhum verbo de entrada de dinheiro: `recebi`, `me mandaram`, `me pagaram`,
   `caiu`, `entrou`, `vendi`, `me transferiram`, `reembolsou`, `estornou`,
   `me deram`.
6. Nenhuma data que não seja hoje ou ontem: `anteontem`, `semana passada`,
   `dia 12`, nomes de dia da semana.
7. Alguma palavra da mensagem bate na tabela de categorias.

Falhou qualquer uma → `null` → LLM.

### Arquivo novo: `src/services/atalho.js`

```js
// Atalho deterministico para o lancamento cotidiano.
//
// A extracao pelo LLM local leva ~17s, e 93% disso e geracao de token em CPU.
// Mensagens como "almoco 24" ou "uber 32" nao tem ambiguidade nenhuma: um
// numero, uma palavra conhecida, nenhuma marca de parcela ou recorrencia.
// Resolver essas aqui derruba o tempo para ~0,05s.
//
// Este modulo e conservador de proposito: na menor duvida devolve null e o
// LLM decide. Errar rapido e pior que acertar devagar.
const { CATEGORIAS } = require('../utils/validacao');

// Palavras que identificam categoria sem ambiguidade. Manter curto e obvio:
// termo duvidoso aqui vira gasto categorizado errado sem o usuario perceber.
const TERMOS = {
  alimentacao: ['almoço', 'almoco', 'janta', 'jantar', 'café', 'cafe', 'lanche',
    'mercado', 'feira', 'restaurante', 'padaria', 'pizza', 'ifood', 'hamburguer',
    'açaí', 'acai', 'sorvete', 'pão', 'pao', 'bar', 'cerveja', 'supermercado',
    'marmita', 'pastel', 'sushi', 'churrasco'],
  transporte: ['uber', 'ônibus', 'onibus', 'metrô', 'metro', 'gasolina',
    'combustível', 'combustivel', 'álcool', 'alcool', 'etanol', 'táxi', 'taxi',
    'estacionamento', 'pedágio', 'pedagio', 'passagem', 'bilhete', 'recarga'],
  lazer: ['cinema', 'show', 'viagem', 'jogo', 'festa', 'passeio', 'parque',
    'teatro', 'balada'],
  saude: ['farmácia', 'farmacia', 'remédio', 'remedio', 'médico', 'medico',
    'dentista', 'academia', 'exame', 'consulta', 'psicólogo', 'psicologo'],
  compras: ['roupa', 'tênis', 'tenis', 'camisa', 'calça', 'calca', 'presente',
    'shopping', 'notebook'],
  contas: ['luz', 'água', 'agua', 'internet', 'aluguel', 'condomínio',
    'condominio', 'gás', 'telefone', 'iptu'],
  assinaturas: ['spotify', 'netflix', 'disney', 'icloud'],
  educacao: ['curso', 'livro', 'faculdade', 'escola', 'apostila'],
};

const PARCELA = /\d+\s*(x|vezes)\b|parcel\w+|dividid\w+/i;
const RECORRENTE = /\btodo(s)? (o(s)? )?m[êe]s\b|\bmensal\w*\b|\bvence dia\b|\bassinatura\b/i;
const ENTRADA = /\b(recebi|receberam|me mandaram|me mandou|me pagaram|me pagou|caiu|entrou|vendi|me transferiu|me transferiram|reembols\w*|estorn\w*|me deram|me deu)\b/i;
const DATA_ESTRANHA = /\banteontem\b|\bsemana passada\b|\bm[êe]s passado\b|\bdia \d+\b|\bsegunda\b|\bter[çc]a\b|\bquarta\b|\bquinta\b|\bsexta\b|\bs[áa]bado\b|\bdomingo\b/i;

// Remove acento para comparar "almoço" com "almoco".
function semAcento(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Indice palavra -> categoria, montado uma vez.
const INDICE = new Map();
for (const [categoria, termos] of Object.entries(TERMOS)) {
  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`Categoria "${categoria}" do atalho nao existe no enum.`);
  }
  for (const termo of termos) INDICE.set(semAcento(termo), categoria);
}

// Devolve o mesmo formato que `extrairGasto`, ou null quando nao tem certeza.
function tentarAtalho(mensagem) {
  const texto = mensagem.trim();
  if (texto.length > 60) return null;
  if (PARCELA.test(texto) || RECORRENTE.test(texto)) return null;
  if (ENTRADA.test(texto)) return null;
  if (DATA_ESTRANHA.test(texto)) return null;

  // Exatamente um numero. Dois costumam ser parcela, data ou troco.
  const numeros = texto.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numeros.length !== 1) return null;
  const valor = Number(numeros[0].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;

  const palavras = semAcento(texto).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let categoria = null;
  let encontrada = null;
  for (const palavra of palavras) {
    if (INDICE.has(palavra)) { categoria = INDICE.get(palavra); encontrada = palavra; break; }
  }
  if (!categoria) return null;

  return {
    tipo: 'gasto_avulso',
    valor: Math.round(valor * 100) / 100,
    categoria,
    descricao: encontrada,
    data_relativa: /\bontem\b/i.test(texto) ? 'ontem' : 'hoje',
    total_parcelas: null,
    valor_parcela: null,
    valor_total_compra: null,
    dia_vencimento: null,
    _meta: { tentativas: 0, duracao_ms: 0, modelo: 'atalho' },
  };
}

module.exports = { tentarAtalho, TERMOS };
```

### Ligar em `src/services/extrator.js`

No topo de `extrairGasto`, antes de montar as mensagens do chat:

```js
const { tentarAtalho } = require('./atalho');

async function extrairGasto(mensagem) {
  // Lancamento cotidiano sai daqui sem tocar no LLM.
  const atalho = tentarAtalho(mensagem);
  if (atalho) return atalho;

  // ... resto como esta hoje
}
```

Nada mais muda. `_meta.modelo` passa a valer `"atalho"` quando o caminho rápido
respondeu, e isso já aparece no campo `llm` da resposta da API — dá para medir a
taxa de acerto em produção sem instrumentação extra.

### Teste obrigatório da fase 1

Crie `teste-atalho.js` na raiz e rode com `node teste-atalho.js`. Os dois lados
importam: o que **deve** ser instantâneo e o que **deve** cair no LLM.

```js
const { tentarAtalho } = require('./src/services/atalho');

const CASOS = [
  // devem resolver sem LLM: [mensagem, valor, categoria, data_relativa]
  ['almoço 24 reais', 24, 'alimentacao', 'hoje'],
  ['uber 32', 32, 'transporte', 'hoje'],
  ['mercado 187,40', 187.4, 'alimentacao', 'hoje'],
  ['gastei 32 no uber', 32, 'transporte', 'hoje'],
  ['paguei 120 de luz', 120, 'contas', 'hoje'],
  ['farmacia 45', 45, 'saude', 'hoje'],
  ['cinema 60 ontem', 60, 'lazer', 'ontem'],
  ['gasolina 200', 200, 'transporte', 'hoje'],
  ['torrei 45 pila no mercado ontem', 45, 'alimentacao', 'ontem'],
  // devem cair no LLM (null)
  ['recebi um pix de 10 reais', null],
  ['me pagaram 120', null],
  ['comprei um fone em 6x de 90', null],
  ['todo mes pago 99 de internet', null],
  ['meu aluguel e 800 e vence dia 5', null],
  ['bom dia, tudo bem?', null],
  ['pix de 30 pro joao', null],
  ['farmacia 32 reais anteontem', null],
  ['gastei 50 naquele lugar novo', null],
  ['vendi a bike por 300', null],
];

let ok = 0;
for (const [mensagem, valor, categoria, data] of CASOS) {
  const r = tentarAtalho(mensagem);
  const bom = valor === null
    ? r === null
    : Boolean(r) && r.valor === valor && r.categoria === categoria && r.data_relativa === data;
  if (bom) ok += 1;
  console.log(`${bom ? ' ok  ' : 'FALHA'} ${r ? `${r.valor} ${r.categoria} ${r.data_relativa}` : 'LLM'}  <- ${mensagem}`);
}
console.log(`\n${ok}/${CASOS.length}`);
process.exit(ok === CASOS.length ? 0 : 1);
```

Este conjunto já passou **19/19** no protótipo. Se algum falhar, o problema é a
sua implementação, não o conjunto.

Depois rode a suíte inteira, que não pode regredir:

```bash
./test.sh    # tem que continuar 35 ok, 0 falha
```

### Resultado esperado da fase 1

| Mensagem | Antes | Depois |
|---|---|---|
| `almoço 24 reais` | 17s | **0,05s** |
| `uber 32` | 17s | **0,05s** |
| `recebi um pix de 10` | 17s | 17s (vai ao LLM, como deve) |
| `comprei um fone em 6x de 90` | 17s | 17s (vai ao LLM, como deve) |

Nenhuma perda de acurácia: o que era decidido pelo modelo continua sendo.

## 3. Fase 2 — schema enxuto (opcional, tem custo)

Só faz sentido se, depois da fase 1, o caminho do LLM ainda incomodar.

**O que é.** Encurtar as chaves do JSON de saída (`valor` → `v`, `categoria` →
`c`, `descricao` → `d`, `data_relativa` → `q`) e tirar os campos de parcela e
vencimento do `required`, para o modelo omiti-los no caso comum. Saída cai de
**70 para 47 tokens**, e o tempo de **17s para 10,5s**.

**O custo, medido.** A matriz de 17 casos foi de 17/17 para **16/17**: o modelo
passa a ler `pix de 30 pro joao` como entrada em vez de gasto. Dá para
recuperar reinserindo o exemplo `"pix pro" é gasto, "pix do" é entrada` no
prompt, mas aí o prompt cresce e parte da economia volta.

Mantenha `tipo` com os valores por extenso. E mapeie as chaves curtas de volta
para os nomes longos dentro de `validarSaida`, para nada fora do extrator
enxergar `v` e `c`.

**O que NÃO fazer — já testado e descartado.** Encurtar também os *valores* do
enum de tipo (`gasto_avulso` → `g`, `entrada` → `e`, `conta_fixa` → `f`,
`parcelamento` → `p`) leva a saída a 40 tokens e o tempo a 9s, mas **destrói a
acurácia**: `almoço 24 reais` vira entrada e `uber 32` vira conta fixa. O modelo
precisa da palavra inteira para raciocinar sobre o significado. Não repita esse
experimento achando que dá para salvar com prompt.

## 4. Fase 3 — trocar de modelo (opcional, não medido)

`qwen2.5:3b` deve rodar perto do dobro da velocidade e ocupa ~2,5GB de RAM em
vez de ~5,5GB. **Este número não foi medido nesta máquina** — meça antes de
decidir.

```bash
ollama pull qwen2.5:3b
sed -i 's|^OLLAMA_MODEL=.*|OLLAMA_MODEL=qwen2.5:3b|' .env
sudo systemctl restart gastos-api
```

Rode a matriz de classificação da seção 5 antes e depois. O risco concentra-se
nos casos sutis de direção do dinheiro (`paguei` vs `me pagaram`, `pix pro` vs
`pix do`) e na precedência parcelamento sobre gasto. Se a fase 1 já resolveu o
uso diário, a troca provavelmente não compensa a perda.

Para voltar: troque `OLLAMA_MODEL` de volta e reinicie. O 7b continua baixado.

## 5. Matriz de classificação — não regrida isto

Qualquer mexida no `PROMPT_SISTEMA`, no `SCHEMA_GASTO` ou no modelo exige
rodar isto. O estado atual é **18/18**.

```js
const casos = [
  ['almoço 24 reais', 'gasto_avulso'],
  ['mercado 187,40', 'gasto_avulso'],
  ['uber 32', 'gasto_avulso'],
  ['gastei 32 no uber', 'gasto_avulso'],
  ['paguei 120 de luz', 'gasto_avulso'],
  ['torrei 45 pila no mercado ontem', 'gasto_avulso'],
  ['pix de 30 pro joao', 'gasto_avulso'],
  ['bom dia, tudo bem?', 'gasto_avulso'],
  ['recebi um pix de 10 reais', 'entrada'],
  ['me mandaram 50', 'entrada'],
  ['me pagaram 120', 'entrada'],
  ['caiu meu salario de 1700', 'entrada'],
  ['vendi a bike por 300', 'entrada'],
  ['recebi um pix de 80 do carlos', 'entrada'],
  ['comprei um fone em 6x de 90', 'parcelamento'],
  ['comprei uma tv de 2160 em 12x', 'parcelamento'],
  ['todo mes pago 99 de internet', 'conta_fixa'],
  ['meu aluguel e 800 e vence dia 5', 'conta_fixa'],
];
```

Duas frases do prompt existem por erro observado, não por precaução. Se você
reescrever o prompt, elas precisam sobreviver em alguma forma:

- **`gasto_avulso` é o padrão declarado, inclusive sem verbo.** Sem isso o
  modelo classificava `almoço 24 reais` como entrada.
- **A descrição só pode usar palavras da mensagem.** Sem isso o modelo gravava
  `recebi um pix de 10` como "pix do joao", inventando um nome que ninguém
  escreveu.

## 6. Critérios de aceite

- [ ] `node teste-atalho.js` → 19/19
- [ ] `./test.sh` → 35 ok, 0 falha
- [ ] Matriz de classificação → 18/18
- [ ] `almoço 24 reais` pela API responde em menos de 0,5s ponta a ponta
- [ ] `comprei um fone em 6x de 90` continua devolvendo `requer_confirmacao: true`
- [ ] `recebi um pix de 10` continua virando linha de renda, não gasto
- [ ] O campo `llm.modelo` da resposta diz `"atalho"` quando o caminho rápido
      respondeu, e o nome do modelo quando não

Medindo ponta a ponta:

```bash
TOKEN=$(grep '^API_TOKEN=' .env | cut -d= -f2)
time curl -s -X POST http://localhost:3334/api/gastos \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mensagem":"almoço 24 reais"}' > /dev/null
```

## 7. O que não vale a pena mexer

Medido ou verificado, para você não perder tempo:

- **Encurtar o `PROMPT_SISTEMA`.** Prompt eval é 1,3s de 17s. Já foi de 903
  para 593 tokens numa iteração anterior e o ganho foi marginal.
- **`num_predict`.** Já está em 300 e a saída para em ~70. Não é o limite.
- **Streaming.** A resposta só serve inteira, o JSON precisa fechar.
- **Mais threads no Ollama.** São 4 cores e ele já os usa.
- **`OLLAMA_NUM_PARALLEL`.** Já está em 1 de propósito; paralelismo em 4 cores
  ARM não ajuda uma inferência só.
- **Cold start.** `OLLAMA_KEEP_ALIVE=-1` já mantém o modelo residente. A carga
  medida é de 1ms.

## 8. Se der errado

O atalho é isolado num arquivo e ligado por três linhas. Para desligar, comente
a chamada em `extrairGasto` e reinicie — tudo volta a passar pelo LLM:

```bash
sudo systemctl restart gastos-api
curl -s http://localhost:3334/api/health
```

Se aparecer gasto categorizado errado em produção, o caminho não é desligar o
atalho inteiro: é tirar da tabela `TERMOS` a palavra que causou o erro. Termo
ambíguo é o único jeito de esse atalho errar.

---

## Resultado medido (01/09/2026)

Todas as medições abaixo são desta VM, com o modelo já quente.

| Caminho | Antes | Depois |
|---|---|---|
| `almoço 24 reais`, `uber 32` (atalho) | 16,3s | **11ms** ponta a ponta |
| `recebi um pix de 10` (LLM) | 16,3s | **3,3s** |
| `comprei um fone em 6x de 90` (LLM) | 16,3s | **4,8s** |

Estado final: `qwen2.5:3b`, schema de chaves curtas, atalho determinístico
ligado. Testes: `teste-atalho.js` 19/19, `teste-classificacao.js` 18/18,
`./test.sh` 35 ok.

### O que o plano previu errado

- **Fase 2 não custou acurácia.** A previsão era cair de 17/17 para 16/17 em
  `pix de 30 pro joao`. Com o `qwen2.5:7b` a matriz deu 18/18 com as chaves
  curtas, sem tocar no prompt.
- **Fase 3 sozinha custa acurácia, e o bloco de exemplos resolve.** O
  `qwen2.5:3b` puro deu **15/18**: perdeu `pix de 30 pro joao` (virou entrada),
  `vendi a bike por 300` (virou gasto) e — o pior — `comprei um fone em 6x de 90`
  (virou gasto avulso, ou seja, um parcelamento silenciosamente perdido).
  Um bloco de 6 exemplos com o JSON de saída, no fim do `PROMPT_SISTEMA`, levou
  o 3b a **18/18**. O 7b continua 18/18 com o mesmo prompt, então dá para voltar
  atrás trocando só `OLLAMA_MODEL`.
- **Latência por modelo, com o prompt final:** 3b ~4,1s por chamada, 7b ~9,2s.

### O bloco de exemplos é carga, não enfeite

Ele existe porque um modelo de 3B não segue a lista de precedência só pela
descrição em prosa. Se alguém encurtar o `PROMPT_SISTEMA` e tirar os exemplos,
a matriz volta para 15/18 — e o caso perdido mais caro é o parcelamento, que
contamina vários meses. Rode `node teste-classificacao.js` depois de qualquer
mexida no prompt, no schema ou no modelo.

### Cuidado com `./test.sh` e o banco de produção

`./test.sh` grava no banco apontado pelo `.env` e **não remove os gastos que
cria** (só rendas, contas fixas e parcelamentos), além de deixar um orçamento
de 800 cadastrado. Rode sempre contra uma instância isolada:

```bash
PORT=3400 DB_PATH=data/teste.db node src/server.js &
BASE=http://localhost:3400 ./test.sh
```
