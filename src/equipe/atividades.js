/** Histórico operacional para estoque e merenda (sem expor a auditoria administrativa). */
const express = require("express");
const { read } = require("../store");
const { rota } = require("../erro");
const router = express.Router();

// Toda ação, inclusive exclusões e ajustes de mínimo, contém nome e data.
router.get(
  "/:modulo",
  rota(async (req, res) => {
    const modulos = { estoque: "Estoque", merenda: "Merenda" };
    const modulo = modulos[req.params.modulo];
    if (!modulo)
      return res.status(404).json({ erro: "Módulo não encontrado." });
    res.json(
      await read((data) =>
        data.logs
          .filter((entry) => entry.modulo === modulo)
          .sort((a, b) => b.data.localeCompare(a.data))
          .slice(0, 150),
      ),
    );
  }),
);
module.exports = router;
