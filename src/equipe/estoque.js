/**
 * src/equipe/estoque.js — SGE Educação
 * Cadastros e manutenção de materiais do almoxarifado.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const { arredondar } = require("../relatorios");
const { pertenceCadastro } = require("../permissoes-operacoes");

const router = express.Router();
const CATEGORIAS = ["livros", "uniformes", "materiais", "outros"];
const UNIDADES = ["unidades", "caixas", "pacotes", "kg", "litros"];

// Endpoint GET /: autenticação e validação acontecem na camada de rotas.
router.get(
  "/",
  rota(async (req, res) => {
    res.json(
      await read((data) =>
        data.stockItems
          .slice()
          .map((item) => {
            const latest = data.movements
              .filter((row) => row.itemId === item.id && !row.cancelada)
              .sort((a, b) => b.data.localeCompare(a.data))[0];
            return {
              ...item,
              ultimoResponsavel:
                latest?.responsavel ||
                item.cadastradoPor ||
                "Histórico não identificado",
              ultimaMovimentacao: latest?.data || null,
              podeExcluir: pertenceCadastro(item, req.user),
            };
          })
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      ),
    );
  }),
);

// Endpoint POST /: autenticação e validação acontecem na camada de rotas.
router.post(
  "/",
  rota(async (req, res) => {
    const { nome, categoria, unidade = "unidades" } = req.body;
    const quantidade = Number(req.body.quantidade);
    const minimo = Number(req.body.minimo);
    const custoUnitario = Number(req.body.custoUnitario);
    if (!String(nome || "").trim())
      throw new ApiError(400, "Nome do item é obrigatório.");
    if (!CATEGORIAS.includes(categoria))
      throw new ApiError(400, "Categoria inválida.");
    if (!UNIDADES.includes(unidade))
      throw new ApiError(400, "Unidade inválida.");
    if (
      !Number.isFinite(quantidade) ||
      quantidade < 0 ||
      !Number.isFinite(minimo) ||
      minimo < 0
    ) {
      throw new ApiError(
        400,
        "Quantidade e estoque mínimo devem ser zero ou maiores.",
      );
    }
    if (!Number.isFinite(custoUnitario) || custoUnitario < 0)
      throw new ApiError(400, "Custo unitário inválido.");
    const item = await update((data) => {
      if (
        data.stockItems.some(
          (current) =>
            current.nome.toLowerCase() === String(nome).trim().toLowerCase(),
        )
      ) {
        throw new ApiError(409, "Já existe um item com esse nome.");
      }
      const novo = {
        id: nextId(data, "stockItems"),
        nome: String(nome).trim(),
        categoria,
        unidade,
        quantidade,
        minimo,
        custoUnitario,
        cadastradoPor: req.user.nome,
        cadastradoPorId: req.user.id,
      };
      data.stockItems.push(novo);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Cadastro de estoque: ${novo.nome}`,
        modulo: "Estoque",
        data: new Date().toISOString(),
      });
      if (quantidade > 0) {
        data.movements.unshift({
          id: nextId(data, "movements"),
          itemId: novo.id,
          itemNome: novo.nome,
          tipo: "entrada",
          quantidade,
          custoUnitario,
          custoTotal: arredondar(quantidade * custoUnitario),
          destino: "Saldo inicial",
          notaFiscal: "",
          responsavel: req.user.nome,
          usuarioId: req.user.id,
          cancelada: false,
          custoUnitarioAnterior: custoUnitario,
          observacao: "Saldo inicial do item",
          data: new Date().toISOString(),
        });
      }
      return novo;
    });
    res.status(201).json(item);
  }),
);

// Endpoint PUT /:id: autenticação e validação acontecem na camada de rotas.
router.put(
  "/:id",
  rota(async (req, res) => {
    const { nome, categoria, unidade } = req.body;
    const minimo = Number(req.body.minimo);
    const id = Number(req.params.id);
    if (!String(nome || "").trim())
      throw new ApiError(400, "Nome do item é obrigatório.");
    if (!CATEGORIAS.includes(categoria) || !UNIDADES.includes(unidade))
      throw new ApiError(400, "Categoria ou unidade inválida.");
    if (!Number.isFinite(minimo) || minimo < 0)
      throw new ApiError(400, "Estoque mínimo inválido.");
    const item = await update((data) => {
      const target = data.stockItems.find((current) => current.id === id);
      if (!target) throw new ApiError(404, "Item não encontrado.");
      if (
        data.stockItems.some(
          (current) =>
            current.id !== id &&
            current.nome.toLowerCase() === String(nome).trim().toLowerCase(),
        )
      ) {
        throw new ApiError(409, "Já existe um item com esse nome.");
      }
      target.nome = String(nome).trim();
      target.categoria = categoria;
      target.unidade = unidade;
      target.minimo = minimo;
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Atualização de item #${id}`,
        modulo: "Estoque",
        data: new Date().toISOString(),
      });
      return target;
    });
    res.json(item);
  }),
);

// Endpoint DELETE /:id: autenticação e validação acontecem na camada de rotas.
router.delete(
  "/:id",
  rota(async (req, res) => {
    const id = Number(req.params.id);
    await update((data) => {
      const index = data.stockItems.findIndex((item) => item.id === id);
      if (index < 0) throw new ApiError(404, "Item não encontrado.");
      if (!pertenceCadastro(data.stockItems[index], req.user))
        throw new ApiError(
          403,
          "Somente o autor do cadastro ou um administrador pode excluí-lo.",
        );
      if (Number(data.stockItems[index].quantidade) !== 0)
        throw new ApiError(
          409,
          "Zere o saldo por movimentação antes de excluir o item.",
        );
      if (data.movements.some((movement) => movement.itemId === id))
        throw new ApiError(
          409,
          "Não é possível excluir um item com histórico de movimentações.",
        );
      data.stockItems.splice(index, 1);
      data.logs.unshift({
        id: nextId(data, "logs"),
        usuario: req.user.nome,
        operacao: `Exclusão de item #${id}`,
        modulo: "Estoque",
        data: new Date().toISOString(),
      });
    });
    res.status(204).end();
  }),
);

module.exports = router;
