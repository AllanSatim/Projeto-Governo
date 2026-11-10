const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { ApiError, rota } = require('../erro');

const router = express.Router();
const CARGOS = ['Secretário', 'Almoxarifado'];

const paraResposta = (u) => ({
  id: u.id, nome: u.nome, cpf: u.cpf, email: u.email,
  usuario: u.usuario, cargo: u.cargo, telefone: u.telefone,
});

async function buscarPorIdentificador(identificador) {
  const v = String(identificador || '').trim();
  const [linhas] = await db().query(
    'SELECT * FROM usuarios WHERE LOWER(usuario) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1', [v, v]);
  return linhas[0] || null;
}

// POST /api/auth/cadastro
router.post('/cadastro', rota(async (req, res) => {
  const { nome, cpf, cargo, email, usuario, senha, confirmarSenha } = req.body;
  if (!nome || !cpf || !cargo || !email || !usuario || !senha) throw new ApiError(400, 'Preencha todos os campos obrigatórios.');
  const cpfNum = String(cpf).replace(/\D/g, '');
  if (cpfNum.length !== 11) throw new ApiError(400, 'CPF deve ter 11 dígitos.');
  if (!CARGOS.includes(cargo)) throw new ApiError(400, 'Cargo inválido.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, 'E-mail inválido.');
  if (String(senha).length < 6) throw new ApiError(400, 'A senha precisa ter no mínimo 6 caracteres.');
  if (senha !== confirmarSenha) throw new ApiError(400, 'As senhas não conferem.');

  const [[existe]] = await db().query(
    `SELECT
       SUM(cpf = ?) AS cpf, SUM(LOWER(email) = LOWER(?)) AS email, SUM(LOWER(usuario) = LOWER(?)) AS usuario
     FROM usuarios`, [cpfNum, email.trim(), usuario.trim()]);
  if (Number(existe.cpf)) throw new ApiError(409, 'CPF já cadastrado.');
  if (Number(existe.email)) throw new ApiError(409, 'E-mail já cadastrado.');
  if (Number(existe.usuario)) throw new ApiError(409, 'Nome de usuário já em uso.');

  const hash = await bcrypt.hash(senha, 10);
  const [r] = await db().query(
    'INSERT INTO usuarios (nome, cpf, cargo, email, usuario, senha_hash) VALUES (?,?,?,?,?,?)',
    [nome.trim(), cpfNum, cargo, email.trim().toLowerCase(), usuario.trim(), hash]);
  const [[novo]] = await db().query('SELECT * FROM usuarios WHERE id = ?', [r.insertId]);
  res.status(201).json(paraResposta(novo));
}));

// POST /api/auth/login
router.post('/login', rota(async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) throw new ApiError(400, 'Informe usuário e senha.');
  const u = await buscarPorIdentificador(usuario);
  // mesma mensagem para usuário inexistente e senha errada
  if (!u || !(await bcrypt.compare(senha, u.senha_hash))) throw new ApiError(401, 'Usuário ou senha inválidos.');
  if (!u.ativo) throw new ApiError(403, 'Conta desativada. Procure o administrador.');
  res.json(paraResposta(u));
}));

// POST /api/auth/recuperar  -> gera código de 6 dígitos (15 min)
router.post('/recuperar', rota(async (req, res) => {
  const u = await buscarPorIdentificador(req.body.identificador);
  if (!u) throw new ApiError(404, 'Usuário não encontrado.');
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db().query(
    'UPDATE usuarios SET codigo_recuperacao = ?, codigo_expira_em = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?',
    [codigo, u.id]);
  // DEMONSTRAÇÃO: devolve o código. Em produção, enviar por e-mail e NÃO devolver.
  res.json({ mensagem: 'Código gerado com sucesso.', codigoDemo: codigo });
}));

// POST /api/auth/redefinir
router.post('/redefinir', rota(async (req, res) => {
  const { identificador, codigo, novaSenha, confirmarNovaSenha } = req.body;
  if (!novaSenha || String(novaSenha).length < 6) throw new ApiError(400, 'A senha precisa ter no mínimo 6 caracteres.');
  if (novaSenha !== confirmarNovaSenha) throw new ApiError(400, 'As senhas não conferem.');
  const u = await buscarPorIdentificador(identificador);
  const [[valido]] = u
    ? await db().query('SELECT (codigo_recuperacao = ? AND codigo_expira_em > NOW()) AS ok FROM usuarios WHERE id = ?', [String(codigo), u.id])
    : [[{ ok: 0 }]];
  if (!u || !Number(valido.ok)) throw new ApiError(400, 'Código inválido ou expirado.');
  const hash = await bcrypt.hash(novaSenha, 10);
  await db().query(
    'UPDATE usuarios SET senha_hash = ?, codigo_recuperacao = NULL, codigo_expira_em = NULL WHERE id = ?', [hash, u.id]);
  res.json({ mensagem: 'Senha atualizada com sucesso.' });
}));

module.exports = router;
