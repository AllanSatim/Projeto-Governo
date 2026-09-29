const categoriaLabel = {
  graos: 'Grãos e cereais',
  hortifruti: 'Hortifrúti',
  laticinios: 'Laticínios',
  proteinas: 'Carnes e proteínas',
  perecivel: 'Outros perecíveis',
  naoperecivel: 'Outros não perecíveis'
};

function mesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function formatarData(dataISO) {
  if (!dataISO) return '—';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function mostrarMensagem(texto, tipo) {
  const el = document.getElementById('mensagemStatus');
  el.textContent = texto;
  el.className = `mensagem-status ${tipo}`;
  setTimeout(() => { el.textContent = ''; el.className = 'mensagem-status'; }, 4000);
}

function carregarAlimentos() {
  fetch(`/api/merenda/alimentos?mes=${mesAtual()}`)
    .then(res => res.json())
    .then(dados => renderTabela(dados))
    .catch(err => {
      console.error('Erro ao carregar alimentos:', err);
      document.getElementById('totalRegistros').textContent = 'Falha ao carregar';
    });
}

function renderTabela(alimentos) {
  const tbody = document.getElementById('tabelaAlimentos');
  const semAlimentos = document.getElementById('semAlimentos');
  const totalRegistros = document.getElementById('totalRegistros');

  totalRegistros.textContent = `${alimentos.length} registro(s) neste mês`;

  if (!alimentos || alimentos.length === 0) {
    tbody.innerHTML = '';
    semAlimentos.style.display = 'block';
    return;
  }
  semAlimentos.style.display = 'none';

  tbody.innerHTML = alimentos.map(a => `
    <tr>
      <td>${a.nome}</td>
      <td>${categoriaLabel[a.categoria] || a.categoria}</td>
      <td class="mono">${a.quantidade} ${a.unidade}</td>
      <td>${formatarData(a.dataRecebimento)}</td>
      <td>${a.fornecedor || '—'}</td>
    </tr>
  `).join('');
}

function registrarAlimento() {
  const nome = document.getElementById('alimentoNome').value.trim();
  const categoria = document.getElementById('alimentoCategoria').value;
  const quantidade = parseFloat(document.getElementById('alimentoQuantidade').value) || 0;
  const unidade = document.getElementById('alimentoUnidade').value;
  const dataRecebimento = document.getElementById('alimentoData').value;
  const fornecedor = document.getElementById('alimentoFornecedor').value.trim();

  if (!nome) {
    mostrarMensagem('Digite o nome do alimento.', 'erro');
    return;
  }
  if (quantidade <= 0) {
    mostrarMensagem('Informe uma quantidade válida.', 'erro');
    return;
  }
  if (!dataRecebimento) {
    mostrarMensagem('Selecione a data de recebimento.', 'erro');
    return;
  }

  const novoAlimento = { nome, categoria, quantidade, unidade, dataRecebimento, fornecedor };

  fetch('/api/merenda/alimentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(novoAlimento)
  })
    .then(res => {
      if (!res.ok) throw new Error('Falha ao salvar');
      return res.json();
    })
    .then(() => {
      mostrarMensagem('Alimento registrado com sucesso!', 'sucesso');
      document.getElementById('alimentoNome').value = '';
      document.getElementById('alimentoQuantidade').value = 0;
      document.getElementById('alimentoData').value = '';
      document.getElementById('alimentoFornecedor').value = '';
      carregarAlimentos();
    })
    .catch(err => {
      console.error('Erro ao registrar alimento:', err);
      mostrarMensagem('Não foi possível salvar. Tente novamente.', 'erro');
    });
}

carregarAlimentos();