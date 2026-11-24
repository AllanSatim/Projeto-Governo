/**
 * src/routes/auth.js — SGE Educação
 * Rotas de autenticação: cadastro, login, logout e atualização de credenciais.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const {
  criarSessao,
  autenticar,
  invalidarSessao,
  invalidarUsuario,
} = require("../sessao");

const router = express.Router();
const loginFailures = new Map();
/** Aplica o limite de tentativas de autenticação por origem. */
function checkLoginRate(key) {
  const now = Date.now();
  const attempts = loginFailures.get(key);
  if (attempts && attempts.until > now && attempts.count >= 8)
    throw new ApiError(
      429,
      "Muitas tentativas. Tente novamente em 15 minutos.",
    );
  if (attempts && attempts.until <= now) loginFailures.delete(key);
}
/** Registra falha de login para o mecanismo de proteção contra tentativas excessivas. */
function noteLoginFailure(key) {
  const previous = loginFailures.get(key);
  loginFailures.set(key, {
    count: (previous && previous.until > Date.now() ? previous.count : 0) + 1,
    until: Date.now() + 15 * 60 * 1000,
  });
  if (loginFailures.size > 10000) loginFailures.clear();
}
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

/** Localiza uma conta pelo identificador de login informado. */
function encontrar(data, identificador) {
  const value = String(identificador || "")
    .trim()
    .toLowerCase();
  return data.users.find(
    (user) =>
      user.usuario.toLowerCase() === value ||
      user.email.toLowerCase() === value,
  );
}

// Endpoint POST /cadastro: autenticação e validação acontecem na camada de rotas.
router.post(
  "/cadastro",
  rota(async (req, res) => {
    const { nome, cpf, cargo, email, usuario, senha, confirmarSenha } =
      req.body;
    if (
      ![nome, cpf, cargo, email, usuario, senha].every((value) =>
        String(value || "").trim(),
      )
    ) {
      throw new ApiError(400, "Preencha todos os campos obrigatórios.");
    }
    const cpfNum = String(cpf).replace(/\D/g, "");
    const emailNormalizado = String(email).trim().toLowerCase();
    const usuarioNormalizado = String(usuario).trim();
    if (cpfNum.length !== 11)
      throw new ApiError(400, "CPF deve ter 11 dígitos.");
    if (!CARGOS.includes(cargo)) throw new ApiError(400, "Cargo inválido.");
    if (!/^\S+@\S+\.\S+$/.test(emailNormalizado))
      throw new ApiError(400, "E-mail inválido.");
    if (String(senha).length < 6)
      throw new ApiError(400, "A senha precisa ter no mínimo 6 caracteres.");
    if (senha !== confirmarSenha)
      throw new ApiError(400, "As senhas não conferem.");

    const passwordHash = await bcrypt.hash(senha, 10);
    const user = await update((data) => {
      if (data.users.some((item) => item.cpf === cpfNum))
        throw new ApiError(409, "CPF já cadastrado.");
      if (
        data.users.some((item) => item.email.toLowerCase() === emailNormalizado)
      )
        throw new ApiError(409, "E-mail já cadastrado.");
      if (
        data.users.some(
          (item) =>
            item.usuario.toLowerCase() === usuarioNormalizado.toLowerCase(),
        )
      ) {
        throw new ApiError(409, "Nome de usuário já em uso.");
      }
      const novo = {
        id: nextId(data, "users"),
        nome: String(nome).trim(),
        cpf: cpfNum,
        cargo,
        perfil: cargo === "Secretário" ? "secretario" : "almoxarifado",
        email: emailNormalizado,
        usuario: usuarioNormalizado,
        senha_hash: passwordHash,
        telefone: "",
        ativo: false,
        aprovado: false,
        criadoEm: new Date().toISOString(),
        ultimoAcesso: null,
        codigo_recuperacao: null,
        codigo_expira_em: null,
      };
      data.users.push(novo);
      return novo;
    });
    res
      .status(201)
      .json({
        ...paraResposta(user),
        aprovado: false,
        mensagem: "Cadastro enviado para aprovação.",
      });
  }),
);

// Endpoint POST /login: autenticação e validação acontecem na camada de rotas.
router.post(
  "/login",
  rota(async (req, res) => {
    const { usuario, senha } = req.body;
    const key = `${req.ip}:${String(usuario || "")
      .trim()
      .toLowerCase()}`;
    checkLoginRate(key);
    if (!usuario || !senha) throw new ApiError(400, "Informe usuário e senha.");
    const user = await read((data) => encontrar(data, usuario));
    if (!user || !(await bcrypt.compare(String(senha), user.senha_hash))) {
      noteLoginFailure(key);
      throw new ApiError(401, "Usuário ou senha inválidos.");
    }
    loginFailures.delete(key);
    if (!user.aprovado || !user.ativo)
      throw new ApiError(
        403,
        "Conta aguardando aprovação ou desativada. Procure o administrador.",
      );
    const agora = new Date().toISOString();
    await update((data) => {
      const savedUser = data.users.find((item) => item.id === user.id);
      savedUser.ultimoAcesso = agora;
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: savedUser.nome,
        operacao: "Acesso ao sistema",
        modulo: "Autenticação",
        data: agora,
      });
    });
    res.json({
      ...paraResposta({ ...user, ultimoAcesso: agora }),
      token: await criarSessao(user.id),
    });
  }),
);

