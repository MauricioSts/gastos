// Vocabulario aprendido com as correcoes do usuario.
//   GET    /api/vocabulario      -> lista, mais recente primeiro
//   POST   /api/vocabulario      -> { termo, categoria, descricao? } ensina direto
//   DELETE /api/vocabulario/:id  -> esquece um termo aprendido errado
const express = require('express');
const vocabulario = require('../services/vocabularioService');
const { ErroApi } = require('../utils/validacao');

const router = express.Router();

router.get('/vocabulario', (req, res, next) => {
  try {
    res.json({ termos: vocabulario.listar() });
  } catch (e) {
    next(e);
  }
});

router.post('/vocabulario', (req, res, next) => {
  try {
    res.status(201).json({ termo: vocabulario.criar(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/vocabulario/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErroApi(400, 'O id deve ser um inteiro positivo.');
    res.json({ removido: true, termo: vocabulario.remover(id) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
