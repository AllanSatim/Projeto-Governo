/**
 * src/db-mysql.js — SGE Educação
 * Adaptador relacional MySQL/MariaDB.
 * Responsável pela persistência, consultas e transações do ERP.
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { reconciliarCargasConhecidas } = require("./autoria-legada");

// ======================================================
// ESTRUTURA DAS TABELAS DO BANCO DE DADOS
// ======================================================

const schema = [
  [
    "users",
    "usuarios",
    [
      "id",
      "nome",
      "cpf",
      "cargo",
      "perfil",
      "email",
      "usuario",
      "senha_hash",
      "telefone",
      "ativo",
      "aprovado",
      "criadoEm",
      "ultimoAcesso",
      "codigo_recuperacao",
      "codigo_expira_em",
    ],
  ],
  [
    "stockItems",
    "itens_estoque",
    [
      "id",
      "nome",
      "categoria",
      "unidade",
      "quantidade",
      "minimo",
      "custoUnitario",
      "cadastradoPor",
      "cadastradoPorId",
    ],
  ],
  [
    "movements",
    "movimentacoes",
    [
      "id",
      "itemId",
      "itemNome",
      "tipo",
      "quantidade",
      "custoUnitario",
      "custoTotal",
      "destino",
      "notaFiscal",
      "responsavel",
      "usuarioId",
      "observacao",
      "data",
      "cancelada",
      "canceladaEm",
      "canceladaPorId",
      "canceladaPor",
      "motivoCancelamento",
      "custoUnitarioAnterior",
    ],
  ],
  [
    "foods",
    "alimentos",
    [
      "id",
      "nome",
      "categoria",
      "quantidade",
      "minimo",
      "quantidadeInicial",
      "unidade",
      "custoUnitario",
      "dataEntrada",
      "fornecedor",
      "cadastradoPor",
      "cadastradoPorId",
    ],
  ],
  [
    "foodMovements",
    "movimentacoes_merenda",
    [
      "id",
      "itemId",
      "itemNome",
      "tipo",
      "quantidade",
      "custoUnitario",
      "custoTotal",
      "destino",
      "responsavel",
      "usuarioId",
      "observacao",
      "data",
      "cancelada",
      "canceladaEm",
      "canceladaPorId",
      "canceladaPor",
      "motivoCancelamento",
      "custoUnitarioAnterior",
    ],
  ],
  [
    "tickets",
    "chamados",
    [
      "id",
      "solicitanteId",
      "nome",
      "email",
      "assunto",
      "mensagem",
      "status",
      "criadoEm",
    ],
  ],
  ["logs", "auditoria", ["id", "usuario", "operacao", "modulo", "data"]],
  [
    "schools",
    "escolas",
    [
      "id",
      "nome",
      "codigoInep",
      "endereco",
      "bairro",
      "municipio",
      "telefone",
      "email",
      "ativo",
    ],
  ],
  [
    "teachers",
    "professores",
    ["id", "nome", "cpf", "email", "telefone", "especialidade", "ativo"],
  ],
  [
    "students",
    "alunos",
    [
      "id",
      "nome",
      "dataNascimento",
      "cpf",
      "responsavel",
      "telefone",
      "email",
      "escolaId",
      "ativo",
    ],
  ],
  [
    "classes",
    "turmas",
    [
      "id",
      "nome",
      "anoLetivo",
      "turno",
      "serie",
      "escolaId",
      "professorId",
      "vagas",
      "ativo",
    ],
  ],
  [
    "enrollments",
    "matriculas",
    ["id", "alunoId", "turmaId", "status", "dataMatricula"],
  ],
  [
    "attendance",
    "frequencia",
    ["id", "matriculaId", "data", "presente", "justificativa"],
  ],
];

// Campos booleanos utilizados pelo sistema.
const boolFields = new Set(["ativo", "aprovado", "presente", "cancelada"]);

let pool;
let initial;
let serial = Promise.resolve();

// Formata identificadores SQL.
const identifier = (name) => `\`${name}\``;

// ======================================================
// INICIALIZAÇÃO DO BANCO DE DADOS
// ======================================================

async function initStore(createInitialState) {
  initial = createInitialState;

  const db = process.env.DB_NAME || "sge_educacao";

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(db)) {
    throw new Error("DB_NAME inválido (use letras, números e underscore).");
  }

  // Configurações provenientes do arquivo .env.
  const options = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    charset: "utf8mb4",
    decimalNumbers: true,
    dateStrings: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
  };

  // Cria o banco caso ainda não exista.
  const bootstrap = await mysql.createConnection(options);

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS ${identifier(db)}
       CHARACTER SET utf8mb4
       COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrap.end();
  }

  // Cria o pool de conexões.
  pool = mysql.createPool({
    ...options,
    database: db,
    waitForConnections: true,
  });

  // Carrega a estrutura SQL do projeto.
  const ddl = await fs.readFile(
    path.join(__dirname, "db", "schema.sql"),
    "utf8",
  );

  for (const statement of ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }

  // ====================================================
  // MIGRAÇÕES NÃO DESTRUTIVAS
  // ====================================================

  // Adiciona a coluna de estoque mínimo dos alimentos.
  const [[minimumColumn]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'alimentos'
     AND COLUMN_NAME = 'minimo'`,
  );

  if (!minimumColumn.total) {
    await pool.query(
      `ALTER TABLE alimentos
       ADD COLUMN minimo DECIMAL(14,3)
       NOT NULL DEFAULT 0 AFTER quantidade`,
    );
  }

  // Verifica a existência da coluna perfil.
  const [[profileColumn]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'usuarios'
     AND COLUMN_NAME = 'perfil'`,
  );

  if (!profileColumn.total) {
    await pool.query(
      `ALTER TABLE usuarios
       ADD COLUMN perfil VARCHAR(20) NULL AFTER cargo`,
    );

    // Preserva as permissões dos usuários existentes.
    await pool.query(
      `UPDATE usuarios
       SET perfil = CASE
         WHEN LOWER(usuario) = 'admin' THEN 'admin'
         WHEN cargo = 'Secretário' THEN 'secretario'
         WHEN cargo = 'Almoxarifado' THEN 'almoxarifado'
         ELSE 'sem_acesso'
       END
       WHERE perfil IS NULL`,
    );
  }

  // Adiciona informações dos responsáveis pelos cadastros.
  for (const table of ["itens_estoque", "alimentos"]) {
    const [[column]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
      [table, "cadastradoPor"],
    );

    if (!column.total) {
      await pool.query(
        `ALTER TABLE ${identifier(table)}
         ADD COLUMN cadastradoPor VARCHAR(180) NULL`,
      );
    }

    const [[idColumn]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
      [table, "cadastradoPorId"],
    );

    if (!idColumn.total) {
      await pool.query(
        `ALTER TABLE ${identifier(table)}
         ADD COLUMN cadastradoPorId INT NULL`,
      );
    }
  }

  // Atualiza a estrutura das tabelas de movimentações.
  for (const table of ["movimentacoes", "movimentacoes_merenda"]) {
    const [[column]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
      [table, "usuarioId"],
    );

    if (!column.total) {
      await pool.query(
        `ALTER TABLE ${identifier(table)}
         ADD COLUMN usuarioId INT NULL AFTER responsavel`,
      );
    }

    // Campos utilizados no cancelamento de movimentações.
    const migrationFields = {
      cancelada: "BOOLEAN NOT NULL DEFAULT 0",
      canceladaEm: "VARCHAR(32) NULL",
      canceladaPorId: "INT NULL",
      canceladaPor: "VARCHAR(180) NULL",
      motivoCancelamento: "VARCHAR(240) NULL",
      custoUnitarioAnterior: "DECIMAL(14,4) NULL",
    };

    for (const [coluna, declaracao] of Object.entries(migrationFields)) {
      const [[existe]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
        [table, coluna],
      );

      if (!existe.total) {
        await pool.query(
          `ALTER TABLE ${identifier(table)}
           ADD COLUMN ${identifier(coluna)} ${declaracao}`,
        );
      }
    }
  }

  // ====================================================
  // INICIALIZAÇÃO DOS DADOS
  // ====================================================

  const [rows] = await pool.execute(
    "SELECT valor FROM sge_meta WHERE chave = ?",
    ["proximoId"],
  );

  if (!rows.length) {
    const seed = await initial();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      await conn.execute("INSERT INTO sge_meta (chave, valor) VALUES (?, ?)", [
        "proximoId",
        JSON.stringify(seed.proximoId),
      ]);

      await replaceCollections(conn, emptyState(seed), seed);

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // Reconcilia somente cargas demonstrativas conhecidas.
  await update((data) => {
    const alterados = reconciliarCargasConhecidas(data);

    if (alterados) {
      const id = Math.max(
        Number(data.proximoId.log) || 1,
        1 + Math.max(0, ...data.logs.map((x) => Number(x.id) || 0)),
      );

      data.proximoId.log = id + 1;

      data.logs.unshift({
        id,
        usuario: "Sistema (migração V7)",
        operacao: `Vinculação automática de ${alterados} campos de autoria de lotes fictícios identificados`,
        modulo: "Administração",
        data: new Date().toISOString(),
      });
    }
  });
}

// ======================================================
// CRIAÇÃO DE ESTADO VAZIO
// ======================================================

function emptyState(seed) {
  const state = {
    proximoId: {},
  };

  for (const [name] of schema) {
    state[name] = [];
  }

  return state;
}

// ======================================================
// LEITURA DOS DADOS DO MYSQL
// ======================================================

async function snapshot(conn) {
  const [[meta]] = await conn.execute(
    "SELECT valor FROM sge_meta WHERE chave = ?",
    ["proximoId"],
  );

  if (!meta) {
    throw new Error("Metadados do SGE não inicializados.");
  }

  const state = {
    proximoId: JSON.parse(meta.valor),
    versao: 2,
  };

  for (const [name, table] of schema) {
    const [rows] = await conn.query(`SELECT * FROM ${identifier(table)}`);

    state[name] = rows.map((row) => {
      const record = {
        ...row,
      };

      // Converte os campos booleanos.
      for (const key of boolFields) {
        if (key in record) {
          record[key] = Boolean(record[key]);
        }
      }

      // Compatibilidade com usuários de versões antigas.
      if (name === "users" && !record.perfil) {
        record.perfil =
          record.cargo === "Secretário"
            ? "secretario"
            : record.cargo === "Almoxarifado"
              ? "almoxarifado"
              : "sem_acesso";
      }

      return record;
    });
  }

  return state;
}

// ======================================================
// EXCLUSÕES RELACIONAIS
// ======================================================

/**
 * Identifica os registros removidos de uma coleção.
 */
