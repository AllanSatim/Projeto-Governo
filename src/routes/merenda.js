const express = require('express');
const { db } = require('../db');
const { ApiError, rota } = require('../erro');

const router = express.Router();
const CATEGORIAS = ['graos', 'hortifruti', 'laticinios', 'proteinas', 'perecivel', 'naoperecivel'];
const UNIDADES = ['kg', 'litros', 'unidades', 'caixas', 'pacotes'];

const SELECT = `SELECT id, nome, categoria, quantidade, unidade,
  custo_unitario AS custoUnitario, data_entrada AS dataEntrada, fornecedor,
  ROUND(quantidade * custo_unitario, 2) AS valorTotal
  FROM alimentos_merenda`;

// GET /api/merenda
router.get('/', rota(async (req, res) => {
  const [linhas] = await db().query(`${SELECT} ORDER BY data_entrada DESC, id DESC`);
  res.json(linhas);
}));

// POST /api/merenda
router.post('/', rota(async (req, res) => {
  const { nome, categoria, quantidade, unidade, custoUnitario, dataEntrada, fornecedor } = req.body;
  if (!nome || !String(nome).trim()) throw new ApiError(400, 'Nome do alimento é obrigatório.');
  if (!CATEGORIAS.includes(categoria)) throw new ApiError(400, 'Categoria inválida.');
  if (!UNIDADES.includes(unidade)) throw new ApiError(400, 'Unidade inválida.');
  if (!(Number(quantidade) > 0)) throw new ApiError(400, 'Quantidade deve ser maior que zero.');
  if (!(Number(custoUnitario) >= 0)) throw new ApiError(400, 'Custo unitário não pode ser negativo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntrada || ''))) throw new ApiError(400, 'Data de entrada inválida.');

  const [r] = await db().query(
    `INSERT INTO alimentos_merenda (nome, categoria, quantidade, unidade, custo_unitario, data_entrada, fornecedor)
     VALUES (?,?,?,?,?,?,?)`,
    [nome.trim(), categoria, quantidade, unidade, custoUnitario, dataEntrada, fornecedor ? String(fornecedor).trim() : null]);
  const [[novo]] = await db().query(`${SELECT} WHERE id = ?`, [r.insertId]);
  res.status(201).json(novo);
}));

// GET /api/merenda/resumo
router.get('/resumo', rota(async (req, res) => {
  const [[r]] = await db().query(
    'SELECT COUNT(*) AS totalRegistros, COALESCE(ROUND(SUM(quantidade * custo_unitario), 2), 0) AS valorTotal FROM alimentos_merenda');
  res.json(r);
}));

// GET /api/merenda/exportar-csv
router.get('/exportar-csv', rota(async (req, res) => {
  const [linhas] = await db().query(`${SELECT} ORDER BY data_entrada DESC, id DESC`);
  const csv = (s) => (s == null ? '' : `"${String(s).replace(/"/g, '""')}"`);
  let out = '\uFEFFAlimento;Categoria;Quantidade;Unidade;Custo Unitário;Valor Total;Data de Entrada;Fornecedor\n';
  for (const a of linhas) {
    out += [csv(a.nome), a.categoria, a.quantidade, a.unidade, a.custoUnitario, a.valorTotal, a.dataEntrada, csv(a.fornecedor)].join(';') + '\n';
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=merenda.csv');
  res.send(out);
}));

// DELETE /api/merenda/:id
router.delete('/:id', rota(async (req, res) => {
  const [r] = await db().query('DELETE FROM alimentos_merenda WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new ApiError(404, 'Alimento não encontrado.');
  res.status(204).end();
}));

module.exports = router;
