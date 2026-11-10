# SGE Educação — Back end (Node + Express + MySQL)

## Como rodar
1. Node 18+ e MySQL instalados e ligados.
2. Copie `.env.example` para `.env` e coloque a senha do seu MySQL.
3. Copie as pastas do front (`css/`, `js/` e os `.html`) para a pasta `public/`.
4. `npm install` e depois `npm start` (ou `npm run dev` para reiniciar sozinho ao salvar).
5. Abra http://localhost:3000/login.html — o banco e as tabelas são criados automaticamente.

## Divisão das telas
| Tela | Status | Responsável |
|---|---|---|
| login, cadastro, esqueceu-senha | PRONTO (`src/routes/auth.js`) | Allan |
| usuario (Meu Perfil) | PRONTO (`src/routes/usuarios.js`) | Allan |
| Merenda | PRONTO (`src/routes/merenda.js`) | Allan |
| Estoque, movimentar-estoque | `src/equipe/estoque.js`, `movimentacoes.js` | Colega 1 |
| financeiro, Relatorio | `src/equipe/financeiro.js`, `relatorios.js` | Colega 2 |
| admin, Suporte, index (painel) | `src/equipe/admin.js`, `chamados.js`, `painel.js` | Colega 3 |

Cada colega edita só os seus arquivos em `src/equipe/` (as rotas já estão registradas no `server.js`).
Tabelas novas: adicionar um `CREATE TABLE IF NOT EXISTS` em `src/db.js`.
Use `const { db } = require('../db')` e `await db().query('SELECT ...', [params])`.
Financeiro, Relatório e Painel dependem de Estoque/Movimentação/Merenda — combinem os nomes das tabelas e colunas.

## Endpoints prontos
| Método | Rota | Corpo / retorno |
|---|---|---|
| POST | /api/auth/cadastro | `{nome,cpf,cargo,email,usuario,senha,confirmarSenha}` -> usuário (201) |
| POST | /api/auth/login | `{usuario,senha}` (usuário ou e-mail) -> `{id,nome,cpf,email,usuario,cargo,telefone}` |
| POST | /api/auth/recuperar | `{identificador}` -> `{mensagem,codigoDemo}` |
| POST | /api/auth/redefinir | `{identificador,codigo,novaSenha,confirmarNovaSenha}` |
| GET | /api/usuarios/:id | dados do perfil |
| PUT | /api/usuarios/:id | `{nome,email,telefone,cargo}` (CPF não muda) |
| GET | /api/merenda | lista (já com `valorTotal`) |
| POST | /api/merenda | `{nome,categoria,quantidade,unidade,custoUnitario,dataEntrada,fornecedor}` (201) |
| DELETE | /api/merenda/:id | 204 |
| GET | /api/merenda/resumo | `{totalRegistros,valorTotal}` |
| GET | /api/merenda/exportar-csv | arquivo CSV |

Erros voltam como `{"erro":"mensagem"}` com o status certo (400, 401, 404, 409...).
Valores: categoria = graos, hortifruti, laticinios, proteinas, perecivel, naoperecivel; unidade = kg, litros, unidades, caixas, pacotes; cargo = "Secretário" ou "Almoxarifado".

## Observações
- Senhas com bcrypt. O login devolve os dados do usuário; guarde o `id` no `localStorage` para o perfil.
- A recuperação de senha devolve o código na resposta só para demonstração. Em produção, enviar por e-mail.
- Próximo passo de segurança: JWT/sessão para proteger as rotas.
