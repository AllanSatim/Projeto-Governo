/**
 * src/equipe/relatorios.js — SGE Educação
 * Endpoints para relatórios e exportações.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read } = require("../store");
const { consolidar } = require("../relatorios");
const { ApiError, rota } = require("../erro");

const router = express.Router();

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (req, res) => {
    const inicio = String(req.query.inicio || "");
    const fim = String(req.query.fim || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    /** Isola a responsabilidade validDate para manter a lógica reutilizável e testável. */
    const validDate = (value) => {
      if (!datePattern.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    };
    if ((inicio && !validDate(inicio)) || (fim && !validDate(fim)))
      throw new ApiError(400, "Período inválido.");
    if (inicio && fim && inicio > fim)
      throw new ApiError(400, "A data inicial deve ser anterior à data final.");
    res.json(await read((data) => consolidar(data, inicio, fim)));
  }),
);

module.exports = router;
