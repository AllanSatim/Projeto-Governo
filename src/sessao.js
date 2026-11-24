/**
 * src/sessao.js — SGE Educação
 * Gerenciamento de sessões, verificação de tokens e autorização por papel.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const crypto = require("node:crypto");
const { ApiError } = require("./erro");
const { read, useMysql, mysqlStore } = require("./store");
const sessions = new Map();
const lifetimeMs = 12 * 60 * 60 * 1000;

/** Emite uma sessão de acesso e armazena seu identificador protegido. */
async function criarSessao(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + lifetimeMs;
  if (useMysql) await mysqlStore.saveSession(token, userId, expiresAt);
  else sessions.set(token, { userId, expiresAt });
  return token;
}
/** Encerra uma sessão a partir de seu token. */
async function invalidarSessao(token) {
  if (!token) return;
  if (useMysql) await mysqlStore.revokeSession(token);
  else sessions.delete(token);
}
/** Encerra as sessões de um usuário específico. */
async function invalidarUsuario(userId) {
  if (useMysql) await mysqlStore.revokeUserSessions(userId);
  else
    for (const [token, sessao] of sessions)
      if (sessao.userId === userId) sessions.delete(token);
}
/** Middleware que valida o token antes de liberar acesso a rotas privadas. */
async function autenticar(req, _res, next) {
  try {
    const token = String(req.get("authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new ApiError(401, "Token inválido.");
    const session = useMysql
      ? await mysqlStore.findSession(token)
      : sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      await invalidarSessao(token);
      throw new ApiError(401, "Sessão inválida ou expirada. Entre novamente.");
    }
    const user = useMysql
      ? await mysqlStore.findUserById(session.userId)
      : await read((data) =>
          data.users.find((item) => item.id === session.userId),
        );
    if (!user || !user.ativo || !user.aprovado) {
      await invalidarSessao(token);
      throw new ApiError(401, "A conta não está mais ativa. Entre novamente.");
    }
    req.user = {
      id: user.id,
      nome: user.nome,
      cargo: user.cargo,
      perfil: user.perfil,
    };
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}
/** Middleware que restringe ações administrativas a perfis autorizados. */
function apenasAdmin(req, _res, next) {
  if (req.user?.perfil !== "admin")
    return next(new ApiError(403, "Acesso exclusivo de administradores."));
  next();
}
/** Protege módulos que podem ser usados por um conjunto específico de perfis. */
function permitirPerfis(...perfis) {
  return (req, _res, next) =>
    perfis.includes(req.user?.perfil)
      ? next()
      : next(
          new ApiError(
            403,
            "Seu perfil não possui permissão para esta funcionalidade.",
          ),
        );
}
module.exports = {
  criarSessao,
  invalidarSessao,
  invalidarUsuario,
  autenticar,
  apenasAdmin,
  permitirPerfis,
};
