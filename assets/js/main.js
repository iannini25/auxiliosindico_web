import { requireAuth } from "./core/auth.js";
import { initIndex } from "./pages/index.js";
import { initAfazer } from "./pages/afazer.js";
import { initConcluidas } from "./pages/concluidas.js";
import { initSugestoes } from "./pages/sugestoes.js";
import { initQueixas } from "./pages/queixas.js";

const inits = { index: initIndex, afazer: initAfazer, concluidas: initConcluidas, sugestoes: initSugestoes, queixas: initQueixas };

document.addEventListener("DOMContentLoaded", () => {
  requireAuth(() => {
    const page = document.body.dataset.page || "index";
    inits[page]?.();
  });
});
