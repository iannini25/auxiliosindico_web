import { getCurrentUserWithRole } from "../core/store.js";

export async function initIndex() {
  const { isModerator } = await getCurrentUserWithRole();
  if (!isModerator) return;
  const menu = document.querySelector(".menu");
  if (menu && !menu.querySelector("[data-admin-link]")) {
    const a = document.createElement("a");
    a.href = "admin.html";
    a.className = "menu__item menu__item--admin";
    a.setAttribute("data-admin-link", "1");
    a.innerHTML = `<span class="menu__title">Admin</span><span class="menu__desc">Painel do síndico</span>`;
    menu.appendChild(a);
  }
}
