/**
 * src/store.js — SGE Educação
 * Camada de persistência: armazenamento JSON de demonstração ou delegação ao adaptador MySQL.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const mysqlStore = require("./db-mysql");
const { reconciliarCargasConhecidas } = require("./autoria-legada");
const useMysql = (process.env.SGE_STORAGE || "json").toLowerCase() === "mysql";

const file = process.env.SGE_DATA_FILE
  ? path.resolve(process.env.SGE_DATA_FILE)
  : path.join(__dirname, "..", "data", "sge.json");
let state;
let writes = Promise.resolve();

const idCounters = {
  users: "user",
  stockItems: "stock",
  movements: "movement",
  foods: "food",
  foodMovements: "foodMovement",
  tickets: "ticket",
  logs: "log",
  schools: "school",
  teachers: "teacher",
  students: "student",
  classes: "class",
  enrollments: "enrollment",
  attendance: "attendance",
};

/** Produz uma data relativa ao dia atual usada exclusivamente na carga fictícia. */
function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Cria o conjunto mínimo de dados fictícios para um banco de demonstração novo. */
async function initialState() {
  const adminPassword = useMysql
    ? process.env.SGE_ADMIN_PASSWORD
    : process.env.SGE_ADMIN_PASSWORD || "admin123";
  if (!adminPassword || adminPassword.length < 12) {
    if (useMysql)
      throw new Error(
        "Defina SGE_ADMIN_PASSWORD com pelo menos 12 caracteres antes do primeiro uso de MySQL.",
      );
  }
  const password = await bcrypt.hash(adminPassword, 10);
  const now = new Date().toISOString();
  const stockItems = [
    {
      id: 1,
      nome: "Caderno universitário",
      categoria: "materiais",
      quantidade: 135,
      minimo: 40,
      custoUnitario: 18.5,
      unidade: "unidades",
    },
    {
      id: 2,
      nome: "Uniforme escolar (camiseta)",
      categoria: "uniformes",
      quantidade: 62,
      minimo: 80,
      custoUnitario: 32,
      unidade: "unidades",
    },
    {
      id: 3,
      nome: "Livro de leitura",
      categoria: "livros",
      quantidade: 210,
      minimo: 50,
      custoUnitario: 24.9,
      unidade: "unidades",
    },
    {
      id: 4,
      nome: "Tinta para impressora",
      categoria: "outros",
      quantidade: 18,
      minimo: 12,
      custoUnitario: 76,
      unidade: "unidades",
    },
  ];
  const users = [
    {
      id: 1,
      nome: "Administrador do Sistema",
      cpf: "00000000000",
      cargo: "Secretário",
      perfil: "admin",
      email: "admin@sge.local",
      usuario: "admin",
      senha_hash: password,
      telefone: "",
      ativo: true,
      aprovado: true,
      criadoEm: now,
      ultimoAcesso: null,
      codigo_recuperacao: null,
      codigo_expira_em: null,
    },
  ];
  const movements = [
    {
      id: 1,
      itemId: 1,
      itemNome: stockItems[0].nome,
      tipo: "entrada",
      quantidade: 135,
      custoUnitario: 18.5,
      custoTotal: 2497.5,
      destino: "Fornecedor inicial",
      notaFiscal: "DEMO-001",
      responsavel: "Administrador do Sistema",
      usuarioId: 1,
      observacao: "Carga de demonstração",
      data: `${dateOffset(-12)}T10:00:00.000Z`,
    },
    {
      id: 2,
      itemId: 2,
      itemNome: stockItems[1].nome,
      tipo: "entrada",
      quantidade: 100,
      custoUnitario: 32,
      custoTotal: 3200,
      destino: "Fornecedor inicial",
      notaFiscal: "DEMO-002",
      responsavel: "Administrador do Sistema",
      observacao: "Carga de demonstração",
      data: `${dateOffset(-8)}T11:00:00.000Z`,
    },
    {
      id: 3,
      itemId: 2,
      itemNome: stockItems[1].nome,
      tipo: "saida",
      quantidade: 38,
      custoUnitario: 32,
      custoTotal: 1216,
      destino: "Escolas municipais",
      notaFiscal: "",
      responsavel: "Administrador do Sistema",
      observacao: "Distribuição de demonstração",
      data: `${dateOffset(-2)}T14:00:00.000Z`,
    },
    {
      id: 4,
      itemId: 3,
      itemNome: stockItems[2].nome,
      tipo: "entrada",
      quantidade: 210,
      custoUnitario: 24.9,
      custoTotal: 5229,
      destino: "Fornecedor inicial",
      notaFiscal: "DEMO-003",
      responsavel: "Administrador do Sistema",
      observacao: "Carga de demonstração",
      data: `${dateOffset(-6)}T10:00:00.000Z`,
    },
    {
      id: 5,
      itemId: 4,
      itemNome: stockItems[3].nome,
      tipo: "entrada",
      quantidade: 18,
      custoUnitario: 76,
      custoTotal: 1368,
      destino: "Fornecedor inicial",
      notaFiscal: "DEMO-004",
      responsavel: "Administrador do Sistema",
      observacao: "Carga de demonstração",
      data: `${dateOffset(-1)}T10:00:00.000Z`,
    },
  ];
  const foods = [
    {
      id: 1,
      nome: "Arroz tipo 1",
      categoria: "graos",
      quantidade: 120,
      minimo: 0,
      quantidadeInicial: 120,
      unidade: "kg",
      custoUnitario: 6.4,
      dataEntrada: dateOffset(-5),
      fornecedor: "Cooperativa local",
    },
    {
      id: 2,
      nome: "Feijão carioca",
      categoria: "graos",
      quantidade: 75,
      minimo: 0,
      quantidadeInicial: 75,
      unidade: "kg",
      custoUnitario: 8.2,
      dataEntrada: dateOffset(-4),
      fornecedor: "Cooperativa local",
    },
    {
      id: 3,
      nome: "Leite integral",
      categoria: "laticinios",
      quantidade: 90,
      minimo: 0,
      quantidadeInicial: 90,
      unidade: "litros",
      custoUnitario: 5.1,
      dataEntrada: dateOffset(-3),
      fornecedor: "Laticínios da região",
    },
  ];
  return {
    versao: 1,
    users,
    stockItems,
    movements,
    foods,
    foodMovements: [],
    tickets: [],
    logs: [],
    schools: [],
    teachers: [],
    students: [],
    classes: [],
    enrollments: [],
    attendance: [],
    proximoId: {
      user: 2,
      stock: 5,
      movement: 6,
      food: 4,
      foodMovement: 1,
      ticket: 1,
      log: 1,
      school: 1,
      teacher: 1,
      student: 1,
      class: 1,
      enrollment: 1,
      attendance: 1,
    },
  };
}

