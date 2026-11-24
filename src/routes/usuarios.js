/**
 * src/routes/usuarios.js — SGE Educação
 * Rotas de consulta e edição dos dados de perfil de usuários.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");

const router = express.Router();
const CARGOS = ["Secretário", "Almoxarifado"];
/** Remove informações internas da conta antes de devolvê-las na API. */
const paraResposta = (user) => ({
  id: user.id,
  nome: user.nome,
  cpf: user.cpf,
  email: user.email,
  usuario: user.usuario,
  cargo: user.cargo,
  perfil: user.perfil,
  telefone: user.telefone || "",
  ativo: Boolean(user.ativo),
});

// Endpoint GET /:id: autenticação e validação acontecem na camada de rotas.
router.get(
  "/:id",
  rota(async (req, res) => {
    if (Number(req.params.id) !== req.user.id && req.user.perfil !== "admin")
      throw new ApiError(403, "Acesso restrito ao próprio perfil.");
    const user = await read((data) =>
      data.users.find((item) => item.id === Number(req.params.id)),
    );
    if (!user) throw new ApiError(404, "Usuário não encontrado.");
    res.json(paraResposta(user));
  }),
);

// Endpoint PUT /:id: autenticação e validação acontecem na camada de rotas.
router.put(
  "/:id",
  rota(async (req, res) => {
    const { nome, email, telefone, cargo } = req.body;
    if (![nome, email, cargo].every((value) => String(value || "").trim()))
      throw new ApiError(400, "Nome, e-mail e cargo são obrigatórios.");
    const emailNormalizado = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNormalizado))
      throw new ApiError(400, "E-mail inválido.");
    if (!CARGOS.includes(cargo)) throw new ApiError(400, "Cargo inválido.");
    const id = Number(req.params.id);
    if (id !== req.user.id && req.user.perfil !== "admin")
      throw new ApiError(403, "Acesso restrito ao próprio perfil.");
    const user = await update((data) => {
      const target = data.users.find((item) => item.id === id);
      if (!target) throw new ApiError(404, "Usuário não encontrado.");
      if (cargo !== target.cargo) {
        if (req.user.perfil !== "admin")
          throw new ApiError(
            403,
            "O cargo só pode ser alterado por um administrador.",
          );
        if (
          target.cargo === "Secretário" &&
          data.users.filter(
            (row) => row.cargo === "Secretário" && row.ativo && row.aprovado,
          ).length <= 1
        ) {
          throw new ApiError(
            409,
            "Não é possível remover o último Secretário ativo.",
          );
        }
      }
      if (
        data.users.some(
          (item) =>
            item.id !== id && item.email.toLowerCase() === emailNormalizado,
        )
      ) {
        throw new ApiError(409, "E-mail já cadastrado.");
      }
      target.nome = String(nome).trim();
      target.email = emailNormalizado;
      target.telefone = String(telefone || "").trim();
      target.cargo = cargo;
      if (target.perfil !== "admin")
        target.perfil = cargo === "Secretário" ? "secretario" : "almoxarifado";
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Atualização do perfil ${target.usuario}`,
        modulo: "Usuários",
        data: new Date().toISOString(),
      });
      return target;
    });
    res.json(paraResposta(user));
  }),
);

module.exports = router;
