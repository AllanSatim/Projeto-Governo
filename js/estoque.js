let items = [];
let history = [];

const catLabel = {
  livros: 'Livros',
  uniformes: 'Uniformes',
  materiais: 'Materiais',
  outros: 'Outros'
};

function formatarMoeda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataISO) {
  if (!dataISO) return '—';
  if (dataISO.includes('/')) return dataISO;
  const [ano, mes, dia] = dataISO.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

function mostrarMensagem(elementId, texto, tipo) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = texto;
  el.className = `mensagem-status ${tipo}`;
  setTimeout(() => { el.textContent = ''; el.className = 'mensagem-status'; }, 4000);
}

/* ---------- CARREGAMENTO ---------- */

function carregarDados() {
  fetch('/api/itens')
    .then(res => res.json())
    .then(dados => {
      items = dados;
      renderAll();
    })
    .catch(err => console.error('Erro ao carregar itens:', err));

  carregarHistorico();
}

function carregarHistorico() {
  fetch('/api/movimentacoes')
    .then(res => res.json())
    .then(dados => {
      history = dados;
      renderHistory();
    })
    .catch(err => console.error('Erro ao carregar movimentações:', err));
}

/* ---------- CADASTRO DE ITENS ---------- */

function addItem() {
  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value;
  const qty = parseInt(document.getElementById('itemQty').value) || 0;
  const min = parseInt(document.getElementById('itemMin').value) || 0;
  const custoUnitario = parseFloat(document.getElementById('itemCusto').value) || 0;

  if (!name) {
    mostrarMensagem('mensagemItem', 'Digite o nome do item.', 'erro');
    return;
  }

  fetch('/api/itens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, qty, min, custoUnitario })
  })
    .then(res => {
      if (!res.ok) throw new Error('Falha ao salvar');
      return res.json();
    })
    .then(() => {
      mostrarMensagem('mensagemItem', 'Item cadastrado com sucesso!', 'sucesso');
      document.getElementById('itemName').value = '';
      document.getElementById('itemQty').value = 0;
      document.getElementById('itemMin').value = 5;
      document.getElementById('itemCusto').value = '0.00';
      carregarDados();
    })
    .catch(err => {
      console.error('Erro ao cadastrar item:', err);
      mostrarMensagem('mensagemItem', 'Não foi possível salvar. Tente novamente.', 'erro');
    });
}

function deleteItem(id) {
  if (!confirm('Remover este item do estoque?')) return;

  fetch(`/api/itens/${id}`, { method: 'DELETE' })
    .then(res => {
      if (!res.ok) throw new Error('Falha ao remover');
      carregarDados();
    })
    .catch(err => {
      console.error('Erro ao remover item:', err);
      mostrarMensagem('mensagemItem', 'Não foi possível remover o item.', 'erro');
    });
}

function editItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const newName = prompt('Novo nome do item:', item.name);
  if (newName === null) return;
  const newMin = prompt('Novo estoque mínimo:', item.min);
  if (newMin === null) return;
  const newCusto = prompt('Novo custo unitário (R$):', item.custoUnitario || 0);
  if (newCusto === null) return;

  const dadosAtualizados = {
    name: newName.trim() || item.name,
    min: parseInt(newMin) || 0,
    custoUnitario: parseFloat(newCusto) || 0
  };

  fetch(`/api/itens/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dadosAtualizados)
  })
    .then(res => {
      if (!res.ok) throw new Error('Falha ao atualizar');
      carregarDados();
    })
    .catch(err => {
      console.error('Erro ao atualizar item:', err);
      mostrarMensagem('mensagemItem', 'Não foi possível atualizar o item.', 'erro');
    });
}

/* ---------- MOVIMENTAÇÃO ---------- */

function moveStock(type) {
  const itemId = parseInt(document.getElementById('moveItem').value);
  const qty = parseInt(document.getElementById('moveQty').value);
  const custoUnitario = parseFloat(document.getElementById('moveCusto').value) || 0;
  const responsavel = document.getElementById('moveResponsavel').value.trim();

  if (!itemId) {
    mostrarMensagem('mensagemMovimentacao', 'Cadastre um item primeiro.', 'erro');
    return;
  }
  if (!qty || qty <= 0) {
    mostrarMensagem('mensagemMovimentacao', 'Informe uma quantidade válida.', 'erro');
    return;
  }
  if (!responsavel) {
    mostrarMensagem('mensagemMovimentacao', 'Informe o responsável pela movimentação.', 'erro');
    return;
  }

  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (type === 'saida' && qty > item.qty) {
    mostrarMensagem('mensagemMovimentacao', `Saída maior que o estoque disponível (${item.qty}).`, 'erro');
    return;
  }

  fetch('/api/movimentacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, type, qty, custoUnitario, responsavel })
  })
    .then(res => {
      if (!res.ok) throw new Error('Falha ao registrar');
      return res.json();
    })
    .then(() => {
      mostrarMensagem('mensagemMovimentacao', 'Movimentação registrada!', 'sucesso');
      document.getElementById('moveQty').value = 1;
      document.getElementById('moveCusto').value = '0.00';
      carregarDados();
    })
    .catch(err => {
      console.error('Erro ao registrar movimentação:', err);
      mostrarMensagem('mensagemMovimentacao', 'Não foi possível registrar. Tente novamente.', 'erro');
    });
}

/* ---------- RENDERIZAÇÃO ---------- */

function renderMoveSelect() {
  const sel = document.getElementById('moveItem');
  const current = sel.value;
  sel.innerHTML = items.map(i =>
    `<option value="${i.id}">${i.name} (${catLabel[i.category] || i.category})</option>`
  ).join('');
  if (current) sel.value = current;
}

function renderFiltroProdutos() {
  const sel = document.getElementById('filtroProduto');
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos os produtos</option>' +
    items.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  if (current) sel.value = current;
}

function renderStats() {
  const valorTotal = items.reduce((s, i) => s + (i.qty * (Number(i.custoUnitario) || 0)), 0);

  document.getElementById('statTipos').textContent = items.length;
  document.getElementById('statUnidades').textContent = items.reduce((s, i) => s + i.qty, 0);
  document.getElementById('statBaixo').textContent = items.filter(i => i.qty <= i.min).length;
  document.getElementById('statValorTotal').textContent = formatarMoeda(valorTotal);
}

function itensFiltrados() {
  const search = document.getElementById('search').value.toLowerCase();
  const filterCat = document.getElementById('filterCategory').value;

  return items.filter(i =>
    i.name.toLowerCase().includes(search) &&
    (filterCat === '' || i.category === filterCat)
  );
}

function renderTable() {
  const filtered = itensFiltrados();
  const tbody = document.getElementById('tableBody');
  const emptyMsg = document.getElementById('emptyMsg');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  tbody.innerHTML = filtered.map(i => {
    const custo = Number(i.custoUnitario) || 0;
    return `
    <tr>
      <td>${i.name}</td>
      <td><span class="badge badge-${i.category}">${catLabel[i.category] || i.category}</span></td>
      <td class="${i.qty <= i.min ? 'stock-low' : 'stock-ok'}">${i.qty}</td>
      <td>${i.min}</td>
      <td>${formatarMoeda(custo)}</td>
      <td>${formatarMoeda(custo * i.qty)}</td>
      <td class="row-actions">
        <button class="edit" onclick="editItem(${i.id})">Editar</button>
        <button class="del" onclick="deleteItem(${i.id})">Excluir</button>
      </td>
    </tr>`;
  }).join('');
}

/* ---------- FILTROS DE MOVIMENTAÇÃO (RF08) ---------- */

function movimentacoesFiltradas() {
  const dataInicio = document.getElementById('filtroDataInicio').value;
  const dataFim = document.getElementById('filtroDataFim').value;
  const produtoId = document.getElementById('filtroProduto').value;
  const tipo = document.getElementById('filtroTipo').value;
  const responsavel = document.getElementById('filtroResponsavel').value.toLowerCase().trim();

  return (history || []).filter(h => {
    const dataMov = (h.date || '').split('T')[0];

    if (dataInicio && dataMov < dataInicio) return false;
    if (dataFim && dataMov > dataFim) return false;
    if (produtoId && String(h.itemId) !== String(produtoId)) return false;
    if (tipo && h.type !== tipo) return false;
    if (responsavel && !(h.responsavel || '').toLowerCase().includes(responsavel)) return false;

    return true;
  });
}

function limparFiltros() {
  document.getElementById('filtroDataInicio').value = '';
  document.getElementById('filtroDataFim').value = '';
  document.getElementById('filtroProduto').value = '';
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroResponsavel').value = '';
  renderHistory();
}

function renderHistory() {
  const tbody = document.getElementById('historyBody');
  const emptyHist = document.getElementById('emptyHist');
  const resumo = document.getElementById('resumoFiltro');

  const filtradas = movimentacoesFiltradas();

  const custoEntradas = filtradas
    .filter(h => h.type === 'entrada')
    .reduce((s, h) => s + (Number(h.custoTotal) || 0), 0);
  const custoSaidas = filtradas
    .filter(h => h.type === 'saida')
    .reduce((s, h) => s + (Number(h.custoTotal) || 0), 0);

  resumo.innerHTML = `
    <span>${filtradas.length} movimentação(ões)</span>
    <span>Custo de entradas: <strong>${formatarMoeda(custoEntradas)}</strong></span>
    <span>Custo de saídas: <strong>${formatarMoeda(custoSaidas)}</strong></span>
  `;

  if (filtradas.length === 0) {
    tbody.innerHTML = '';
    emptyHist.style.display = 'block';
    return;
  }
  emptyHist.style.display = 'none';

  tbody.innerHTML = filtradas.map(h => `
    <tr>
      <td>${formatarData(h.date)}</td>
      <td>${h.itemName}</td>
      <td><span class="badge ${h.type === 'entrada' ? 'badge-materiais' : 'badge-uniformes'}">${h.type === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
      <td>${h.qty} un.</td>
      <td>${formatarMoeda(h.custoTotal)}</td>
      <td>${h.responsavel || '—'}</td>
    </tr>
  `).join('');
}

/* ---------- EXPORTAÇÃO CSV (RF09) ---------- */

function baixarCSV(nomeArquivo, linhas) {
  const csv = linhas.map(linha =>
    linha.map(celula => {
      const texto = String(celula ?? '');
      return texto.includes(';') || texto.includes('"')
        ? `"${texto.replace(/"/g, '""')}"`
        : texto;
    }).join(';')
  ).join('\r\n');

  // BOM para o Excel reconhecer acentuação corretamente
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportarItensCSV() {
  const filtered = itensFiltrados();
  if (filtered.length === 0) {
    mostrarMensagem('mensagemItem', 'Nada para exportar.', 'erro');
    return;
  }

  const linhas = [
    ['Item', 'Categoria', 'Quantidade', 'Estoque minimo', 'Custo unitario (R$)', 'Valor total (R$)']
  ];

  filtered.forEach(i => {
    const custo = Number(i.custoUnitario) || 0;
    linhas.push([
      i.name,
      catLabel[i.category] || i.category,
      i.qty,
      i.min,
      custo.toFixed(2).replace('.', ','),
      (custo * i.qty).toFixed(2).replace('.', ',')
    ]);
  });

  const hoje = new Date().toISOString().split('T')[0];
  baixarCSV(`estoque-itens-${hoje}.csv`, linhas);
}

function exportarMovimentacoesCSV() {
  const filtradas = movimentacoesFiltradas();
  if (filtradas.length === 0) {
    mostrarMensagem('mensagemMovimentacao', 'Nada para exportar.', 'erro');
    return;
  }

  const linhas = [
    ['Data', 'Item', 'Tipo', 'Quantidade', 'Custo unitario (R$)', 'Custo total (R$)', 'Responsavel']
  ];

  filtradas.forEach(h => {
    linhas.push([
      formatarData(h.date),
      h.itemName,
      h.type === 'entrada' ? 'Entrada' : 'Saida',
      h.qty,
      (Number(h.custoUnitario) || 0).toFixed(2).replace('.', ','),
      (Number(h.custoTotal) || 0).toFixed(2).replace('.', ','),
      h.responsavel || ''
    ]);
  });

  const hoje = new Date().toISOString().split('T')[0];
  baixarCSV(`movimentacoes-${hoje}.csv`, linhas);
}

function renderAll() {
  renderMoveSelect();
  renderFiltroProdutos();
  renderStats();
  renderTable();
}

carregarDados();