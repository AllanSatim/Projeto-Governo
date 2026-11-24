/**
 * src/equipe/admin.js — SGE Educação
 * Administração de contas: aprovação, ativação, exclusão, redefinição e auditoria.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const { invalidarUsuario } = require("../sessao");
const { listarPendentes, vincularRegistro } = require("../autoria-legada");

const router = express.Router();
/** Converte dados da conta para o formato seguro de retorno administrativo. */
const paraAdmin = (user) => ({
  id: user.id,
  nome: user.nome,
  cpf: user.cpf,
  email: user.email,
  usuario: user.usuario,
  cargo: user.cargo,
  perfil: user.perfil,
  ativo: Boolean(user.ativo),
  aprovado: Boolean(user.aprovado),
  criadoEm: user.criadoEm,
  ultimoAcesso: user.ultimoAcesso,
});

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (_req, res) => {
    res.json(
      await read((data) => ({
        usuarios: data.users.map(paraAdmin),
        pendentes: data.users.filter((user) => !user.aprovado).map(paraAdmin),
        resumo: {
          total: data.users.length,
          ativos: data.users.filter((user) => user.ativo && user.aprovado)
            .length,
          bloqueados: data.users.filter((user) => !user.ativo && user.aprovado)
            .length,
          secretarios: data.users.filter(
            (user) =>
              user.perfil === "secretario" && user.ativo && user.aprovado,
          ).length,
        },
      })),
    );
  }),
);

// Endpoint POST /usuarios: autenticação e validação acontecem na camada de rotas.
router.post(
  "/usuarios",
  rota(async (req, res) => {
    const { nome, cpf, cargo, email, usuario } = req.body;
    const cpfNormalizado = String(cpf || "").replace(/\D/g, "");
    const emailNormalizado = String(email || "")
      .trim()
      .toLowerCase();
    const login = String(usuario || "").trim();
    if (
      ![nome, cpfNormalizado, cargo, emailNormalizado, login].every((value) =>
        String(value || "").trim(),
      )
    ) {
      throw new ApiError(400, "Preencha todos os campos obrigatórios.");
    }
    if (
      cpfNormalizado.length !== 11 ||
      !/^\S+@\S+\.\S+$/.test(emailNormalizado)
    )
      throw new ApiError(400, "CPF ou e-mail inválido.");
    if (!["Secretário", "Almoxarifado"].includes(cargo))
      throw new ApiError(400, "Cargo inválido.");
    const temporaryPassword = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const user = await update((data) => {
      if (data.users.some((item) => item.cpf === cpfNormalizado))
        throw new ApiError(409, "CPF já cadastrado.");
      if (
        data.users.some((item) => item.email.toLowerCase() === emailNormalizado)
      )
        throw new ApiError(409, "E-mail já cadastrado.");
      if (
        data.users.some(
          (item) => item.usuario.toLowerCase() === login.toLowerCase(),
        )
      )
        throw new ApiError(409, "Nome de usuário já em uso.");
      const newUser = {
        id: nextId(data, "users"),
        nome: String(nome).trim(),
        cpf: cpfNormalizado,
        cargo,
        perfil: cargo === "Secretário" ? "secretario" : "almoxarifado",
        email: emailNormalizado,
        usuario: login,
        senha_hash: passwordHash,
        telefone: "",
        ativo: true,
        aprovado: true,
        criadoEm: new Date().toISOString(),
        ultimoAcesso: null,
        codigo_recuperacao: null,
        codigo_expira_em: null,
      };
      data.users.push(newUser);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Cadastro do usuário ${login}`,
        modulo: "Administração",
        data: new Date().toISOString(),
      });
      return newUser;
    });
    res
      .status(201)
      .json({ ...paraAdmin(user), senhaTemporaria: temporaryPassword });
  }),
);

// Endpoint PATCH /usuarios/:id: autenticação e validação acontecem na camada de rotas.
router.patch(
  "/usuarios/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    const user = await update((data) => {
      const target = data.users.find((item) => item.id === id);
      if (!target) throw new ApiError(404, "Usuário não encontrado.");
      if (target.id === req.user.id && req.body.ativo === false)
        throw new ApiError(400, "Não é possível bloquear a própria conta.");
      if (typeof req.body.ativo === "boolean") target.ativo = req.body.ativo;
      if (typeof req.body.aprovado === "boolean") {
        target.aprovado = req.body.aprovado;
        if (req.body.aprovado) target.ativo = true;
      }
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `${req.body.aprovado === false ? "Rejeição" : req.body.aprovado ? "Aprovação" : target.ativo ? "Desbloqueio" : "Bloqueio"} de ${target.usuario}`,
        modulo: "Administração",
        data: new Date().toISOString(),
      });
      return target;
    });
    res.json(paraAdmin(user));
  }),
);

// Endpoint DELETE /usuarios/:id: autenticação e validação acontecem na camada de rotas.
router.delete(
  "/usuarios/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    await update((data) => {
      const index = data.users.findIndex((item) => item.id === id);
      if (index < 0) throw new ApiError(404, "Usuário não encontrado.");
      if (data.users[index].aprovado)
        throw new ApiError(
          409,
          "Somente solicitações pendentes podem ser removidas.",
        );
      const [rejected] = data.users.splice(index, 1);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Rejeição do cadastro de ${rejected.usuario}`,
        modulo: "Administração",
        data: new Date().toISOString(),
      });
    });
    res.status(204).end();
  }),
);

// Endpoint POST /usuarios/:id/redefinir-senha: autenticação e validação acontecem na camada de rotas.
router.post(
  "/usuarios/:id/redefinir-senha",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    const temporaryPassword = crypto.randomBytes(12).toString("base64url");
    const hash = await bcrypt.hash(temporaryPassword, 12);
    await update((data) => {
      const user = data.users.find((item) => item.id === id);
      if (!user) throw new ApiError(404, "Usuário não encontrado.");
      user.senha_hash = hash;
      user.codigo_recuperacao = null;
      user.codigo_expira_em = null;
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Redefinição administrativa da senha de ${user.usuario}`,
        modulo: "Administração",
        data: new Date().toISOString(),
      });
    });
    await invalidarUsuario(id);
    res.json({
      senhaTemporaria: temporaryPassword,
      mensagem: "Senha provisória criada. Informe ao titular em canal seguro.",
    });
  }),
);

/** Lista cadastros e movimentos antigos sem identificação inequívoca da conta. */
router.get(
  "/autoria-pendente",
  rota(async (_req, res) => {
    res.json(await read((data) => listarPendentes(data)));
  }),
);

/** Apenas o administrador pode confirmar a autoria legada após conferência. */
router.post(
  "/vincular-autoria",
  rota(async (req, res) => {
    const resultado = await update((data) =>
      vincularRegistro(data, {
        tipo: req.body.tipo,
        id: req.body.id,
        usuarioId: req.body.usuarioId,
        justificativa: req.body.justificativa,
        administrador: req.user,
      }),
    );
    res.json(resultado);
  }),
);

// Endpoint GET /logs: autenticação e validação acontecem na camada de rotas.
router.get(
  "/logs",
  rota(async (_req, res) => {
    res.json(await read((data) => data.logs.slice(0, 100)));
  }),
);

module.exports = router;
