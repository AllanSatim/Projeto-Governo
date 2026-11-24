/**
 * Auditoria estática de interface — SGE Educação V3.
 * Não depende de navegador: verifica estrutura compartilhada e arquivos do layout.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "..", "public");
const pages = fs.readdirSync(dir).filter((name) => name.endsWith(".html"));

/** Verifica identidade visual e carregamento de arquivos em todas as páginas. */
test("13 telas carregam logo, estilo e script sem referências quebradas", () => {
  assert.equal(pages.length, 13);
  for (const name of pages) {
    const html = fs.readFileSync(path.join(dir, name), "utf8");
    assert.doesNotMatch(
      html,
      /AMBIENTE DEMONSTRATIVO|Ambiente de demonstração|Dados demonstrativos|showcase-footnote/,
      name,
    );
    assert.match(html, /assets\/sge-simbolo\.png/, name);
    assert.match(html, /css\/refinements\.css/, name);
    assert.match(html, /assets\/sge-marca-completa\.webp/, name);
    assert.match(html, /id="conteudoPrincipal"/, name);
    assert.match(html, /href="#conteudoPrincipal"/, name);
    for (const [, target] of html.matchAll(/(?:src|href)="([^"?#]+)"/g)) {
      if (/^(https?:|mailto:|tel:)/.test(target)) continue;
      assert.ok(
        fs.existsSync(path.join(dir, target)),
        `${name}: referência ausente ${target}`,
      );
    }
  }
});

/** Verifica navegação por teclado e item ativo em cada tela interna. */
test("10 páginas autenticadas possuem navegação unificada e acessível", () => {
  const auth = new Set(["login.html", "cadastro.html", "esqueceu-senha.html"]);
  const protectedPages = pages.filter((name) => !auth.has(name));
  assert.equal(protectedPages.length, 10);
  for (const name of protectedPages) {
    const html = fs.readFileSync(path.join(dir, name), "utf8");
    assert.match(html, /id="menuLateral"/);
    assert.match(html, /aria-controls="menuLateral"/);
    assert.match(html, /id="navBackdrop"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, name);
    assert.match(html, /class="link-gestao-escolar/); // preserva controle de perfil
    assert.ok(
      !html.includes('href="configuracoes.html"'),
      "Link de configuração inexistente",
    );
  }
});

/** Garante que a interação de menu e o esquema de cores sejam parte do projeto. */
test("estilos cobrem dispositivos móveis e opções de acessibilidade", () => {
  const css = fs.readFileSync(path.join(dir, "css", "refinements.css"), "utf8");
  const js = fs.readFileSync(path.join(dir, "js", "theme.js"), "utf8");
  for (const rule of [
    "prefers-reduced-motion",
    "focus-visible",
    "nav-backdrop",
    "max-width: 860px",
    'data-theme="dark"',
  ]) {
    assert.ok(css.includes(rule), `Regra CSS esperada: ${rule}`);
  }
  assert.match(
    css,
    /overflow-x:\s*hidden/,
    "A tela não deve criar rolagem lateral",
  );
  assert.match(
    css,
    /max-width:\s*1450px/,
    "O estoque deve empilhar antes da compressao lateral",
  );
  assert.match(
    css,
    /tabela-merenda-itens/,
    "A tabela de merenda deve usar layout fixo",
  );
  assert.match(
    css,
    /tabela-merenda-movimentos/,
    "A tabela de movimentacoes da merenda deve usar layout fixo",
  );
  assert.match(
    css,
    /graficos-relatorio/,
    "Os graficos do relatorio devem ter layout organizado",
  );
  assert.match(
    css,
    /tabela-historico-movimentacoes/,
    "A tabela de movimentacoes deve usar largura fixa",
  );
  for (const handler of ["aria-expanded", "Escape", "nav-open", "click"]) {
    assert.ok(js.includes(handler), `Evento esperado: ${handler}`);
  }
});

test("tela de merenda oferece ações em formulário próprio e exclusão direta", () => {
  const html = fs.readFileSync(path.join(dir, "Merenda.html"), "utf8");
  const js = fs.readFileSync(path.join(dir, "js", "app.js"), "utf8");
  assert.match(html, /id="acoesMerenda"/);
  for (const action of ["minimo", "entrada", "consumo", "excluir"]) {
    assert.ok(
      html.includes(`selecionarAcaoMerenda('${action}')`),
      `Ação de merenda esperada: ${action}`,
    );
  }
  assert.match(js, /window\.excluirAlimento = async \(id\) => \{/);
  assert.doesNotMatch(
    js,
    /window\.confirm\('Deseja excluir este registro de merenda/,
  );
});
