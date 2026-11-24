-- ===========================================================================
-- SGE EDUCACAO | INSTALACAO COMPLETA PARA XAMPP (MariaDB / MySQL)
-- Execute TODO este arquivo no phpMyAdmin > SQL, com um banco novo.
-- Cria 15 tabelas e insere registros FICTICIOS para testes do ERP.
-- Nao apaga bancos ou tabelas existentes.
-- A aplicacao Node.js acessa os dados diretamente com mysql2.
-- Conta DEMO: admin | senha: SGE@2026#Teste!
-- Troque a senha assim que entrar. NAO UTILIZE DADOS REAIS DE ALUNOS.
-- ===========================================================================

CREATE DATABASE IF NOT EXISTS `sge_educacao`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sge_educacao`;
SET NAMES utf8mb4;

-- 1. ESTRUTURA RELACIONAL (a mesma utilizada pelo src/db-mysql.js)
CREATE TABLE IF NOT EXISTS sge_meta (chave VARCHAR(40) PRIMARY KEY, valor TEXT NOT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS usuarios (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL, cpf VARCHAR(11) NOT NULL UNIQUE, cargo VARCHAR(40) NOT NULL, perfil VARCHAR(20) NOT NULL DEFAULT 'secretario',
 email VARCHAR(180) NOT NULL UNIQUE, usuario VARCHAR(80) NOT NULL UNIQUE, senha_hash VARCHAR(255) NOT NULL,
 telefone VARCHAR(40), ativo BOOLEAN NOT NULL DEFAULT 0, aprovado BOOLEAN NOT NULL DEFAULT 0,
 criadoEm VARCHAR(32) NOT NULL, ultimoAcesso VARCHAR(32), codigo_recuperacao VARCHAR(255), codigo_expira_em VARCHAR(32)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS itens_estoque (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL UNIQUE, categoria VARCHAR(40) NOT NULL,
 unidade VARCHAR(30) NOT NULL, quantidade DECIMAL(14,3) NOT NULL DEFAULT 0, minimo DECIMAL(14,3) NOT NULL DEFAULT 0,
 custoUnitario DECIMAL(14,4) NOT NULL DEFAULT 0, cadastradoPor VARCHAR(180) NULL, cadastradoPorId INT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movimentacoes (
 id INT PRIMARY KEY, itemId INT NOT NULL, itemNome VARCHAR(180) NOT NULL, tipo VARCHAR(10) NOT NULL,
 quantidade DECIMAL(14,3) NOT NULL, custoUnitario DECIMAL(14,4) NOT NULL, custoTotal DECIMAL(16,2) NOT NULL,
 destino VARCHAR(180) NOT NULL, notaFiscal VARCHAR(80), responsavel VARCHAR(180), usuarioId INT NULL, observacao TEXT, data VARCHAR(32) NOT NULL,
 cancelada BOOLEAN NOT NULL DEFAULT 0, canceladaEm VARCHAR(32) NULL,
 canceladaPorId INT NULL, canceladaPor VARCHAR(180) NULL, motivoCancelamento VARCHAR(240) NULL,
 custoUnitarioAnterior DECIMAL(14,4) NULL,
 INDEX idx_mov_data (data), CONSTRAINT fk_mov_estoque FOREIGN KEY (itemId) REFERENCES itens_estoque(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS alimentos (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL, categoria VARCHAR(40) NOT NULL,
 quantidade DECIMAL(14,3) NOT NULL, minimo DECIMAL(14,3) NOT NULL DEFAULT 0, quantidadeInicial DECIMAL(14,3) NOT NULL, unidade VARCHAR(30) NOT NULL, custoUnitario DECIMAL(14,4) NOT NULL,
 dataEntrada VARCHAR(10) NOT NULL, fornecedor VARCHAR(180), cadastradoPor VARCHAR(180) NULL, cadastradoPorId INT NULL, INDEX idx_alim_data(dataEntrada)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movimentacoes_merenda (
 id INT PRIMARY KEY, itemId INT NOT NULL, itemNome VARCHAR(180) NOT NULL, tipo VARCHAR(10) NOT NULL,
 quantidade DECIMAL(14,3) NOT NULL, custoUnitario DECIMAL(14,4) NOT NULL, custoTotal DECIMAL(16,2) NOT NULL,
 destino VARCHAR(180) NOT NULL, responsavel VARCHAR(180) NOT NULL, usuarioId INT NULL, observacao TEXT, data VARCHAR(32) NOT NULL,
 cancelada BOOLEAN NOT NULL DEFAULT 0, canceladaEm VARCHAR(32) NULL,
 canceladaPorId INT NULL, canceladaPor VARCHAR(180) NULL, motivoCancelamento VARCHAR(240) NULL,
 custoUnitarioAnterior DECIMAL(14,4) NULL,
 INDEX idx_mmerenda_data (data),
 CONSTRAINT fk_mov_merenda FOREIGN KEY (itemId) REFERENCES alimentos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS chamados (
 id INT PRIMARY KEY, solicitanteId INT NOT NULL, nome VARCHAR(180), email VARCHAR(180), assunto VARCHAR(180),
 mensagem TEXT, status VARCHAR(30) NOT NULL DEFAULT 'Aberto', criadoEm VARCHAR(32) NOT NULL,
 INDEX idx_chamados_solicitante(solicitanteId),
 CONSTRAINT fk_chamados_usuario FOREIGN KEY (solicitanteId) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auditoria (
 id INT PRIMARY KEY, usuario VARCHAR(180), operacao VARCHAR(255), modulo VARCHAR(80), data VARCHAR(32) NOT NULL,
 INDEX idx_auditoria_data(data)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS escolas (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL, codigoInep VARCHAR(20) UNIQUE,
 endereco VARCHAR(255), bairro VARCHAR(120), municipio VARCHAR(120), telefone VARCHAR(40),
 email VARCHAR(180), ativo BOOLEAN NOT NULL DEFAULT 1
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS professores (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL, cpf VARCHAR(11) UNIQUE,
 email VARCHAR(180), telefone VARCHAR(40), especialidade VARCHAR(120), ativo BOOLEAN NOT NULL DEFAULT 1
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS alunos (
 id INT PRIMARY KEY, nome VARCHAR(180) NOT NULL, dataNascimento VARCHAR(10), cpf VARCHAR(11) UNIQUE,
 responsavel VARCHAR(180) NOT NULL, telefone VARCHAR(40), email VARCHAR(180), escolaId INT NOT NULL,
 ativo BOOLEAN NOT NULL DEFAULT 1, INDEX idx_alunos_escola(escolaId),
 CONSTRAINT fk_alunos_escola FOREIGN KEY (escolaId) REFERENCES escolas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS turmas (
 id INT PRIMARY KEY, nome VARCHAR(100) NOT NULL, anoLetivo INT NOT NULL, turno VARCHAR(30) NOT NULL,
 serie VARCHAR(80) NOT NULL, escolaId INT NOT NULL, professorId INT, vagas INT NOT NULL,
 ativo BOOLEAN NOT NULL DEFAULT 1, INDEX idx_turma_escola(escolaId),
 CONSTRAINT fk_turma_escola FOREIGN KEY (escolaId) REFERENCES escolas(id) ON DELETE RESTRICT,
 CONSTRAINT fk_turma_professor FOREIGN KEY (professorId) REFERENCES professores(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS matriculas (
 id INT PRIMARY KEY, alunoId INT NOT NULL, turmaId INT NOT NULL, status VARCHAR(30) NOT NULL,
 dataMatricula VARCHAR(10) NOT NULL, UNIQUE KEY uk_matricula_aluno_turma(alunoId,turmaId),
 CONSTRAINT fk_matricula_aluno FOREIGN KEY (alunoId) REFERENCES alunos(id) ON DELETE RESTRICT,
 CONSTRAINT fk_matricula_turma FOREIGN KEY (turmaId) REFERENCES turmas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS frequencia (
 id INT PRIMARY KEY, matriculaId INT NOT NULL, data VARCHAR(10) NOT NULL,
 presente BOOLEAN NOT NULL, justificativa VARCHAR(255), UNIQUE KEY uk_frequencia_dia(matriculaId,data),
 CONSTRAINT fk_frequencia_matricula FOREIGN KEY (matriculaId) REFERENCES matriculas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessoes (
 tokenHash CHAR(64) PRIMARY KEY, userId INT NOT NULL, expiraEm VARCHAR(32) NOT NULL,
 INDEX idx_sessoes_usuario(userId),
 CONSTRAINT fk_sessoes_usuario FOREIGN KEY (userId) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- 2. USUARIO ADMINISTRADOR (hash bcrypt; nunca armazene senha em texto puro)
INSERT INTO usuarios
  (id,nome,cpf,cargo,perfil,email,usuario,senha_hash,telefone,ativo,aprovado,criadoEm,ultimoAcesso,codigo_recuperacao,codigo_expira_em)
VALUES
  (1,'Administrador do Sistema','00000000000','Secretário','admin','admin@sge.local','admin',
   '$2a$10$4pQfVt3ddzSM.pwxvIQvWOgN9OV9yNSI7PO5pN9stG8auwAILl5.G','',1,1,'2026-11-13T09:00:00.000Z',NULL,NULL,NULL)
ON DUPLICATE KEY UPDATE id=id;

-- 3. ESTOQUE (exemplos do projeto)
INSERT INTO itens_estoque
  (id,nome,categoria,unidade,quantidade,minimo,custoUnitario)
VALUES
  (1,'Caderno universitário','materiais','unidades',135,40,18.50),
  (2,'Uniforme escolar (camiseta)','uniformes','unidades',62,80,32.00),
  (3,'Livro de leitura','livros','unidades',210,50,24.90),
  (4,'Tinta para impressora','outros','unidades',18,12,76.00)
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO movimentacoes
  (id,itemId,itemNome,tipo,quantidade,custoUnitario,custoTotal,destino,notaFiscal,responsavel,observacao,data)
VALUES
  (1,1,'Caderno universitário','entrada',135,18.50,2497.50,'Fornecedor inicial','DEMO-001','Administrador do Sistema','Carga fictícia inicial','2026-10-29T10:00:00.000Z'),
  (2,2,'Uniforme escolar (camiseta)','entrada',100,32.00,3200.00,'Fornecedor inicial','DEMO-002','Administrador do Sistema','Carga fictícia inicial','2026-11-02T11:00:00.000Z'),
  (3,2,'Uniforme escolar (camiseta)','saida',38,32.00,1216.00,'Escolas demonstrativas','','Administrador do Sistema','Distribuição fictícia','2026-11-08T14:00:00.000Z'),
  (4,3,'Livro de leitura','entrada',210,24.90,5229.00,'Fornecedor inicial','DEMO-003','Administrador do Sistema','Carga fictícia inicial','2026-11-04T10:00:00.000Z'),
  (5,4,'Tinta para impressora','entrada',18,76.00,1368.00,'Fornecedor inicial','DEMO-004','Administrador do Sistema','Carga fictícia inicial','2026-11-09T10:00:00.000Z')
ON DUPLICATE KEY UPDATE id=id;

-- 4. MERENDA (saldos ja consideram as saidas demonstrativas abaixo)
INSERT INTO alimentos
  (id,nome,categoria,quantidade,quantidadeInicial,unidade,custoUnitario,dataEntrada,fornecedor)
VALUES
  (1,'Arroz tipo 1','graos',110,120,'kg',6.40,'2026-11-05','Cooperativa demonstrativa'),
  (2,'Feijão carioca','graos',70,75,'kg',8.20,'2026-11-06','Cooperativa demonstrativa'),
  (3,'Leite integral','laticinios',90,90,'litros',5.10,'2026-11-07','Laticínios demonstrativos')
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO movimentacoes_merenda
  (id,itemId,itemNome,tipo,quantidade,custoUnitario,custoTotal,destino,responsavel,observacao,data)
VALUES
  (1,1,'Arroz tipo 1','saida',10,6.40,64.00,'Escola Exemplo Aurora','Administrador do Sistema','Consumo fictício','2026-11-10T11:00:00.000Z'),
  (2,2,'Feijão carioca','saida',5,8.20,41.00,'Escola Exemplo Aurora','Administrador do Sistema','Consumo fictício','2026-11-10T11:10:00.000Z')
ON DUPLICATE KEY UPDATE id=id;

-- 5. ESCOLAS (NOMES FICTICIOS; codigo INEP real nao informado)
INSERT INTO escolas
  (id,nome,codigoInep,endereco,bairro,municipio,telefone,email,ativo)
VALUES
  (1,'Escola Exemplo Aurora',NULL,'Rua Exemplo, 100','Centro','Município Exemplo','', 'aurora@example.org',1),
  (2,'Escola Exemplo Horizonte',NULL,'Avenida Exemplo, 200','Jardim','Município Exemplo','', 'horizonte@example.org',1)
ON DUPLICATE KEY UPDATE id=id;

-- 6. PROFESSORES FICTICIOS (sem CPF real)
INSERT INTO professores
  (id,nome,cpf,email,telefone,especialidade,ativo)
VALUES
  (1,'Professor Exemplo A',NULL,'docente.a@example.org','','Alfabetização',1),
  (2,'Professora Exemplo B',NULL,'docente.b@example.org','','Matemática',1),
  (3,'Professora Exemplo C',NULL,'docente.c@example.org','','Educação infantil',1)
ON DUPLICATE KEY UPDATE id=id;

-- 7. ALUNOS FICTICIOS (sem dados pessoais reais)
INSERT INTO alunos
  (id,nome,dataNascimento,cpf,responsavel,telefone,email,escolaId,ativo)
VALUES
  (1,'Aluno Exemplo 01','2017-03-12',NULL,'Responsável Exemplo A','','',1,1),
  (2,'Aluno Exemplo 02','2017-08-21',NULL,'Responsável Exemplo B','','',1,1),
  (3,'Aluno Exemplo 03','2016-06-18',NULL,'Responsável Exemplo C','','',1,1),
  (4,'Aluno Exemplo 04','2018-01-23',NULL,'Responsável Exemplo D','','',2,1),
  (5,'Aluno Exemplo 05','2018-10-14',NULL,'Responsável Exemplo E','','',2,1),
  (6,'Aluno Exemplo 06','2018-11-05',NULL,'Responsável Exemplo F','','',2,1)
ON DUPLICATE KEY UPDATE id=id;

-- 8. TURMAS, VINCULADAS A ESCOLAS E PROFESSORES
INSERT INTO turmas
  (id,nome,anoLetivo,turno,serie,escolaId,professorId,vagas,ativo)
VALUES
  (1,'1º Ano A',2026,'Manhã','1º Ano',1,1,30,1),
  (2,'2º Ano A',2026,'Tarde','2º Ano',1,2,30,1),
  (3,'Infantil A',2026,'Integral','Educação infantil',2,3,25,1)
ON DUPLICATE KEY UPDATE id=id;

-- 9. MATRICULAS (alunos e turmas da mesma escola)
INSERT INTO matriculas
  (id,alunoId,turmaId,status,dataMatricula)
VALUES
  (1,1,1,'Ativa','2026-02-05'),
  (2,2,1,'Ativa','2026-02-05'),
  (3,3,2,'Ativa','2026-02-06'),
  (4,4,3,'Ativa','2026-02-05'),
  (5,5,3,'Ativa','2026-02-06'),
  (6,6,3,'Ativa','2026-02-06')
ON DUPLICATE KEY UPDATE id=id;

-- 10. FREQUENCIA (datas no mesmo ano letivo das turmas)
INSERT INTO frequencia
  (id,matriculaId,data,presente,justificativa)
VALUES
  (1,1,'2026-11-09',1,''),
  (2,2,'2026-11-09',1,''),
  (3,3,'2026-11-09',0,'Ausência informada pelo responsável'),
  (4,4,'2026-11-09',1,''),
  (5,5,'2026-11-09',1,''),
  (6,6,'2026-11-09',0,'Sem justificativa'),
  (7,1,'2026-11-10',1,''),
  (8,2,'2026-11-10',0,'Ausência informada pelo responsável'),
  (9,3,'2026-11-10',1,''),
  (10,4,'2026-11-10',1,''),
  (11,5,'2026-11-10',1,''),
  (12,6,'2026-11-10',1,'')
ON DUPLICATE KEY UPDATE id=id;

-- 11. SUPORTE / AUDITORIA: exemplos para o painel
INSERT INTO chamados
  (id,solicitanteId,nome,email,assunto,mensagem,status,criadoEm)
VALUES
  (1,1,'Administrador do Sistema','admin@sge.local','Teste de suporte','Chamado de demonstração para validar o módulo de suporte.','Aberto','2026-11-11T11:00:00.000Z')
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO auditoria
  (id,usuario,operacao,modulo,data)
VALUES
  (1,'Administrador do Sistema','Carga demonstrativa inicial do banco','Sistema','2026-11-13T09:00:00.000Z')
ON DUPLICATE KEY UPDATE id=id;

-- 12. CONTADORES DE IDs: INDISPENSAVEL para o adaptador MySQL do ERP.
-- Deve ser executado APOS os inserts; na primeira execucao calcula os IDs
-- a partir dos maiores IDs que foram inseridos em cada tabela.
INSERT INTO sge_meta (chave, valor)
SELECT 'proximoId', JSON_OBJECT(
  'user',          (SELECT COALESCE(MAX(id),0)+1 FROM usuarios),
  'stock',         (SELECT COALESCE(MAX(id),0)+1 FROM itens_estoque),
  'movement',      (SELECT COALESCE(MAX(id),0)+1 FROM movimentacoes),
  'food',          (SELECT COALESCE(MAX(id),0)+1 FROM alimentos),
  'foodMovement',  (SELECT COALESCE(MAX(id),0)+1 FROM movimentacoes_merenda),
  'ticket',        (SELECT COALESCE(MAX(id),0)+1 FROM chamados),
  'log',           (SELECT COALESCE(MAX(id),0)+1 FROM auditoria),
  'school',        (SELECT COALESCE(MAX(id),0)+1 FROM escolas),
  'teacher',       (SELECT COALESCE(MAX(id),0)+1 FROM professores),
  'student',       (SELECT COALESCE(MAX(id),0)+1 FROM alunos),
  'class',         (SELECT COALESCE(MAX(id),0)+1 FROM turmas),
  'enrollment',    (SELECT COALESCE(MAX(id),0)+1 FROM matriculas),
  'attendance',    (SELECT COALESCE(MAX(id),0)+1 FROM frequencia)
)
WHERE NOT EXISTS (SELECT 1 FROM sge_meta WHERE chave = 'proximoId');

-- A tabela sessoes foi criada vazia propositalmente: tokens sao gerados
-- e armazenados com hash apenas depois de um login real.

-- 13. CONFERENCIA FINAL (deve retornar 15 tabelas)
SELECT COUNT(*) AS total_tabelas
FROM information_schema.tables
WHERE table_schema = 'sge_educacao' AND table_type = 'BASE TABLE';

SELECT 'usuarios' AS tabela, COUNT(*) AS registros FROM usuarios
UNION ALL SELECT 'escolas',COUNT(*) FROM escolas
UNION ALL SELECT 'professores',COUNT(*) FROM professores
UNION ALL SELECT 'alunos',COUNT(*) FROM alunos
UNION ALL SELECT 'turmas',COUNT(*) FROM turmas
UNION ALL SELECT 'matriculas',COUNT(*) FROM matriculas
UNION ALL SELECT 'frequencia',COUNT(*) FROM frequencia
UNION ALL SELECT 'itens_estoque',COUNT(*) FROM itens_estoque
UNION ALL SELECT 'movimentacoes',COUNT(*) FROM movimentacoes
UNION ALL SELECT 'alimentos',COUNT(*) FROM alimentos
UNION ALL SELECT 'movimentacoes_merenda',COUNT(*) FROM movimentacoes_merenda
UNION ALL SELECT 'chamados',COUNT(*) FROM chamados
UNION ALL SELECT 'auditoria',COUNT(*) FROM auditoria
UNION ALL SELECT 'sge_meta',COUNT(*) FROM sge_meta
UNION ALL SELECT 'sessoes',COUNT(*) FROM sessoes;