function getDeletedIds(beforeRows, afterRows) {
  const currentIds = new Set(afterRows.map((row) => String(row.id)));

  return new Set(
    beforeRows
      .filter((row) => !currentIds.has(String(row.id)))
      .map((row) => String(row.id)),
  );
}

/**
 * Remove registros dependentes dos alimentos e itens
 * de estoque que foram excluídos.
 *
 * A autorização deve ser validada pela rota responsável.
 */
function prepareRelatedDeletions(before, after) {
  // Identifica os alimentos excluídos.
  const deletedFoods = getDeletedIds(before.foods, after.foods);

  // Identifica os itens de estoque excluídos.
  const deletedStockItems = getDeletedIds(before.stockItems, after.stockItems);

  // Remove movimentações vinculadas aos alimentos.
  if (deletedFoods.size > 0) {
    after.foodMovements = after.foodMovements.filter(
      (movement) => !deletedFoods.has(String(movement.itemId)),
    );
  }

  // Remove movimentações vinculadas aos itens de estoque.
  if (deletedStockItems.size > 0) {
    after.movements = after.movements.filter(
      (movement) => !deletedStockItems.has(String(movement.itemId)),
    );
  }
}

// ======================================================
// VALIDAÇÃO DOS RELACIONAMENTOS
// ======================================================

