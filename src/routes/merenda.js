/**
 * src/routes/merenda.js — SGE Educação
 * Rotas de merenda: alimentos, reposições, consumo e exportações.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const { arredondar } = require("../relatorios");
const {
  pertenceCadastro,
  podeCancelar,
  exigirPermissaoCancelamento,
  marcarCancelamento,
} = require("../permissoes-operacoes");

const router = express.Router();
const CATEGORIAS = [
  "graos",
  "hortifruti",
  "laticinios",
  "proteinas",
  "perecivel",
  "naoperecivel",
  "bebidas",
];
const UNIDADES = ["kg", "litros", "unidades", "caixas", "pacotes"];
/** Converte um item de merenda para o formato utilizado na API. */
const formatar = (food) => ({
  ...food,
  minimo: Number(food.minimo || 0),
  valorTotal:
    Math.round(Number(food.quantidade) * Number(food.custoUnitario) * 100) /
    100,
});
/** Valida uma data informada no cadastro. */
const dataValida = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (req, res) => {
    res.json(
      await read((data) =>
        data.foods
          .slice()
          .sort(
            (a, b) => b.dataEntrada.localeCompare(a.dataEntrada) || b.id - a.id,
          )
          .map((food) => {
            const latest = data.foodMovements
              .filter((row) => row.itemId === food.id && !row.cancelada)
              .sort((a, b) => b.data.localeCompare(a.data))[0];
            return {
              ...formatar(food),
              ultimoResponsavel:
                latest?.responsavel ||
                food.cadastradoPor ||
                "Histórico não identificado",
              ultimaMovimentacao: latest?.data || null,
              podeExcluir: pertenceCadastro(food, req.user),
            };
          }),
      ),
    );
  }),
);

// Endpoint POST /: autenticação e validação acontecem na camada de rotas.
router.post(
  "/",
  rota(async (req, res) => {
    const {
      nome,
      categoria,
      quantidade,
      unidade,
      custoUnitario,
      dataEntrada,
      fornecedor,
    } = req.body;
    const qty = Number(quantidade);
    const minimo = req.body.minimo === undefined ? 0 : Number(req.body.minimo);
    const cost = Number(custoUnitario);
    if (!String(nome || "").trim())
      throw new ApiError(400, "Nome do alimento é obrigatório.");
    if (!CATEGORIAS.includes(categoria))
      throw new ApiError(400, "Categoria inválida.");
    if (!UNIDADES.includes(unidade))
      throw new ApiError(400, "Unidade inválida.");
    if (!Number.isFinite(qty) || qty <= 0)
      throw new ApiError(400, "Quantidade deve ser maior que zero.");
    if (!Number.isFinite(minimo) || minimo < 0)
      throw new ApiError(400, "Estoque mínimo inválido.");
    if (!Number.isFinite(cost) || cost < 0)
      throw new ApiError(400, "Custo unitário não pode ser negativo.");
    if (!dataValida(dataEntrada))
      throw new ApiError(400, "Data de entrada inválida.");
    const food = await update((data) => {
      const item = {
        id: nextId(data, "foods"),
        nome: String(nome).trim(),
        categoria,
        quantidade: qty,
        minimo,
        quantidadeInicial: qty,
        unidade,
        custoUnitario: cost,
        dataEntrada,
        fornecedor: String(fornecedor || "").trim(),
        cadastradoPor: req.user.nome,
        cadastradoPorId: req.user.id,
      };
      data.foods.push(item);
      // Todo recebimento inicial gera um lançamento auditável, inclusive quando
      // o produto é cadastrado diretamente pela tela Merenda.
      const agora = new Date().toISOString();
      data.foodMovements.unshift({
        id: nextId(data, "foodMovements"),
        itemId: item.id,
        itemNome: item.nome,
        tipo: "entrada",
        quantidade: qty,
        custoUnitario: cost,
        custoTotal: arredondar(qty * cost),
        destino: item.fornecedor || "Saldo inicial",
        responsavel: req.user.nome,
        usuarioId: req.user.id,
        cancelada: false,
        custoUnitarioAnterior: cost,
        observacao: "Cadastro e entrada inicial de merenda",
        data: agora,
      });
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Recebimento de merenda: ${item.nome}`,
        modulo: "Merenda",
        data: new Date().toISOString(),
      });
      return item;
    });
    res.status(201).json(formatar(food));
  }),
);

// Endpoint PATCH /:id/minimo: autenticação e validação acontecem na camada de rotas.
router.patch(
  "/:id/minimo",
  rota(async (req, res) => {
    const minimo = Number(req.body.minimo);
    if (!Number.isFinite(minimo) || minimo < 0)
      throw new ApiError(400, "Estoque mínimo inválido.");
    const food = await update((data) => {
      const item = data.foods.find((row) => row.id === Number(req.params.id));
      if (!item) throw new ApiError(404, "Alimento não encontrado.");
      item.minimo = minimo;
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Atualização do estoque mínimo de merenda: ${item.nome}`,
        modulo: "Merenda",
        data: new Date().toISOString(),
      });
      return item;
    });
    res.json(formatar(food));
  }),
);

