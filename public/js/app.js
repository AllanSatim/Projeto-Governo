/**
 * public/js/app.js — SGE Educação
 * Controlador principal do navegador: autenticação, painéis, estoque, merenda, relatórios, perfil e suporte. Mantém os IDs públicos das páginas e consome a API REST.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
(() => {
  /** Obtém o primeiro elemento correspondente a um seletor CSS. */
  const $ = (selector) => document.querySelector(selector);
  /** Obtém um elemento pelo ID sem utilizar seletores dinâmicos. */
  const byId = (id) => document.getElementById(id);
  /** Recupera a conta salva na sessão sem lançar erro quando não houver JSON válido. */
  let user = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("sgeUser") ||
          sessionStorage.getItem("sgeUser") ||
          "null",
      );
    } catch {
      return null;
    }
  })();
  const token =
    localStorage.getItem("sgeToken") || sessionStorage.getItem("sgeToken");
  const authStorage = localStorage.getItem("sgeToken")
    ? localStorage
    : sessionStorage;
  const page = location.pathname.split("/").pop().toLowerCase();
  const authPages = ["login.html", "cadastro.html", "esqueceu-senha.html"];
  const protectedPage = !authPages.includes(page);
  let stockItems = [];
  let movements = [];
  let merenda = [];
  let alimentoAcaoId = null;
  let usuarios = [];
  let financeData = null;
  let reportData = null;

  if (protectedPage && !token) {
    location.replace(
      `login.html?next=${encodeURIComponent(page || "index.html")}`,
    );
    return;
  }

  document.querySelectorAll("a.btn-sair-topo").forEach((link) => {
    link.addEventListener("click", () => {
      // Revogação no servidor; a navegação não depende da resposta HTTP.
      if (token)
        fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      localStorage.removeItem("sgeUser");
      localStorage.removeItem("sgeToken");
      sessionStorage.removeItem("sgeUser");
      sessionStorage.removeItem("sgeToken");
    });
  });

  /** Executa requisição autenticada à API REST, normalizando erros HTTP e respostas JSON. */
  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && protectedPage) {
      localStorage.removeItem("sgeUser");
      localStorage.removeItem("sgeToken");
      sessionStorage.removeItem("sgeUser");
      sessionStorage.removeItem("sgeToken");
      location.replace("login.html");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.erro || `Falha na solicitação (${response.status}).`,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }

  /** Converte valores de entrada para números usados nos cálculos da interface. */
  const number = (value) => Number(value || 0);
  /** Formata valores monetários em reais, segundo a localização pt-BR. */
  const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(number(value));
  /** Formata quantidades preservando casas decimais relevantes. */
  const quantity = (value) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
      number(value),
    );
  /** Converte caracteres especiais em entidades HTML para evitar injeção em conteúdo renderizado. */
  const safe = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  /** Transforma data de entrada em data legível para o público brasileiro. */
  const dateText = (value) => {
    if (!value) return "—";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? new Date(`${value}T12:00:00`)
      : new Date(value);
    return Number.isNaN(date.getTime())
      ? safe(value)
      : new Intl.DateTimeFormat("pt-BR").format(date);
  };
  /** Escapa aspas e delimita uma célula de arquivo CSV. */
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  /** Converte o código interno da categoria para seu rótulo visível. */
  const labelCategory = (value) =>
    ({
      livros: "Livros e Didáticos",
      uniformes: "Uniformes",
      materiais: "Materiais e Papelaria",
      outros: "Outros Suprimentos",
      graos: "Grãos e Cereais",
      hortifruti: "Hortifrúti",
      laticinios: "Laticínios",
      proteinas: "Carnes e Proteínas",
      perecivel: "Outros Perecíveis",
      naoperecivel: "Outros Não Perecíveis",
      bebidas: "Bebidas",
    })[value] ||
    value ||
    "—";

  /** Exibe uma mensagem de sucesso ou erro sem alterar a estrutura da página. */
  function showMessage(id, message, kind = "sucesso") {
    const element = byId(id);
    if (!element) return;
    element.textContent = message;
    element.className = `mensagem-status ${kind}`;
  }

  /** Alterna o aviso de lista vazia conforme a quantidade de resultados. */
  function renderEmpty(id, isEmpty) {
    const element = byId(id);
    if (element) element.style.display = isEmpty ? "" : "none";
  }

  /** Baixa uma exportação CSV usando o token da sessão atual. */
  async function downloadCsv(url, name) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.erro || "Não foi possível exportar os dados.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      window.alert(error.message);
    }
  }

  /** Preenche nome, cargo e avatar da pessoa autenticada nos campos da interface. */
  function updateUserHeader() {
    if (!user) return;
    const fullName = user.nome || "Usuário";
    const initials = fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
    if (byId("perfilNomeHero")) byId("perfilNomeHero").textContent = fullName;
    if (byId("perfilEmailHero"))
      byId("perfilEmailHero").textContent = user.email || "";
    if (byId("perfilAvatarHero"))
      byId("perfilAvatarHero").textContent = initials;
    if (byId("perfilRoleBadge"))
      byId("perfilRoleBadge").textContent =
        user.perfil === "admin" ? "Administrador" : user.cargo || "";
    document.querySelectorAll(".topo-perfil").forEach((link) => {
      link.title = `Meu perfil · ${fullName}`;
    });
    if (byId("chamadoNome")) byId("chamadoNome").value = fullName;
    if (byId("chamadoEmail")) byId("chamadoEmail").value = user.email || "";
    if (byId("moveResponsavel")) byId("moveResponsavel").value = fullName;
  }

  /** Desenha o gráfico de barras no canvas com eixos e rótulos proporcionais. */
  function drawBars(canvasId, labels, values, isCurrency = false) {
    const canvas = byId(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 220);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const padding = { top: 20, right: 18, bottom: 82, left: 58 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const max = Math.max(...values, 1);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (plotHeight * i) / 4;
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      const value = max * (1 - i / 4);
      ctx.fillStyle = "#64748b";
      ctx.fillText(
        isCurrency
          ? value >= 1000
            ? `${(value / 1000).toFixed(0)} mil`
            : value.toFixed(0)
          : quantity(value),
        padding.left - 7,
        y,
      );
    }
    const slot = plotWidth / Math.max(labels.length, 1);
    labels.forEach((label, index) => {
      const barWidth = Math.min(42, slot * 0.62);
      const barHeight = (Math.max(values[index], 0) / max) * plotHeight;
      const x = padding.left + slot * index + (slot - barWidth) / 2;
      const y = padding.top + plotHeight - barHeight;
      ctx.fillStyle = [
        "#2563eb",
        "#059669",
        "#8b5cf6",
        "#f59e0b",
        "#0891b2",
        "#ef4444",
      ][index % 6];
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [5, 5, 0, 0]);
      ctx.fill();
      ctx.fillStyle = "#475569";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "10px system-ui, sans-serif";
      const labelLines = {
        "Livros e Didáticos": ["Livros", "Didáticos"],
        "Materiais e Papelaria": ["Materiais", "Papelaria"],
        Uniformes: ["Uniformes"],
        "Outros Suprimentos": ["Outros", "Suprimentos"],
        "Grãos e Cereais": ["Grãos", "Cereais"],
        Hortifrúti: ["Hortifrúti"],
        Laticínios: ["Laticínios"],
        "Carnes e Proteínas": ["Carnes", "Proteínas"],
        "Outros Perecíveis": ["Outros", "Perecíveis"],
        "Outros Não Perecíveis": ["Não", "Perecíveis"],
        Bebidas: ["Bebidas"],
      }[label] || [label];
      labelLines.forEach((text, lineIndex) => {
        ctx.fillText(
          text,
          x + barWidth / 2,
          padding.top + plotHeight + 10 + lineIndex * 13,
        );
      });
    });
  }

  /** Desenha um gráfico de rosca e a legenda a partir das categorias informadas. */
  function drawDonut(canvasId, labels, values) {
    const canvas = byId(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    const height = Math.max(rect.height, 250);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const total = values.reduce((sum, value) => sum + value, 0);
    const colors = [
      "#2563eb",
      "#8b5cf6",
      "#059669",
      "#f59e0b",
      "#0891b2",
      "#ef4444",
    ];
    const cx = width * 0.38;
    const cy = height * 0.48;
    const radius = Math.min(width * 0.29, height * 0.36);
    let start = -Math.PI / 2;
    values.forEach((value, index) => {
      const end = start + (total ? (value / total) * Math.PI * 2 : 0);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end);
      ctx.arc(cx, cy, radius * 0.58, end, start, true);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start = end;
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "12px system-ui, sans-serif";
    labels.forEach((label, index) => {
      const y = 28 + index * 24;
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(width * 0.7, y - 5, 10, 10);
      ctx.fillStyle = "#475569";
      ctx.fillText(String(label).slice(0, 18), width * 0.7 + 16, y);
    });
    if (total) {
      ctx.textAlign = "center";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillStyle = "#334155";
      ctx.fillText(money(total), cx, cy);
    }
  }

  /** Carrega da API os indicadores financeiros exibidos na visão geral. */
  async function loadDashboard() {
    const summary = await api("/api/painel");
    const values = {
      kpiCustoTotalEstoque: summary.estoqueValor,
      kpiCustoMateriais: summary.materiaisValor,
      kpiCustoMerenda: summary.merendaValor,
      kpiCustoSaidas: summary.saidasValor,
    };
    Object.entries(values).forEach(([id, value]) => {
      if (byId(id)) byId(id).textContent = money(value);
    });
    if (byId("kpiNotaCustoTotalEstoque"))
      byId("kpiNotaCustoTotalEstoque").textContent =
        `${summary.itensEstoque} itens cadastrados`;
    if (byId("kpiNotaSaidas"))
      byId("kpiNotaSaidas").textContent =
        `${summary.itensCriticos} itens no mínimo ou abaixo`;
  }

  /** Filtra, desenha e atualiza as informações da tabela de materiais. */
  function renderStock() {
    const search = (byId("search")?.value || "").toLowerCase();
    const category = byId("filterCategory")?.value || "";
    const rows = stockItems.filter(
      (item) =>
        item.nome.toLowerCase().includes(search) &&
        (!category || item.categoria === category),
    );
    if (byId("tableBody")) {
      byId("tableBody").innerHTML = rows
        .map(
          (item) => `<tr>
        <td>${safe(item.nome)}</td><td><span class="badge badge-${safe(item.categoria)}">${safe(labelCategory(item.categoria))}</span></td>
        <td>${quantity(item.quantidade)} ${safe(item.unidade)}</td><td>${quantity(item.minimo)}</td>
        <td>${money(item.custoUnitario)}</td><td>${money(item.quantidade * item.custoUnitario)}</td>
        <td>${safe(item.ultimoResponsavel || "Histórico não identificado")}</td>
        <td>${item.podeExcluir ? `<button type="button" class="btn-danger btn-sm" title="Excluir item" onclick="excluirItem(${item.id})">Excluir</button>` : '<span class="acao-indisponivel" title="Excluir aparece somente para quem cadastrou o item">—</span>'}</td></tr>`,
        )
        .join("");
      renderEmpty("emptyMsg", rows.length === 0);
      if (byId("statTipos"))
        byId("statTipos").textContent = String(stockItems.length);
      if (byId("statUnidades"))
        byId("statUnidades").textContent = quantity(
          stockItems.reduce((sum, item) => sum + item.quantidade, 0),
        );
      if (byId("statBaixo"))
        byId("statBaixo").textContent = String(
          stockItems.filter((item) => item.quantidade <= item.minimo).length,
        );
      if (byId("statValorTotal"))
        byId("statValorTotal").textContent = money(
          stockItems.reduce(
            (sum, item) => sum + item.quantidade * item.custoUnitario,
            0,
          ),
        );
    }
    const selects = ["moveItem", "moveProduto", "filtroProduto"];
    selects.forEach((id) => {
      const select = byId(id);
      if (!select) return;
      const selected = select.value;
      const firstOption =
        id === "filtroProduto"
          ? '<option value="">Todos os produtos</option>'
          : '<option value="">Selecione o item</option>';
      select.innerHTML = `${firstOption}${stockItems.map((item) => `<option value="${item.id}">${safe(item.nome)} — ${quantity(item.quantidade)} ${safe(item.unidade)}</option>`).join("")}`;
      if ([...select.options].some((option) => option.value === selected))
        select.value = selected;
      if (!select.value && stockItems.length && id !== "filtroProduto")
        select.value = String(stockItems[0].id);
    });
    const quickItem = stockItems.find(
      (item) => item.id === Number(byId("moveItem")?.value),
    );
    if (quickItem && byId("moveCusto") && number(byId("moveCusto").value) === 0)
      byId("moveCusto").value = quickItem.custoUnitario.toFixed(2);
    const detailedItem = stockItems.find(
      (item) => item.id === Number(byId("moveProduto")?.value),
    );
    if (
      detailedItem &&
      byId("moveCustoUnitario") &&
      number(byId("moveCustoUnitario").value) === 0
    ) {
      byId("moveCustoUnitario").value = detailedItem.custoUnitario.toFixed(2);
    }
    renderHistory();
  }

  /** Aplica pesquisa, datas e critérios de tipo ao histórico do estoque. */
  function filterMovements() {
    const start = byId("filtroDataInicio")?.value || "";
    const end = byId("filtroDataFim")?.value || "";
    const product = byId("filtroProduto")?.value || "";
    const type = byId("filtroTipo")?.value || "";
    const responsible = (byId("filtroResponsavel")?.value || "").toLowerCase();
    return movements.filter((item) => {
      const day = item.data.slice(0, 10);
      return (
        (!start || day >= start) &&
        (!end || day <= end) &&
        (!product || item.itemId === Number(product)) &&
        (!type || item.tipo === type) &&
        (!responsible ||
          String(item.responsavel || "")
            .toLowerCase()
            .includes(responsible))
      );
    });
  }

  /** Renderiza o histórico de movimentações e trata o caso sem resultados. */
  function renderHistory() {
    const rows = filterMovements();
    const target = byId("historyBody") || byId("tabelaHistoricoBody");
    if (!target) return;
    target.innerHTML = rows
      .map(
        (item) => `<tr>
      <td>${dateText(item.data)}</td><td>${safe(item.itemNome)}${item.notaFiscal ? `<br><small>${safe(item.notaFiscal)}</small>` : ""}</td>
      <td><span class="badge badge-${item.tipo}">${item.tipo === "entrada" ? "Entrada" : "Saída"}</span>${item.cancelada ? ' <span class="mov-cancelada">Cancelada</span>' : ""}</td>
      <td>${quantity(item.quantidade)}</td><td>${money(item.custoTotal)}</td>
      ${byId("tabelaHistoricoBody") ? `<td>${safe(item.destino)}</td>` : ""}
      <td>${safe(item.responsavel || "Histórico não identificado")}${item.cancelada ? `<br><small>Cancelada por ${safe(item.canceladaPor || "Não identificado")}</small>` : ""}</td>
      <td>${item.podeExcluir ? `<button type="button" class="btn-danger btn-sm" title="Excluir movimentação; o saldo e o histórico serão validados" onclick="excluirMovimentacao(${item.id})">Excluir</button>` : "—"}</td></tr>`,
      )
      .join("");
    renderEmpty(
      byId("emptyHist") ? "emptyHist" : "emptyHistorico",
      rows.length === 0,
    );
    const summary = byId("resumoFiltro") || byId("resumoHistoricoFiltro");
    if (summary)
      summary.textContent = `${rows.length} movimentação(ões) · Entradas: ${quantity(rows.filter((item) => !item.cancelada && item.tipo === "entrada").reduce((sum, item) => sum + item.quantidade, 0))} · Saídas: ${quantity(rows.filter((item) => !item.cancelada && item.tipo === "saida").reduce((sum, item) => sum + item.quantidade, 0))}`;
  }

  /** Consulta os materiais e o histórico do almoxarifado para atualizar os painéis. */
  async function loadStock() {
    [stockItems, movements] = await Promise.all([
      api("/api/estoque"),
      api("/api/movimentacoes"),
    ]);
    renderStock();
    if (byId("kpiEntradasHoje")) {
      const today = new Date().toISOString().slice(0, 10);
      const todayMovements = movements.filter(
        (item) => !item.cancelada && item.data.slice(0, 10) === today,
      );
      const entries = todayMovements.filter((item) => item.tipo === "entrada");
      const exits = todayMovements.filter((item) => item.tipo === "saida");
      byId("kpiEntradasHoje").textContent =
        `${quantity(entries.reduce((sum, item) => sum + item.quantidade, 0))} un.`;
      byId("kpiSaidasHoje").textContent =
        `${quantity(exits.reduce((sum, item) => sum + item.quantidade, 0))} un.`;
      byId("kpiEntradasValor").textContent = money(
        entries.reduce((sum, item) => sum + item.custoTotal, 0),
      );
      byId("kpiSaidasValor").textContent = money(
        exits.reduce((sum, item) => sum + item.custoTotal, 0),
      );
    }
    updateForecast();
  }

  /** Calcula a previsão de saldo e de valor antes de confirmar uma saída ou entrada. */
  function updateForecast() {
    const select = byId("moveProduto");
    if (!select) return;
    const item = stockItems.find(
      (stockItem) => stockItem.id === Number(select.value),
    );
    const preview = byId("previsaoEstoque");
    if (!item || !preview) {
      if (preview) preview.style.display = "none";
      return;
    }
    const type = $('input[name="tipoMov"]:checked')?.value || "entrada";
    const qty = number(byId("moveQuantidade")?.value);
    const cost = number(byId("moveCustoUnitario")?.value);
    const after = item.quantidade + (type === "entrada" ? qty : -qty);
    preview.style.display = "";
    byId("prevEstoqueAtual").textContent =
      `${quantity(item.quantidade)} ${item.unidade}`;
    byId("prevEstoqueMinimo").textContent =
      `${quantity(item.minimo)} ${item.unidade}`;
    byId("prevNovoEstoque").textContent = `${quantity(after)} ${item.unidade}`;
    byId("prevNovoEstoque").style.color =
      after < 0 ? "#b91c1c" : after <= item.minimo ? "#b45309" : "#047857";
    if (byId("moveCustoTotalCalculado"))
      byId("moveCustoTotalCalculado").textContent = money(qty * cost);
  }

  /** Carrega alimentos e movimentações de merenda para os indicadores e tabelas. */
  async function loadFoods() {
    merenda = await api("/api/merenda");
    if (byId("tabelaAlimentos")) {
      byId("tabelaAlimentos").innerHTML = merenda
        .map(
          (item) => `<tr>
        <td>${safe(item.nome)}</td><td>${safe(labelCategory(item.categoria))}</td>
        <td>${quantity(item.quantidade)} ${safe(item.unidade)}</td>
        <td>${quantity(item.minimo)} ${safe(item.unidade)}</td><td>${money(item.custoUnitario)}</td>
        <td>${money(item.valorTotal)}</td><td>${dateText(item.dataEntrada)}</td><td>${safe(item.fornecedor || "—")}</td>
        <td>${safe(item.ultimoResponsavel || "Histórico não identificado")}</td>
        <td><button class="btn-secondary btn-sm" onclick="abrirAcaoMerenda(${item.id}, 'minimo')">Ajustar mínimo</button> <button class="btn-secondary btn-sm" onclick="abrirAcaoMerenda(${item.id}, 'entrada')">+ Repor</button> <button class="btn-secondary btn-sm" onclick="abrirAcaoMerenda(${item.id}, 'consumo')">Registrar consumo</button> ${item.podeExcluir ? `<button type="button" class="btn-danger btn-sm" title="Excluir alimento diretamente" onclick="excluirAlimento(${item.id})">Excluir</button>` : ""}</td></tr>`,
        )
        .join("");
      renderEmpty("semAlimentos", merenda.length === 0);
      if (byId("alimentoAcao")) {
        const selectedId = merenda.some((item) => item.id === alimentoAcaoId)
          ? alimentoAcaoId
          : merenda[0]?.id;
        alimentoAcaoId = selectedId ?? null;
        byId("alimentoAcao").innerHTML = merenda
          .map(
            (item) =>
              `<option value="${item.id}">${safe(item.nome)} — ${quantity(item.quantidade)} ${safe(item.unidade)}</option>`,
          )
          .join("");
        if (alimentoAcaoId !== null)
          byId("alimentoAcao").value = String(alimentoAcaoId);
        renderMerendaActionForm();
      }
      if (byId("totalRegistros"))
        byId("totalRegistros").textContent =
          `${merenda.length} registro(s) · ${money(merenda.reduce((sum, item) => sum + item.valorTotal, 0))} em estoque`;
      if (byId("statMerendaTipos"))
        byId("statMerendaTipos").textContent = quantity(merenda.length);
      if (byId("statMerendaQuantidade")) {
        const totalsByUnit = merenda.reduce((totals, item) => {
          totals[item.unidade] =
            (totals[item.unidade] || 0) + number(item.quantidade);
          return totals;
        }, {});
        byId("statMerendaQuantidade").textContent =
          Object.entries(totalsByUnit)
            .map(([unit, total]) => `${quantity(total)} ${unit}`)
            .join("\n") || "0";
      }
      if (byId("statMerendaBaixo"))
        byId("statMerendaBaixo").textContent = quantity(
          merenda.filter(
            (item) => number(item.quantidade) <= number(item.minimo),
          ).length,
        );
      if (byId("statMerendaValor"))
        byId("statMerendaValor").textContent = money(
          merenda.reduce((sum, item) => sum + number(item.valorTotal), 0),
        );
    }
  }

  /** Preenche os históricos com o nome gravado pela API no momento da operação. */
  async function loadOperationalHistory() {
    if (byId("historicoMerendaBody")) {
      const entries = await api("/api/merenda/consumos");
      byId("historicoMerendaBody").innerHTML = entries
        .map(
          (entry) => `<tr>
        <td>${dateText(entry.data)}</td><td>${safe(entry.itemNome)}</td>
        <td><span class="badge badge-${entry.tipo}">${entry.tipo === "entrada" ? "Entrada" : "Saída"}</span>${entry.cancelada ? ' <span class="mov-cancelada">Cancelada</span>' : ""}</td>
        <td>${quantity(entry.quantidade)}</td><td>${money(entry.custoTotal)}</td>
        <td>${safe(entry.destino)}</td><td><strong>${safe(entry.responsavel || "Histórico não identificado")}</strong>${entry.cancelada ? `<br><small>Cancelada por ${safe(entry.canceladaPor || "Não identificado")}</small>` : ""}</td>
        <td>${entry.podeExcluir ? `<button type="button" class="btn-danger btn-sm" title="Excluir movimentação; o saldo e o histórico serão validados" onclick="excluirMovimentacaoMerenda(${entry.id})">Excluir</button>` : "—"}</td>
      </tr>`,
        )
        .join("");
      renderEmpty("semHistoricoMerenda", entries.length === 0);
    }
    for (const [modulo, id] of [
      ["merenda", "atividadesMerendaBody"],
      ["estoque", "atividadesEstoqueBody"],
    ]) {
      if (!byId(id)) continue;
      const entries = await api(`/api/atividades/${modulo}`);
      byId(id).innerHTML = entries
        .map(
          (entry) => `<tr>
        <td>${dateText(entry.data)}</td><td>${safe(entry.operacao)}</td>
        <td><strong>${safe(entry.usuario || "Não identificado")}</strong></td>
      </tr>`,
        )
        .join("");
      renderEmpty(
        modulo === "merenda" ? "semAtividadesMerenda" : "semAtividadesEstoque",
        entries.length === 0,
      );
    }
  }

  /** Obtém lançamentos e totais para o painel financeiro. */
  async function loadFinance() {
    const report = await api("/api/financeiro");
    financeData = report;
    [
      ["kpiCustoTotalEstoque", report.estoqueValor],
      ["kpiCustoMateriais", report.materiaisValor],
      ["kpiCustoMerenda", report.merendaValor],
      ["kpiCustoTotalSaidas", report.saidasValor],
    ].forEach(([id, value]) => {
      if (byId(id)) byId(id).textContent = money(value);
    });
    const entries = report.extrato
      .filter((row) => row.tipo === "entrada")
      .reduce((sum, row) => sum + row.custoTotal, 0);
    drawDonut(
      "chartComposicaoCustos",
      ["Materiais", "Merenda"],
      [report.materiaisValor, report.merendaValor],
    );
    drawBars(
      "chartEntradasSaidas",
      ["Entradas", "Saídas", "Saldo"],
      [entries, report.saidasValor, report.estoqueValor],
      true,
    );
    const query = (byId("filtroBusca")?.value || "").toLowerCase();
    const module = byId("filtroModulo")?.value || "";
    const type = byId("filtroTipo")?.value || "";
    const rows = report.extrato.filter(
      (row) =>
        (!module || row.modulo === module) &&
        (!type || row.tipo === type) &&
        (!query ||
          `${row.item} ${row.responsavel} ${row.origemDestino}`
            .toLowerCase()
            .includes(query)),
    );
    if (byId("tabelaCustosBody")) {
      byId("tabelaCustosBody").innerHTML = rows
        .map(
          (
            row,
          ) => `<tr><td>${dateText(row.data)}</td><td>${safe(row.modulo)}</td>
        <td>${safe(row.item)}</td><td><span class="badge badge-${row.tipo}">${row.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
        <td>${quantity(row.quantidade)}</td><td>${money(row.custoUnitario)}</td><td>${money(row.custoTotal)}</td>
        <td>${safe(row.origemDestino)}</td><td>${safe(row.responsavel || "Histórico não identificado")}</td></tr>`,
        )
        .join("");
      renderEmpty("emptyCustos", rows.length === 0);
      if (byId("resumoCustosFiltro"))
        byId("resumoCustosFiltro").textContent =
          `${rows.length} lançamento(s) · Total exibido: ${money(rows.reduce((sum, row) => sum + row.custoTotal, 0))}`;
    }
  }

  /** Atualiza os indicadores de relatório e seus gráficos a partir da API. */
  async function loadReport() {
    const start = byId("periodoInicio")?.value || "";
    const end = byId("periodoFim")?.value || "";
    const search = new URLSearchParams();
    if (start) search.set("inicio", start);
    if (end) search.set("fim", end);
    const report = await api(
      `/api/relatorios${search.size ? `?${search}` : ""}`,
    );
    reportData = report;
    if (byId("valorTotalEstoque"))
      byId("valorTotalEstoque").textContent = money(report.estoqueValor);
    if (byId("custoEntradas"))
      byId("custoEntradas").textContent = money(report.entradasValor);
    if (byId("custoSaidas"))
      byId("custoSaidas").textContent = money(report.saidasValor);
    if (byId("ultimaAtualizacao"))
      byId("ultimaAtualizacao").textContent =
        `Atualizado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
    drawBars(
      "graficoCategorias",
      report.porCategoria.map((item) => labelCategory(item.categoria)),
      report.porCategoria.map((item) => item.quantidade),
    );
    drawBars(
      "graficoCustos",
      report.porCategoria.map((item) => labelCategory(item.categoria)),
      report.porCategoria.map((item) => item.valor),
      true,
    );
    if (byId("tabelaItensCriticos")) {
      byId("tabelaItensCriticos").innerHTML = report.critical
        .map(
          (item) => `<tr><td>${safe(item.nome)}</td>
        <td>${safe(labelCategory(item.categoria))}</td><td>Central</td>
        <td>${quantity(item.quantidade)} ${safe(item.unidade)}</td><td>${quantity(item.minimo)} ${safe(item.unidade)}</td>
        <td>${money(item.reposicaoEstimada)}</td></tr>`,
        )
        .join("");
      renderEmpty("semItensCriticos", report.critical.length === 0);
    }
  }

  /** Carrega contas, solicitações pendentes e auditoria com permissão administrativa. */
  async function loadAdmin() {
    const result = await api("/api/admin");
    usuarios = result.usuarios;
    if (byId("kpiTotalUsuarios"))
      byId("kpiTotalUsuarios").textContent = String(result.resumo.total);
    if (byId("kpiUsuariosAtivos"))
      byId("kpiUsuariosAtivos").textContent = String(result.resumo.ativos);
    if (byId("kpiUsuariosBloqueados"))
      byId("kpiUsuariosBloqueados").textContent = String(
        result.resumo.bloqueados + result.pendentes.length,
      );
    if (byId("kpiTotalSecretarios"))
      byId("kpiTotalSecretarios").textContent = String(
        result.resumo.secretarios,
      );
    if (byId("totalUsuariosPendentes"))
      byId("totalUsuariosPendentes").textContent =
        `${result.pendentes.length} solicitações`;
    if (byId("usuariosPendentesBody")) {
      byId("usuariosPendentesBody").innerHTML = result.pendentes
        .map(
          (item) => `<tr>
        <td>${safe(item.nome)}</td><td>${safe(item.cpf)}</td><td>${safe(item.email)}</td><td>${safe(item.cargo)}</td>
        <td>${dateText(item.criadoEm)}</td><td><button class="btn-success btn-sm" onclick="aprovarUsuario(${item.id})">Aprovar</button>
        <button class="btn-danger btn-sm" onclick="rejeitarUsuario(${item.id})">Rejeitar</button></td></tr>`,
        )
        .join("");
      renderEmpty("emptyUsuariosPendentes", result.pendentes.length === 0);
    }
    renderAdminUsers();
    if (byId("tabelaAutoriaPendenteBody")) await loadLegacyOwners();
    const logs = await api("/api/admin/logs");
    if (byId("tabelaLogsAuditoriaBody")) {
      byId("tabelaLogsAuditoriaBody").innerHTML = logs
        .map(
          (log) => `<tr><td>${dateText(log.data)}</td>
        <td>${safe(log.usuario)}</td><td>${safe(log.operacao)}</td><td>${safe(log.modulo)}</td><td>Local</td></tr>`,
        )
        .join("");
    }
  }

  /** Mostra registros legados cuja autoria não foi identificada com segurança. */
  async function loadLegacyOwners() {
    const data = await api("/api/admin/autoria-pendente");
    if (byId("totalAutoriaPendente")) {
      byId("totalAutoriaPendente").textContent =
        `${data.total} registro(s) a conferir${data.total > data.registros.length ? " · primeiros 300 exibidos" : ""}`;
    }
    const options = usuarios
      .filter((u) => u.aprovado && u.ativo)
      .map(
        (u) =>
          `<option value="${Number(u.id)}">${safe(u.nome)} (${safe(u.usuario)})</option>`,
      )
      .join("");
    byId("tabelaAutoriaPendenteBody").innerHTML = data.registros
      .map(
        (row) => `<tr>
      <td>${safe({ item: "Material", movimento: "Mov. estoque", alimento: "Alimento", merenda: "Mov. merenda" }[row.tipo] || row.tipo)}</td>
      <td>${safe(row.nome)} <small>#${Number(row.id)}</small></td>
      <td>${safe(row.responsavelAnterior)}${row.observacao ? `<br><small>${safe(row.observacao)}</small>` : ""}</td>
      <td><label for="autorLegado_${row.tipo}_${Number(row.id)}" class="sr-only">Responsável correto</label>
        <select id="autorLegado_${row.tipo}_${Number(row.id)}"><option value="">Selecione</option>${options}</select></td>
      <td><button type="button" class="btn-secondary btn-sm" onclick="vincularAutoriaLegada('${row.tipo}',${Number(row.id)})">Vincular</button></td>
    </tr>`,
      )
      .join("");
    renderEmpty("emptyAutoriaPendente", data.registros.length === 0);
  }

  /** Vincula um registro antigo à conta indicada, com justificativa auditável. */
  window.vincularAutoriaLegada = async (tipo, id) => {
    const usuarioId = Number(byId(`autorLegado_${tipo}_${id}`)?.value);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      window.alert("Selecione a conta responsável.");
      return;
    }
    const justificativa = window.prompt(
      "Qual evidência confirma a conta responsável? Esta decisão será registrada na auditoria.",
    );
    if (justificativa === null) return;
    if (justificativa.trim().length < 12) {
      window.alert("Descreva a evidência em pelo menos 12 caracteres.");
      return;
    }
    if (
      !window.confirm(
        "Confirmar atribuição deste registro antigo à conta selecionada?",
      )
    )
      return;
    try {
      await api("/api/admin/vincular-autoria", {
        method: "POST",
        body: { tipo, id, usuarioId, justificativa },
      });
      await loadAdmin();
      window.alert(
        "Responsável vinculado. O botão Excluir aparecerá somente para essa conta.",
      );
    } catch (error) {
      window.alert(error.message);
    }
  };

  /** Aplica filtros e mostra usuários aprovados com ações adequadas ao estado. */
  function renderAdminUsers() {
    if (!byId("tabelaUsuariosAdminBody")) return;
    const search = (byId("filtroAdminBusca")?.value || "").toLowerCase();
    const role = byId("filtroAdminCargo")?.value || "";
    const status = byId("filtroAdminStatus")?.value || "";
    const rows = usuarios.filter(
      (item) =>
        item.aprovado &&
        (!role || item.cargo === role) &&
        (!status || (status === "Ativo" ? item.ativo : !item.ativo)) &&
        (!search ||
          `${item.nome} ${item.usuario} ${item.cpf}`
            .toLowerCase()
            .includes(search)),
    );
    byId("tabelaUsuariosAdminBody").innerHTML = rows
      .map(
        (
          item,
        ) => `<tr><td>${safe(item.nome)}<br><small>${safe(item.usuario)}</small></td>
      <td>${safe(item.cpf)}</td><td>${safe(item.email)}</td><td>${safe(item.cargo)}</td>
      <td>${safe(item.perfil === "admin" ? "Administrador" : item.perfil === "secretario" ? "Secretário" : item.perfil === "almoxarifado" ? "Almoxarifado" : "Sem perfil")}</td>
      <td><span class="badge ${item.ativo ? "badge-ativo" : "badge-inativo"}">${item.ativo ? "Ativo" : "Inativo"}</span></td>
      <td>${dateText(item.ultimoAcesso)}</td><td><button class="${item.ativo ? "btn-danger" : "btn-success"} btn-sm" onclick="alternarUsuario(${item.id}, ${!item.ativo})">${item.ativo ? "Bloquear" : "Desbloquear"}</button>
        <button class="btn-secondary btn-sm" onclick="redefinirSenhaAdmin(${item.id})">Redefinir senha</button></td></tr>`,
      )
      .join("");
    renderEmpty("emptyUsuariosAdmin", rows.length === 0);
  }

  /** Valida a sessão, configura eventos de formulário e carrega apenas dados da página aberta. */
  async function start() {
    if (protectedPage) {
      const currentUser = await api("/api/auth/me");
      user = currentUser;
      if (user.perfil === "admin") document.body.classList.add("perfil-admin");
      // A autorização real é verificada pela API; a interface apenas adequa
      // a navegação. Nunca usar o cargo nem os dados locais como autoridade.
      document.querySelectorAll('a[href="admin.html"]').forEach((anchor) => {
        if (user.perfil !== "admin")
          (anchor.closest("li") || anchor).style.display = "none";
      });
      document
        .querySelectorAll(".link-gestao-escolar, .modulo-academico")
        .forEach((element) => {
          if (!["admin", "secretario"].includes(user.perfil))
            element.style.display = "none";
        });
      if (page === "admin.html") {
        if (user.perfil !== "admin") {
          location.replace("index.html");
          return;
        }
        document.body.classList.add("admin-autorizado");
      }
      if (!["admin", "secretario"].includes(user.perfil)) {
        document
          .querySelectorAll(
            'a[href="financeiro.html"], a[href="Relatorio.html"]',
          )
          .forEach(
            (anchor) =>
              ((anchor.closest("li") || anchor).style.display = "none"),
          );
      }
      if (
        ["gestao-escolar.html", "financeiro.html", "relatorio.html"].includes(
          page,
        ) &&
        !["admin", "secretario"].includes(user.perfil)
      ) {
        location.replace("index.html");
        return;
      }
    }
    updateUserHeader();
    if (byId("formLogin")) {
      byId("usuario").focus();
    }
    if (byId("formCadastro") && byId("cadCpf")) mascaraCPF(byId("cadCpf"));
    if (byId("alimentoData") && !byId("alimentoData").value)
      byId("alimentoData").value = new Date().toISOString().slice(0, 10);
    if (byId("moveItem"))
      byId("moveItem").addEventListener("change", () => {
        const item = stockItems.find(
          (stockItem) => stockItem.id === Number(byId("moveItem").value),
        );
        if (item && byId("moveCusto"))
          byId("moveCusto").value = item.custoUnitario.toFixed(2);
      });
    if (byId("moveProduto"))
      byId("moveProduto").addEventListener("change", () => {
        const item = stockItems.find(
          (stockItem) => stockItem.id === Number(byId("moveProduto").value),
        );
        if (item && byId("moveCustoUnitario"))
          byId("moveCustoUnitario").value = item.custoUnitario.toFixed(2);
        updateForecast();
      });
    if (byId("formPerfilDados")) {
      try {
        const profile = await api(`/api/usuarios/${user.id}`);
        ["Nome", "Cpf", "Email", "Telefone", "Cargo"].forEach((key) => {
          const field = byId(`usr${key}`);
          const value = profile[key.toLowerCase()];
          if (field && value != null) field.value = value;
        });
        if (byId("usrCargo")) byId("usrCargo").disabled = true;
      } catch (error) {
        window.alert(error.message);
      }
    }
    if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    if (byId("tableBody") || byId("tabelaHistoricoBody")) await loadStock();
    if (byId("tabelaAlimentos")) await loadFoods();
    if (byId("historicoMerendaBody") || byId("atividadesEstoqueBody"))
      await loadOperationalHistory();
    if (byId("chartComposicaoCustos")) await loadFinance();
    if (byId("graficoCategorias")) await loadReport();
    if (byId("tabelaUsuariosAdminBody")) await loadAdmin();
    if (byId("formChamado")) await loadTickets();
    if (byId("themeToggle"))
      byId("themeToggle").addEventListener("click", () =>
        setTimeout(
          () =>
            byId("themeToggle")?.setAttribute(
              "aria-pressed",
              document.documentElement.dataset.theme === "dark",
            ),
          0,
        ),
      );
  }

  /** Carrega os chamados de suporte e seu status para a interface. */
  async function loadTickets() {
    const tickets = await api("/api/chamados");
    let container = byId("listaChamados");
    if (!container) {
      container = document.createElement("div");
      container.id = "listaChamados";
      container.className = "painel-corpo";
      const form = byId("formChamado")?.closest(".painel");
      if (form) form.after(container);
    }
    const admin = user?.perfil === "admin";
    container.innerHTML = `<h3>${admin ? "Chamados" : "Meus chamados"}</h3>${tickets.length ? `<div class="tabela-responsiva"><table><thead><tr><th>Chamado</th><th>Assunto</th><th>Data</th><th>Status</th>${admin ? "<th>Ações</th>" : ""}</tr></thead><tbody>${tickets.map((ticket) => `<tr><td>#${ticket.id}</td><td>${safe(ticket.assunto)}</td><td>${dateText(ticket.criadoEm)}</td><td>${safe(ticket.status)}</td>${admin ? `<td><button type="button" class="btn-danger btn-sm" onclick="excluirChamado(${Number(ticket.id)})">Excluir</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : "<p>Nenhum chamado registrado.</p>"}`;
  }

  /** Autentica com usuário e senha e guarda a sessão conforme a opção "manter conectado". */
  window.realizarLogin = async (event) => {
    event.preventDefault();
    showMessage("mensagemLogin", "Validando acesso...", "aviso");
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: { usuario: byId("usuario").value, senha: byId("senha").value },
      });
      localStorage.removeItem("sgeUser");
      localStorage.removeItem("sgeToken");
      sessionStorage.removeItem("sgeUser");
      sessionStorage.removeItem("sgeToken");
      const storage = byId("lembrar")?.checked ? localStorage : sessionStorage;
      storage.setItem("sgeUser", JSON.stringify(result));
      storage.setItem("sgeToken", result.token);
      const next = new URLSearchParams(location.search).get("next");
      location.href =
        next && /^[\w.-]+\.html$/i.test(next) ? next : "index.html";
    } catch (error) {
      showMessage("mensagemLogin", error.message, "erro");
    }
    return false;
  };
  /** Envia uma solicitação de conta e trata a resposta de aprovação. */
  window.realizarCadastro = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/auth/cadastro", {
        method: "POST",
        body: {
          nome: byId("cadNome").value,
          cpf: byId("cadCpf").value,
          cargo: byId("cadCargo").value,
          email: byId("cadEmail").value,
          usuario: byId("cadUsuario").value,
          senha: byId("cadSenha").value,
          confirmarSenha: byId("cadSenhaConfirm").value,
        },
      });
      showMessage("mensagemCadastro", result.mensagem, "sucesso");
      byId("formCadastro").reset();
    } catch (error) {
      showMessage("mensagemCadastro", error.message, "erro");
    }
    return false;
  };
  /** Valida identificador para a primeira etapa da recuperação de senha. */
  window.avancarEtapa1 = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/auth/recuperar", {
        method: "POST",
        body: { identificador: byId("recEmail").value },
      });
      byId("codigoDemo").textContent = result.codigoDemo;
      byId("formEtapa2").style.display = "";
      showMessage("mensagemEtapa1", result.mensagem, "sucesso");
    } catch (error) {
      showMessage("mensagemEtapa1", error.message, "erro");
    }
    return false;
  };
  /** Confirma o código de recuperação e envia a nova senha. */
  window.finalizarRedefinicao = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/auth/redefinir", {
        method: "POST",
        body: {
          identificador: byId("recEmail").value,
          codigo: byId("codigoVerificacao").value,
          novaSenha: byId("novaSenha").value,
          confirmarNovaSenha: byId("confirmaNovaSenha").value,
        },
      });
      byId("formEtapa1").style.display = "none";
      byId("formEtapa2").style.display = "none";
      byId("blocoSucesso").style.display = "";
      byId("tituloRecuperacao").textContent = "Senha redefinida";
      byId("subtituloRecuperacao").textContent = result.mensagem;
    } catch (error) {
      showMessage("mensagemEtapa2", error.message, "erro");
    }
    return false;
  };
  /** Limpa as etapas de recuperação para permitir nova solicitação. */
  window.reiniciarProcesso = () => {
    byId("formEtapa1").reset();
    byId("formEtapa2").reset();
    byId("formEtapa2").style.display = "none";
    byId("formEtapa1").style.display = "";
    byId("mensagemEtapa1").textContent = "";
    return false;
  };
  /** Exibe ou oculta a senha do formulário de login. */
  window.alternarSenha = () => togglePassword("senha", "btnMostrarSenha");
  /** Controla a visualização dos campos de senha do cadastro. */
  window.alternarVisibilidadeSenha = (id, button) =>
    togglePassword(id, null, button);
  /** Controla a visualização dos campos na recuperação da conta. */
  window.alternarVisibilidade = (id, button) =>
    togglePassword(id, null, button);
  /** Alterna a visibilidade de senha sem alterar o conteúdo digitado. */
  function togglePassword(id, buttonId, button) {
    const input = byId(id);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    const target = button || (buttonId && byId(buttonId));
    if (target)
      target.textContent = input.type === "password" ? "Mostrar" : "Ocultar";
  }
  /** Normaliza a digitação do CPF sem alterar a informação armazenada. */
  window.mascaraCPF = (input) => {
    const digits = input.value.replace(/\D/g, "").slice(0, 11);
    input.value = digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  /** Atualiza o indicador visual de força da senha no cadastro. */
  window.avaliarForcaSenha = () => {
    const value = byId("cadSenha")?.value || "";
    const score = [
      value.length >= 8,
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ].filter(Boolean).length;
    if (byId("barraForca")) byId("barraForca").style.width = `${score * 25}%`;
    if (byId("textoForca"))
      byId("textoForca").textContent = value
        ? ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"][score]
        : "";
  };
  /** Valida o formulário e cria um material pela API. */
  window.addItem = async () => {
    try {
      await api("/api/estoque", {
        method: "POST",
        body: {
          nome: byId("itemName").value,
          categoria: byId("itemCategory").value,
          quantidade: byId("itemQty").value,
          minimo: byId("itemMin").value,
          custoUnitario: byId("itemCusto").value,
          unidade: "unidades",
          responsavel: user.nome,
        },
      });
      showMessage("mensagemItem", "Item adicionado ao estoque.", "sucesso");
      byId("itemName").value = "";
      await loadStock();
      await loadOperationalHistory();
    } catch (error) {
      showMessage("mensagemItem", error.message, "erro");
    }
  };
  /** Solicita confirmação antes de remover material do almoxarifado. */
  window.excluirItem = async (id) => {
    if (!window.confirm("Deseja excluir este item do estoque?")) return;
    try {
      await api(`/api/estoque/${id}`, { method: "DELETE" });
      await loadStock();
      await loadOperationalHistory();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Cancela operação autorizada; API verifica permissão e recalcula saldo. */
  window.excluirMovimentacao = async (id) => {
    if (
      !window.confirm(
        "Excluir esta movimentação? O lançamento será marcado como cancelado e o saldo será corrigido se for possível.",
      )
    )
      return;
    const motivo = window.prompt(
      "Motivo do cancelamento (para auditoria):",
      "Correção de lançamento",
    );
    if (motivo === null) return;
    try {
      await api(`/api/movimentacoes/${id}`, {
        method: "DELETE",
        body: { motivo },
      });
      await loadStock();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Compatibilidade com ações HTML antigas: redesenha a tabela de materiais. */
  window.renderTable = renderStock;
  /** Compatibilidade com ações HTML antigas: redesenha o histórico. */
  window.renderHistory = renderHistory;
  /** Restaura os filtros padrão da listagem. */
  window.limparFiltros = () => {
    [
      "filtroDataInicio",
      "filtroDataFim",
      "filtroProduto",
      "filtroTipo",
      "filtroResponsavel",
    ].forEach((id) => {
      if (byId(id)) byId(id).value = "";
    });
    renderHistory();
  };
  /** Reaproveita a limpeza de filtros nas tabelas históricas. */
  window.limparFiltrosHistorico = window.limparFiltros;
  /** Registra entrada ou saída, validando quantidade e saldo disponível. */
  window.moveStock = async (type) => {
    const select = byId("moveItem");
    try {
      await api("/api/movimentacoes", {
        method: "POST",
        body: {
          itemId: select.value,
          tipo: type,
          quantidade: byId("moveQty").value,
          custoUnitario: byId("moveCusto").value,
          destino: type === "entrada" ? "Entrada rápida" : "Saída rápida",
          responsavel: byId("moveResponsavel").value || user.nome,
        },
      });
      showMessage(
        "mensagemMovimentacao",
        `Movimentação de ${type} registrada.`,
        "sucesso",
      );
      await loadStock();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      showMessage("mensagemMovimentacao", error.message, "erro");
    }
  };
  /** Atualiza a simulação da movimentação selecionada. */
  window.atualizarPrevisaoEstoque = updateForecast;
  /** Envia uma movimentação com origem, destino e responsável. */
  window.registrarMovimentacao = async (event) => {
    event.preventDefault();
    try {
      const body = {
        itemId: byId("moveProduto").value,
        tipo: $('input[name="tipoMov"]:checked')?.value,
        quantidade: byId("moveQuantidade").value,
        custoUnitario: byId("moveCustoUnitario").value,
        destino: byId("moveDestino").value,
        notaFiscal: byId("moveNotaFiscal").value,
        responsavel: byId("moveResponsavel").value,
        observacao: byId("moveObservacao").value,
      };
      await api("/api/movimentacoes", { method: "POST", body });
      window.alert("Movimentação registrada com sucesso.");
      byId("formMovimentar").reset();
      byId("moveResponsavel").value = user.nome;
      await loadStock();
      await loadOperationalHistory();
    } catch (error) {
      window.alert(error.message);
    }
    return false;
  };
  /** Cria um novo alimento com quantidade, custo e categoria. */
  window.registrarAlimento = async () => {
    try {
      await api("/api/merenda", {
        method: "POST",
        body: {
          nome: byId("alimentoNome").value,
          categoria: byId("alimentoCategoria").value,
          quantidade: byId("alimentoQuantidade").value,
          minimo: byId("alimentoMinimo").value,
          unidade: byId("alimentoUnidade").value,
          custoUnitario: byId("alimentoCusto").value,
          dataEntrada: byId("alimentoData").value,
          fornecedor: byId("alimentoFornecedor").value,
        },
      });
      showMessage(
        "mensagemStatus",
        "Alimento registrado no estoque de merenda.",
        "sucesso",
      );
      byId("alimentoNome").value = "";
      await loadFoods();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      showMessage("mensagemStatus", error.message, "erro");
    }
  };
  /** Exibe os formulários de operação do alimento selecionado. */
  function renderMerendaActionForm() {
    const panel = byId("acoesMerenda");
    const container = byId("formularioAcaoMerenda");
    if (!panel || !container) return;
    const food = merenda.find((item) => item.id === alimentoAcaoId);
    if (!food || !panel.dataset.action) {
      panel.hidden = true;
      container.innerHTML = "";
      return;
    }
    panel.hidden = false;
    const mode = panel.dataset.action || "minimo";
    const fields = {
      minimo: `<div class="form-campo"><label for="valorMinimoMerenda">Novo estoque mínimo (${safe(food.unidade)})</label><input id="valorMinimoMerenda" name="minimo" type="number" min="0" step="0.01" value="${number(food.minimo)}" required></div>`,
      entrada: `<div class="form-row"><div class="form-campo"><label for="quantidadeEntradaMerenda">Quantidade a repor (${safe(food.unidade)})</label><input id="quantidadeEntradaMerenda" name="quantidade" type="number" min="0.01" step="0.01" required></div><div class="form-campo"><label for="fornecedorMerenda">Fornecedor / origem</label><input id="fornecedorMerenda" name="fornecedor" type="text" value="${safe(food.fornecedor || "")}"></div></div>`,
      consumo: `<div class="form-row"><div class="form-campo"><label for="quantidadeConsumoMerenda">Quantidade consumida (${safe(food.unidade)}; disponível: ${quantity(food.quantidade)})</label><input id="quantidadeConsumoMerenda" name="quantidade" type="number" min="0.01" max="${number(food.quantidade)}" step="0.01" required></div><div class="form-campo"><label for="destinoConsumoMerenda">Escola / destino do consumo</label><input id="destinoConsumoMerenda" name="destino" type="text" required></div></div>`,
    };
    const titles = {
      minimo: "Ajustar estoque mínimo",
      entrada: "Registrar reposição",
      consumo: "Registrar consumo",
    };
    if (mode === "excluir") {
      container.innerHTML = `<p>Excluir <strong>${safe(food.nome)}</strong> do estoque agora? O registro será removido sem exigir saldo zerado. As movimentações anteriores serão mantidas no histórico.</p><button type="button" class="btn-danger" onclick="excluirAlimento(${food.id})"${food.podeExcluir ? "" : " disabled"}>Excluir alimento agora</button>${food.podeExcluir ? "" : '<p class="nota alerta">Somente quem cadastrou o alimento ou um administrador pode excluí-lo.</p>'}`;
      return;
    }
    container.innerHTML = `<h3>${titles[mode]} — ${safe(food.nome)}</h3><form id="formAcaoMerenda">${fields[mode]}<div class="acoes-pagina"><button type="submit" class="btn-primary">Salvar operação</button><button type="button" class="btn-secondary" onclick="fecharAcaoMerenda()">Fechar</button></div></form>`;
    byId("formAcaoMerenda").addEventListener("submit", enviarAcaoMerenda);
  }

  window.abrirAcaoMerenda = (id, mode) => {
    alimentoAcaoId = Number(id);
    const panel = byId("acoesMerenda");
    if (!panel) return;
    panel.dataset.action = mode;
    if (byId("alimentoAcao"))
      byId("alimentoAcao").value = String(alimentoAcaoId);
    renderMerendaActionForm();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  window.selecionarAcaoMerenda = (mode) => {
    const panel = byId("acoesMerenda");
    if (!panel) return;
    if (mode === "excluir") {
      const food = merenda.find((item) => item.id === alimentoAcaoId);
      if (food?.podeExcluir) window.excluirAlimento(alimentoAcaoId);
      else
        showMessage(
          "mensagemAcaoMerenda",
          "Somente quem cadastrou o alimento ou um administrador pode excluí-lo.",
          "erro",
        );
      return;
    }
    panel.dataset.action = mode;
    renderMerendaActionForm();
  };
  window.fecharAcaoMerenda = () => {
    const panel = byId("acoesMerenda");
    if (panel) {
      panel.hidden = true;
      delete panel.dataset.action;
    }
  };
  byId("alimentoAcao")?.addEventListener("change", (event) => {
    alimentoAcaoId = Number(event.target.value);
    renderMerendaActionForm();
  });
  async function enviarAcaoMerenda(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const mode = byId("acoesMerenda")?.dataset.action || "minimo";
    const routes = {
      minimo: {
        url: `/api/merenda/${alimentoAcaoId}/minimo`,
        method: "PATCH",
        success: "Estoque mínimo atualizado.",
      },
      entrada: {
        url: `/api/merenda/${alimentoAcaoId}/entrada`,
        method: "POST",
        success: "Reposição registrada com sucesso.",
      },
      consumo: {
        url: `/api/merenda/${alimentoAcaoId}/consumo`,
        method: "POST",
        success: "Consumo registrado com sucesso.",
      },
    };
    const operation = routes[mode];
    if (!operation) return;
    try {
      await api(operation.url, { method: operation.method, body: values });
      showMessage("mensagemAcaoMerenda", operation.success, "sucesso");
      await loadFoods();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      showMessage("mensagemAcaoMerenda", error.message, "erro");
    }
  }
  /** Exclui o alimento sem confirmação e preserva as movimentações para auditoria. */
  window.excluirAlimento = async (id) => {
    try {
      await api(`/api/merenda/${id}`, { method: "DELETE" });
      showMessage(
        "mensagemStatus",
        "Alimento excluído. As movimentações anteriores foram mantidas no histórico.",
        "sucesso",
      );
      await loadFoods();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      showMessage("mensagemStatus", error.message, "erro");
    }
  };
  /** Desfaz movimentação de merenda autorizada pela API. */
  window.excluirMovimentacaoMerenda = async (id) => {
    if (
      !window.confirm(
        "Excluir esta movimentação de merenda? O lançamento será cancelado e o saldo será corrigido se for possível.",
      )
    )
      return;
    const motivo = window.prompt(
      "Motivo do cancelamento (para auditoria):",
      "Correção de lançamento",
    );
    if (motivo === null) return;
    try {
      await api(`/api/merenda/consumos/${id}`, {
        method: "DELETE",
        body: { motivo },
      });
      await loadFoods();
      await loadOperationalHistory();
      if (byId("kpiCustoTotalEstoque")) await loadDashboard();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Exporta os alimentos registrados para planilha CSV. */
  window.exportarMerendaCSV = () =>
    downloadCsv("/api/merenda/exportar-csv", "merenda.csv");
  /** Exporta o demonstrativo de custos para CSV. */
  window.exportarFinanceiroCSV = () =>
    downloadCsv("/api/financeiro/exportar-csv", "financeiro.csv");
  /** Exporta a relação de materiais em estoque. */
  window.exportarItensCSV = () => {
    const lines = [
      "Item;Categoria;Quantidade;Mínimo;Custo Unitário;Valor Total",
    ];
    stockItems.forEach((item) =>
      lines.push(
        [
          csvCell(item.nome),
          csvCell(labelCategory(item.categoria)),
          item.quantidade,
          item.minimo,
          item.custoUnitario,
          item.quantidade * item.custoUnitario,
        ].join(";"),
      ),
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    link.download = "estoque.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  /** Exporta o histórico de entradas e saídas. */
  window.exportarHistoricoCSV = () => {
    const lines = [
      "Data;Item;Tipo;Quantidade;Custo Total;Destino;Responsável;Situação",
    ];
    filterMovements().forEach((item) =>
      lines.push(
        [
          item.data,
          csvCell(item.itemNome),
          item.tipo,
          item.quantidade,
          item.custoTotal,
          csvCell(item.destino),
          csvCell(item.responsavel),
          item.cancelada ? "Cancelada" : "Ativa",
        ].join(";"),
      ),
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    link.download = "movimentacoes.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  /** Recarrega o painel financeiro após alterar filtros. */
  window.renderizarTabelaCustos = () =>
    loadFinance().catch((error) => window.alert(error.message));
  /** Recarrega os dados dos relatórios. */
  window.carregarRelatorio = () =>
    loadReport().catch((error) => window.alert(error.message));
  /** Aplica filtros na tabela de usuários administrativos. */
  window.renderizarTabelaUsuarios = renderAdminUsers;
  /** Abre o modal para inclusão administrativa de usuário. */
  window.abrirModalNovoUsuario = () =>
    byId("modalNovoUsuario")?.classList.add("aberto");
  /** Fecha o modal de criação de usuário. */
  window.fecharModalNovoUsuario = () =>
    byId("modalNovoUsuario")?.classList.remove("aberto");
  /** Aprova a solicitação de uma nova conta. */
  window.aprovarUsuario = async (id) => {
    try {
      await api(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        body: { aprovado: true },
      });
      await loadAdmin();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Rejeita uma solicitação de nova conta. */
  window.rejeitarUsuario = async (id) => {
    if (!window.confirm("Deseja rejeitar e remover esta solicitação?")) return;
    try {
      await api(`/api/admin/usuarios/${id}`, { method: "DELETE" });
      await loadAdmin();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Bloqueia ou desbloqueia a conta escolhida. */
  window.alternarUsuario = async (id, ativo) => {
    try {
      await api(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        body: { ativo },
      });
      await loadAdmin();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Cria uma conta pela interface administrativa. */
  window.salvarNovoUsuario = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/admin/usuarios", {
        method: "POST",
        body: {
          nome: byId("novoNome").value,
          cpf: byId("novoCpf").value,
          cargo: byId("novoCargo").value,
          email: byId("novoEmail").value,
          usuario: byId("novoLogin").value,
        },
      });
      window.alert(
        `Usuário criado. Senha temporária: ${result.senhaTemporaria}\nInforme-a ao servidor e solicite a troca após o primeiro acesso.`,
      );
      byId("formNovoUsuario").reset();
      window.fecharModalNovoUsuario();
      await loadAdmin();
    } catch (error) {
      window.alert(error.message);
    }
    return false;
  };
  /** Aciona a redefinição de senha do usuário selecionado. */
  window.redefinirSenhaAdmin = async (id) => {
    if (
      !confirm(
        "Gerar uma nova senha provisória e encerrar as sessões deste usuário?",
      )
    )
      return;
    try {
      const response = await api(`/api/admin/usuarios/${id}/redefinir-senha`, {
        method: "POST",
      });
      alert(
        `Nova senha provisória (copie e transmita por canal seguro): ${response.senhaTemporaria}`,
      );
      await loadAdmin();
    } catch (error) {
      alert(error.message);
    }
  };
  /** Altera a senha autenticada mediante senha atual e confirmação. */
  window.alterarSenhaPerfil = async (event) => {
    event.preventDefault();
    try {
      await api("/api/auth/alterar-senha", {
        method: "POST",
        body: {
          senhaAtual: byId("senhaAtual").value,
          novaSenha: byId("senhaNova").value,
          confirmarNovaSenha: byId("senhaConfirma").value,
        },
      });
      localStorage.removeItem("sgeToken");
      localStorage.removeItem("sgeUser");
      sessionStorage.removeItem("sgeToken");
      sessionStorage.removeItem("sgeUser");
      location.replace("login.html");
    } catch (error) {
      showMessage("msgAlterarSenha", error.message, "erro");
    }
    return false;
  };
  /** Atualiza os dados pessoais editáveis no perfil do usuário. */
  window.salvarDadosPerfil = async (event) => {
    event.preventDefault();
    try {
      const result = await api(`/api/usuarios/${user.id}`, {
        method: "PUT",
        body: {
          nome: byId("usrNome").value,
          email: byId("usrEmail").value,
          telefone: byId("usrTelefone").value,
          cargo: byId("usrCargo").value,
        },
      });
      authStorage.setItem("sgeUser", JSON.stringify({ ...user, ...result }));
      Object.assign(user, result);
      updateUserHeader();
      window.alert("Perfil atualizado com sucesso.");
    } catch (error) {
      window.alert(error.message);
    }
    return false;
  };
  /** Alterna as seções do painel sem recarregar a página. */
  window.alternarAbas = (event, id) => {
    event.preventDefault();
    document
      .querySelectorAll(".tab-btn")
      .forEach((button) => button.classList.remove("ativo"));
    document
      .querySelectorAll(".tab-conteudo")
      .forEach((content) => content.classList.remove("ativo"));
    event.currentTarget.classList.add("ativo");
    byId(id)?.classList.add("ativo");
  };
  /** Abre um chamado de suporte com categoria e descrição. */
  window.enviarChamado = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/chamados", {
        method: "POST",
        body: {
          nome: byId("chamadoNome").value,
          email: byId("chamadoEmail").value,
          assunto: byId("chamadoAssunto").value,
          mensagem: byId("chamadoMensagem").value,
        },
      });
      showMessage(
        "msgChamado",
        `Chamado #${result.id} registrado. Acompanhe o status nesta tela.`,
        "sucesso",
      );
      byId("chamadoMensagem").value = "";
      await loadTickets();
    } catch (error) {
      showMessage("msgChamado", error.message, "erro");
    }
    return false;
  };
  /** Remove chamados somente pela ação administrativa autorizada pela API. */
  window.excluirChamado = async (id) => {
    if (
      !window.confirm(
        `Deseja excluir o chamado #${id}? Esta ação será registrada na auditoria.`,
      )
    )
      return;
    try {
      await api(`/api/chamados/${id}`, { method: "DELETE" });
      await loadTickets();
    } catch (error) {
      window.alert(error.message);
    }
  };
  /** Atualiza indicador de feedback visual da interface. */
  window.alternarHumor = () => {
    const element = byId("humorMsg");
    if (element)
      element.style.display = element.style.display === "none" ? "" : "none";
  };
  window.addEventListener("resize", () => {
    if (financeData) {
      const entries = financeData.extrato
        .filter((row) => row.tipo === "entrada")
        .reduce((sum, row) => sum + row.custoTotal, 0);
      drawDonut(
        "chartComposicaoCustos",
        ["Materiais", "Merenda"],
        [financeData.materiaisValor, financeData.merendaValor],
      );
      drawBars(
        "chartEntradasSaidas",
        ["Entradas", "Saídas", "Saldo"],
        [entries, financeData.saidasValor, financeData.estoqueValor],
        true,
      );
    }
    if (reportData) {
      drawBars(
        "graficoCategorias",
        reportData.porCategoria.map((item) => labelCategory(item.categoria)),
        reportData.porCategoria.map((item) => item.quantidade),
      );
      drawBars(
        "graficoCustos",
        reportData.porCategoria.map((item) => labelCategory(item.categoria)),
        reportData.porCategoria.map((item) => item.valor),
        true,
      );
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    start().catch((error) => {
      console.error(error);
      const main = $(".conteudo");
      if (main) {
        const message = document.createElement("div");
        message.className = "mensagem-status erro";
        message.textContent = `Não foi possível carregar os dados: ${error.message}`;
        main.prepend(message);
      }
    });
  });
})();
