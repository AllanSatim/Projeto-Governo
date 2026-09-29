function carregarIndicadoresPainel() {
  fetch('/api/painel/indicadores')
    .then(res => res.json())
    .then(dados => {
      document.getElementById('qtdItensEstoque').textContent = dados.itensEstoque;
      document.getElementById('notaItensEstoque').textContent = `Atualizado ${dados.atualizadoEm}`;

      document.getElementById('qtdItensBaixo').textContent = dados.itensBaixo;
      document.getElementById('notaItensBaixo').textContent = `Repor em até 5 dias`;

      document.getElementById('qtdEscolas').textContent = dados.escolasAtendidas;
      document.getElementById('notaEscolas').textContent = `Todas com estoque ativo`;

      document.getElementById('qtdRelatorios').textContent = dados.relatoriosPendentes;
      document.getElementById('notaRelatorios').textContent = `Prazo: ${dados.prazoRelatorios}`;
    })
    .catch(err => {
      console.error('Erro ao carregar indicadores:', err);
    });
}

carregarIndicadoresPainel();