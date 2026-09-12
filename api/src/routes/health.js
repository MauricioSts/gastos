// Health check: estado do processo, do banco e do Ollama.
const express = require('express');
const db = require('../db');
const config = require('../config');
const { verificarSaude } = require('../services/ollama');

const router = express.Router();

router.get('/health', async (req, res) => {
  let banco;
  try {
    db.prepare('SELECT 1').get();
    banco = { online: true };
  } catch (e) {
    banco = { online: false, erro: e.message };
  }

  const ollama = await verificarSaude();
  // Servico so e considerado saudavel se banco e LLM respondem.
  const ok = banco.online && ollama.online;

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degradado',
    uptime_s: Math.round(process.uptime()),
    banco,
    ollama: { url: config.ollamaUrl, modelo: config.ollamaModel, ...ollama },
  });
});

module.exports = router;
