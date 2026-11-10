const express = require('express');
const { db } = require('../db');
const { ApiError, rota } = require('../erro');

const router = express.Router();
const CARGOS = ['Secretário', 'Almoxarifado'];

const paraResposta = (u) => ({
  id: u.id, nome: u.nome, cpf: u.cpf, email: u.email,
  usuario: u.usuario, cargo: u.cargo, telefone: u.telefone,
});

async function obter(id) {
  const [[u]] = await db().query('SELECT * FROM usuarios WHERE id = ?', [id]);
  if (!u) throw new ApiError(404, 'Usuário não encontrado.');
  return u;
}

// GET /api/usuarios/:id  (tela Meu Perfil)
router.get('/:id', rota(async (req, res) => {
  res.json(paraResposta(await obter(req.params.id)));
}));

// PUT /api/usuarios/:id  (CPF não muda)
router.put('/:id', rota(async (req, res) => {
  const u = await obter(req.params.id);
  const { nome, email, telefone, cargo } = req.body;
  if (!nome || !email || !cargo) throw new ApiError(400, 'Nome, e-mail e cargo são obrigatórios.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, 'E-mail inválido.');
  if (!CARGOS.includes(cargo)) throw new ApiError(400, 'Cargo inválido.');
  const emailNovo = email.trim().toLowerCase();
  if (emailNovo !== u.email.toLowerCase()) {
    const [[dup]] = await db().query('SELECT COUNT(*) AS n FROM usuarios WHERE LOWER(email) = ? AND id <> ?', [emailNovo, u.id]);
    if (dup.n) throw new ApiError(409, 'E-mail já cadastrado.');
  }
  await db().query('UPDATE usuarios SET nome = ?, email = ?, telefone = ?, cargo = ? WHERE id = ?',
    [nome.trim(), emailNovo, telefone || null, cargo, u.id]);
  res.json(paraResposta(await obter(u.id)));
}));

module.exports = router;
