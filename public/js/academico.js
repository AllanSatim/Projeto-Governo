/**
 * public/js/academico.js — SGE Educação
 * Controller da Gestão Acadêmica: definições de campos, navegação entre recursos, validação de formulário e operações de cadastro na API.
 *
 * Organização: funções de responsabilidade única; alterações de contrato devem
 * ser refletidas nas rotas e páginas relacionadas.
 */
(() => {
  "use strict";
  /** Isola a responsabilidade $ para manter a lógica reutilizável e testável. */
  const $ = (id) => document.getElementById(id);
  if (!$("academicTabs")) return;
  const token =
    localStorage.getItem("sgeToken") || sessionStorage.getItem("sgeToken");
  /** Escapa caracteres especiais antes de inserir texto dinâmico no HTML. */
  const escape = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const schemas = {
    escolas: {
      label: "Escolas",
      fields: [
        ["nome", "Nome da escola", "text", true],
        ["codigoInep", "Código INEP (8 dígitos)", "text"],
        ["municipio", "Município", "text", true],
        ["bairro", "Bairro"],
        ["endereco", "Endereço"],
        ["telefone", "Telefone"],
        ["email", "E-mail", "email"],
        ["ativo", "Ativa?", "check"],
      ],
      columns: ["nome", "codigoInep", "municipio", "bairro", "ativo"],
    },
    professores: {
      label: "Professores",
      fields: [
        ["nome", "Nome completo", "text", true],
        ["cpf", "CPF (11 dígitos)"],
        ["email", "E-mail", "email"],
        ["telefone", "Telefone"],
        ["especialidade", "Especialidade"],
        ["ativo", "Ativo?", "check"],
      ],
      columns: ["nome", "cpf", "especialidade", "email", "ativo"],
    },
    alunos: {
      label: "Alunos",
      fields: [
        ["nome", "Nome completo", "text", true],
        ["dataNascimento", "Data de nascimento", "date", true],
        ["cpf", "CPF (opcional)"],
        ["responsavel", "Nome do responsável", "text", true],
        ["telefone", "Telefone"],
        ["email", "E-mail", "email"],
        ["escolaId", "Escola", "escolas", true],
        ["ativo", "Ativo?", "check"],
      ],
      columns: ["nome", "dataNascimento", "responsavel", "escolaId", "ativo"],
    },
    turmas: {
      label: "Turmas",
      fields: [
        ["nome", "Identificação da turma", "text", true],
        ["anoLetivo", "Ano letivo", "number", true],
        ["serie", "Série ou etapa", "text", true],
        ["turno", "Turno", "turnos", true],
        ["escolaId", "Escola", "escolas", true],
        ["professorId", "Professor responsável", "professores"],
        ["vagas", "Vagas", "number", true],
        ["ativo", "Ativa?", "check"],
      ],
      columns: ["nome", "anoLetivo", "serie", "turno", "escolaId", "vagas"],
    },
    matriculas: {
      label: "Matrículas",
      fields: [
        ["alunoId", "Aluno", "alunos", true],
        ["turmaId", "Turma", "turmas", true],
        ["status", "Situação", "status", true],
        ["dataMatricula", "Data da matrícula", "date", true],
      ],
      columns: ["alunoId", "turmaId", "status", "dataMatricula"],
    },
    frequencia: {
      label: "Frequência",
      fields: [
        ["matriculaId", "Matrícula", "matriculas", true],
        ["data", "Dia", "date", true],
        ["presente", "Presença", "presenca", true],
        ["justificativa", "Justificativa", "text"],
      ],
      columns: ["matriculaId", "data", "presente", "justificativa"],
    },
  };
  const dropdowns = {
    turnos: [
      ["Manhã", "Manhã"],
      ["Tarde", "Tarde"],
      ["Noite", "Noite"],
      ["Integral", "Integral"],
    ],
    status: [
      ["Ativa", "Ativa"],
      ["Concluída", "Concluída"],
      ["Cancelada", "Cancelada"],
    ],
    presenca: [
      ["true", "Presente"],
      ["false", "Ausente"],
    ],
  };
  const names = Object.keys(schemas);
  let current = "escolas",
    records = [],
    cache = {},
    editId = null;
  /** Solicita dados acadêmicos à API e identifica sessões inválidas ou acesso negado. */
  async function request(path, opts = {}) {
    const response = await fetch("/api/academico" + path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (response.status === 401) {
      location.replace("login.html");
      throw new Error("Sessão expirada.");
    }
    if (response.status === 403) {
      location.replace("index.html");
      throw new Error("Acesso restrito aos perfis acadêmicos autorizados.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.erro || `Erro HTTP ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }
  /** Apresenta mensagens de validação e confirmação na Gestão Acadêmica. */
  function notice(message, error = false) {
    const target = $("academicNotice");
    target.style.display = "";
    target.className = "mensagem-status " + (error ? "erro" : "sucesso");
    target.textContent = message;
  }
  /** Recupera o rótulo legível definido para um campo da Gestão Acadêmica. */
  function fieldLabel(key) {
    for (const schema of Object.values(schemas)) {
      const entry = schema.fields.find((f) => f[0] === key);
      if (entry) return entry[1];
    }
    return key;
  }
  /** Formata valores, datas e nomes relacionados para a tabela acadêmica. */
  function display(key, value) {
    if (key === "ativo") return value ? "Sim" : "Não";
    if (key === "presente") return value ? "Presente" : "Ausente";
    if (key.endsWith("Id")) {
      const related = {
        escolaId: "escolas",
        professorId: "professores",
        alunoId: "alunos",
        turmaId: "turmas",
        matriculaId: "matriculas",
      }[key];
      const item = cache[related]?.find((row) => row.id === value);
      if (related === "matriculas")
        return item ? `#${item.id} · ${display("alunoId", item.alunoId)}` : "—";
      return item ? escape(item.nome) : "—";
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return escape(value.split("-").reverse().join("/"));
    return escape(value || "—");
  }
  /** Monta as abas para navegar pelos diferentes tipos de cadastro acadêmico. */
  function tabs() {
    $("academicTabs").innerHTML = names
      .map(
        (name) =>
          `<button type="button" role="tab" aria-selected="${name === current}" class="academic-tab ${name === current ? "selected" : ""}" data-tab="${name}">${schemas[name].label}</button>`,
      )
      .join("");
  }
  /** Atualiza a apresentação de render a partir dos dados disponíveis na interface. */
  function render() {
    const term = $("academicSearch").value.trim().toLowerCase();
    const schema = schemas[current];
    const list = records.filter((row) =>
      schema.columns.some(
        (key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(term) ||
          display(key, row[key]).toLowerCase().includes(term),
      ),
    );
    $("academicHead").innerHTML =
      `<tr><th>ID</th>${schema.columns.map((key) => `<th>${escape(fieldLabel(key))}</th>`).join("")}<th>Ações</th></tr>`;
    $("academicRows").innerHTML = list.length
      ? list
          .map(
            (
              row,
            ) => `<tr><td>#${row.id}</td>${schema.columns.map((key) => `<td>${display(key, row[key])}</td>`).join("")}
      <td class="academic-row-actions"><button class="btn-secondary btn-sm" data-edit="${row.id}" type="button">Editar</button>
      <button class="btn-danger btn-sm" type="button" data-delete="${row.id}">Excluir</button></td></tr>`,
          )
          .join("")
      : `<tr><td colspan="${schema.columns.length + 2}">Nenhum registro encontrado.</td></tr>`;
    $("academicCount").textContent =
      `${list.length} de ${records.length} registro(s)`;
  }
  /** Atualiza a apresentação de loadOptions a partir dos dados disponíveis na interface. */
  async function loadOptions() {
    await Promise.all(
      names.map(async (name) => {
        cache[name] = await request(`/${name}`);
      }),
    );
  }
  /** Atualiza a apresentação de load a partir dos dados disponíveis na interface. */
  async function load() {
    await loadOptions();
    records = cache[current];
    render();
  }
  /** Isola a responsabilidade summary para manter a lógica reutilizável e testável. */
  async function summary() {
    const stats = await request("/resumo");
    const items = [
      ["Escolas", stats.escolas],
      ["Alunos", stats.alunos],
      ["Professores", stats.professores],
      ["Turmas", stats.turmas],
      ["Matrículas ativas", stats.matriculasAtivas],
      ["Faltas registradas", stats.faltas],
    ];
    $("academicKpis").innerHTML = items
      .map(
        ([label, value]) =>
          `<div class="academic-kpi"><strong>${value}</strong><span>${label}</span></div>`,
      )
      .join("");
  }
  /** Isola a responsabilidade options para manter a lógica reutilizável e testável. */
  function options(type) {
    const source =
      dropdowns[type] ||
      (cache[type] || []).map((row) => [
        String(row.id),
        type === "matriculas"
          ? `#${row.id} - ${display("alunoId", row.alunoId).replace(/&amp;/g, "&")}`
          : row.nome,
      ]);
    return source
      .map(
        ([value, label]) =>
          `<option value="${escape(value)}">${escape(label)}</option>`,
      )
      .join("");
  }
  /** Isola a responsabilidade openForm para manter a lógica reutilizável e testável. */
  function openForm(record = null) {
    editId = record?.id ?? null;
    $("academicFormTitle").textContent =
      `${editId ? "Editar" : "Cadastrar"} — ${schemas[current].label}`;
    $("academicFields").innerHTML = schemas[current].fields
      .map(([key, label, type = "text", required]) => {
        const value =
          record?.[key] ??
          (type === "check"
            ? true
            : key === "anoLetivo"
              ? new Date().getFullYear()
              : key === "dataMatricula" || key === "data"
                ? new Date().toISOString().slice(0, 10)
                : "");
        if (type === "check")
          return `<label class="academic-field academic-check"><input type="checkbox" name="${key}" ${value ? "checked" : ""}> ${escape(label)}</label>`;
        if (dropdowns[type] || cache[type])
          return `<label class="academic-field">${escape(label)}<select name="${key}" ${required ? "required" : ""}><option value="">Selecione...</option>${options(type)}</select></label>`;
        return `<label class="academic-field">${escape(label)}<input type="${type === "number" || type === "date" || type === "email" ? type : "text"}" name="${key}" value="${escape(value)}" ${required ? "required" : ""} ${type === "number" ? 'min="1"' : ""} maxlength="255"></label>`;
      })
      .join("");
    for (const [key, , type] of schemas[current].fields) {
      if (dropdowns[type] || cache[type]) {
        const selector = $("academicForm").elements.namedItem(key);
        selector.value =
          record?.[key] === null || record?.[key] === undefined
            ? type === "status"
              ? "Ativa"
              : type === "presenca"
                ? "true"
                : ""
            : String(record[key]);
      }
    }
    $("academicFormPanel").hidden = false;
    $("academicFormPanel").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
  /** Isola a responsabilidade closeForm para manter a lógica reutilizável e testável. */
  const closeForm = () => {
    editId = null;
    $("academicFormPanel").hidden = true;
    $("academicForm").reset();
  };
  /** Isola a responsabilidade submit para manter a lógica reutilizável e testável. */
  async function submit(event) {
    event.preventDefault();
    const body = {};
    for (const [key, , type] of schemas[current].fields) {
      const input = event.currentTarget.elements.namedItem(key);
      body[key] =
        type === "check"
          ? input.checked
          : type === "presenca"
            ? input.value === "true"
            : type === "number" || key.endsWith("Id")
              ? input.value
                ? Number(input.value)
                : null
              : input.value.trim();
    }
    try {
      await request(`/${current}${editId ? `/${editId}` : ""}`, {
        method: editId ? "PUT" : "POST",
        body,
      });
      closeForm();
      await load();
      await summary();
      notice("Registro salvo com sucesso.");
    } catch (error) {
      notice(error.message, true);
    }
  }
  $("academicTabs").addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    current = tab.dataset.tab;
    $("academicSearch").value = "";
    tabs();
    closeForm();
    try {
      await load();
    } catch (error) {
      notice(error.message, true);
    }
  });
  $("academicRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-edit],[data-delete]");
    if (!button) return;
    const row = records.find(
      (item) =>
        item.id === Number(button.dataset.edit || button.dataset.delete),
    );
    if (!row) return;
    if (button.dataset.edit) {
      openForm(row);
      return;
    }
    if (
      !confirm(
        `Excluir ${schemas[current].label.toLowerCase()} #${row.id}? Registros vinculados não poderão ser excluídos.`,
      )
    )
      return;
    try {
      await request(`/${current}/${row.id}`, { method: "DELETE" });
      await load();
      await summary();
      notice("Registro excluído.");
    } catch (error) {
      notice(error.message, true);
    }
  });
  $("academicSearch").addEventListener("input", render);
  $("academicNew").addEventListener("click", () => openForm());
  $("academicCancel").addEventListener("click", closeForm);
  $("academicCancelTop").addEventListener("click", closeForm);
  $("academicForm").addEventListener("submit", submit);
  tabs();
  (async () => {
    try {
      await load();
      await summary();
    } catch (error) {
      notice(error.message, true);
    }
  })();
})();
