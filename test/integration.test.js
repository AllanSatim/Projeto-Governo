/**
 * test/integration.test.js — SGE Educação
 * Módulo do ERP SGE Educação.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

/** Isola a responsabilidade unusedPort para manter a lógica reutilizável e testável. */
async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("fluxos principais funcionam sem MySQL e persistem em arquivo local", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sge-integration-"),
  );
  const dataFile = path.join(directory, "sge.json");
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;

  /** Isola a responsabilidade start para manter a lógica reutilizável e testável. */
  const start = () => {
    child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "src", "server.js")],
      {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          SGE_STORAGE: "json",
          SGE_ADMIN_PASSWORD: "admin123",
          SGE_DEMO_RECOVERY: "false",
          PORT: String(port),
          SGE_DATA_FILE: dataFile,
        },
        stdio: "ignore",
      },
    );
  };
  /** Isola a responsabilidade stop para manter a lógica reutilizável e testável. */
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  };
  /** Solicita dados acadêmicos à API e identifica sessões inválidas ou acesso negado. */
  const request = async (url, { method = "GET", token, body } = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = response.status === 204 ? null : await response.json();
    return { status: response.status, body: result };
  };
  /** Isola a responsabilidade waitUntilReady para manter a lógica reutilizável e testável. */
  const waitUntilReady = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null)
        throw new Error(`Servidor encerrou com código ${child.exitCode}.`);
      try {
        const response = await fetch(`${baseUrl}/api/status`);
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Servidor não iniciou no tempo esperado.");
  };
  t.after(async () => {
    await stop();
    await fs.rm(directory, { recursive: true, force: true });
  });

  start();
  await waitUntilReady();
  assert.equal(
    (await request("/api/status")).body.armazenamento,
    "arquivo-local",
  );
  assert.equal((await request("/api/painel")).status, 401);

  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { usuario: "admin", senha: "admin123" },
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.token;
  assert.ok(adminToken);
  assert.equal(
    (await request("/api/painel", { token: adminToken })).status,
    200,
  );

  const createdItem = await request("/api/estoque", {
    method: "POST",
    token: adminToken,
    body: {
      nome: "Item de teste",
      categoria: "materiais",
      unidade: "unidades",
      quantidade: 5,
      minimo: 1,
      custoUnitario: 2.5,
    },
  });
  assert.equal(createdItem.status, 201);
  const movement = await request("/api/movimentacoes", {
    method: "POST",
    token: adminToken,
    body: {
      itemId: createdItem.body.id,
      tipo: "saida",
      quantidade: 3,
      custoUnitario: 2.5,
      destino: "Escola de teste",
      responsavel: "Admin",
    },
  });
  assert.equal(movement.status, 201);
  assert.equal(
    (
      await request("/api/movimentacoes", {
        method: "POST",
        token: adminToken,
        body: {
          itemId: createdItem.body.id,
          tipo: "saida",
          quantidade: 3,
          custoUnitario: 2.5,
          destino: "Teste",
          responsavel: "Admin",
        },
      })
    ).status,
    400,
  );
  const stockAfterMovement = await request("/api/estoque", {
    token: adminToken,
  });
  assert.equal(
    stockAfterMovement.body.find((item) => item.id === createdItem.body.id)
      .quantidade,
    2,
  );

  const food = await request("/api/merenda", {
    method: "POST",
    token: adminToken,
    body: {
      nome: "Banana",
      categoria: "hortifruti",
      quantidade: 10,
      minimo: 8,
      unidade: "kg",
      custoUnitario: 4,
      dataEntrada: "2026-11-10",
    },
  });
  assert.equal(food.status, 201);
  assert.equal(food.body.valorTotal, 40);
  assert.equal(food.body.minimo, 8);
  assert.equal(
    (
      await request(`/api/merenda/${food.body.id}/minimo`, {
        method: "PATCH",
        token: adminToken,
        body: { minimo: -1 },
      })
    ).status,
    400,
  );
  const beverage = await request("/api/merenda", {
    method: "POST",
    token: adminToken,
    body: {
      nome: "Suco de uva teste",
      categoria: "bebidas",
      quantidade: 10,
      unidade: "litros",
      custoUnitario: 8.5,
      dataEntrada: "2026-11-13",
    },
  });
  assert.equal(beverage.status, 201);
  assert.equal(beverage.body.minimo, 0);
  const entry = await request(`/api/merenda/${beverage.body.id}/entrada`, {
    method: "POST",
    token: adminToken,
    body: { quantidade: 5, fornecedor: "Fornecedor Teste" },
  });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.tipo, "entrada");
  assert.equal(entry.body.custoTotal, 42.5);
  const afterEntry = await request("/api/merenda", { token: adminToken });
  assert.equal(
    afterEntry.body.find((row) => row.id === beverage.body.id).quantidade,
    15,
  );
  assert.equal(
    (
      await request(`/api/merenda/${beverage.body.id}/entrada`, {
        method: "POST",
        token: adminToken,
        body: { quantidade: -1 },
      })
    ).status,
    400,
  );
  const foodConsumption = await request(
    `/api/merenda/${food.body.id}/consumo`,
    {
      method: "POST",
      token: adminToken,
      body: { quantidade: 3, destino: "Escola teste" },
    },
  );
  assert.equal(foodConsumption.status, 201);
  assert.equal(foodConsumption.body.custoTotal, 12);
  const afterConsumption = await request("/api/merenda", { token: adminToken });
  assert.equal(
    afterConsumption.body.find((row) => row.id === food.body.id).quantidade,
    7,
  );
  assert.equal(
    afterConsumption.body.find((row) => row.id === food.body.id).minimo,
    8,
  );
  const updatedMinimum = await request(`/api/merenda/${food.body.id}/minimo`, {
    method: "PATCH",
    token: adminToken,
    body: { minimo: 6 },
  });
  assert.equal(updatedMinimum.status, 200);
  assert.equal(updatedMinimum.body.minimo, 6);
  const financeAfterConsumption = await request("/api/financeiro", {
    token: adminToken,
  });
  assert.ok(
    financeAfterConsumption.body.extrato.some(
      (row) =>
        row.item === "Banana" && row.tipo === "saida" && row.custoTotal === 12,
    ),
  );
  const foodToDelete = await request("/api/merenda", {
    method: "POST",
    token: adminToken,
    body: {
      nome: "Alimento para exclusão direta",
      categoria: "graos",
      quantidade: 4,
      minimo: 1,
      unidade: "kg",
      custoUnitario: 3,
      dataEntrada: "2026-11-14",
    },
  });
  const deletionHistory = await request(
    `/api/merenda/${foodToDelete.body.id}/consumo`,
    {
      method: "POST",
      token: adminToken,
      body: { quantidade: 1, destino: "Escola teste" },
    },
  );
  assert.equal(deletionHistory.status, 201);
  assert.equal(
    (
      await request(`/api/merenda/${foodToDelete.body.id}`, {
        method: "DELETE",
        token: adminToken,
      })
    ).status,
    204,
  );
  assert.ok(
    !(await request("/api/merenda", { token: adminToken })).body.some(
      (item) => item.id === foodToDelete.body.id,
    ),
  );
  const preservedHistory = await request("/api/merenda/consumos", {
    token: adminToken,
  });
  assert.ok(
    preservedHistory.body.some(
      (item) => item.id === deletionHistory.body.id && !item.podeExcluir,
    ),
  );
  assert.equal(
    (
      await request("/api/merenda", {
        method: "POST",
        token: adminToken,
        body: {
          nome: "Data impossível",
          categoria: "hortifruti",
          quantidade: 1,
          unidade: "kg",
          custoUnitario: 1,
          dataEntrada: "2026-02-31",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/relatorios", { token: adminToken })).status,
    200,
  );
  assert.equal(
    (await request("/api/relatorios?inicio=2026-02-31", { token: adminToken }))
      .status,
    400,
  );

  const ticket = await request("/api/chamados", {
    method: "POST",
    token: adminToken,
    body: {
      nome: "Admin",
      email: "admin@sge.local",
      assunto: "Teste",
      mensagem: "Chamado de integração",
    },
  });
  assert.equal(ticket.status, 201);

  const signup = await request("/api/auth/cadastro", {
    method: "POST",
    body: {
      nome: "Usuário de teste",
      cpf: "12345678901",
      cargo: "Almoxarifado",
      email: "teste@sge.local",
      usuario: "teste",
      senha: "senha123",
      confirmarSenha: "senha123",
    },
  });
  assert.equal(signup.status, 201);
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { usuario: "teste", senha: "senha123" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/admin/usuarios/${signup.body.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { aprovado: true },
      })
    ).status,
    200,
  );
  const userLogin = await request("/api/auth/login", {
    method: "POST",
    body: { usuario: "teste", senha: "senha123" },
  });
  assert.equal(userLogin.status, 200);
  assert.equal(
    (
      await request(`/api/usuarios/${signup.body.id}`, {
        token: userLogin.body.token,
      })
    ).body.nome,
    "Usuário de teste",
  );

  await stop();
  start();
  await waitUntilReady();
  const loginAfterRestart = await request("/api/auth/login", {
    method: "POST",
    body: { usuario: "admin", senha: "admin123" },
  });
  assert.equal(loginAfterRestart.status, 200);
  const persistedStock = await request("/api/estoque", {
    token: loginAfterRestart.body.token,
  });
  assert.equal(
    persistedStock.body.find((item) => item.id === createdItem.body.id)
      .quantidade,
    2,
  );
  const persistedFoods = await request("/api/merenda", {
    token: loginAfterRestart.body.token,
  });
  assert.equal(
    persistedFoods.body.find((item) => item.id === food.body.id).minimo,
    6,
  );
});
