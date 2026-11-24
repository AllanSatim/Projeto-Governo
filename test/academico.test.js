/**
 * test/academico.test.js — SGE Educação
 * Módulo do ERP SGE Educação.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

/** Isola a responsabilidade port para manter a lógica reutilizável e testável. */
async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}

test("gestão acadêmica, regras de matrícula, frequência, autorização, senha e persistência", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sge-academico-"));
  const address = `http://127.0.0.1:${await port()}`;
  let child;
  /** Isola a responsabilidade start para manter a lógica reutilizável e testável. */
  async function start() {
    child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "src/server.js")],
      {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          SGE_STORAGE: "json",
          SGE_ADMIN_PASSWORD: "admin123",
          SGE_DEMO_RECOVERY: "false",
          SGE_DATA_FILE: path.join(dir, "dados.json"),
          PORT: address.split(":").pop(),
        },
        stdio: "ignore",
      },
    );
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error("Servidor não iniciou.");
      try {
        if ((await fetch(address + "/api/status")).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timeout na inicialização.");
  }
  /** Isola a responsabilidade stop para manter a lógica reutilizável e testável. */
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  }
  /** Isola a responsabilidade send para manter a lógica reutilizável e testável. */
  async function send(url, method = "GET", body, token) {
    const response = await fetch(address + url, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  t.after(async () => {
    await stop();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await start();
  const login = await send("/api/auth/login", "POST", {
    usuario: "admin",
    senha: "admin123",
  });
  assert.equal(login.status, 200);
  let auth = login.body.token;
  assert.equal((await send("/api/academico/escolas")).status, 401);
  assert.equal(
    (await send("/api/academico/resumo", "GET", undefined, auth)).body.escolas,
    0,
  );
  const escola = await send(
    "/api/academico/escolas",
    "POST",
    { nome: "EMEF Central", municipio: "Cidade", codigoInep: "12345678" },
    auth,
  );
  assert.equal(escola.status, 201);
  const duplicada = await send(
    "/api/academico/escolas",
    "POST",
    { nome: "Outra", municipio: "Cidade", codigoInep: "12345678" },
    auth,
  );
  assert.equal(duplicada.status, 409);
  const prof = await send(
    "/api/academico/professores",
    "POST",
    { nome: "Maria", especialidade: "Matemática" },
    auth,
  );
  assert.equal(prof.status, 201);
  const aluno = await send(
    "/api/academico/alunos",
    "POST",
    {
      nome: "Ana",
      dataNascimento: "2012-05-20",
      responsavel: "João",
      escolaId: escola.body.id,
    },
    auth,
  );
  assert.equal(aluno.status, 201);
  const classe = await send(
    "/api/academico/turmas",
    "POST",
    {
      nome: "8º A",
      anoLetivo: 2026,
      turno: "Manhã",
      serie: "8º ano",
      escolaId: escola.body.id,
      professorId: prof.body.id,
      vagas: 1,
    },
    auth,
  );
  assert.equal(classe.status, 201);
  const turmaCheia = await send(
    "/api/academico/matriculas",
    "POST",
    {
      alunoId: aluno.body.id,
      turmaId: classe.body.id,
      status: "Ativa",
      dataMatricula: "2026-02-01",
    },
    auth,
  );
  assert.equal(turmaCheia.status, 201);
  const aluno2 = await send(
    "/api/academico/alunos",
    "POST",
    {
      nome: "Bruno",
      dataNascimento: "2013-01-01",
      responsavel: "Carla",
      escolaId: escola.body.id,
    },
    auth,
  );
  assert.equal(aluno2.status, 201);
  assert.equal(
    (
      await send(
        "/api/academico/matriculas",
        "POST",
        { alunoId: aluno2.body.id, turmaId: classe.body.id },
        auth,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await send(
        "/api/academico/escolas/" + escola.body.id,
        "DELETE",
        undefined,
        auth,
      )
    ).status,
    409,
  );
  const faltou = await send(
    "/api/academico/frequencia",
    "POST",
    {
      matriculaId: turmaCheia.body.id,
      data: "2026-11-13",
      presente: false,
      justificativa: "Consulta médica",
    },
    auth,
  );
  assert.equal(faltou.status, 201);
  assert.equal(
    (
      await send(
        "/api/academico/frequencia",
        "POST",
        {
          matriculaId: turmaCheia.body.id,
          data: "2026-11-13",
          presente: true,
        },
        auth,
      )
    ).status,
    409,
  );
  const stats = await send("/api/academico/resumo", "GET", undefined, auth);
  assert.equal(stats.body.matriculasAtivas, 1);
  assert.equal(stats.body.faltas, 1);
  assert.equal(
    (await send("/api/auth/me", "GET", undefined, auth)).body.usuario,
    "admin",
  );
  assert.equal(
    (
      await send(
        "/api/auth/alterar-senha",
        "POST",
        {
          senhaAtual: "errada",
          novaSenha: "novaSenha123",
          confirmarNovaSenha: "novaSenha123",
        },
        auth,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await send(
        "/api/auth/alterar-senha",
        "POST",
        {
          senhaAtual: "admin123",
          novaSenha: "novaSenha123",
          confirmarNovaSenha: "novaSenha123",
        },
        auth,
      )
    ).status,
    200,
  );
  assert.equal(
    (await send("/api/academico/escolas", "GET", undefined, auth)).status,
    401,
  );
  await stop();
  await start();
  assert.equal(
    (
      await send("/api/auth/login", "POST", {
        usuario: "admin",
        senha: "admin123",
      })
    ).status,
    401,
  );
  auth = (
    await send("/api/auth/login", "POST", {
      usuario: "admin",
      senha: "novaSenha123",
    })
  ).body.token;
  assert.equal(
    (await send("/api/academico/escolas", "GET", undefined, auth)).body.length,
    1,
  );
  assert.equal(
    (await send("/api/academico/frequencia", "GET", undefined, auth)).body
      .length,
    1,
  );
  assert.equal(
    (await send("/api/auth/logout", "POST", undefined, auth)).status,
    204,
  );
  assert.equal(
    (await send("/api/academico/resumo", "GET", undefined, auth)).status,
    401,
  );
});
