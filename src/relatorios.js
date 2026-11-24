/**
 * src/relatorios.js — SGE Educação
 * Cálculos de custo e agregações usados pelos painéis financeiros e relatórios.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const arredondar = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Calcula os totais e indicadores a partir de saldos e movimentações. */
function consolidar(data, inicio, fim) {
  const itens = data.stockItems;
  const merenda = data.foods;
  const materiaisValor = itens.reduce(
    (total, item) => total + item.quantidade * item.custoUnitario,
    0,
  );
  const merendaValor = merenda.reduce(
    (total, item) => total + item.quantidade * item.custoUnitario,
    0,
  );
  // O extrato normaliza as entradas e saídas de ambos os estoques. Não
  // contabilizar uma reposição de merenda como saída nem duplicar cadastro.
  const movimentos = extrato(data).filter(
    (item) =>
      (!inicio || item.data.slice(0, 10) >= inicio) &&
      (!fim || item.data.slice(0, 10) <= fim),
  );
  const entradas = movimentos
    .filter((item) => item.tipo === "entrada")
    .reduce((total, item) => total + Number(item.custoTotal), 0);
  const saidas = movimentos
    .filter((item) => item.tipo === "saida")
    .reduce((total, item) => total + Number(item.custoTotal), 0);
  const porCategoria = new Map();
  for (const item of itens) {
    const category = porCategoria.get(item.categoria) || {
      categoria: item.categoria,
      quantidade: 0,
      valor: 0,
    };
    category.quantidade += item.quantidade;
    category.valor += item.quantidade * item.custoUnitario;
    porCategoria.set(item.categoria, category);
  }
  for (const item of merenda) {
    const category = porCategoria.get(item.categoria) || {
      categoria: item.categoria,
      quantidade: 0,
      valor: 0,
    };
    category.quantidade += item.quantidade;
    category.valor += item.quantidade * item.custoUnitario;
    porCategoria.set(item.categoria, category);
  }
  const critical = itens
    .filter((item) => item.quantidade <= item.minimo)
    .map((item) => ({
      ...item,
      reposicaoEstimada: arredondar(
        Math.max(item.minimo - item.quantidade, 0) * item.custoUnitario,
      ),
    }));
  return {
    materiaisValor: arredondar(materiaisValor),
    merendaValor: arredondar(merendaValor),
    estoqueValor: arredondar(materiaisValor + merendaValor),
    entradasValor: arredondar(entradas),
    saidasValor: arredondar(saidas),
    porCategoria: [...porCategoria.values()].map((item) => ({
      ...item,
      valor: arredondar(item.valor),
    })),
    critical,
  };
}

/** Monta o extrato financeiro a partir dos registros de entrada e saída. */
function extrato(data) {
  const comidaMovs = data.foodMovements || [];
  // As cargas antigas não tinham histórico de recebimento. Somente nesses casos
  // criar uma linha de legado sem atribuir falsamente a ação a um funcionário.
  const itensComEntrada = new Set(
    comidaMovs.filter((row) => row.tipo === "entrada").map((row) => row.itemId),
  );
  const entries = [
    ...data.movements
      .filter((row) => !row.cancelada)
      .map((item) => ({
        id: `m-${item.id}`,
        data: item.data,
        modulo: "Materiais",
        item: item.itemNome,
        tipo: item.tipo,
        quantidade: item.quantidade,
        custoUnitario: item.custoUnitario,
        custoTotal: item.custoTotal,
        origemDestino: item.destino,
        responsavel: item.responsavel || "Histórico não identificado",
      })),
    ...comidaMovs
      .filter((row) => !row.cancelada)
      .map((item) => ({
        id: `fm-${item.id}`,
        data: item.data,
        modulo: "Merenda",
        item: item.itemNome,
        tipo: item.tipo,
        quantidade: item.quantidade,
        custoUnitario: item.custoUnitario,
        custoTotal: item.custoTotal,
        origemDestino: item.destino,
        responsavel: item.responsavel || "Histórico não identificado",
      })),
    ...data.foods
      .filter((item) => !itensComEntrada.has(item.id))
      .map((item) => ({
        id: `legado-${item.id}`,
        data: `${item.dataEntrada}T12:00:00.000Z`,
        modulo: "Merenda",
        item: item.nome,
        tipo: "entrada",
        quantidade: item.quantidadeInicial ?? item.quantidade,
        custoUnitario: item.custoUnitario,
        custoTotal: arredondar(
          (item.quantidadeInicial ?? item.quantidade) * item.custoUnitario,
        ),
        origemDestino: item.fornecedor || "Registro anterior",
        responsavel: "Histórico anterior sem responsável identificado",
      })),
  ];
  return entries.sort((a, b) => b.data.localeCompare(a.data));
}

module.exports = { arredondar, consolidar, extrato };
