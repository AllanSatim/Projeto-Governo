const INTERVALO_ATUALIZACAO_MS = 60000; // 1 minuto

let graficoCategorias = null;
let graficoCustos = null;
let dadosAtuais = null;

function formatarMoeda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ---------- GRÁFICOS ---------- */

function criarGraficoBarras(canvasId, label, cor) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: label,
        data: [],
        backgroundColor: cor,
        borderRadius: 4,
        maxBarThickness: 60
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function atualizarGrafico(grafico, labels, valores) {
  grafico.data.labels = labels;
  grafico.data.datasets[0].data = valores;
  grafico.update();
}

/* ---------- TABELA DE ITENS CRÍTICOS ---------- */

function renderItensCriticos(itens) {
  const tbody = document.getElementById('tabelaItensCriticos');
  const semItens = document.getElementById('semItensCriticos');

  if (!itens || itens.length === 0) {
    tbody.innerHTML = '';
    semItens.style.display = 'block';
    return;
  }
  semItens.style.display = 'none';

  tbody.innerHTML = itens.map(item => `
    <tr>
      <td>${item.nome}</td>
      <td>${item.categoria}</td>
      <td>${item.escola || '—'}</td>
      <td class="mono qtd-critica">${item.quantidade}</td>
      <td class="mono">${item.minimo}</td>
      <td>${formatarMoeda(item.custoReposicao)}</td>
    </tr>
  `).join('');
}

/* ---------- CARREGAMENTO (com filtro de período — RF08) ---------- */

function carregarRelatorio() {
  const inicio = document.getElementById('periodoInicio').value;
  const fim = document.getElementById('periodoFim').value;

  const params = new URLSearchParams();
  if (inicio) params.append('inicio', inicio);
  if (fim) params.append('fim', fim);

  const url = params.toString()
    ? `/api/relatorios/estoque?${params.toString()}`
    : '/api/relatorios/estoque';

  fetch(url)
    .then(res => res.json())
    .then(dados => {
      dadosAtuais = dados;

      const labels = dados.porCategoria.map(c => c.categoria);
      atualizarGrafico(graficoCategorias, labels, dados.porCategoria.map(c => c.quantidade));
      atualizarGrafico(graficoCustos, labels, dados.porCategoria.map(c => c.custoTotal));

      document.getElementById('valorTotalEstoque').textContent = formatarMoeda(dados.valorTotalEstoque);
      document.getElementById('custoEntradas').textContent = formatarMoeda(dados.custoEntradas);
      document.getElementById('custoSaidas').textContent = formatarMoeda(dados.custoSaidas);

      renderItensCriticos(dados.itensAbaixoMinimo);

      const marcador = document.getElementById('ultimaAtualizacao');
      marcador.textContent = dados.atualizadoEm
        ? `Atualizado às ${dados.atualizadoEm}`
        : `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
    })
    .catch(err => {
      console.error('Erro ao carregar relatório de estoque:', err);
      document.getElementById('ultimaAtualizacao').textContent = 'Falha ao atualizar';
    });
}

/* ---------- EXPORTAÇÃO (RF09) ---------- */

function baixarCSV(nomeArquivo, linhas) {
  const csv = linhas.map(linha =>
    linha.map(celula => {
      const texto = String(celula ?? '');
      return texto.includes(';') || texto.includes('"')
        ? `"${texto.replace(/"/g, '""')}"`
        : texto;
    }).join(';')
  ).join('\r\n');

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

function exportarRelatorioCSV() {
  if (!dadosAtuais) {
    alert('Aguarde o carregamento dos dados.');
    return;
  }

  const inicio = document.getElementById('periodoInicio').value;
  const fim = document.getElementById('periodoFim').value;

  const linhas = [];

  linhas.push(['RELATORIO DE ESTOQUE - Secretaria Municipal de Educacao']);
  linhas.push(['Periodo', inicio ? `${inicio} a ${fim || 'hoje'}` : 'Consolidado atual']);
  linhas.push(['Gerado em', new Date().toLocaleString('pt-BR')]);
  linhas.push([]);

  linhas.push(['RESUMO FINANCEIRO']);
  linhas.push(['Valor total em estoque (R$)', (Number(dadosAtuais.valorTotalEstoque) || 0).toFixed(2).replace('.', ',')]);
  linhas.push(['Custo de entradas (R$)', (Number(dadosAtuais.custoEntradas) || 0).toFixed(2).replace('.', ',')]);
  linhas.push(['Custo de saidas (R$)', (Number(dadosAtuais.custoSaidas) || 0).toFixed(2).replace('.', ',')]);
  linhas.push([]);

  linhas.push(['ESTOQUE POR CATEGORIA']);
  linhas.push(['Categoria', 'Quantidade', 'Custo total (R$)']);
  dadosAtuais.porCategoria.forEach(c => {
    linhas.push([
      c.categoria,
      c.quantidade,
      (Number(c.custoTotal) || 0).toFixed(2).replace('.', ',')
    ]);
  });
  linhas.push([]);

  linhas.push(['ITENS ABAIXO DO ESTOQUE MINIMO']);
  linhas.push(['Item', 'Categoria', 'Escola', 'Quantidade', 'Minimo', 'Custo de reposicao (R$)']);
  (dadosAtuais.itensAbaixoMinimo || []).forEach(i => {
    linhas.push([
      i.nome,
      i.categoria,
      i.escola || '',
      i.quantidade,
      i.minimo,
      (Number(i.custoReposicao) || 0).toFixed(2).replace('.', ',')
    ]);
  });

  const hoje = new Date().toISOString().split('T')[0];
  baixarCSV(`relatorio-estoque-${hoje}.csv`, linhas);
}

/* ---------- INICIALIZAÇÃO ---------- */

graficoCategorias = criarGraficoBarras('graficoCategorias', 'Quantidade em estoque', '#1868B7');
graficoCustos = criarGraficoBarras('graficoCustos', 'Custo total (R$)', '#2E7D4F');

carregarRelatorio();
setInterval(carregarRelatorio, INTERVALO_ATUALIZACAO_MS);