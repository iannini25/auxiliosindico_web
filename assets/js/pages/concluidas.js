import { db } from "../core/firebaseStore.js";
import {
  collection, query, where, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function initConcluidas() {
  const root = document.querySelector(".tasks");
  if (!root) return;

  // Query simples (sem orderBy) para não exigir índice
  const q = query(collection(db, "tasks"), where("status", "==", "done"));

  onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push(d.data()));
    render(root, items);
  });

  // Fallback único: se não tiver "done", tentamos "concluida" (tarefas antigas)
  const first = await getDocs(q);
  if (first.empty) {
    const qOld = query(collection(db, "tasks"), where("status", "==", "concluida"));
    const old = await getDocs(qOld);
    if (!old.empty) {
      const items = [];
      old.forEach((d) => items.push(d.data()));
      render(root, items);
    }
  }
}

function render(root, items) {
  // ordena no cliente por updatedAt desc (cai pra createdAt se faltar)
  items.sort((a,b) => ts(b) - ts(a));

  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = `<article class="task-card"><p>Nenhuma atividade concluída.</p></article>`;
    return;
  }
  items.forEach((t) => root.appendChild(card(t)));
}

function ts(t) {
  const u = t.updatedAt?.toMillis?.() ?? null;
  const c = t.createdAt?.toMillis?.() ?? 0;
  return u ?? c;
}

function card(t) {
  const when = t.updatedAt?.toDate ? t.updatedAt.toDate().toLocaleDateString() :
               t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : "—";
  const el = document.createElement("article");
  el.className = "task-card task-card--ok";
  el.innerHTML = `
    <div class="task-card__head">
      <h2 class="task-card__title">${esc(t.title || "Atividade")}</h2>
      <span class="task-badge">Finalizado</span>
    </div>
    <p class="task-card__desc">${esc(t.description || "")}</p>
    <div class="task-card__meta"><span class="task-meta__item">Concluído em: ${when}</span></div>
  `;
  return el;
}

const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
