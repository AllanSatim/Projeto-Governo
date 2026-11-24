/**
 * src/equipe/financeiro.js — SGE Educação
 * Consultas de custos e movimentos que alimentam o painel financeiro.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read } = require("../store");
const { consolidar, extrato } = require("../relatorios");
const { rota } = require("../erro");

const router = express.Router();

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (_req, res) => {
    res.json(
      await read((data) => ({
        ...consolidar(data),
        extrato: extrato(data),
      })),
    );
  }),
);

// Endpoint GET /exportar-csv: autenticação e validação acontecem na camada de rotas.
router.get(
  "/exportar-csv",
  rota(async (_req, res) => {
    const rows = await read(extrato);
    /** Isola a responsabilidade csv para manter a lógica reutilizável e testável. */
    const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "Data;Módulo;Item;Operação;Quantidade;Custo Unitário;Custo Total;Origem/Destino;Responsável",
    ];
    for (const row of rows) {
      lines.push(
        [
          row.data,
          row.modulo,
          csv(row.item),
          row.tipo,
          row.quantidade,
          row.custoUnitario,
          row.custoTotal,
          csv(row.origemDestino),
          csv(row.responsavel),
        ].join(";"),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=financeiro.csv");
    res.send(`\uFEFF${lines.join("\n")}\n`);
  }),
);

module.exports = router;
