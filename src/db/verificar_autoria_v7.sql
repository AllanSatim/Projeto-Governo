-- Somente consulta: não altera o banco de dados.
USE sge_educacao;
SELECT 'Cadastros de materiais' AS tipo,
       SUM(CASE WHEN cadastradoPorId IS NOT NULL THEN 1 ELSE 0 END) AS com_conta,
       SUM(CASE WHEN cadastradoPorId IS NULL THEN 1 ELSE 0 END) AS sem_conta FROM itens_estoque
UNION ALL SELECT 'Movimentações de materiais',
       SUM(CASE WHEN usuarioId IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN usuarioId IS NULL THEN 1 ELSE 0 END) FROM movimentacoes
UNION ALL SELECT 'Cadastros de alimentos',
       SUM(CASE WHEN cadastradoPorId IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN cadastradoPorId IS NULL THEN 1 ELSE 0 END) FROM alimentos
UNION ALL SELECT 'Movimentações de merenda',
       SUM(CASE WHEN usuarioId IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN usuarioId IS NULL THEN 1 ELSE 0 END) FROM movimentacoes_merenda;
