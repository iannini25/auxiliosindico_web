import { db, serverTimestamp } from "../core/firebaseStore.js";
import {
  doc, getDoc, setDoc, collection, addDoc, onSnapshot, orderBy, query,
  updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getCurrentUserWithRole } from "../core/store.js";

const STATUS_OK = new Set(["todo", "doing", "late"]);

// remove chaves undefined antes de enviar ao Firestore
const safe = (obj) => {
  const copy = { ...obj };
  Object.keys(copy).forEach((k) => copy[k] === undefined && delete copy[k]);
  return copy;
};

export async function initAfazer() {
  const { user, profile } = await getCurrentUserWithRole();
  const isModerator = (profile?.role === "moderator");

  const root = document.querySelector(".tasks");
  if (!root) return;

  // filtros (mostra atrasadas vs no tempo)
  setupFilters();

  // === cards estáticos do HTML (semente) ===
  const cards = Array.from(root.querySelectorAll(".task-card"));
  for (const card of cards) {
    const title = card.querySelector(".task-card__title")?.textContent?.trim() || "Atividade";
    const description = card.querySelector(".task-card__desc")?.textContent?.trim() || "";
    const status = card.getAttribute("data-status") || "todo";
    const id = "static_" + slug(title);

    if (!STATUS_OK.has(status)) card.setAttribute("data-status", "todo");

    // garante o doc da task no Firestore (merge, não apaga nada)
    const tRef = doc(db, "tasks", id);
    const s = await getDoc(tRef);
    if (!s.exists()) {
      await setDoc(tRef, {
        title, description, status,
        createdAt: serverTimestamp(),
        createdByName: profile?.name || ""
      }, { merge: true });
    }

    // comentários (live)
    wireComments(id, card, profile, user);

    // botões de admin nos cards estáticos (se moderador)
    if (isModerator) injectAdminActions(card, id);
  }

  // === ouvir tarefas criadas pelo síndico ===
  const list = document.querySelector(".tasks");
  const tasksQ = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
  onSnapshot(tasksQ, (snap) => {
    snap.docChanges().forEach((chg) => {
      const id = chg.doc.id;
      // ignora os "seeds" gerados a partir dos cards estáticos
      if (id.startsWith("static_")) return;

      const t = chg.doc.data();
      const st = normalizeStatus(t.status, t.dueDate);

      // concluída não aparece aqui (vai para 'concluídas')
      if (!st) {
        // se existir um card antigo aqui, remova
        list.querySelector(`[data-id="${id}"]`)?.remove();
        return;
      }

      if (chg.type === "removed") {
        list.querySelector(`[data-id="${id}"]`)?.remove();
        return;
      }

      // cria/atualiza o card
      const existing = list.querySelector(`[data-id="${id}"]`);
      const card = renderTaskCard(id, t, st, isModerator, user);
      if (existing) existing.replaceWith(card);
      else list.prepend(card);
    });

    // reaplica o filtro atual
    applyFilter(getCurrentFilter());
  });
}

// ===== Comentários =====
function wireComments(taskId, cardEl, profile, user) {
  const list = cardEl.querySelector(".task-comments__list");
  const form = cardEl.querySelector(".task-comment-form");

  if (list) {
    const q = query(collection(db, "tasks", taskId, "comments"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snap) => {
      list.innerHTML = "";
      snap.forEach((d) => {
        const c = d.data();
        const li = document.createElement("li");
        li.className = "task-comment";
        const when = c.createdAt?.toDate ? c.createdAt.toDate() : null;
        const t = when ? `${two(when.getDate())}/${two(when.getMonth() + 1)} ${two(when.getHours())}:${two(when.getMinutes())}` : "";
        li.innerHTML = `
          <div class="task-comment__meta">
            <span class="task-comment__author">${esc(c.authorName || "Morador")}</span>
            <span class="task-comment__sep">•</span>
            <time class="task-comment__time">${t}</time>
          </div>
          <p class="task-comment__text">${esc(c.text)}</p>
        `;
        list.appendChild(li);
      });
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const text = input?.value?.trim();
      if (!text) return;
      try {
        const payload = safe({
          text,
          // usa sempre o UID do Auth; nunca envie undefined
          authorUid: user?.uid ?? profile?.uid ?? profile?.id ?? null,
          authorName: (profile?.name || "Morador").trim(),
          authorApt: profile?.apt ?? null,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "tasks", taskId, "comments"), payload);
        input.value = "";
      } catch (err) { alert(err.message); }
    });
  }
}

// === filtros (expus apply/get para reusar no snapshot) ===
function setupFilters() {
  const btns = document.querySelectorAll(".filter-btn");
  if (!btns.length) return;

  btns.forEach((b) => b.addEventListener("click", () => {
    btns.forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    applyFilter(b.dataset.filter);
  }));

  applyFilter(getCurrentFilter());
}

function getCurrentFilter() {
  const pressed = document.querySelector('.filter-btn[aria-pressed="true"]');
  return pressed?.dataset.filter || "all";
}

function applyFilter(filter) {
  document.querySelectorAll(".task-card").forEach((card) => {
    const st = card.getAttribute("data-status");
    let show = true;                 // all
    if (filter === "late") show = (st === "late");
    if (filter === "ontime") show = (st === "todo" || st === "doing");
    card.style.display = show ? "" : "none";
  });
}

