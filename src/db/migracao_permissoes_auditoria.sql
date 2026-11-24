-- SGE Educação: migração segura para MariaDB 10.4 (XAMPP)
-- EXECUTAR SOMENTE APÓS BACKUP COMPLETO DO BANCO.
-- A API também realiza esta migração automaticamente ao iniciar no modo mysql.
-- Não apaga tabelas nem modifica senhas.
USE sge_educacao;

-- O perfil de acesso é independente do cargo profissional.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NULL AFTER cargo;

-- Somente a conta antiga de login "admin" é promovida a administrador.
-- Usuários secretarios comuns não ganham acesso administrativo.
UPDATE usuarios
SET perfil = CASE
  WHEN LOWER(usuario) = 'admin' THEN 'admin'
  WHEN cargo = 'Secretário' THEN 'secretario'
  WHEN cargo = 'Almoxarifado' THEN 'almoxarifado'
  ELSE 'sem_acesso'
END
WHERE perfil IS NULL OR TRIM(perfil) = '';

-- O identificador do operador acompanha novas movimentações.
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS usuarioId INT NULL AFTER responsavel;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS usuarioId INT NULL AFTER responsavel;

-- O cadastro passa a registrar autor mesmo quando a quantidade inicial é zero.
ALTER TABLE itens_estoque ADD COLUMN IF NOT EXISTS cadastradoPor VARCHAR(180) NULL;
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS cadastradoPor VARCHAR(180) NULL;

-- Verificação: perfis e registros anteriores continuam preservados.
SELECT usuario, nome, cargo, perfil, ativo, aprovado FROM usuarios ORDER BY id;
