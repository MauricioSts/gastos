// Ponto de entrada: monta middlewares, rotas e sobe o Express.
const express = require('express');
const config = require('./config');
const auth = require('./middleware/auth');
const cors = require('./middleware/cors');
const rateLimit = require('./middleware/rateLimit');
const { naoEncontrado, tratarErro } = require('./middleware/erro');
const rotaGastos = require('./routes/gastos');
const rotaFinancas = require('./routes/financas');
const rotaCompromissos = require('./routes/compromissos');
const rotaHealth = require('./routes/health');
const rotaBoot = require('./routes/boot');
const rotaConsultor = require('./routes/consultor');

const app = express();

// Atras do Caddy: req.ip passa a refletir o IP real do cliente.
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

// Corpo pequeno: as mensagens sao curtas, nao ha upload.
app.use(express.json({ limit: '16kb' }));

// CORS antes de tudo: o preflight OPTIONS nao carrega token e nao pode
// esbarrar no rate limit nem na autenticacao.
app.use(cors);

// Rate limit antes da auth para tambem frear tentativa de forca bruta no token.
app.use('/api', rateLimit);

// Health e publico para monitoramento externo; o resto exige token.
app.use('/api', rotaHealth);
app.use('/api', auth);
app.use('/api/gastos', rotaGastos);
app.use('/api', rotaFinancas);
app.use('/api', rotaCompromissos);
app.use('/api', rotaBoot);
app.use('/api', rotaConsultor);

app.use(naoEncontrado);
app.use(tratarErro);

const servidor = app.listen(config.porta, '127.0.0.1', () => {
  console.log(`[gastos-api] ouvindo em http://127.0.0.1:${config.porta}`);
  console.log(`[gastos-api] modelo: ${config.ollamaModel} via ${config.ollamaUrl}`);
  console.log(`[gastos-api] banco: ${config.dbPath}`);
});

// Encerramento limpo para o systemd (restart sem conexoes penduradas).
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`[gastos-api] recebido ${sinal}, encerrando...`);
    servidor.close(() => process.exit(0));
    // Nao espera para sempre por conexoes lentas.
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

module.exports = app;