/**
 * Garante que as movimentações restantes possuem
 * alimentos ou itens de estoque correspondentes.
 */
function validateRelationships(state) {
  const foodIds = new Set(state.foods.map((row) => String(row.id)));

  const stockIds = new Set(state.stockItems.map((row) => String(row.id)));

  // Valida as movimentações da merenda.
  for (const movement of state.foodMovements) {
    if (!foodIds.has(String(movement.itemId))) {
      const error = new Error(
        `Movimentação de merenda ${movement.id} referencia um alimento inexistente.`,
      );

      error.status = 409;
      throw error;
    }
  }

  // Valida as movimentações do almoxarifado.
  for (const movement of state.movements) {
    if (!stockIds.has(String(movement.itemId))) {
      const error = new Error(
        `Movimentação ${movement.id} referencia um item de estoque inexistente.`,
      );

      error.status = 409;
      throw error;
    }
  }
}

// ======================================================
// PERSISTÊNCIA DOS DADOS — FUNÇÃO CORRIGIDA
// ======================================================

/**
 * Compara as coleções e persiste inclusões,
 * atualizações e exclusões no MySQL.
 *
 * As exclusões de alimentos e itens de estoque incluem
 * suas movimentações vinculadas.
 *
 * As chaves estrangeiras permanecem habilitadas.
 */
