-- SGE V5: executar em sge_educacao somente após um BACKUP completo.
-- MariaDB 10.4+ (XAMPP). Comandos aditivos; não apagam históricos ou senhas.
-- O backend V5 executa esta mesma migração automaticamente na inicialização.
USE sge_educacao;
ALTER TABLE itens_estoque ADD COLUMN IF NOT EXISTS cadastradoPorId INT NULL;
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS cadastradoPorId INT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS cancelada BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS canceladaEm VARCHAR(32) NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS canceladaPorId INT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS canceladaPor VARCHAR(180) NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS motivoCancelamento VARCHAR(240) NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS custoUnitarioAnterior DECIMAL(14,4) NULL;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS cancelada BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS canceladaEm VARCHAR(32) NULL;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS canceladaPorId INT NULL;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS canceladaPor VARCHAR(180) NULL;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS motivoCancelamento VARCHAR(240) NULL;
ALTER TABLE movimentacoes_merenda ADD COLUMN IF NOT EXISTS custoUnitarioAnterior DECIMAL(14,4) NULL;

-- NÃO preencher usuarioId/cadastradoPorId dos registros antigos usando apenas nomes;
-- homônimos podem existir. Sem ID de origem, a exclusão permanecerá bloqueada.
SELECT 'materiais' AS modulo, COUNT(*) AS movimentos_sem_autor FROM movimentacoes WHERE usuarioId IS NULL
UNION ALL SELECT 'merenda', COUNT(*) FROM movimentacoes_merenda WHERE usuarioId IS NULL;
