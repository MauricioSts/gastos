// Carrega e valida as variaveis de ambiente uma unica vez.
require('dotenv').config();
const path = require('path');

// Le uma env var numerica com valor padrao.
function num(nome, padrao) {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n)) throw new Error(`Env ${nome} precisa ser numerica (recebido: "${bruto}")`);
  return n;
}

const config = {
  porta: num('PORT', 3334),
  // Endereco local do Ollama; nunca deve apontar para servico pago/externo.
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  // Modelo que escreve o conselho financeiro. Separado do de extracao porque
  // as duas tarefas tem exigencias opostas: extracao precisa de latencia baixa
  // (o usuario espera para lancar um gasto), conselho precisa de texto melhor
  // e roda em streaming, onde alguns segundos a mais nao doem. Por padrao usa
  // o mesmo modelo: trocar para 7b aqui melhora a prosa e custa ~2x o tempo.
  ollamaModelConselho: process.env.OLLAMA_MODEL_CONSELHO || process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  ollamaTimeoutMs: num('OLLAMA_TIMEOUT_MS', 90000),
  // Caminho do arquivo SQLite (relativo resolve a partir da raiz do projeto).
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/gastos.db'),
  apiToken: process.env.API_TOKEN || '',
  timezone: process.env.TZ_APP || 'America/Sao_Paulo',
  // Ciclo do cartao. O mes de referencia do app NAO e o mes do calendario:
  // ele vai do dia seguinte ao fechamento ate o fechamento seguinte, porque e
  // assim que a fatura -- e o dinheiro do usuario -- realmente funciona.
  ciclo: {
    // Dia em que a fatura fecha. Gasto feito depois dele ja e do ciclo seguinte.
    diaFechamento: num('CICLO_DIA_FECHAMENTO', 28),
    // Dia em que a renda cai. Se for maior que o fechamento, a renda do ciclo
    // chega no mes anterior ao rotulo do ciclo (salario de 30/08 banca o ciclo
    // de setembro).
    diaRecebimento: num('CICLO_DIA_RECEBIMENTO', 30),
    // Dia em que a fatura fechada e paga, no mes seguinte ao fechamento.
    diaPagamento: num('CICLO_DIA_PAGAMENTO', 5),
  },
  rateLimit: {
    janelaMs: num('RATE_LIMIT_JANELA_MS', 60000),
    maxReqs: num('RATE_LIMIT_MAX', 60),
  },
  // Confia no cabecalho X-Forwarded-For (estamos atras do Caddy).
  trustProxy: process.env.TRUST_PROXY !== 'false',
  // Origens de navegador autorizadas a chamar a API (o frontend na Vercel).
  // Lista separada por virgula; sem barra no fim.
  corsOrigens: (process.env.CORS_ORIGENS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
};

// Token e obrigatorio: sem ele a API ficaria aberta na internet.
if (!config.apiToken || config.apiToken.length < 16) {
  throw new Error('API_TOKEN ausente ou curto demais (minimo 16 caracteres). Veja .env.example.');
}

module.exports = config;
