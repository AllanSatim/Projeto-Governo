/**
 * src/equipe/chamados.js — SGE Educação
 * Abertura, acompanhamento e atualização de chamados do suporte.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");

const router = express.Router();

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (req, res) => {
    res.json(
      await read((data) =>
        data.tickets
          .filter(
            (ticket) =>
              req.user.perfil === "admin" ||
              ticket.solicitanteId === req.user.id,
          )
          .slice()
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      ),
    );
  }),
);

// Endpoint POST /: autenticação e validação acontecem na camada de rotas.
router.post(
  "/",
  rota(async (req, res) => {
    const { nome, email, assunto, mensagem } = req.body;
    if (
      ![nome, email, assunto, mensagem].every((value) =>
        String(value || "").trim(),
      )
    )
      throw new ApiError(400, "Preencha todos os campos do chamado.");
    if (!/^\S+@\S+\.\S+$/.test(String(email)))
      throw new ApiError(400, "E-mail inválido.");
    const ticket = await update((data) => {
      const item = {
        id: nextId(data, "tickets"),
        solicitanteId: req.user.id,
        nome: String(nome).trim(),
        email: String(email).trim().toLowerCase(),
        assunto: String(assunto).trim(),
        mensagem: String(mensagem).trim(),
        status: "Aberto",
        criadoEm: new Date().toISOString(),
      };
      data.tickets.unshift(item);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Abertura do chamado #${item.id}`,
        modulo: "Suporte",
        data: item.criadoEm,
      });
      return item;
    });
    res.status(201).json(ticket);
  }),
);

// Endpoint PATCH /:id: autenticação e validação acontecem na camada de rotas.
router.patch(
  "/:id",
  rota(async (req, res) => {
    if (req.user.perfil !== "admin")
      throw new ApiError(
        403,
        "Somente administradores podem atualizar chamados.",
      );
    if (!["Aberto", "Em atendimento", "Resolvido"].includes(req.body.status))
      throw new ApiError(400, "Status inválido.");
    const ticket = await update((data) => {
      const target = data.tickets.find(
        (item) => item.id === Number(req.params.id),
      );
      if (!target) throw new ApiError(404, "Chamado não encontrado.");
      target.status = req.body.status;
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Atualização do chamado #${target.id}: ${target.status}`,
        modulo: "Suporte",
        data: new Date().toISOString(),
      });
      return target;
    });
    res.json(ticket);
  }),
);

// Endpoint DELETE /:id: somente administradores podem remover chamados.
router.delete(
  "/:id",
  rota(async (req, res) => {
    if (req.user.perfil !== "admin")
      throw new ApiError(
        403,
        "Somente administradores podem excluir chamados.",
      );
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new ApiError(400, "Identificador inválido.");
    await update((data) => {
      const index = data.tickets.findIndex((ticket) => ticket.id === id);
      if (index < 0) throw new ApiError(404, "Chamado não encontrado.");
      data.tickets.splice(index, 1);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Exclusão do chamado #${id}`,
        modulo: "Suporte",
        data: new Date().toISOString(),
      });
    });
    res.status(204).end();
  }),
);

module.exports = router;
