-- CARGA ADICIONAL DE MERENDA PARA DEMONSTRACAO - XAMPP / MARIADB
-- Execute no phpMyAdmin, banco sge_educacao, com o Node.js parado.
-- Nao apaga nem altera os produtos existentes. Repetir nao duplica os IDs 3001..3035.
-- TODOS OS PRODUTOS, FORNECEDORES, QUANTIDADES E PRECOS ABAIXO SAO FICTICIOS.
-- A categoria 'bebidas' e um valor de texto no campo categoria (nao precisa ALTER TABLE).
USE `sge_educacao`;
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO alimentos (id,nome,categoria,quantidade,quantidadeInicial,unidade,custoUnitario,dataEntrada,fornecedor) VALUES
(3001,'Suco de uva integral 1 L','bebidas',240,240,'litros',11.90,'2026-11-13','Distribuidora Exemplo'),
(3002,'Suco de maçã integral 1 L','bebidas',180,180,'litros',12.40,'2026-11-13','Distribuidora Exemplo'),
(3003,'Suco de laranja integral 1 L','bebidas',220,220,'litros',10.80,'2026-11-13','Distribuidora Exemplo'),
(3004,'Suco de maracujá concentrado 500 ml','bebidas',175,175,'unidades',7.50,'2026-11-13','Fornecedor Fictício'),
(3005,'Suco de acerola concentrado 500 ml','bebidas',160,160,'unidades',6.90,'2026-11-13','Fornecedor Fictício'),
(3006,'Polpa congelada de manga 100 g','bebidas',300,300,'pacotes',2.60,'2026-11-13','Cooperativa Demonstrativa'),
(3007,'Polpa congelada de goiaba 100 g','bebidas',300,300,'pacotes',2.70,'2026-11-13','Cooperativa Demonstrativa'),
(3008,'Água mineral sem gás 500 ml','bebidas',800,800,'unidades',1.90,'2026-11-13','Distribuidora Exemplo'),
(3009,'Água mineral sem gás galão 20 L','bebidas',45,45,'unidades',18.90,'2026-11-13','Distribuidora Exemplo'),
(3010,'Leite sem lactose UHT 1 L','bebidas',90,90,'litros',6.80,'2026-11-13','Laticínios Demonstrativos'),
(3011,'Arroz branco tipo 1','graos',420,420,'kg',5.70,'2026-11-13','Cooperativa Demonstrativa'),
(3012,'Feijão preto','graos',210,210,'kg',8.60,'2026-11-13','Cooperativa Demonstrativa'),
(3013,'Macarrão parafuso','graos',185,185,'kg',6.20,'2026-11-13','Fornecedor Fictício'),
(3014,'Aveia em flocos','graos',85,85,'kg',11.40,'2026-11-13','Fornecedor Fictício'),
(3015,'Farinha de mandioca','graos',100,100,'kg',7.50,'2026-11-13','Cooperativa Demonstrativa'),
(3016,'Batata inglesa','hortifruti',260,260,'kg',4.60,'2026-11-13','Hortifruti Demonstrativo'),
(3017,'Cenoura','hortifruti',145,145,'kg',4.90,'2026-11-13','Hortifruti Demonstrativo'),
(3018,'Abobrinha','hortifruti',120,120,'kg',5.80,'2026-11-13','Hortifruti Demonstrativo'),
(3019,'Banana prata','hortifruti',285,285,'kg',6.30,'2026-11-13','Hortifruti Demonstrativo'),
(3020,'Maçã nacional','hortifruti',190,190,'kg',8.40,'2026-11-13','Hortifruti Demonstrativo'),
(3021,'Laranja pera','hortifruti',330,330,'kg',4.10,'2026-11-13','Hortifruti Demonstrativo'),
(3022,'Iogurte natural sem açúcar','laticinios',180,180,'litros',9.90,'2026-11-13','Laticínios Demonstrativos'),
(3023,'Queijo muçarela','laticinios',90,90,'kg',36.80,'2026-11-13','Laticínios Demonstrativos'),
(3024,'Leite em pó integral','laticinios',125,125,'kg',32.90,'2026-11-13','Laticínios Demonstrativos'),
(3025,'Peito de frango congelado','proteinas',265,265,'kg',19.80,'2026-11-13','Frigorífico Demonstrativo'),
(3026,'Carne bovina moída congelada','proteinas',180,180,'kg',31.50,'2026-11-13','Frigorífico Demonstrativo'),
(3027,'Ovos de galinha','proteinas',950,950,'unidades',0.88,'2026-11-13','Granja Demonstrativa'),
(3028,'Peixe filé congelado','proteinas',110,110,'kg',28.90,'2026-11-13','Frigorífico Demonstrativo'),
(3029,'Óleo de soja 900 ml','naoperecivel',225,225,'unidades',7.30,'2026-11-13','Distribuidora Exemplo'),
(3030,'Extrato de tomate 340 g','naoperecivel',410,410,'unidades',3.90,'2026-11-13','Distribuidora Exemplo'),
(3031,'Açúcar cristal','naoperecivel',180,180,'kg',4.20,'2026-11-13','Distribuidora Exemplo'),
(3032,'Sal iodado','naoperecivel',80,80,'kg',2.30,'2026-11-13','Distribuidora Exemplo'),
(3033,'Biscoito integral sem recheio','naoperecivel',340,340,'pacotes',5.40,'2026-11-13','Distribuidora Exemplo'),
(3034,'Pão integral fatiado','perecivel',115,115,'pacotes',8.90,'2026-11-13','Padaria Demonstrativa'),
(3035,'Pão de forma tradicional','perecivel',150,150,'pacotes',7.50,'2026-11-13','Padaria Demonstrativa')
ON DUPLICATE KEY UPDATE id=id;

-- Impede que novos cadastros da API reutilizem IDs de alimentos existentes.
UPDATE sge_meta
SET valor = JSON_SET(valor, '$.food',
 GREATEST(
  COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(valor,'$.food')) AS UNSIGNED),1),
  (SELECT COALESCE(MAX(id),0)+1 FROM alimentos)
 ))
WHERE chave = 'proximoId';
COMMIT;

SELECT categoria,COUNT(*) AS total_produtos,SUM(quantidade * custoUnitario) AS valor_total
FROM alimentos GROUP BY categoria ORDER BY categoria;
SELECT id,nome,categoria,quantidade,unidade FROM alimentos WHERE categoria='bebidas' ORDER BY id;
