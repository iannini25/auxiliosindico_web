// assets/js/pages/sugestoes.js
import { db, serverTimestamp } from "../core/firebaseStore.js";
import {
  collection, addDoc, doc, setDoc, getDoc, onSnapshot, query, where, orderBy, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getCurrentUserWithRole } from "../core/store.js";

export async function initSugestoes() {
  const { user, profile } = await getCurrentUserWithRole();
  if (!user) return;

  const form = document.querySelector(".suggest-form");
  const list = document.querySelector(".suggestions");
  if (!form || !list) return;

  // ENVIAR SUGESTÃO
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = form.querySelector("#sugestao");
    const text = (ta?.value || "").trim();
    if (!text) return alert("Escreva a sugestão.");

    const [title, ...rest] = text.split(/\n/);
    const description = rest.join("\n").trim();

    try {
      const ref = await addDoc(collection(db, "suggestions"), {
        title: (title || "Sugestão").slice(0, 120),
        description,
        text,
        status: "pendente",
        createdAt: serverTimestamp(),
        authorUid: user.uid,
        authorName: profile?.name || "",
        authorApt: profile?.apt ?? null,
      });
      // console.info("[suggestions] created:", ref.path); // opcional p/ conferir no console
      ta.value = "";
    } catch (err) {
      alert(err?.message || "Não foi possível enviar a sugestão.");
    }
  });

  // LISTAR (pendente + aprovada) SEM EXIGIR ÍNDICE COMPOSTO
  // Em vez de where(..., "in", [...]) + orderBy(...), usamos só orderBy e filtramos no cliente.
  const q = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    list.innerHTML = "";
    snap.forEach((d) => {
      const s = d.data();
      if (s?.status === "pendente" || s?.status === "aprovada") {
        list.appendChild(renderSuggestion(d.id, s, user.uid));
      }
    });
  }, (err) => {
    console.error("Erro ao carregar sugestões:", err);
  });
}

function renderSuggestion(id, s, myUid) {
  const el = document.createElement("article");
  el.className = "suggest-card";
  const when = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : "—";
  el.innerHTML = `
    <div class="suggest-card__head"><h2 class="suggest-card__title">${esc(s.title || "Sugestão")}</h2></div>
    <p class="suggest-card__desc">${esc(s.description || "")}</p>
    <div class="suggest-card__meta">
      <span class="suggest-meta__item">Enviado por: ${esc(s.authorName || "Morador")}</span>
      <span class="suggest-meta__sep">•</span>
      <time class="suggest-meta__item">${when}</time>
    </div>

    <div class="suggest-votes" role="group" aria-label="Votação">
      <button class="vote-btn vote-btn--no"  type="button" aria-pressed="false" aria-label="Votar contra">✕</button>
      <span class="vote-tally">
        <b data-no>0</b> 
        <span class="suggest-meta__sep">•</span>
        <b data-yes>0</b> 
      </span>
      <button class="vote-btn vote-btn--yes" type="button" aria-pressed="false" aria-label="Votar a favor">✓</button>
    </div>
  `;

  const yesBtn = el.querySelector(".vote-btn--yes");
  const noBtn  = el.querySelector(".vote-btn--no");
  const yesCnt = el.querySelector("[data-yes]");
  const noCnt  = el.querySelector("[data-no]");

  // placar + meu voto (ao vivo)
  const votesQ = query(collection(db, "suggestionVotes"), where("suggestionId", "==", id));
  onSnapshot(votesQ, (vs) => {
    let yes = 0, no = 0, my = null;
    vs.forEach((v) => {
      const d = v.data();
      if (d.value === "yes") yes++;
      if (d.value === "no")  no++;
      if (d.uid === myUid)   my = d.value;
    });
    yesCnt.textContent = String(yes);
    noCnt.textContent  = String(no);

    // estado visual (não desabilita; permite retirar/trocar)
    yesBtn.classList.toggle("is-active", my === "yes");
    noBtn.classList.toggle("is-active",  my === "no");
    yesBtn.setAttribute("aria-pressed", my === "yes" ? "true" : "false");
    noBtn.setAttribute("aria-pressed",  my === "no"  ? "true" : "false");
  });

  yesBtn.addEventListener("click", () => vote(id, myUid, "yes"));
  noBtn.addEventListener("click",  () => vote(id, myUid, "no"));
  return el;
}

// 1 voto por pessoa: cria / troca / remove
async function vote(suggestionId, uid, value) {
  const ref = doc(db, "suggestionVotes", `${suggestionId}_${uid}`);
  const ex  = await getDoc(ref);

  if (!ex.exists()) {
    await setDoc(ref, { suggestionId, uid, value, createdAt: serverTimestamp() });
    return;
  }
  const curr = ex.data().value;
  if (curr === value) {
    await deleteDoc(ref); // retirar voto
  } else {
    await updateDoc(ref, { value, changedAt: serverTimestamp() }); // trocar voto
  }
}

const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