// Reposição de alimento existente: registra entrada e atualiza o saldo em uma operação.
// Endpoint POST /:id/entrada: autenticação e validação acontecem na camada de rotas.
router.post(
  "/:id/entrada",
  rota(async (req, res) => {
    const quantidade = Number(req.body.quantidade);
    const novoCusto =
      req.body.custoUnitario === undefined || req.body.custoUnitario === ""
        ? null
        : Number(req.body.custoUnitario);
    if (!Number.isFinite(quantidade) || quantidade <= 0)
      throw new ApiError(400, "Quantidade de entrada inválida.");
    if (novoCusto !== null && (!Number.isFinite(novoCusto) || novoCusto < 0))
      throw new ApiError(400, "Custo unitário inválido.");
    const entry = await update((data) => {
      const food = data.foods.find((item) => item.id === Number(req.params.id));
      if (!food) throw new ApiError(404, "Alimento não encontrado.");
      const precoAnterior = food.custoUnitario;
      if (novoCusto !== null) food.custoUnitario = novoCusto;
      food.quantidade = arredondar(food.quantidade + quantidade);
      food.quantidadeInicial = arredondar(
        (food.quantidadeInicial ?? 0) + quantidade,
      );
      const item = {
        id: nextId(data, "foodMovements"),
        itemId: food.id,
        itemNome: food.nome,
        tipo: "entrada",
        quantidade,
        custoUnitario: food.custoUnitario,
        custoTotal: arredondar(quantidade * food.custoUnitario),
        destino: String(req.body.fornecedor || "Reposição de estoque").trim(),
        responsavel: req.user.nome,
        usuarioId: req.user.id,
        cancelada: false,
        custoUnitarioAnterior: precoAnterior,
        observacao: String(req.body.observacao || "").trim(),
        data: new Date().toISOString(),
      };
      data.foodMovements.unshift(item);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Reposição de merenda: ${food.nome} (${quantidade} ${food.unidade})`,
        modulo: "Merenda",
        data: item.data,
      });
      return item;
    });
    res.status(201).json(entry);
  }),
);

// Endpoint DELETE /:id: autenticação e validação acontecem na camada de rotas.
router.delete(
  "/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    const removed = await update((data) => {
      const index = data.foods.findIndex((item) => item.id === id);
      if (index < 0) throw new ApiError(404, "Alimento não encontrado.");
      if (!pertenceCadastro(data.foods[index], req.user))
        throw new ApiError(
          403,
          "Somente o autor do cadastro ou um administrador pode excluí-lo.",
        );
      const removed = data.foods.splice(index, 1)[0];
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Exclusão direta de alimento de merenda #${id}: ${removed.nome}`,
        modulo: "Merenda",
        data: new Date().toISOString(),
      });
      return removed;
    });
    res.status(204).end();
  }),
);

// Endpoint GET /consumos: autenticação e validação acontecem na camada de rotas.
router.get(
  "/consumos",
  rota(async (req, res) => {
    res.json(
      await read((data) =>
        data.foodMovements
          .slice()
          .sort((a, b) => b.data.localeCompare(a.data))
          .map((row) => ({
            ...row,
            podeExcluir:
              data.foods.some((food) => food.id === row.itemId) &&
              podeCancelar(row, data.foodMovements, req.user),
          })),
      ),
    );
  }),
);