/** Inicializa o armazenamento escolhido e valida dados e esquema necessários. */
async function initStore() {
  if (useMysql) return mysqlStore.initStore(initialState);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    for (const name of [
      "users",
      "stockItems",
      "movements",
      "foods",
      "tickets",
      "logs",
    ]) {
      if (!Array.isArray(saved[name]))
        throw new Error(`O arquivo de dados está sem a coleção "${name}".`);
    }
    if (!saved.proximoId || typeof saved.proximoId !== "object")
      throw new Error(
        "O arquivo de dados não contém os contadores de registros.",
      );
    // Migração retrocompatível de arquivos anteriores à gestão acadêmica.
    for (const [name, prefix] of Object.entries(idCounters)) {
      if (!Array.isArray(saved[name])) saved[name] = [];
      if (!Number.isInteger(saved.proximoId[prefix])) {
        saved.proximoId[prefix] =
          Math.max(0, ...saved[name].map((row) => Number(row.id) || 0)) + 1;
      }
    }
    // Arquivos locais criados antes da separação de papéis não têm `perfil`.
    // Não promover secretários comuns; somente login administrativo reservado.
    for (const account of saved.users) {
      if (!account.perfil)
        account.perfil =
          account.usuario?.toLowerCase() === "admin"
            ? "admin"
            : account.cargo === "Secretário"
              ? "secretario"
              : account.cargo === "Almoxarifado"
                ? "almoxarifado"
                : "sem_acesso";
    }
    for (const food of saved.foods) {
      if (food.quantidadeInicial == null)
        food.quantidadeInicial = food.quantidade;
      if (food.minimo == null) food.minimo = 0;
    }
    state = saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = await initialState();
    await persist(state);
  }
  const alterados = reconciliarCargasConhecidas(state);
  if (alterados) {
    state.logs.unshift({
      id: nextId(state, "logs"),
      usuario: "Sistema (migração V7)",
      operacao: `Vinculação automática de ${alterados} campos de autoria de lotes fictícios identificados`,
      modulo: "Administração",
      data: new Date().toISOString(),
    });
    await persist(state);
  }
}

/** Salva dados locais em arquivo temporário e depois renomeia para reduzir risco de escrita parcial. */
async function persist(nextState) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify(nextState, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(temporary, file);
}

/** Executa consulta sobre um retrato consistente do armazenamento. */
async function read(callback) {
  if (useMysql) return mysqlStore.read(callback);
  if (!state)
    throw new Error("O armazenamento local ainda não foi inicializado.");
  return callback(structuredClone(state));
}

/** Serializa uma alteração de estado e persiste o resultado somente se a operação concluir. */
function update(callback) {
  if (useMysql) return mysqlStore.update(callback);
  const operation = writes.then(async () => {
    if (!state)
      throw new Error("O armazenamento local ainda não foi inicializado.");
    const draft = structuredClone(state);
    const result = await callback(draft);
    await persist(draft);
    state = draft;
    return result;
  });
  writes = operation.catch(() => {});
  return operation;
}

/** Reserva o próximo identificador numérico de uma coleção. */
function nextId(data, collection) {
  const key = idCounters[collection];
  if (!key) throw new Error(`Coleção desconhecida: ${collection}`);
  const id = data[collection].reduce(
    (next, row) => Math.max(next, Number(row.id) + 1 || 1),
    Number(data.proximoId[key]) || 1,
  );
  data.proximoId[key] = id + 1;
  return id;
}

module.exports = { initStore, read, update, nextId, useMysql, mysqlStore };
