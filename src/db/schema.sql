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
