/**
 * SGE Educação — Tema e experiência de navegação.
 * Este módulo roda em todas as páginas e não depende da API/banco.
 * Mantém o tema selecionado e controla o menu responsivo com acessibilidade.
 */
const themeRoot = document.documentElement;

/** Lê uma preferência persistida; previne falha em navegação com storage bloqueado. */
function themePreference() {
  try { return localStorage.getItem('sge-theme'); } catch { return null; }
}

themeRoot.dataset.theme = themePreference() === 'dark' ? 'dark' : 'light';

document.addEventListener('DOMContentLoaded', () => {
  // Compatibilidade com páginas antigas que expunham um link inexistente.
  document.querySelectorAll('.item-configuracoes-removido, .modulo-configuracoes-removido')
    .forEach((item) => item.remove());

  // Alterna a aparência sem alterar dados de formulário ou sessão do usuário.
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const updateThemeToggle = () => {
      const isDark = themeRoot.dataset.theme === 'dark';
      themeToggle.textContent = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
      themeToggle.setAttribute('aria-pressed', String(isDark));
    };
    updateThemeToggle();
    themeToggle.addEventListener('click', () => {
      const nextTheme = themeRoot.dataset.theme === 'dark' ? 'light' : 'dark';
      themeRoot.dataset.theme = nextTheme;
      try { localStorage.setItem('sge-theme', nextTheme); } catch { /* sessão sem armazenamento local */ }
      updateThemeToggle();
    });
  }

  // Menu mobile: fechar ao tocar fora, escolher rota ou pressionar Escape.
  const toggle = document.querySelector('.btn-menu-mobile');
  const nav = document.getElementById('menuLateral');
  const backdrop = document.getElementById('navBackdrop');
  if (!toggle || !nav || !backdrop) return; // Páginas de autenticação não possuem menu.

  const setMenu = (open) => {
    const next = Boolean(open);
    nav.classList.toggle('aberta', next);
    backdrop.hidden = !next;
    document.body.classList.toggle('nav-open', next);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', next ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    if (next) nav.querySelector('a')?.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('aberta')));
  backdrop.addEventListener('click', () => { setMenu(false); toggle.focus(); });
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('aberta')) {
      setMenu(false);
      toggle.focus();
    }
  });
  // A navegação lateral volta ao layout tradicional quando a tela amplia.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860 && nav.classList.contains('aberta')) setMenu(false);
  });
});
