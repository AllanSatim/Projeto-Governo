const express = require('express');
const { db } = require('../db');
const { ApiError, rota } = require('../erro');

const router = express.Router();

/*
 * TELA: financeiro.html - custo total em estoque, custo das saidas, extrato (usa Estoque + Movimentacao + Merenda)
 * RESPONSAVEL: Colega 2
 * ROTA BASE: /api/financeiro
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
