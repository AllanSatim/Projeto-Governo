require('dotenv').config();
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
};
const nomeBanco = process.env.DB_NAME || 'sge_educacao';

let pool;

/** Cria o banco e as tabelas se ainda não existirem. */
async function iniciarBanco() {
  const conn = await mysql.createConnection(cfg);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${nomeBanco}\` CHARACTER SET utf8mb4`);
  await conn.end();

  pool = mysql.createPool({ ...cfg, database: nomeBanco, waitForConnections: true, connectionLimit: 10, decimalNumbers: true, dateStrings: true });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      cpf CHAR(11) NOT NULL UNIQUE,
      cargo VARCHAR(30) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      usuario VARCHAR(60) NOT NULL UNIQUE,
      senha_hash VARCHAR(100) NOT NULL,
      telefone VARCHAR(30),
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      codigo_recuperacao CHAR(6),
      codigo_expira_em DATETIME
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alimentos_merenda (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      categoria VARCHAR(30) NOT NULL,
      quantidade DECIMAL(12,2) NOT NULL,
      unidade VARCHAR(20) NOT NULL,
      custo_unitario DECIMAL(12,2) NOT NULL,
      data_entrada DATE NOT NULL,
      fornecedor VARCHAR(150)
    )`);
}

// Os colegas usam: const { db } = require('../db');  e depois  await db().query('SELECT ...')
const db = () => pool;

module.exports = { iniciarBanco, db };
