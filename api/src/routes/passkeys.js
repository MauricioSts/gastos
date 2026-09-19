// Gestao das passkeys (Face ID). Tudo aqui exige sessao: so quem ja entrou
// com a senha cadastra um aparelho novo.
const express = require('express');
const passkey = require('../services/passkeyService');

const router = express.Router();

router.get('/passkeys', (req, res) => res.json(passkey.listar()));

router.post('/passkeys/opcoes', async (req, res, next) => {
  try {
    return res.json(await passkey.opcoesRegistro());
  } catch (e) {
    return next(e);
  }
});

router.post('/passkeys', async (req, res, next) => {
  try {
    const { resposta, nome } = req.body || {};
    return res.status(201).json(await passkey.registrar(resposta, nome));
  } catch (e) {
    return next(e);
  }
});

router.delete('/passkeys/:id', (req, res) => {
  if (!passkey.remover(req.params.id)) return res.status(404).json({ erro: 'Passkey não encontrada.' });
  return res.status(204).end();
});

module.exports = router;
