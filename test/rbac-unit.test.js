/** Teste de autorização sem banco ou dependências externas. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("middleware distingue admin de Secretário, mesmo com cargo idêntico", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "sessao.js"),
    "utf8",
  );
  let exported;
  const mockRequire = (name) => {
    if (name === "node:crypto") return require("node:crypto");
    if (name === "./erro")
      return {
        ApiError: class ApiError extends Error {
          constructor(status, message) {
            super(message);
            this.status = status;
          }
        },
      };
    if (name === "./store")
      return { read: async () => {}, useMysql: false, mysqlStore: {} };
    throw new Error("Dependência não esperada: " + name);
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    require: mockRequire,
    module,
    exports: module.exports,
    Map,
    Date,
    String,
  });
  exported = module.exports;
  let result;
  exported.apenasAdmin(
    { user: { cargo: "Secretário", perfil: "secretario" } },
    null,
    (error) => {
      result = error || "ok";
    },
  );
  assert.equal(result.status, 403);
  exported.apenasAdmin(
    { user: { cargo: "Secretário", perfil: "admin" } },
    null,
    (error) => {
      result = error || "ok";
    },
  );
  assert.equal(result, "ok");
  exported.permitirPerfis("admin", "secretario")(
    { user: { perfil: "almoxarifado" } },
    null,
    (error) => {
      result = error || "ok";
    },
  );
  assert.equal(result.status, 403);
});