/** Somente o autor autenticado cancela a última movimentação ativa do produto. */
router.delete(
  "/consumos/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      throw new ApiError(400, "Identificador inválido.");
    const resultado = await update((data) => {
      const mov = data.foodMovements.find((row) => row.id === id);
      if (!mov) throw new ApiError(404, "Movimentação não encontrada.");
      exigirPermissaoCancelamento(mov, data.foodMovements, req.user);
      const food = data.foods.find((row) => row.id === mov.itemId);
      if (!food) throw new ApiError(409, "Alimento vinculado não encontrado.");
      const qty = Number(mov.quantidade);
      if (mov.tipo === "entrada") {
        if (
          Number(food.quantidade) < qty ||
          Number(food.quantidadeInicial) < qty
        ) {
          throw new ApiError(
            409,
            "Não é possível cancelar esta entrada: saldo ou histórico de entradas insuficiente.",
          );
        }
        // Só desfazemos uma reposição antiga quando conhecemos o custo anterior.
        // Reverte carga inicial fictícia sem preço prévio somente quando
        // o produto não possui qualquer outra operação ativa e a remoção zera
        // o estoque. Lançamentos reais sem custo anterior seguem bloqueados.
        const inicialDemo =
          String(mov.observacao || "").includes("ENTRADA FICTÍCIA") &&
          mov.destino === "Inventário inicial demonstrativo" &&
          Number(food.quantidade) === qty &&
          Number(food.quantidadeInicial) === qty &&
          !data.foodMovements.some(
            (other) =>
              other.id !== mov.id &&
              other.itemId === mov.itemId &&
              !other.cancelada,
          );
        if (mov.custoUnitarioAnterior == null && !inicialDemo) {
          throw new ApiError(
            409,
            "Entrada antiga sem custo anterior. Solicite um ajuste auditado.",
          );
        }
        food.quantidade = arredondar(Number(food.quantidade) - qty);
        food.quantidadeInicial = arredondar(
          Number(food.quantidadeInicial) - qty,
        );
        food.custoUnitario =
          mov.custoUnitarioAnterior == null
            ? 0
            : Number(mov.custoUnitarioAnterior);
      } else if (mov.tipo === "saida") {
        food.quantidade = arredondar(Number(food.quantidade) + qty);
      } else throw new ApiError(409, "Tipo de movimentação desconhecido.");
      marcarCancelamento(mov, req.user, req.body?.motivo);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Cancelamento da movimentação de merenda #${id}: ${mov.itemNome} (${qty} ${food.unidade})`,
        modulo: "Merenda",
        data: mov.canceladaEm,
      });
      return mov;
    });
    res.json(resultado);
  }),
);

// Endpoint POST /:id/consumo: autenticação e validação acontecem na camada de rotas.
router.post(
  "/:id/consumo",
  rota(async (req, res) => {
    const quantidade = Number(req.body.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0)
      throw new ApiError(400, "Quantidade consumida inválida.");
    if (!String(req.body.destino || "").trim())
      throw new ApiError(400, "Informe a escola ou destino do consumo.");
    const movement = await update((data) => {
      const food = data.foods.find((item) => item.id === Number(req.params.id));
      if (!food) throw new ApiError(404, "Alimento não encontrado.");
      if (quantidade > food.quantidade)
        throw new ApiError(
          409,
          `Saldo insuficiente: ${food.quantidade} ${food.unidade}.`,
        );
      food.quantidade = arredondar(food.quantidade - quantidade);
      const item = {
        id: nextId(data, "foodMovements"),
        itemId: food.id,
        itemNome: food.nome,
        tipo: "saida",
        quantidade,
        custoUnitario: food.custoUnitario,
        custoTotal: arredondar(quantidade * food.custoUnitario),
        destino: String(req.body.destino).trim(),
        responsavel: req.user.nome,
        usuarioId: req.user.id,
        cancelada: false,
        observacao: String(req.body.observacao || "").trim(),
        data: new Date().toISOString(),
      };
      data.foodMovements.unshift(item);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Consumo de merenda: ${food.nome} (${quantidade} ${food.unidade})`,
        modulo: "Merenda",
        data: item.data,
      });
      return item;
    });
    res.status(201).json(movement);
  }),
);

// Endpoint GET /resumo: autenticação e validação acontecem na camada de rotas.
router.get(
  "/resumo",
  rota(async (_req, res) => {
    res.json(
      await read((data) => ({
        totalRegistros: data.foods.length,
        valorTotal:
          Math.round(
            data.foods.reduce(
              (sum, item) => sum + item.quantidade * item.custoUnitario,
              0,
            ) * 100,
          ) / 100,
      })),
    );
  }),
);

// Endpoint GET /exportar-csv: autenticação e validação acontecem na camada de rotas.
router.get(
  "/exportar-csv",
  rota(async (_req, res) => {
    const rows = await read((data) => data.foods.map(formatar));
    /** Isola a responsabilidade csv para manter a lógica reutilizável e testável. */
    const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = [
      "Alimento;Categoria;Quantidade;Unidade;Custo Unitário;Valor Total;Data de Entrada;Fornecedor",
    ];
    for (const item of rows) {
      body.push(
        [
          csv(item.nome),
          item.categoria,
          item.quantidade,
          item.unidade,
          item.custoUnitario,
          item.valorTotal,
          item.dataEntrada,
          csv(item.fornecedor),
        ].join(";"),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=merenda.csv");
    res.send(`\uFEFF${body.join("\n")}\n`);
  }),
);

module.exports = router;
