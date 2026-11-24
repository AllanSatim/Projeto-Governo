/**
 * src/equipe/movimentacoes.js — SGE Educação
 * Operações de entrada e saída de materiais com validação de saldo.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const { arredondar } = require("../relatorios");
const {
  podeCancelar,
  exigirPermissaoCancelamento,
  marcarCancelamento,
} = require("../permissoes-operacoes");

const router = express.Router();

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (req, res) => {
    res.json(
      await read((data) =>
        data.movements
          .slice()
          .sort((a, b) => b.data.localeCompare(a.data))
          .map((row) => ({
            ...row,
            podeExcluir: podeCancelar(row, data.movements, req.user),
          })),
      ),
    );
  }),
);

// Endpoint POST /: autenticação e validação acontecem na camada de rotas.
router.post(
  "/",
  rota(async (req, res) => {
    const { tipo, destino } = req.body;
    const itemId = Number(req.body.itemId);
    const quantidade = Number(req.body.quantidade);
    const custoUnitario = Number(req.body.custoUnitario);
    if (!["entrada", "saida"].includes(tipo))
      throw new ApiError(400, "Tipo de movimentação inválido.");
    if (
      !Number.isInteger(itemId) ||
      !Number.isFinite(quantidade) ||
      quantidade <= 0
    )
      throw new ApiError(
        400,
        "Selecione um item e informe uma quantidade válida.",
      );
    if (!Number.isFinite(custoUnitario) || custoUnitario < 0)
      throw new ApiError(400, "Custo unitário inválido.");
    if (!String(destino || "").trim())
      throw new ApiError(400, "Destino/origem é obrigatório.");
    const movement = await update((data) => {
      const item = data.stockItems.find((current) => current.id === itemId);
      if (!item) throw new ApiError(404, "Item de estoque não encontrado.");
      if (tipo === "saida" && quantidade > item.quantidade)
        throw new ApiError(
          400,
          `Saldo insuficiente. Disponível: ${item.quantidade} ${item.unidade}.`,
        );
      const precoAnterior = item.custoUnitario;
      if (tipo === "entrada") {
        const currentValue = item.quantidade * item.custoUnitario;
        item.quantidade += quantidade;
        item.custoUnitario = item.quantidade
          ? arredondar(
              (currentValue + quantidade * custoUnitario) / item.quantidade,
            )
          : custoUnitario;
      } else {
        item.quantidade = arredondar(item.quantidade - quantidade);
      }
      const saved = {
        id: nextId(data, "movements"),
        itemId: item.id,
        itemNome: item.nome,
        tipo,
        quantidade,
        custoUnitario,
        custoTotal: arredondar(quantidade * custoUnitario),
        destino: String(destino).trim(),
        notaFiscal: String(req.body.notaFiscal || "").trim(),
        responsavel: req.user.nome,
        usuarioId: req.user.id,
        cancelada: false,
        custoUnitarioAnterior: precoAnterior,
        observacao: String(req.body.observacao || "").trim(),
        data: new Date().toISOString(),
      };
      data.movements.unshift(saved);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `${tipo === "entrada" ? "Entrada" : "Saída"}: ${saved.itemNome} (${quantidade})`,
        modulo: "Estoque",
        data: saved.data,
      });
      return saved;
    });
    res.status(201).json(movement);
  }),
);

/** Cancela uma movimentação autorizada e desfaz o efeito no saldo. */
router.delete(
  "/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      throw new ApiError(400, "Identificador inválido.");
    const resultado = await update((data) => {
      const mov = data.movements.find((row) => row.id === id);
      if (!mov) throw new ApiError(404, "Movimentação não encontrada.");
      exigirPermissaoCancelamento(mov, data.movements, req.user);
      const item = data.stockItems.find((row) => row.id === mov.itemId);
      if (!item) throw new ApiError(409, "Produto vinculado não encontrado.");
      const quantidade = Number(mov.quantidade);
      if (mov.tipo === "entrada") {
        if (Number(item.quantidade) < quantidade)
          throw new ApiError(
            409,
            "Saldo insuficiente para desfazer a entrada.",
          );
        // Uma entrada histórica de carga fictícia só pode ser estornada sem
        // preço anterior se ela representar TODO o saldo e não houver outras
        // movimentações ativas. Nunca presumir esse cenário em lançamentos reais.
        const inicialDemo =
          (mov.notaFiscal === `DEMO-CARGA-${mov.id}` ||
            /^DEMO-00[1-4]$/.test(mov.notaFiscal || "")) &&
          /demonstração|fictícia para apresentação/i.test(
            String(mov.observacao || ""),
          ) &&
          Number(item.quantidade) === quantidade &&
          !data.movements.some(
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
        item.quantidade = arredondar(Number(item.quantidade) - quantidade);
        item.custoUnitario =
          mov.custoUnitarioAnterior == null
            ? 0
            : Number(mov.custoUnitarioAnterior);
      } else if (mov.tipo === "saida") {
        item.quantidade = arredondar(Number(item.quantidade) + quantidade);
      } else throw new ApiError(409, "Tipo de movimentação desconhecido.");
      marcarCancelamento(mov, req.user, req.body?.motivo);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Cancelamento da movimentação de estoque #${id}: ${mov.itemNome} (${quantidade} ${item.unidade})`,
        modulo: "Estoque",
        data: mov.canceladaEm,
      });
      return mov;
    });
    res.json(resultado);
  }),
);

module.exports = router;
