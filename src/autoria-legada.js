/**
 * Reconciliação segura de autoria para cadastros anteriores à V4.
 * Não trata um texto livre de responsável como identidade autenticada.
 * Somente os lotes demonstrativos conhecidos, com marcadores verificáveis,
 * podem ser vinculados automaticamente; os demais exigem conferência admin.
 */
const { ApiError } = require("./erro");

const demoNames = {
  secretaria01: "Mariana Costa",
  secretaria02: "Rafael Almeida",
  secretaria03: "Fernanda Ribeiro",
  secretaria04: "Carlos Martins",
  secretaria05: "Juliana Barbosa",
  almox01: "Patricia Oliveira",
  almox02: "Lucas Ferreira",
  almox03: "Beatriz Santos",
  almox04: "Gustavo Lima",
  almox05: "Camila Rodrigues",
};
const foodLogins = [
  "secretaria01",
  "almox01",
  "secretaria02",
  "almox02",
  "secretaria03",
  "almox03",
  "secretaria04",
  "almox04",
  "secretaria05",
  "almox05",
];

/** Localiza somente uma conta que corresponda ao login e nome da carga original. */
function contaDeDemonstracao(data, login) {
  const candidates = (data.users || []).filter(
    (user) => user.usuario === login && user.nome === demoNames[login],
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/** Reconhece lotes conhecidos da instalação: não altera saldos, datas ou preços. */
function reconciliarCargasConhecidas(data) {
  let alterados = 0;
  const admin = (data.users || []).find(
    (u) => u.usuario === "admin" && u.nome === "Administrador do Sistema",
  );
  const mariana = contaDeDemonstracao(data, "secretaria01");
  const stockById = new Map(data.stockItems.map((x) => [Number(x.id), x]));
  const foodById = new Map(data.foods.map((x) => [Number(x.id), x]));

  for (const mov of data.movements) {
    const id = Number(mov.id);
    let owner = null;
    const item = stockById.get(Number(mov.itemId));
    if (
      mariana &&
      id >= 1001 &&
      id <= 1025 &&
      Number(mov.itemId) === id &&
      mov.notaFiscal === `DEMO-CARGA-${id}` &&
      mov.responsavel === mariana.nome &&
      String(mov.observacao || "").includes(
        "Movimentação fictícia para apresentação",
      )
    )
      owner = mariana;
    // A carga interna inicial é reconhecida por nomes, notas e IDs exatos.
    if (
      admin &&
      id >= 1 &&
      id <= 5 &&
      Number(mov.itemId) ===
        (id === 3 ? 2 : id === 4 ? 3 : id === 5 ? 4 : id) &&
      mov.responsavel === admin.nome &&
      ["DEMO-001", "DEMO-002", "", "DEMO-003", "DEMO-004"][id - 1] ===
        mov.notaFiscal &&
      String(mov.observacao || "").includes("demonstração")
    )
      owner = admin;
    if (!owner || !item) continue;
    if (mov.usuarioId == null) {
      mov.usuarioId = owner.id;
      alterados++;
    }
    if (
      item.cadastradoPorId == null &&
      (!item.cadastradoPor || item.cadastradoPor === owner.nome) &&
      ((owner === mariana && id >= 1001) || owner === admin)
    ) {
      item.cadastradoPorId = owner.id;
      if (!item.cadastradoPor) item.cadastradoPor = owner.nome;
      alterados++;
    }
  }

  for (const mov of data.foodMovements) {
    const id = Number(mov.id),
      foodId = Number(mov.itemId);
    if (id < 62001 || id > 62045 || id - foodId !== 10000) continue;
    const food = foodById.get(foodId);
    const owner = contaDeDemonstracao(data, foodLogins[(foodId - 52001) % 10]);
    if (
      !food ||
      !owner ||
      mov.responsavel !== owner.nome ||
      mov.tipo !== "entrada" ||
      mov.destino !== "Inventário inicial demonstrativo" ||
      !String(mov.observacao || "").includes("ENTRADA FICTÍCIA") ||
      !String(food.fornecedor || "").includes("demonstrativo")
    )
      continue;
    if (mov.usuarioId == null) {
      mov.usuarioId = owner.id;
      alterados++;
    }
    if (
      food.cadastradoPorId == null &&
      (!food.cadastradoPor || food.cadastradoPor === owner.nome)
    ) {
      food.cadastradoPorId = owner.id;
      if (!food.cadastradoPor) food.cadastradoPor = owner.nome;
      alterados++;
    }
  }
  return alterados;
}

const TIPOS = Object.freeze({
  item: {
    collection: "stockItems",
    ownerField: "cadastradoPorId",
    textField: "cadastradoPor",
    label: "Cadastro de material",
  },
  movimento: {
    collection: "movements",
    ownerField: "usuarioId",
    textField: "responsavel",
    label: "Movimentação de material",
  },
  alimento: {
    collection: "foods",
    ownerField: "cadastradoPorId",
    textField: "cadastradoPor",
    label: "Cadastro de alimento",
  },
  merenda: {
    collection: "foodMovements",
    ownerField: "usuarioId",
    textField: "responsavel",
    label: "Movimentação de merenda",
  },
});

/** Apresenta registros sem autor confirmado ao administrador. */
function listarPendentes(data, limite = 300) {
  const registros = [];
  const total = {};
  for (const [tipo, spec] of Object.entries(TIPOS)) {
    const pendentes = data[spec.collection].filter(
      (x) => x[spec.ownerField] == null,
    );
    total[tipo] = pendentes.length;
    for (const row of pendentes.slice(
      0,
      Math.max(0, limite - registros.length),
    )) {
      registros.push({
        tipo,
        id: row.id,
        nome: row.nome || row.itemNome || "Sem descrição",
        responsavelAnterior: row[spec.textField] || "Não informado",
        observacao: String(row.observacao || "").slice(0, 180),
        cancelada: Boolean(row.cancelada),
      });
    }
  }
  return {
    registros,
    totais: total,
    total: Object.values(total).reduce((a, b) => a + b, 0),
  };
}

/** A atribuição administrativa permite a operação à conta correta e guarda uma trilha de auditoria. */
function vincularRegistro(
  data,
  { tipo, id, usuarioId, justificativa, administrador },
) {
  if (administrador?.perfil !== "admin")
    throw new ApiError(
      403,
      "Somente administradores podem atribuir autoria histórica.",
    );
  const spec = Object.prototype.hasOwnProperty.call(TIPOS, tipo)
    ? TIPOS[tipo]
    : null;
  if (
    !spec ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) <= 0 ||
    !Number.isSafeInteger(Number(usuarioId)) ||
    Number(usuarioId) <= 0
  )
    throw new ApiError(400, "Registro ou usuário inválido.");
  const motivo = String(justificativa || "").trim();
  if (motivo.length < 12 || motivo.length > 200)
    throw new ApiError(
      400,
      "Informe uma justificativa entre 12 e 200 caracteres.",
    );
  const user = data.users.find((x) => Number(x.id) === Number(usuarioId));
  if (!user) throw new ApiError(404, "Usuário indicado não encontrado.");
  const row = data[spec.collection].find((x) => Number(x.id) === Number(id));
  if (!row) throw new ApiError(404, "Registro antigo não encontrado.");
  if (row[spec.ownerField] != null)
    throw new ApiError(
      409,
      "O registro já tem autoria vinculada e não pode ser transferido por esta função.",
    );
  if (row.cancelada)
    throw new ApiError(
      409,
      "Movimentação já cancelada não pode receber autorização para exclusão.",
    );
  row[spec.ownerField] = user.id;
  // Preserva o nome original para não reescrever uma operação histórica.
  if (!row[spec.textField]) row[spec.textField] = user.nome;
  const logId =
    Number(data.proximoId.log) ||
    Math.max(0, ...data.logs.map((x) => Number(x.id) || 0)) + 1;
  data.proximoId.log = logId + 1;
  data.logs.unshift({
    id: logId,
    usuario: administrador.nome,
    operacao:
      `Autoria legada vinculada: ${spec.label} #${row.id} -> ${user.usuario} (#${user.id}). Motivo: ${motivo}`.slice(
        0,
        255,
      ),
    modulo: "Administração",
    data: new Date().toISOString(),
  });
  return { tipo, id: row.id, usuarioId: user.id, nomeUsuario: user.nome };
}

module.exports = {
  reconciliarCargasConhecidas,
  listarPendentes,
  vincularRegistro,
};
