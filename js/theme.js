const themeRoot = document.documentElement;
const savedTheme = localStorage.getItem("sge-theme");

themeRoot.dataset.theme = savedTheme === "dark" ? "dark" : "light";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".item-configuracoes-removido, .modulo-configuracoes-removido").forEach((item) => {
    item.remove();
  });

  const themeToggle = document.getElementById("themeToggle");

  if (themeToggle) {
    const updateThemeToggle = () => {
      const darkModeEnabled = themeRoot.dataset.theme === "dark";
      themeToggle.textContent = darkModeEnabled ? "Ativar modo claro" : "Ativar modo escuro";
      themeToggle.setAttribute("aria-pressed", String(darkModeEnabled));
    };

    updateThemeToggle();
    themeToggle.addEventListener("click", () => {
      const nextTheme = themeRoot.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("sge-theme", nextTheme);
      themeRoot.dataset.theme = nextTheme;
      updateThemeToggle();
    });
  }
});
