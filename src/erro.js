/** Erro com status HTTP. Ex.: throw new ApiError(400, 'CPF inválido.') */
class ApiError extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Evita try/catch em toda rota assíncrona. */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, rota };