async function replaceCollections(conn, before, after) {
  // Prepara as exclusões dos registros dependentes.
  prepareRelatedDeletions(before, after);

  // Valida os relacionamentos restantes.
  validateRelationships(after);

  // ====================================================
  // INSERÇÕES E ATUALIZAÇÕES
  // ====================================================

  for (const [name, table, keys] of schema) {
    // Padroniza os IDs para evitar diferenças entre
    // valores numéricos e strings.
    const old = new Map(before[name].map((row) => [String(row.id), row]));

    for (const row of after[name]) {
      const id = String(row.id);
      const previous = old.get(id);

      // Ignora registros que não sofreram alterações.
      if (previous && JSON.stringify(previous) === JSON.stringify(row)) {
        continue;
      }

      const values = keys.map(
        (key) => row[key] ?? (key === "cancelada" ? false : null),
      );

      const updatable = keys.filter((key) => key !== "id");

      // Atualiza registros existentes.
      if (old.has(id)) {
        const updateValues = updatable.map(
          (key) => row[key] ?? (key === "cancelada" ? false : null),
        );

        await conn.execute(
          `UPDATE ${identifier(table)}
           SET ${updatable.map((key) => `${identifier(key)}=?`).join(",")}
           WHERE id=?`,
          [...updateValues, row.id],
        );
      } else {
        // Insere novos registros.
        await conn.execute(
          `INSERT INTO ${identifier(table)}
           (${keys.map(identifier).join(",")})
           VALUES (${keys.map(() => "?").join(",")})`,
          values,
        );
      }
    }
  }

  // ====================================================
  // EXCLUSÕES DEFINITIVAS
  // ====================================================

  /**
   * Executa exclusões na ordem inversa do schema.
   *
   * Dessa forma, as movimentações são removidas
   * antes dos alimentos e itens de estoque.
   */

  for (const [name, table] of schema.slice().reverse()) {
    const keep = new Set(after[name].map((row) => String(row.id)));

    for (const row of before[name]) {
      // Preserva os registros presentes no novo estado.
      if (keep.has(String(row.id))) {
        continue;
      }

      // Exclui definitivamente o registro.
      await conn.execute(
        `DELETE FROM ${identifier(table)}
         WHERE id = ?`,
        [row.id],
      );
    }
  }
}

