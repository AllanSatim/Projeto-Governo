/**
 * src/equipe/painel.js — SGE Educação
 * Consolidação de indicadores de alto nível para o painel inicial.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read } = require("../store");
const { consolidar } = require("../relatorios");
const { rota } = require("../erro");

const router = express.Router();

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (_req, res) => {
    res.json(
      await read((data) => ({
        ...consolidar(data),
        quantidadeMateriais: data.stockItems.reduce(
          (sum, item) => sum + item.quantidade,
          0,
        ),
        quantidadeMerenda: data.foods.reduce(
          (sum, item) => sum + item.quantidade,
          0,
        ),
        itensEstoque: data.stockItems.length,
        itensCriticos: data.stockItems.filter(
          (item) => item.quantidade <= item.minimo,
        ).length,
        movimentosRecentes: data.movements
          .filter((item) => !item.cancelada)
          .sort((a, b) => b.data.localeCompare(a.data))
          .slice(0, 5),
      })),
    );
  }),
);

module.exports = router;
