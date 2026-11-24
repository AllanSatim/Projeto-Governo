/**
 * Testes de autorização e auditoria de operações — SGE Educação.
 * Executar com `npm test` após `npm install` (não requer MySQL).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

async function portaLivre() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const porta = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return porta;
}

test("secretários não acessam administração; operações usam identidade da sessão", async (t) => {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "sge-rbac-"));
  const porta = await portaLivre();
  const origem = `http://127.0.0.1:${porta}`;
  const servidor = spawn(
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
        SGE_DATA_FILE: path.join(pasta, "dados.json"),
        PORT: String(porta),
      },
      stdio: "ignore",
    },
  );
  t.after(async () => {
    if (servidor.exitCode === null) {
      await new Promise((resolve) => {
        servidor.once("exit", resolve);
        servidor.kill();
      });
    }
    await fs.rm(pasta, { recursive: true, force: true });
  });
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (servidor.exitCode !== null)
      throw new Error("Servidor não iniciou para o teste.");
    try {
      if ((await fetch(`${origem}/api/status`)).ok) break;
    } catch {}
    if (attempts === 79) throw new Error("Servidor não ficou pronto.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  async function requisitar(rota, method = "GET", body, token) {
    const resposta = await fetch(origem + rota, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const dados = resposta.status === 204 ? null : await resposta.json();
    return { status: resposta.status, dados };
  }
  const loginAdmin = await requisitar("/api/auth/login", "POST", {
    usuario: "admin",
    senha: "admin123",
  });
  assert.equal(loginAdmin.status, 200);
  assert.equal(loginAdmin.dados.perfil, "admin");
  const admin = loginAdmin.dados.token;
  const registro = await requisitar("/api/auth/cadastro", "POST", {
    nome: "Secretária de teste",
    cpf: "33155566677",
    cargo: "Secretário",
    email: "secretaria@teste.local",
    usuario: "secretaria_prova",
    senha: "Demo@Senha123",
    confirmarSenha: "Demo@Senha123",
    perfil: "admin",
  });
  assert.equal(registro.status, 201);
  assert.equal(registro.dados.perfil, "secretario");
  assert.equal(
    (
      await requisitar(
        `/api/admin/usuarios/${registro.dados.id}`,
        "PATCH",
        { aprovado: true },
        admin,
      )
    ).status,
    200,
  );
  const loginSecretaria = await requisitar("/api/auth/login", "POST", {
    usuario: "secretaria_prova",
    senha: "Demo@Senha123",
  });
  assert.equal(loginSecretaria.status, 200);
  assert.equal(loginSecretaria.dados.perfil, "secretario");
  const secretaria = loginSecretaria.dados.token;
  for (const rota of ["/api/admin", "/api/admin/logs", "/api/admin/usuarios"]) {
    assert.equal(
      (await requisitar(rota, "GET", undefined, secretaria)).status,
      403,
      rota,
    );
  }
  assert.equal(
    (
      await requisitar(
        "/api/admin/usuarios",
        "POST",
        {
          nome: "Intruso",
          cpf: "11122233344",
          cargo: "Secretário",
          email: "intruso@teste.local",
          usuario: "intruso",
        },
        secretaria,
      )
    ).status,
    403,
  );
  assert.equal(
    (await requisitar("/api/usuarios/1", "GET", undefined, secretaria)).status,
    403,
  );
  assert.equal(
    (await requisitar("/api/academico/resumo", "GET", undefined, secretaria))
      .status,
    200,
  );
  assert.equal(
    (
      await requisitar(
        `/api/usuarios/${registro.dados.id}`,
        "PUT",
        {
          nome: "Secretária de teste",
          email: "secretaria@teste.local",
          cargo: "Almoxarifado",
          perfil: "admin",
        },
        secretaria,
      )
    ).status,
    403,
  );
  const item = await requisitar(
    "/api/estoque",
    "POST",
    {
      nome: "Caderno Teste RBAC",
      categoria: "materiais",
      unidade: "unidades",
      quantidade: 0,
      minimo: 2,
      custoUnitario: 12,
      responsavel: "Usuário Falso",
    },
    secretaria,
  );
  assert.equal(item.status, 201);
  const cadastroNoSaldoZero = (
    await requisitar("/api/estoque", "GET", undefined, secretaria)
  ).dados.find((row) => row.id === item.dados.id);
  assert.equal(cadastroNoSaldoZero.ultimoResponsavel, "Secretária de teste");
  const entrada = await requisitar(
    "/api/movimentacoes",
    "POST",
    {
      itemId: item.dados.id,
      tipo: "entrada",
      quantidade: 5,
      custoUnitario: 12,
      destino: "Fornecedor",
      responsavel: "Pessoa Falsa",
    },
    secretaria,
  );
  assert.equal(entrada.status, 201);
  assert.equal(entrada.dados.responsavel, "Secretária de teste");
  assert.equal(entrada.dados.usuarioId, registro.dados.id);
  const bebida = await requisitar(
    "/api/merenda",
    "POST",
    {
      nome: "Suco natural",
      categoria: "bebidas",
      quantidade: 20,
      unidade: "litros",
      custoUnitario: 7,
      dataEntrada: "2026-11-20",
      fornecedor: "Fornecedor Escola",
      responsavel: "Pessoa Falsa",
    },
    secretaria,
  );
  assert.equal(bebida.status, 201);
  const registros = (
    await requisitar("/api/merenda/consumos", "GET", undefined, secretaria)
  ).dados;
  const registroInicial = registros.find(
    (row) => row.itemId === bebida.dados.id && row.tipo === "entrada",
  );
  assert.ok(
    registroInicial,
    "Cadastro de merenda deve gerar entrada no histórico",
  );
  assert.equal(registroInicial.responsavel, "Secretária de teste");
  assert.equal(registroInicial.usuarioId, registro.dados.id);
  const saida = await requisitar(
    `/api/merenda/${bebida.dados.id}/consumo`,
    "POST",
    {
      quantidade: 2,
      destino: "Escola Central",
      responsavel: "Pessoa Falsa",
    },
    secretaria,
  );
  assert.equal(saida.status, 201);
  assert.equal(saida.dados.responsavel, "Secretária de teste");
  const financeiro = (
    await requisitar("/api/financeiro", "GET", undefined, secretaria)
  ).dados;
  assert.ok(
    financeiro.extrato.some(
      (row) =>
        row.item === "Suco natural" &&
        row.tipo === "entrada" &&
        row.responsavel === "Secretária de teste",
    ),
  );
  assert.ok(
    financeiro.extrato.some(
      (row) =>
        row.item === "Suco natural" &&
        row.tipo === "saida" &&
        row.responsavel === "Secretária de teste",
    ),
  );
  const auditoria = (
    await requisitar("/api/atividades/merenda", "GET", undefined, secretaria)
  ).dados;
  assert.ok(
    auditoria.some(
      (row) =>
        row.usuario === "Secretária de teste" &&
        row.operacao.includes("Consumo"),
    ),
  );
});

test("contabilidade não duplica recebimento de merenda e registra autor histórico", () => {
  const { consolidar, extrato } = require("../src/relatorios");
  const dados = {
    stockItems: [],
    movements: [],
    foods: [
      {
        id: 10,
        nome: "Arroz",
        categoria: "graos",
        quantidade: 9,
        quantidadeInicial: 10,
        minimo: 0,
        custoUnitario: 3,
        dataEntrada: "2026-11-20",
        fornecedor: "F",
      },
    ],
    foodMovements: [
      {
        id: 1,
        itemId: 10,
        itemNome: "Arroz",
        tipo: "entrada",
        quantidade: 10,
        custoTotal: 30,
        custoUnitario: 3,
        data: "2026-11-20T10:00:00Z",
        destino: "F",
        responsavel: "Ana",
      },
      {
        id: 2,
        itemId: 10,
        itemNome: "Arroz",
        tipo: "saida",
        quantidade: 1,
        custoTotal: 3,
        custoUnitario: 3,
        data: "2026-11-20T11:00:00Z",
        destino: "Escola",
        responsavel: "Bruno",
      },
    ],
  };
  assert.equal(consolidar(dados).entradasValor, 30);
  assert.equal(consolidar(dados).saidasValor, 3);
  assert.equal(extrato(dados).length, 2);
  assert.equal(
    extrato(dados).find((item) => item.tipo === "entrada").responsavel,
    "Ana",
  );
});
