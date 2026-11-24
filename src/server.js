/**
 * src/server.js — SGE Educação
 * Ponto de entrada HTTP. Inicializa persistência, registra middlewares de segurança, publica arquivos estáticos e associa as rotas da API.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
if (process.env.NODE_ENV !== "test")
  require("dotenv").config({
    path: require("path").join(__dirname, "..", ".env"),
  });
if (
  process.env.NODE_ENV === "production" &&
  (process.env.SGE_STORAGE !== "mysql" ||
    process.env.SGE_DEMO_RECOVERY === "true")
) {
  throw new Error(
    "Produção exige MySQL e recuperação demonstrativa desativada.",
  );
}
const path = require("path");
const express = require("express");
const cors = require("cors");
const { iniciarBanco } = require("./db");
const { useMysql } = require("./store");

const app = express();
// A API é acessada pela mesma origem do front-end; CORS externo é opt-in.
if (process.env.CORS_ORIGIN)
  app.use(
    cors({ origin: process.env.CORS_ORIGIN.split(",").map((x) => x.trim()) }),
  );
app.disable("x-powered-by");
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "128kb" }));

// Front end (css/, js/ e os .html ficam na pasta public/)
app.use(express.static(path.join(__dirname, "..", "public")));

// Endpoint GET /api/status: autenticação e validação acontecem na camada de rotas.
app.get("/api/status", (_req, res) =>
  res.json({
    status: "ok",
    armazenamento: useMysql ? "mysql" : "arquivo-local",
    bancoConfigurado: useMysql,
  }),
);

// ---- Autenticação ----
app.use("/api/auth", require("./routes/auth"));

const { autenticar, apenasAdmin, permitirPerfis } = require("./sessao");
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/") || req.path === "/status") return next();
  autenticar(req, res, (err) =>
    err
      ? next(err)
      : permitirPerfis("admin", "secretario", "almoxarifado")(req, res, next),
  );
});
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/merenda", require("./routes/merenda"));
app.use("/api/estoque", require("./equipe/estoque"));
app.use("/api/movimentacoes", require("./equipe/movimentacoes"));
app.use(
  "/api/financeiro",
  permitirPerfis("admin", "secretario"),
  require("./equipe/financeiro"),
);
app.use(
  "/api/relatorios",
  permitirPerfis("admin", "secretario"),
  require("./equipe/relatorios"),
);
app.use("/api/admin", apenasAdmin, require("./equipe/admin"));
app.use(
  "/api/academico",
  permitirPerfis("admin", "secretario"),
  require("./routes/academico"),
);
app.use("/api/chamados", require("./equipe/chamados"));
app.use("/api/painel", require("./equipe/painel"));
app.use("/api/atividades", require("./equipe/atividades"));

// 404 da API e tratamento de erros: sempre responde {"erro": "mensagem"}
app.use("/api", (req, res) =>
  res.status(404).json({ erro: "Rota não encontrada." }),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.status) return res.status(err.status).json({ erro: err.message });
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const PORT = process.env.PORT || 3000;
iniciarBanco()
  .then(() =>
    app.listen(PORT, () =>
      console.log(
        `SGE rodando em http://localhost:${PORT} (${useMysql ? "MySQL" : "arquivo local"})`,
      ),
    ),
  )
  .catch((e) => {
    console.error("Falha ao inicializar a persistência:", e.message);
    process.exit(1);
  });
