/**
 * src/routes/academico.js — SGE Educação
 * Rotas e regras de negócio de escolas, professores, alunos, turmas, matrículas e frequência.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
/** Módulo acadêmico — CRUD de escolas, professores, alunos, turmas, matrículas e frequência.
 * Dados pessoais acessíveis exclusivamente ao Secretário (middleware aplicado em server.js).
 */
const express = require("express");
const { read, update, nextId } = require("../store");
const { ApiError, rota } = require("../erro");
const router = express.Router();
const resources = {
  escolas: "schools",
  professores: "teachers",
  alunos: "students",
  turmas: "classes",
  matriculas: "enrollments",
  frequencia: "attendance",
};
/** Normaliza campos de texto para validações e comparações. */
const filled = (value) => String(value ?? "").trim();
/** Converte um identificador recebido para inteiro positivo válido. */
const id = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;
/** Verifica formato e validade de uma data no padrão ISO. */
const isDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
/** Remove caracteres não numéricos de documentos e telefones. */
const digits = (value) => filled(value).replace(/\D/g, "");
/** Verifica formato básico de e-mail informado. */
const email = (value) =>
  !filled(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(filled(value));
/** Exige campo obrigatório e devolve seu valor normalizado. */
const requireField = (value, field) => {
  if (!filled(value)) throw new ApiError(400, `${field} é obrigatório(a).`);
  return filled(value);
};
/** Confirma que a entidade referenciada existe antes de vincular registros. */
const mustExist = (data, collection, value, label) => {
  const item = data[collection].find((row) => row.id === id(value));
  if (!item) throw new ApiError(400, `${label} não encontrado(a).`);
  return item;
};
/** Evita duplicidade de campos com restrição de unicidade. */
function checkUnique(data, collection, key, value, currentId) {
  if (
    value &&
    data[collection].some(
      (row) =>
        row.id !== currentId &&
        row[key] &&
        String(row[key]).toLowerCase() === String(value).toLowerCase(),
    )
  ) {
    throw new ApiError(409, `${key} já está cadastrado(a).`);
  }
}
/** Aplica as regras de validação específicas de cada tipo de registro. */
function validate(resource, payload, data, currentId) {
  switch (resource) {
    case "escolas": {
      const codigoInep = digits(payload.codigoInep) || null;
      if (codigoInep && !/^\d{8}$/.test(codigoInep))
        throw new ApiError(400, "Código INEP deve ter 8 dígitos.");
      checkUnique(data, "schools", "codigoInep", codigoInep, currentId);
      if (!email(payload.email)) throw new ApiError(400, "E-mail inválido.");
      return {
        nome: requireField(payload.nome, "Nome da escola"),
        codigoInep,
        endereco: filled(payload.endereco),
        bairro: filled(payload.bairro),
        municipio: requireField(payload.municipio, "Município"),
        telefone: filled(payload.telefone),
        email: filled(payload.email).toLowerCase(),
        ativo: payload.ativo !== false,
      };
    }
    case "professores": {
      const cpf = digits(payload.cpf) || null;
      if (cpf && cpf.length !== 11)
        throw new ApiError(400, "CPF deve ter 11 dígitos.");
      checkUnique(data, "teachers", "cpf", cpf, currentId);
      if (!email(payload.email)) throw new ApiError(400, "E-mail inválido.");
      return {
        nome: requireField(payload.nome, "Nome do professor"),
        cpf,
        email: filled(payload.email).toLowerCase(),
        telefone: filled(payload.telefone),
        especialidade: filled(payload.especialidade),
        ativo: payload.ativo !== false,
      };
    }
    case "alunos": {
      const cpf = digits(payload.cpf) || null;
      if (cpf && cpf.length !== 11)
        throw new ApiError(400, "CPF deve ter 11 dígitos.");
      checkUnique(data, "students", "cpf", cpf, currentId);
      if (!email(payload.email)) throw new ApiError(400, "E-mail inválido.");
      if (
        !isDate(payload.dataNascimento) ||
        payload.dataNascimento > new Date().toISOString().slice(0, 10)
      )
        throw new ApiError(400, "Data de nascimento inválida.");
      const escola = mustExist(data, "schools", payload.escolaId, "Escola");
      if (!escola.ativo) throw new ApiError(400, "A escola está inativa.");
      return {
        nome: requireField(payload.nome, "Nome do aluno"),
        dataNascimento: payload.dataNascimento,
        cpf,
        responsavel: requireField(payload.responsavel, "Responsável"),
        telefone: filled(payload.telefone),
        email: filled(payload.email).toLowerCase(),
        escolaId: escola.id,
        ativo: payload.ativo !== false,
      };
    }
    case "turmas": {
      const escola = mustExist(data, "schools", payload.escolaId, "Escola");
      const professor = payload.professorId
        ? mustExist(data, "teachers", payload.professorId, "Professor")
        : null;
      if (!escola.ativo || (professor && !professor.ativo))
        throw new ApiError(400, "Escola ou professor inativo.");
      const anoLetivo = Number(payload.anoLetivo),
        vagas = Number(payload.vagas);
      if (!Number.isInteger(anoLetivo) || anoLetivo < 2000 || anoLetivo > 2100)
        throw new ApiError(400, "Ano letivo inválido.");
      if (!Number.isInteger(vagas) || vagas < 1 || vagas > 2000)
        throw new ApiError(400, "Número de vagas inválido.");
      if (!["Manhã", "Tarde", "Noite", "Integral"].includes(payload.turno))
        throw new ApiError(400, "Turno inválido.");
      const ocupadas = data.enrollments.filter(
        (row) => row.turmaId === currentId && row.status === "Ativa",
      ).length;
      if (currentId && vagas < ocupadas)
        throw new ApiError(409, `A turma tem ${ocupadas} matrículas ativas.`);
      return {
        nome: requireField(payload.nome, "Nome da turma"),
        anoLetivo,
        turno: payload.turno,
        serie: requireField(payload.serie, "Série/etapa"),
        escolaId: escola.id,
        professorId: professor?.id ?? null,
        vagas,
        ativo: payload.ativo !== false,
      };
    }
    case "matriculas": {
      const aluno = mustExist(data, "students", payload.alunoId, "Aluno");
      const turma = mustExist(data, "classes", payload.turmaId, "Turma");
      if (aluno.escolaId !== turma.escolaId)
        throw new ApiError(
          400,
          "Aluno e turma devem pertencer à mesma escola.",
        );
      if (!aluno.ativo || !turma.ativo)
        throw new ApiError(400, "Aluno ou turma inativo(a).");
      const status = payload.status || "Ativa";
      if (!["Ativa", "Concluída", "Cancelada"].includes(status))
        throw new ApiError(400, "Status da matrícula inválido.");
      const dataMatricula =
        payload.dataMatricula || new Date().toISOString().slice(0, 10);
      if (!isDate(dataMatricula))
        throw new ApiError(400, "Data da matrícula inválida.");
      const duplicada = data.enrollments.some(
        (row) =>
          row.id !== currentId &&
          row.alunoId === aluno.id &&
          row.turmaId === turma.id,
      );
      if (duplicada)
        throw new ApiError(409, "Aluno já possui matrícula nesta turma.");
      const other = data.enrollments.some(
        (row) =>
          row.id !== currentId &&
          row.alunoId === aluno.id &&
          row.status === "Ativa" &&
          data.classes.find((c) => c.id === row.turmaId)?.anoLetivo ===
            turma.anoLetivo,
      );
      if (status === "Ativa" && other)
        throw new ApiError(
          409,
          "Aluno já possui matrícula ativa neste ano letivo.",
        );
      const ocupadas = data.enrollments.filter(
        (row) =>
          row.id !== currentId &&
          row.turmaId === turma.id &&
          row.status === "Ativa",
      ).length;
      if (status === "Ativa" && ocupadas >= turma.vagas)
        throw new ApiError(409, "A turma não possui vagas disponíveis.");
      return { alunoId: aluno.id, turmaId: turma.id, status, dataMatricula };
    }
    case "frequencia": {
      const matricula = mustExist(
        data,
        "enrollments",
        payload.matriculaId,
        "Matrícula",
      );
      if (!isDate(payload.data))
        throw new ApiError(400, "Data de frequência inválida.");
      const turma = mustExist(data, "classes", matricula.turmaId, "Turma");
      if (!payload.data.startsWith(String(turma.anoLetivo)))
        throw new ApiError(
          400,
          "A frequência deve pertencer ao ano letivo da turma.",
        );
      if (typeof payload.presente !== "boolean")
        throw new ApiError(400, "Informe se o aluno esteve presente.");
      if (
        data.attendance.some(
          (row) =>
            row.id !== currentId &&
            row.matriculaId === matricula.id &&
            row.data === payload.data,
        )
      )
        throw new ApiError(409, "Frequência já registrada para esta data.");
      return {
        matriculaId: matricula.id,
        data: payload.data,
        presente: payload.presente,
        justificativa: filled(payload.justificativa),
      };
    }
    default:
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
  }
}
/** Identifica vínculos que impedem a exclusão de um cadastro. */
function dependencies(data, collection, recordId) {
  const refs =
    {
      schools: [
        ["students", "escolaId"],
        ["classes", "escolaId"],
      ],
      teachers: [["classes", "professorId"]],
      students: [["enrollments", "alunoId"]],
      classes: [["enrollments", "turmaId"]],
      enrollments: [["attendance", "matriculaId"]],
    }[collection] || [];
  return refs.some(([child, key]) =>
    data[child].some((row) => row[key] === recordId),
  );
}
/** Registra uma ação realizada por usuário no histórico de auditoria. */
const audit = (data, actor, action) =>
  data.logs.unshift({
    id: nextId(data, "logs"),
    usuario: actor,
    operacao: action,
    modulo: "Gestão Escolar",
    data: new Date().toISOString(),
  });

// Endpoint GET /resumo: autenticação e validação acontecem na camada de rotas.
router.get(
  "/resumo",
  rota(async (_req, res) => {
    res.json(
      await read((data) => ({
        escolas: data.schools.length,
        professores: data.teachers.length,
        alunos: data.students.length,
        turmas: data.classes.length,
        matriculasAtivas: data.enrollments.filter(
          (row) => row.status === "Ativa",
        ).length,
        presencas: data.attendance.filter((row) => row.presente).length,
        faltas: data.attendance.filter((row) => !row.presente).length,
      })),
    );
  }),
);
// Endpoint GET /:recurso: autenticação e validação acontecem na camada de rotas.
router.get(
  "/:recurso",
  rota(async (req, res) => {
    const collection = resources[req.params.recurso];
    if (!collection)
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
    res.json(
      await read((data) =>
        data[collection].slice().sort((a, b) => b.id - a.id),
      ),
    );
  }),
);
// Endpoint GET /:recurso/:id: autenticação e validação acontecem na camada de rotas.
router.get(
  "/:recurso/:id",
  rota(async (req, res) => {
    const collection = resources[req.params.recurso];
    if (!collection)
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
    const item = await read((data) =>
      data[collection].find((row) => row.id === id(req.params.id)),
    );
    if (!item) throw new ApiError(404, "Registro não encontrado.");
    res.json(item);
  }),
);
// Endpoint POST /:recurso: autenticação e validação acontecem na camada de rotas.
router.post(
  "/:recurso",
  rota(async (req, res) => {
    const collection = resources[req.params.recurso];
    if (!collection)
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
    const saved = await update((data) => {
      const validated = validate(req.params.recurso, req.body, data);
      const item = { id: nextId(data, collection), ...validated };
      data[collection].push(item);
      audit(
        data,
        req.user.nome,
        `Cadastro em ${req.params.recurso} #${item.id}`,
      );
      return item;
    });
    res.status(201).json(saved);
  }),
);
// Endpoint PUT /:recurso/:id: autenticação e validação acontecem na camada de rotas.
router.put(
  "/:recurso/:id",
  rota(async (req, res) => {
    const collection = resources[req.params.recurso];
    if (!collection)
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
    const saved = await update((data) => {
      const item = data[collection].find((row) => row.id === id(req.params.id));
      if (!item) throw new ApiError(404, "Registro não encontrado.");
      const validated = validate(req.params.recurso, req.body, data, item.id);
      if (
        req.params.recurso === "matriculas" &&
        item.turmaId !== validated.turmaId &&
        data.attendance.some((row) => row.matriculaId === item.id)
      ) {
        throw new ApiError(
          409,
          "Não é possível transferir matrícula com frequência registrada; conclua/cancele e crie outra.",
        );
      }
      if (
        req.params.recurso === "alunos" &&
        item.escolaId !== validated.escolaId &&
        data.enrollments.some((row) => row.alunoId === item.id)
      )
        throw new ApiError(409, "Não altere a escola de um aluno matriculado.");
      if (
        req.params.recurso === "turmas" &&
        item.escolaId !== validated.escolaId &&
        data.enrollments.some((row) => row.turmaId === item.id)
      )
        throw new ApiError(409, "Não altere a escola de turma com matrículas.");
      Object.assign(item, validated);
      audit(data, req.user.nome, `Edição em ${req.params.recurso} #${item.id}`);
      return item;
    });
    res.json(saved);
  }),
);
// Endpoint DELETE /:recurso/:id: autenticação e validação acontecem na camada de rotas.
router.delete(
  "/:recurso/:id",
  rota(async (req, res) => {
    const collection = resources[req.params.recurso];
    if (!collection)
      throw new ApiError(404, "Recurso acadêmico não encontrado.");
    await update((data) => {
      const index = data[collection].findIndex(
        (row) => row.id === id(req.params.id),
      );
      if (index < 0) throw new ApiError(404, "Registro não encontrado.");
      if (dependencies(data, collection, data[collection][index].id))
        throw new ApiError(
          409,
          "Registro possui vínculos. Remova/desfaça os vínculos antes de excluir.",
        );
      const [removed] = data[collection].splice(index, 1);
      audit(
        data,
        req.user.nome,
        `Exclusão em ${req.params.recurso} #${removed.id}`,
      );
    });
    res.status(204).end();
  }),
);
module.exports = router;
