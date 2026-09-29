function alternarSenha() {
  const campo = document.getElementById('senha');
  const botao = document.getElementById('btnMostrarSenha');

  if (campo.type === 'password') {
    campo.type = 'text';
    botao.textContent = 'Ocultar';
  } else {
    campo.type = 'password';
    botao.textContent = 'Mostrar';
  }
}

function mostrarMensagem(texto, tipo) {
  const el = document.getElementById('mensagemLogin');
  el.textContent = texto;
  el.className = `mensagem-status ${tipo}`;
}

function realizarLogin(event) {
  event.preventDefault();

  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;
  const botaoEntrar = document.querySelector('.btn-entrar');

  if (!usuario || !senha) {
    mostrarMensagem('Preencha usuário e senha.', 'erro');
    return false;
  }

  botaoEntrar.disabled = true;
  botaoEntrar.textContent = 'Entrando...';
  mostrarMensagem('', '');

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, senha })
  })
    .then(res => {
      if (!res.ok) throw new Error('Credenciais inválidas');
      return res.json();
    })
    .then(dados => {
      if (dados.token) {
        localStorage.setItem('sge_token', dados.token);
      }
      mostrarMensagem('Login realizado com sucesso!', 'sucesso');
      window.location.href = 'index.html';
    })
    .catch(err => {
      console.error('Erro no login:', err);
      mostrarMensagem('Usuário ou senha inválidos.', 'erro');
    })
    .finally(() => {
      botaoEntrar.disabled = false;
      botaoEntrar.textContent = 'Entrar';
    });

  return false;
}