// ======================================================
// CONSULTAS AO BANCO DE DADOS
// ======================================================

/**
 * Executa consultas sobre um estado consistente
 * do banco de dados.
 */
async function read(callback) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const state = await snapshot(conn);

    await conn.commit();

    return callback(state);
  } catch (error) {
    await conn.rollback();

    throw error;
  } finally {
    conn.release();
  }
}

// ======================================================
// ATUALIZAÇÕES COM TRANSAÇÕES
// ======================================================

/**
 * Serializa as alterações no banco.
 *
 * Em caso de falha, todas as modificações realizadas
 * durante a operação são desfeitas.
 */
function update(callback) {
  const operation = serial.then(async () => {
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Bloqueia os metadados durante a atualização.
      // Evita conflitos entre operações simultâneas.
      await conn.execute(
        `SELECT valor
         FROM sge_meta
         WHERE chave = ?
         FOR UPDATE`,
        ["proximoId"],
      );

      // Obtém o estado anterior.
      const previous = await snapshot(conn);

      // Cria uma cópia independente do estado.
      const next = structuredClone(previous);

      // Executa a operação solicitada pela aplicação.
      const result = await callback(next);

      // Persiste todas as alterações.
      await replaceCollections(conn, previous, next);

      // Atualiza os próximos IDs do sistema.
      await conn.execute(
        `UPDATE sge_meta
         SET valor = ?
         WHERE chave = ?`,
        [JSON.stringify(next.proximoId), "proximoId"],
      );

      // Confirma a transação.
      await conn.commit();

      return result;
    } catch (error) {
      // Desfaz todas as alterações em caso de erro.
      await conn.rollback();

      throw error;
    } finally {
      conn.release();
    }
  });

  // Mantém a fila de operações funcionando após erros.
  serial = operation.catch(() => {});

  return operation;
}

// ======================================================
// GERENCIAMENTO DE SESSÕES
// ======================================================

/**
 * Persiste o hash do token de sessão e sua validade.
 */
async function saveSession(token, userId, expiry) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  // Remove sessões expiradas.
  await pool.execute("DELETE FROM sessoes WHERE expiraEm <= ?", [
    new Date().toISOString(),
  ]);

  // Registra a nova sessão.
  await pool.execute(
    `INSERT INTO sessoes
     (tokenHash, userId, expiraEm)
     VALUES (?, ?, ?)`,
    [hash, userId, new Date(expiry).toISOString()],
  );
}

/**
 * Recupera uma sessão pelo token recebido.
 */
async function findSession(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const [rows] = await pool.execute(
    `SELECT userId, expiraEm
     FROM sessoes
     WHERE tokenHash = ?`,
    [hash],
  );

  return rows[0]
    ? {
        userId: rows[0].userId,
        expiresAt: Date.parse(rows[0].expiraEm),
      }
    : null;
}

/**
 * Invalida uma sessão específica.
 */
async function revokeSession(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  await pool.execute("DELETE FROM sessoes WHERE tokenHash = ?", [hash]);
}

/**
 * Invalida todas as sessões de determinado usuário.
 */
async function revokeUserSessions(userId) {
  await pool.execute("DELETE FROM sessoes WHERE userId = ?", [userId]);
}

// ======================================================
// CONSULTA DE USUÁRIOS
// ======================================================

/**
 * Busca as informações e permissões de um usuário.
 */
async function findUserById(id) {
  const [rows] = await pool.execute(
    `SELECT
       id,
       nome,
       cargo,
       perfil,
       ativo,
       aprovado
     FROM usuarios
     WHERE id = ?`,
    [id],
  );

  return rows[0];
}

// ======================================================
// EXPORTAÇÃO DAS FUNÇÕES
// ======================================================

module.exports = {
  findUserById,
  initStore,
  read,
  update,
  saveSession,
  findSession,
  revokeSession,
  revokeUserSessions,
  schema,
};
