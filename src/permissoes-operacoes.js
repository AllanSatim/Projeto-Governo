/**
 * Regras de propriedade das operações. A autoria da sessão ou o perfil
 * administrador autoriza a exclusão; nomes enviados pelo navegador não bastam.
 */
const { ApiError } = require("./erro");

/** Registros legados sem usuarioId nunca recebem propriedade presumida. */
function pertenceAoUsuario(registro, usuario) {
  const idAutor = Number(registro?.usuarioId);
  const idLogado = Number(usuario?.id);
  return (
    Number.isInteger(idAutor) &&
    idAutor > 0 &&
    Number.isInteger(idLogado) &&
    idLogado > 0 &&
    idAutor === idLogado
  );
}

/** O cadastro de um produto também deve ter o ID do autor autenticado. */
function pertenceCadastro(item, usuario) {
  return (
    usuario?.perfil === "admin" ||
    pertenceAoUsuario({ usuarioId: item?.cadastradoPorId }, usuario)
  );
}

/** Movimentação mais recente não cancelada do mesmo produto. */
function ultimaAtiva(movimentos, itemId) {
  return movimentos
    .filter((row) => row.itemId === itemId && !row.cancelada)
    .sort(
      (a, b) =>
        String(b.data || "").localeCompare(String(a.data || "")) || b.id - a.id,
    )[0];
}

/**
 * Permissão de EXIBIÇÃO do botão Excluir: basta que a movimentação ativa
 * pertença à conta autenticada ou seja acessada por um administrador. A existência de operações posteriores ou
 * requisitos de saldo NÃO oculta o botão. Essas condições são verificadas
 * somente ao executar o estorno, para preservar a integridade do estoque.
 */
function podeCancelar(movimento, _movimentos, usuario) {
  return (
    !movimento.cancelada &&
    (usuario?.perfil === "admin" || pertenceAoUsuario(movimento, usuario))
  );
}

/** Revalida no servidor dentro da transação; a interface não é confiável. */
function exigirPermissaoCancelamento(movimento, movimentos, usuario) {
  if (usuario?.perfil !== "admin" && !pertenceAoUsuario(movimento, usuario)) {
    throw new ApiError(
      403,
      "Você só pode excluir movimentações realizadas por sua própria conta. Registros antigos sem autor identificado não podem ser excluídos.",
    );
  }
  if (movimento.cancelada)
    throw new ApiError(409, "Esta movimentação já foi cancelada.");
  if (ultimaAtiva(movimentos, movimento.itemId)?.id !== movimento.id) {
    throw new ApiError(
      409,
      "Esta operação possui movimentações posteriores. Para preservar o estoque, solicite um ajuste em vez de excluir o histórico.",
    );
  }
}

/** Preserva a trilha de auditoria sem destruir a movimentação histórica. */
function marcarCancelamento(movimento, usuario, motivo) {
  movimento.cancelada = true;
  movimento.canceladaEm = new Date().toISOString();
  movimento.canceladaPorId = usuario.id;
  movimento.canceladaPor = usuario.nome;
  movimento.motivoCancelamento = String(motivo || "Correção de lançamento")
    .trim()
    .slice(0, 240);
}

module.exports = {
  pertenceAoUsuario,
  pertenceCadastro,
  ultimaAtiva,
  podeCancelar,
  exigirPermissaoCancelamento,
  marcarCancelamento,
};
