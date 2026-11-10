const express = require('express');
const { db } = require('../db');
const { ApiError, rota } = require('../erro');

const router = express.Router();

/*
 * TELA: Estoque.html - estoque de materiais (cadastro, saldo, estoque minimo)
 * RESPONSAVEL: Colega 1
 * ROTA BASE: /api/estoque
 *
 * TODO (colega): criar a tabela em src/db.js (CREATE TABLE IF NOT EXISTS ...)
 * e implementar as rotas que o JavaScript da tela precisar,
 * seguindo o padrao de src/routes/merenda.js.
 *
 * Exemplo:
 * router.get('/', rota(async (req, res) => {
 *   const [linhas] = await db().query('SELECT * FROM sua_tabela');
 *   res.json(linhas);
 * }));
 */

module.exports = router;
