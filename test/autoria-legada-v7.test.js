/** Verifica a atribuição de contas aos registros anteriores ao controle de autoria. */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  reconciliarCargasConhecidas,
  listarPendentes,
  vincularRegistro,
} = require("../src/autoria-legada");
const {
  pertenceAoUsuario,
  pertenceCadastro,
  podeCancelar,
} = require("../src/permissoes-operacoes");

const admin = {
  id: 1,
  usuario: "admin",
  nome: "Administrador do Sistema",
  perfil: "admin",
};
const mariana = {
  id: 101,
  usuario: "secretaria01",
  nome: "Mariana Costa",
  perfil: "secretario",
};
const patricia = {
  id: 106,
  usuario: "almox01",
  nome: "Patricia Oliveira",
  perfil: "almoxarifado",
};
function state() {
  return {
    users: [admin, mariana, patricia],
    stockItems: [],
    movements: [],
    foods: [],
    foodMovements: [],
    logs: [],
    proximoId: { log: 1 },
  };
}
test("lote antigo de materiais: Excluir aparece para a conta vinculada e o administrador", () => {
  const s = state();
  s.stockItems.push({ id: 1001, nome: "Caderno brochura 96 folhas" });
  s.movements.push({
    id: 1001,
    itemId: 1001,
    itemNome: "Caderno brochura 96 folhas",
    responsavel: "Mariana Costa",
    notaFiscal: "DEMO-CARGA-1001",
    observacao: "Movimentação fictícia para apresentação",
    cancelada: false,
  });
  const changes = reconciliarCargasConhecidas(s);
  assert.equal(changes, 2);
  assert.equal(s.stockItems[0].cadastradoPorId, 101);
  assert.equal(s.movements[0].usuarioId, 101);
  assert.equal(pertenceCadastro(s.stockItems[0], mariana), true);
  assert.equal(pertenceCadastro(s.stockItems[0], patricia), false);
  assert.equal(podeCancelar(s.movements[0], [], mariana), true);
  assert.equal(podeCancelar(s.movements[0], [], admin), true);
  assert.equal(
    reconciliarCargasConhecidas(s),
    0,
    "reexecutar não deve substituir autoria",
  );
});

test("merenda antiga: alternância da carga fictícia reconhece seus autores simulados", () => {
  const s = state();
  s.foods.push(
    {
      id: 52001,
      nome: "Arroz parboilizado",
      fornecedor: "Fornecedor demonstrativo (fictício)",
    },
    {
      id: 52002,
      nome: "Leite",
      fornecedor: "Fornecedor demonstrativo (fictício)",
    },
  );
  s.foodMovements.push(
    {
      id: 62001,
      itemId: 52001,
      itemNome: "Arroz parboilizado",
      tipo: "entrada",
      responsavel: mariana.nome,
      destino: "Inventário inicial demonstrativo",
      observacao: "ENTRADA FICTÍCIA para apresentação",
      cancelada: false,
    },
    {
      id: 62002,
      itemId: 52002,
      itemNome: "Leite",
      tipo: "entrada",
      responsavel: patricia.nome,
      destino: "Inventário inicial demonstrativo",
      observacao: "ENTRADA FICTÍCIA para apresentação",
      cancelada: false,
    },
  );
  assert.equal(reconciliarCargasConhecidas(s), 4);
  assert.equal(s.foods[0].cadastradoPorId, mariana.id);
  assert.equal(s.foods[1].cadastradoPorId, patricia.id);
  assert.equal(podeCancelar(s.foodMovements[0], [], patricia), false);
  assert.equal(podeCancelar(s.foodMovements[1], [], patricia), true);
});

test("nome solto não prova autoria: exige atribuição administrativa justificada", () => {
  const s = state();
  s.foods.push({
    id: 3001,
    nome: "Suco de uva",
    fornecedor: "Distribuidora Exemplo",
  });
  s.foodMovements.push({
    id: 9001,
    itemId: 3001,
    itemNome: "Suco de uva",
    responsavel: "Mariana Costa",
    cancelada: false,
  });
  assert.equal(reconciliarCargasConhecidas(s), 0);
  assert.equal(listarPendentes(s).total, 2);
  assert.equal(pertenceAoUsuario(s.foodMovements[0], mariana), false);
  assert.throws(
    () =>
      vincularRegistro(s, {
        tipo: "merenda",
        id: 9001,
        usuarioId: 101,
        justificativa: "curta",
        administrador: admin,
      }),
    /justificativa/,
  );
  assert.throws(
    () =>
      vincularRegistro(s, {
        tipo: "merenda",
        id: 9001,
        usuarioId: 101,
        justificativa: "Relatório arquivado com assinatura de usuário",
        administrador: mariana,
      }),
    /Somente administradores/,
  );
  const item = vincularRegistro(s, {
    tipo: "merenda",
    id: 9001,
    usuarioId: 101,
    justificativa: "Conferido com relatório da carga demonstrativa",
    administrador: admin,
  });
  assert.equal(item.usuarioId, mariana.id);
  assert.equal(podeCancelar(s.foodMovements[0], [], mariana), true);
  assert.equal(podeCancelar(s.foodMovements[0], [], patricia), false);
  assert.ok(s.logs[0].operacao.includes("Autoria legada vinculada"));
  assert.throws(
    () =>
      vincularRegistro(s, {
        tipo: "merenda",
        id: 9001,
        usuarioId: 106,
        justificativa: "Quero transferir a operação para outra pessoa",
        administrador: admin,
      }),
    /já tem autoria/,
  );
});

test("carga com o mesmo ID, mas sem marcadores verificáveis, nunca recebe autoria automaticamente", () => {
  const s = state();
  s.stockItems.push({ id: 1001, nome: "Produto aleatório" });
  s.movements.push({
    id: 1001,
    itemId: 1001,
    itemNome: "Produto aleatório",
    responsavel: mariana.nome,
    notaFiscal: "SEM-IDENTIFICACAO",
    observacao: "Fornecedor desconhecido",
    cancelada: false,
  });
  assert.equal(reconciliarCargasConhecidas(s), 0);
  assert.equal(s.stockItems[0].cadastradoPorId, undefined);
  assert.equal(s.movements[0].usuarioId, undefined);
});
