/**
 * Testes isolados das ROTAS REAIS, sem Express/MySQL: registra handlers do
 * roteador com adaptadores em memória, verificando autorização e integridade.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.join(__dirname, "..");
const alice = { id: 21, nome: "Alice", perfil: "secretario" };
const bob = { id: 22, nome: "Bob", perfil: "almoxarifado" };
const admin = { id: 1, nome: "Admin", perfil: "admin" };

function testHarness() {
  let state = {
    users: [],
    stockItems: [],
    movements: [],
    foods: [],
    foodMovements: [],
    tickets: [],
    logs: [],
    proximoId: {
      stock: 1,
      movement: 1,
      food: 1,
      foodMovement: 1,
      ticket: 1,
      log: 1,
    },
  };
  const idProps = {
    stockItems: "stock",
    movements: "movement",
    foods: "food",
    foodMovements: "foodMovement",
    tickets: "ticket",
    logs: "log",
  };
  const store = {
    read: async (fn) => fn(structuredClone(state)),
    update: async (fn) => {
      const draft = structuredClone(state);
      const value = await fn(draft);
      state = draft;
      return value;
    },
    nextId: (data, collection) => data.proximoId[idProps[collection]]++,
  };
  const routes = {};
  const express = {
    Router: () => {
      const registry = { get: [], post: [], put: [], patch: [], delete: [] };
      for (const method of Object.keys(registry)) {
        registry[method] = (url, handler) => {
          routes[`${method.toUpperCase()} ${url}`] = handler;
        };
      }
      return registry;
    },
  };
  async function register(relative, namespace) {
    const original = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "express") return express;
      if (request === "../store") return store;
      return original.call(this, request, parent, isMain);
    };
    const before = Object.keys(routes);
    try {
      delete require.cache[require.resolve(path.join(root, relative))];
      require(path.join(root, relative));
    } finally {
      Module._load = original;
    }
    const added = Object.keys(routes).filter((k) => !before.includes(k));
    for (const key of added) {
      routes[namespace + " " + key] = routes[key];
      delete routes[key];
    }
  }
  async function request(ns, method, url, user, body = {}) {
    const [pathName, id] = url.includes("/:") ? url.split("/:") : [url, null];
    const key = `${ns} ${method} ${url}`;
    const handler = routes[key];
    assert.ok(handler, `handler não encontrado: ${key}`);
    let response = { status: 200, body: null };
    const res = {
      status(code) {
        response.status = code;
        return res;
      },
      json(payload) {
        response.body = payload;
        return res;
      },
      end() {
        return res;
      },
    };
    let error;
    const req = { params: { id: body.__id }, user, body: { ...body } };
    await handler(req, res, (e) => {
      error = e;
    });
    if (error) return { status: error.status || 500, erro: error.message };
    return response;
  }
  return {
    register,
    request,
    getState: () => structuredClone(state),
    setState: (s) => {
      state = structuredClone(s);
    },
  };
}

async function setup() {
  const harness = testHarness();
  await harness.register("src/equipe/estoque.js", "stock");
  await harness.register("src/equipe/movimentacoes.js", "mov");
  await harness.register("src/routes/merenda.js", "food");
  await harness.register("src/equipe/chamados.js", "tickets");
  return harness;
}

test("só proprietário pode excluir cadastro sem histórico e saldo zero", async () => {
  const { request, getState } = await setup();
  const novo = await request("stock", "POST", "/", alice, {
    nome: "Quadro de testes",
    categoria: "outros",
    unidade: "unidades",
    quantidade: 0,
    minimo: 1,
    custoUnitario: 40,
    cadastradoPorId: bob.id,
  });
  assert.equal(novo.status, 201);
  const id = novo.body.id;
  const listaBob = await request("stock", "GET", "/", bob);
  assert.equal(listaBob.body.find((i) => i.id === id).podeExcluir, false);
  assert.equal(
    (await request("stock", "DELETE", "/:id", bob, { __id: id })).status,
    403,
  );
  const listaAlice = await request("stock", "GET", "/", alice);
  assert.equal(listaAlice.body.find((i) => i.id === id).podeExcluir, true);
  assert.equal(
    (await request("stock", "DELETE", "/:id", alice, { __id: id })).status,
    204,
  );
  assert.ok(!getState().stockItems.some((i) => i.id === id));
});

test("não pode cancelar movimentação de outro usuário; só a última é reversível", async () => {
  const { request, getState } = await setup();
  const created = await request("stock", "POST", "/", alice, {
    nome: "Caderno A",
    categoria: "materiais",
    unidade: "unidades",
    quantidade: 0,
    minimo: 0,
    custoUnitario: 10,
  });
  const id = created.body.id;
  const entrada = await request("mov", "POST", "/", alice, {
    itemId: id,
    tipo: "entrada",
    quantidade: 10,
    custoUnitario: 12,
    destino: "Fornecedor",
    responsavel: "Bob",
  });
  assert.equal(entrada.status, 201);
  const saida = await request("mov", "POST", "/", bob, {
    itemId: id,
    tipo: "saida",
    quantidade: 3,
    custoUnitario: 12,
    destino: "Escola",
    responsavel: "Alice",
  });
  assert.equal(saida.status, 201);
  assert.equal(saida.body.responsavel, "Bob");
  assert.equal(saida.body.usuarioId, bob.id);
  const forAlice = (await request("mov", "GET", "/", alice)).body;
  assert.equal(forAlice.find((x) => x.id === saida.body.id).podeExcluir, false);
  assert.equal(
    forAlice.find((x) => x.id === entrada.body.id).podeExcluir,
    true,
    "botão da operação própria deve permanecer visível mesmo com movimentação posterior",
  );
  const forBob = (await request("mov", "GET", "/", bob)).body;
  assert.equal(forBob.find((x) => x.id === saida.body.id).podeExcluir, true);
  assert.equal(
    (await request("mov", "GET", "/", admin)).body.find(
      (x) => x.id === saida.body.id,
    ).podeExcluir,
    true,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: saida.body.id }))
      .status,
    403,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: entrada.body.id }))
      .status,
    409,
  );
  assert.equal(getState().stockItems[0].quantidade, 7);
  const removida = await request("mov", "DELETE", "/:id", bob, {
    __id: saida.body.id,
    motivo: "Lançamento de teste incorreto",
  });
  assert.equal(removida.status, 200);
  assert.equal(removida.body.cancelada, true);
  assert.equal(removida.body.canceladaPorId, bob.id);
  assert.equal(getState().stockItems[0].quantidade, 10);
  assert.equal(
    (await request("mov", "DELETE", "/:id", bob, { __id: saida.body.id }))
      .status,
    409,
  );
  assert.equal(
    (await request("mov", "GET", "/", alice)).body.find(
      (x) => x.id === entrada.body.id,
    ).podeExcluir,
    true,
  );
  const cancelarEntrada = await request("mov", "DELETE", "/:id", alice, {
    __id: entrada.body.id,
  });
  assert.equal(cancelarEntrada.status, 200);
  assert.equal(getState().stockItems[0].quantidade, 0);
  assert.equal(getState().stockItems[0].custoUnitario, 10);
  assert.equal(
    getState().movements.length,
    2,
    "movimentações canceladas continuam auditáveis",
  );
  assert.equal(
    getState().logs.filter((l) => l.operacao.includes("Cancelamento")).length,
    2,
  );
});

test("entradas antigas sem custo ou autoria não são atribuídas automaticamente", async () => {
  const { request, getState, setState } = await setup();
  const created = await request("stock", "POST", "/", alice, {
    nome: "Livro B",
    categoria: "livros",
    unidade: "unidades",
    quantidade: 0,
    minimo: 0,
    custoUnitario: 15,
  });
  let state = getState();
  state.stockItems[0].quantidade = 5;
  state.movements.push({
    id: 99,
    itemId: created.body.id,
    itemNome: "Livro B",
    tipo: "entrada",
    quantidade: 5,
    custoUnitario: 15,
    custoTotal: 75,
    data: new Date().toISOString(),
    responsavel: "Alice",
    usuarioId: null,
    cancelada: false,
  });
  setState(state);
  const legacy = (await request("mov", "GET", "/", alice)).body.find(
    (x) => x.id === 99,
  );
  assert.equal(legacy.podeExcluir, false);
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: 99 })).status,
    403,
  );
  state = getState();
  state.movements[0].usuarioId = alice.id;
  setState(state);
  assert.equal(
    (await request("mov", "GET", "/", alice)).body.find((x) => x.id === 99)
      .podeExcluir,
    true,
    "operação própria identificada mostra o botão mesmo quando o estorno é impossível",
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: 99 })).status,
    409,
    "entrada legada sem preço anterior não é cancelada",
  );
  assert.equal(
    (await request("mov", "GET", "/", admin)).body.find((x) => x.id === 99)
      .podeExcluir,
    true,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", admin, { __id: 99 })).status,
    409,
    "o administrador pode solicitar o estorno, mas custos históricos ausentes continuam protegidos",
  );
});

test("administrador pode excluir registros individuais de terceiros com auditoria e integridade", async () => {
  const { request, getState } = await setup();
  const cadastroVazio = await request("stock", "POST", "/", bob, {
    nome: "Item removível",
    categoria: "outros",
    unidade: "unidades",
    quantidade: 0,
    minimo: 0,
    custoUnitario: 4,
  });
  assert.equal(
    (await request("stock", "GET", "/", admin)).body.find(
      (item) => item.id === cadastroVazio.body.id,
    ).podeExcluir,
    true,
  );
  assert.equal(
    (
      await request("stock", "DELETE", "/:id", admin, {
        __id: cadastroVazio.body.id,
      })
    ).status,
    204,
  );
  assert.ok(
    getState().logs.some(
      (log) =>
        log.usuario === "Admin" && log.operacao.includes("Exclusão de item"),
    ),
  );

  const stock = await request("stock", "POST", "/", bob, {
    nome: "Material compartilhado",
    categoria: "materiais",
    unidade: "unidades",
    quantidade: 0,
    minimo: 0,
    custoUnitario: 10,
  });
  const entrada = await request("mov", "POST", "/", bob, {
    itemId: stock.body.id,
    tipo: "entrada",
    quantidade: 10,
    custoUnitario: 10,
    destino: "Fornecedor",
  });
  const saida = await request("mov", "POST", "/", alice, {
    itemId: stock.body.id,
    tipo: "saida",
    quantidade: 3,
    custoUnitario: 10,
    destino: "Escola",
  });
  assert.equal(
    (await request("mov", "DELETE", "/:id", admin, { __id: entrada.body.id }))
      .status,
    409,
    "a exclusão administrativa ainda respeita a ordem das movimentações",
  );
  const estornoEstoque = await request("mov", "DELETE", "/:id", admin, {
    __id: saida.body.id,
    motivo: "Correção administrativa",
  });
  assert.equal(estornoEstoque.status, 200);
  assert.equal(estornoEstoque.body.canceladaPorId, admin.id);
  assert.equal(
    getState().stockItems.find((item) => item.id === stock.body.id).quantidade,
    10,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", admin, { __id: entrada.body.id }))
      .status,
    200,
  );
  assert.equal(
    getState().stockItems.find((item) => item.id === stock.body.id).quantidade,
    0,
  );

  const food = await request("food", "POST", "/", bob, {
    nome: "Alimento compartilhado",
    categoria: "bebidas",
    quantidade: 10,
    unidade: "litros",
    minimo: 0,
    custoUnitario: 8,
    dataEntrada: "2026-11-20",
    fornecedor: "Fornecedor",
  });
  const consumo = await request("food", "POST", "/:id/consumo", alice, {
    __id: food.body.id,
    quantidade: 4,
    destino: "Escola",
  });
  assert.equal(
    (await request("food", "GET", "/", admin)).body.find(
      (item) => item.id === food.body.id,
    ).podeExcluir,
    true,
  );
  const estornoMerenda = await request(
    "food",
    "DELETE",
    "/consumos/:id",
    admin,
    { __id: consumo.body.id },
  );
  assert.equal(estornoMerenda.status, 200);
  assert.equal(estornoMerenda.body.canceladaPorId, admin.id);
  assert.equal(
    getState().foods.find((item) => item.id === food.body.id).quantidade,
    10,
  );
  const entradaMerenda = getState().foodMovements.find(
    (item) => item.itemId === food.body.id && !item.cancelada,
  );
  assert.equal(
    (
      await request("food", "DELETE", "/consumos/:id", admin, {
        __id: entradaMerenda.id,
      })
    ).status,
    200,
  );
  assert.equal(
    getState().foods.find((item) => item.id === food.body.id).quantidade,
    0,
  );
  assert.equal(
    (await request("food", "DELETE", "/:id", admin, { __id: food.body.id }))
      .status,
    204,
    "a exclusão direta não depende do histórico ou do saldo",
  );
  assert.equal(
    getState().foods.some((item) => item.id === food.body.id),
    false,
  );
  assert.equal(
    getState().foodMovements.filter((item) => item.itemId === food.body.id)
      .length,
    2,
    "as movimentações continuam disponíveis para auditoria",
  );

  const ticket = await request("tickets", "POST", "/", bob, {
    nome: "Bob",
    email: "bob@example.org",
    assunto: "Outros",
    mensagem: "Solicitação de suporte",
  });
  assert.equal(
    (await request("tickets", "DELETE", "/:id", bob, { __id: ticket.body.id }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("tickets", "DELETE", "/:id", admin, {
        __id: ticket.body.id,
      })
    ).status,
    204,
  );
  assert.ok(
    getState().logs.some(
      (log) =>
        log.usuario === "Admin" &&
        log.operacao.includes(`chamado #${ticket.body.id}`),
    ),
  );
});

test("merenda: exclusão de movimentação do outro é negada, própria é cancelada e saldo restaurado", async () => {
  const { request, getState } = await setup();
  const food = await request("food", "POST", "/", alice, {
    nome: "Suco de uva",
    categoria: "bebidas",
    quantidade: 10,
    unidade: "litros",
    minimo: 0,
    custoUnitario: 8,
    dataEntrada: "2026-11-20",
    fornecedor: "Fornecedor",
    cadastradoPorId: bob.id,
  });
  assert.equal(food.status, 201);
  const initial = getState().foodMovements[0];
  const saida = await request("food", "POST", "/:id/consumo", bob, {
    __id: food.body.id,
    quantidade: 4,
    destino: "Escola A",
    usuarioId: alice.id,
  });
  assert.equal(saida.status, 201);
  assert.equal(saida.body.usuarioId, bob.id);
  assert.equal(
    (await request("food", "GET", "/consumos", alice)).body.find(
      (x) => x.id === saida.body.id,
    ).podeExcluir,
    false,
  );
  assert.equal(
    (
      await request("food", "DELETE", "/consumos/:id", alice, {
        __id: saida.body.id,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("food", "GET", "/consumos", alice)).body.find(
      (x) => x.id === initial.id,
    ).podeExcluir,
    true,
    "a entrada de merenda própria mantém o botão mesmo havendo consumo posterior",
  );
  assert.equal(
    (
      await request("food", "DELETE", "/consumos/:id", alice, {
        __id: initial.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("food", "DELETE", "/consumos/:id", bob, {
        __id: saida.body.id,
        motivo: "Teste",
      })
    ).status,
    200,
  );
  assert.equal(getState().foods[0].quantidade, 10);
  assert.equal(
    (
      await request("food", "DELETE", "/consumos/:id", alice, {
        __id: initial.id,
      })
    ).status,
    200,
  );
  assert.equal(getState().foods[0].quantidade, 0);
  assert.equal(getState().foods[0].quantidadeInicial, 0);
  assert.equal(getState().foodMovements.length, 2);
  assert.equal(
    (await request("food", "DELETE", "/:id", alice, { __id: food.body.id }))
      .status,
    204,
    "a exclusão direta funciona mesmo com movimentações canceladas",
  );
  assert.equal(
    getState().foods.some((item) => item.id === food.body.id),
    false,
  );
  assert.equal(getState().foodMovements.length, 2);
});

test("extrato financeiro exclui operações canceladas sem gerar entrada fantasma", () => {
  const { extrato, consolidar } = require("../src/relatorios");
  const base = {
    stockItems: [],
    movements: [],
    foods: [
      {
        id: 1,
        nome: "Polpa",
        categoria: "bebidas",
        quantidade: 0,
        quantidadeInicial: 0,
        custoUnitario: 12,
        dataEntrada: "2026-11-20",
        fornecedor: "F",
      },
    ],
    foodMovements: [
      {
        id: 1,
        itemId: 1,
        itemNome: "Polpa",
        tipo: "entrada",
        quantidade: 10,
        custoUnitario: 12,
        custoTotal: 120,
        cancelada: true,
        data: "2026-11-20T15:00:00Z",
      },
    ],
  };
  assert.equal(extrato(base).length, 0);
  assert.equal(consolidar(base).entradasValor, 0);
});

// Regressão V6: o botão NÃO pode desaparecer só porque o cadastro tem saldo/histórico.
test("V6: Excluir aparece para quem cadastrou itens com saldo e histórico, mas não para terceiros", async () => {
  const { request, getState } = await setup();
  const stock = await request("stock", "POST", "/", alice, {
    nome: "Caderno V6",
    categoria: "materiais",
    unidade: "unidades",
    quantidade: 20,
    minimo: 0,
    custoUnitario: 4,
  });
  assert.equal(stock.status, 201);
  assert.equal(
    (await request("stock", "GET", "/", alice)).body.find(
      (x) => x.id === stock.body.id,
    ).podeExcluir,
    true,
  );
  assert.equal(
    (await request("stock", "GET", "/", bob)).body.find(
      (x) => x.id === stock.body.id,
    ).podeExcluir,
    false,
  );
  assert.equal(
    (await request("stock", "DELETE", "/:id", bob, { __id: stock.body.id }))
      .status,
    403,
  );
  assert.equal(
    (await request("stock", "DELETE", "/:id", alice, { __id: stock.body.id }))
      .status,
    409,
    "saldo existente bloqueia exclusão real, sem esconder o botão",
  );
  const food = await request("food", "POST", "/", bob, {
    nome: "Suco V6",
    categoria: "bebidas",
    quantidade: 20,
    unidade: "litros",
    minimo: 0,
    custoUnitario: 5,
    dataEntrada: "2026-11-20",
    fornecedor: "F",
  });
  assert.equal(food.status, 201);
  assert.equal(
    (await request("food", "GET", "/", bob)).body.find(
      (x) => x.id === food.body.id,
    ).podeExcluir,
    true,
  );
  assert.equal(
    (await request("food", "GET", "/", alice)).body.find(
      (x) => x.id === food.body.id,
    ).podeExcluir,
    false,
  );
  assert.equal(
    (await request("food", "DELETE", "/:id", alice, { __id: food.body.id }))
      .status,
    403,
  );
  assert.equal(
    (await request("food", "DELETE", "/:id", bob, { __id: food.body.id }))
      .status,
    204,
  );
  assert.equal(
    getState().foods.some((item) => item.id === food.body.id),
    false,
  );
  assert.equal(
    getState().foodMovements.some((item) => item.itemId === food.body.id),
    true,
    "a entrada permanece no histórico após remover o cadastro",
  );
});

test("V6: botão é retirado somente de movimentação cancelada ou de outro usuário", async () => {
  const { request } = await setup();
  const stock = await request("stock", "POST", "/", alice, {
    nome: "Estojo V6",
    categoria: "materiais",
    unidade: "unidades",
    quantidade: 0,
    minimo: 0,
    custoUnitario: 2,
  });
  const movement = await request("mov", "POST", "/", alice, {
    itemId: stock.body.id,
    tipo: "entrada",
    quantidade: 6,
    custoUnitario: 2,
    destino: "Distribuição",
  });
  const id = movement.body.id;
  assert.equal(
    (await request("mov", "GET", "/", alice)).body.find((x) => x.id === id)
      .podeExcluir,
    true,
  );
  assert.equal(
    (await request("mov", "GET", "/", bob)).body.find((x) => x.id === id)
      .podeExcluir,
    false,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: id })).status,
    200,
  );
  assert.equal(
    (await request("mov", "GET", "/", alice)).body.find((x) => x.id === id)
      .podeExcluir,
    false,
  );
});

test("V7: carga inicial histórica de materiais pode ser estornada pela conta vinculada", async () => {
  const { request, setState, getState } = await setup();
  setState({
    users: [],
    foods: [],
    foodMovements: [],
    logs: [],
    stockItems: [
      {
        id: 1001,
        nome: "Caderno demo",
        quantidade: 10,
        custoUnitario: 5,
        unidade: "unidades",
        cadastradoPorId: alice.id,
      },
    ],
    movements: [
      {
        id: 1001,
        itemId: 1001,
        itemNome: "Caderno demo",
        tipo: "entrada",
        quantidade: 10,
        custoUnitario: 5,
        custoTotal: 50,
        data: new Date().toISOString(),
        responsavel: "Alice",
        usuarioId: alice.id,
        notaFiscal: "DEMO-CARGA-1001",
        observacao: "Movimentação fictícia para apresentação",
        cancelada: false,
      },
    ],
    proximoId: {
      stock: 1002,
      movement: 1002,
      food: 1,
      foodMovement: 1,
      log: 1,
    },
  });
  assert.equal(
    (await request("mov", "DELETE", "/:id", bob, { __id: 1001 })).status,
    403,
  );
  assert.equal(
    (await request("mov", "DELETE", "/:id", alice, { __id: 1001 })).status,
    200,
  );
  assert.equal(getState().stockItems[0].quantidade, 0);
  assert.equal(getState().movements[0].cancelada, true);
});

test("V7: carga inicial fictícia de merenda pode ser estornada pela conta vinculada", async () => {
  const { request, setState, getState } = await setup();
  setState({
    users: [],
    stockItems: [],
    movements: [],
    logs: [],
    foods: [
      {
        id: 52001,
        nome: "Suco demo",
        quantidade: 12,
        quantidadeInicial: 12,
        custoUnitario: 6,
        unidade: "litros",
        cadastradoPorId: alice.id,
      },
    ],
    foodMovements: [
      {
        id: 62001,
        itemId: 52001,
        itemNome: "Suco demo",
        tipo: "entrada",
        quantidade: 12,
        custoUnitario: 6,
        custoTotal: 72,
        data: new Date().toISOString(),
        responsavel: "Alice",
        usuarioId: alice.id,
        destino: "Inventário inicial demonstrativo",
        observacao: "ENTRADA FICTÍCIA para apresentação",
        cancelada: false,
      },
    ],
    proximoId: {
      stock: 1,
      movement: 1,
      food: 52002,
      foodMovement: 62002,
      log: 1,
    },
  });
  assert.equal(
    (await request("food", "DELETE", "/consumos/:id", bob, { __id: 62001 }))
      .status,
    403,
  );
  assert.equal(
    (await request("food", "DELETE", "/consumos/:id", alice, { __id: 62001 }))
      .status,
    200,
  );
  assert.equal(getState().foods[0].quantidade, 0);
  assert.equal(getState().foodMovements[0].cancelada, true);
});