// === helpers de renderização/status ===
function normalizeStatus(status, dueDate) {
  let st = (status || "todo").toLowerCase();

  // mapeia rótulos antigos do admin
  if (st === "aberta") st = "todo";
  if (st === "em_andamento") st = "doing";
  if (st === "concluida" || st === "done") return null; // concluídas saem desta lista

  // se tem prazo vencido e ainda não concluída -> 'late'
  try {
    const d = dueDate?.toDate ? dueDate.toDate() : (dueDate ? new Date(dueDate) : null);
    if (d && d < new Date() && st !== "late") st = "late";
  } catch (_) { }

  if (!STATUS_OK.has(st)) st = "todo";
  return st;
}

function renderTaskCard(id, t, st, isModerator = false, user = null) {
  const when = t.createdAt?.toDate ? t.createdAt.toDate() : null;
  const whenStr = when ? `${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()}` : "—";

  const due = t.dueDate?.toDate ? t.dueDate.toDate() : (t.dueDate ? new Date(t.dueDate) : null);
  const dueStr = due ? `${two(due.getDate())}/${two(due.getMonth() + 1)}/${due.getFullYear()}` : "—";

  const mod = st === "todo" ? "nao-iniciado" : (st === "doing" ? "andamento" : "atrasado");

  const el = document.createElement("article");
  el.className = `task-card task-card--${mod}`;
  el.dataset.status = st;
  el.dataset.id = id;
  el.innerHTML = `
    <div class="task-card__head">
      <h2 class="task-card__title">${esc(t.title || "Atividade")}</h2>
      <span class="task-status task-status--${st}">${st === "todo" ? "Não iniciado" : st === "doing" ? "Em andamento" : "Atrasado"}</span>
    </div>
    <p class="task-card__desc">${esc(t.description || "")}</p>
    <div class="task-card__meta">
      <span class="task-meta__item">Adicionado: ${whenStr}</span>
      <span class="task-meta__sep">•</span>
      <span class="task-meta__item">Prazo sugerido: ${dueStr}</span>
    </div>

    ${isModerator ? `
    <div class="task-actions" role="group" aria-label="Ações do moderador">
      <button class="btn btn--warn"  data-act="doing"  title="Marcar como em andamento">Em andamento</button>
      <button class="btn btn--ok"    data-act="done"   title="Marcar como concluída">Concluir</button>
      <button class="btn btn--danger"data-act="delete" title="Apagar atividade">Apagar</button>
    </div>` : ""}

    <section class="task-comments" aria-label="Comentários">
      <h3 class="task-comments__title">💬 Comentários</h3>
      <ul class="task-comments__list"></ul>
      <form class="task-comment-form" action="#" method="post">
        <label class="task-comment-form__label">Adicionar comentário</label>
        <div class="task-comment-form__row">
          <input class="task-comment-form__input" type="text" placeholder="Escreva um comentário…">
          <button class="task-comment-form__btn" type="submit" aria-label="Enviar comentário">➤</button>
        </div>
      </form>
    </section>
  `;

  // liga comentários (mesma lógica dos cards estáticos) — agora passando user
  wireComments(id, el, {}, user);

  // liga ações de moderador (se houver)
  if (isModerator) bindAdminActions(el, id);

  return el;
}

function bindAdminActions(cardEl, taskId) {
  cardEl.querySelectorAll(".task-actions .btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      try {
        btn.disabled = true; // evita clique duplo
        if (act === "doing") {
          await updateDoc(doc(db, "tasks", taskId), { status: "doing", updatedAt: serverTimestamp() });
          // reflete visual rapidamente
          cardEl.dataset.status = "doing";
          cardEl.querySelector(".task-status").className = "task-status task-status--doing";
          cardEl.querySelector(".task-status").textContent = "Em andamento";
          const badge = cardEl.querySelector(".task-status");
          if (badge) {
            badge.className = "task-status task-status--doing";
            badge.textContent = "Em andamento";
          }
        } else if (act === "done") {
          await updateDoc(doc(db, "tasks", taskId), { status: "done", updatedAt: serverTimestamp() });
          // some desta lista; aparecerá em concluidas.html
          cardEl.remove();
        } else if (act === "delete") {
          if (confirm("Apagar esta atividade? Isso não pode ser desfeito.")) {
            await deleteDoc(doc(db, "tasks", taskId));
            cardEl.remove();
          }
        }
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function injectAdminActions(cardEl, taskId) {
  if (cardEl.querySelector(".task-actions")) return;
  const bar = document.createElement("div");
  bar.className = "task-actions";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Ações do moderador");
  bar.innerHTML = `
    <button class="btn btn--warn"  data-act="doing"  title="Marcar como em andamento">Em andamento</button>
    <button class="btn btn--ok"    data-act="done"   title="Marcar como concluída">Concluir</button>
    <button class="btn btn--danger"data-act="delete" title="Apagar atividade">Apagar</button>
  `;
  const comments = cardEl.querySelector(".task-comments");
  if (comments) comments.insertAdjacentElement("beforebegin", bar);
  else cardEl.appendChild(bar);
  bindAdminActions(cardEl, taskId);
}

const two = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
