require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { iniciarBanco } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Front end (css/, js/ e os .html ficam na pasta public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Rotas prontas (Allan) ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/merenda', require('./routes/merenda'));

// ---- Rotas dos colegas (arquivos em src/equipe/) ----
app.use('/api/estoque', require('./equipe/estoque'));
app.use('/api/movimentacoes', require('./equipe/movimentacoes'));
app.use('/api/financeiro', require('./equipe/financeiro'));
app.use('/api/relatorios', require('./equipe/relatorios'));
app.use('/api/admin', require('./equipe/admin'));
app.use('/api/chamados', require('./equipe/chamados'));
app.use('/api/painel', require('./equipe/painel'));

// 404 da API e tratamento de erros: sempre responde {"erro": "mensagem"}
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ erro: err.message });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
iniciarBanco()
  .then(() => app.listen(PORT, () => console.log(`SGE rodando em http://localhost:${PORT}`)))
  .catch((e) => {
    console.error('Falha ao conectar no MySQL. Confira o .env:', e.message);
    process.exit(1);
  });
