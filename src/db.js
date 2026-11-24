/**
 * src/db.js — SGE Educação
 * Seleciona a implementação de inicialização do banco para o ambiente configurado.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const { initStore } = require("./store");

module.exports = {
  iniciarBanco: initStore,
};