// Endpoint POST /recuperar: autenticação e validação acontecem na camada de rotas.
router.post(
  "/recuperar",
  rota(async (req, res) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.SGE_DEMO_RECOVERY !== "true"
    ) {
      throw new ApiError(
        503,
        "Recuperação automática indisponível neste ambiente. Contate o administrador para redefinir sua senha.",
      );
    }
    const user = await read((data) => encontrar(data, req.body.identificador));
    if (!user) throw new ApiError(404, "Usuário não encontrado.");
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await update((data) => {
      const savedUser = data.users.find((item) => item.id === user.id);
      savedUser.codigo_recuperacao = codigo;
      savedUser.codigo_expira_em = new Date(
        Date.now() + 15 * 60 * 1000,
      ).toISOString();
    });
    res.json({ mensagem: "Código gerado com sucesso.", codigoDemo: codigo });
  }),
);

// Endpoint POST /redefinir: autenticação e validação acontecem na camada de rotas.
router.post(
  "/redefinir",
  rota(async (req, res) => {
    const { identificador, codigo, novaSenha, confirmarNovaSenha } = req.body;
    if (
      process.env.NODE_ENV === "production" ||
      process.env.SGE_DEMO_RECOVERY !== "true"
    )
      throw new ApiError(503, "Redefinição pública desabilitada.");
    if (!novaSenha || String(novaSenha).length < 6)
      throw new ApiError(400, "A senha precisa ter no mínimo 6 caracteres.");
    if (novaSenha !== confirmarNovaSenha)
      throw new ApiError(400, "As senhas não conferem.");
    const user = await read((data) => encontrar(data, identificador));
    if (
      !user ||
      user.codigo_recuperacao !== String(codigo || "") ||
      !(Date.parse(user.codigo_expira_em || "") > Date.now())
    ) {
      throw new ApiError(400, "Código inválido ou expirado.");
    }
    const passwordHash = await bcrypt.hash(novaSenha, 10);
    await update((data) => {
      const savedUser = data.users.find((item) => item.id === user.id);
      if (
        !savedUser ||
        savedUser.codigo_recuperacao !== String(codigo || "") ||
        !(Date.parse(savedUser.codigo_expira_em || "") > Date.now())
      )
        throw new ApiError(400, "Código inválido ou expirado.");
      savedUser.senha_hash = passwordHash;
      savedUser.codigo_recuperacao = null;
      savedUser.codigo_expira_em = null;
    });
    await invalidarUsuario(user.id);
    res.json({ mensagem: "Senha atualizada com sucesso." });
  }),
);

// Endpoint GET /me: autenticação e validação acontecem na camada de rotas.
router.get(
  "/me",
  autenticar,
  rota(async (req, res) => {
    const user = await read((data) =>
      data.users.find((item) => item.id === req.user.id),
    );
    res.json(paraResposta(user));
  }),
);

// Endpoint POST /logout: autenticação e validação acontecem na camada de rotas.
router.post(
  "/logout",
  autenticar,
  rota(async (req, res) => {
    await invalidarSessao(req.token);
    res.status(204).end();
  }),
);

// Endpoint POST /alterar-senha: autenticação e validação acontecem na camada de rotas.
router.post(
  "/alterar-senha",
  autenticar,
  rota(async (req, res) => {
    const { senhaAtual, novaSenha, confirmarNovaSenha } = req.body;
    if (
      !novaSenha ||
      String(novaSenha).length < 8 ||
      novaSenha !== confirmarNovaSenha
    ) {
      throw new ApiError(
        400,
        "Nova senha deve ter ao menos 8 caracteres e coincidir com a confirmação.",
      );
    }
    const user = await read((data) =>
      data.users.find((item) => item.id === req.user.id),
    );
    if (!(await bcrypt.compare(String(senhaAtual || ""), user.senha_hash)))
      throw new ApiError(401, "Senha atual incorreta.");
    const hash = await bcrypt.hash(novaSenha, 12);
    await update((data) => {
      data.users.find((item) => item.id === req.user.id).senha_hash = hash;
    });
    await invalidarUsuario(req.user.id);
    res.json({ mensagem: "Senha alterada. Faça login novamente." });
  }),
);

module.exports = router;
