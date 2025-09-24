import { auth, db, serverTimestamp } from "/assets/js/core/firebaseStore.js";
import {
  doc, getDoc, addDoc, collection, query, where, onSnapshot, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const panel = document.getElementById("panel");
const notModerator = document.getElementById("notModerator");
const suggestionsList = document.getElementById("suggestionsList");
const emptySug = document.getElementById("emptySug");

// logout
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login.html";
});

// checa papel do usuário
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);
  const role = usnap.exists() ? usnap.data().role : null;

  if (role !== "moderator") {
    notModerator.style.display = "block";
    panel.style.display = "none";
    return;
  }
  notModerator.style.display = "none";
  panel.style.display = "block";

  bindTaskForm(user);
  listenSuggestions();
});

// form nova task
function bindTaskForm(user){
  const form = document.getElementById("taskForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("taskTitle").value.trim();
    const desc  = document.getElementById("taskDesc").value.trim();
    const cat   = document.getElementById("taskCat").value;
    const dueStr= document.getElementById("taskDue").value;

    if (!title) { alert("Digite um título"); return; }

    const payload = {
      title,
      description: desc || "",
      category: cat,
      status: "todo",            // todo | doing | late
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
    };
    if (dueStr) payload.dueDate = new Date(`${dueStr}T00:00:00`);

    try {
      await addDoc(collection(db, "tasks"), payload);
      form.reset();
      alert("Atividade criada!");
    } catch (err) {
      alert(err.message);
    }
  });
}

// sugestões pendentes
function listenSuggestions(){
  const q = query(collection(db, "suggestions"), where("status", "in", ["pendente", null]));
  onSnapshot(q, (snap) => {
    suggestionsList.innerHTML = "";
    if (snap.empty) {
      emptySug.style.display = "block";
      return;
    }
    emptySug.style.display = "none";
    snap.forEach((docu) => {
      const s = { id: docu.id, ...docu.data() };
      suggestionsList.appendChild(renderSuggestionCard(s));
    });
  });
}

function renderSuggestionCard(sug){
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;">
      <div>
        <strong>${escapeHtml(sug.title || "Sugestão")}</strong>
        <div class="muted">${escapeHtml(sug.description || "")}</div>
        <div class="muted">por: ${escapeHtml(sug.authorName || "—")}</div>
      </div>
      <span class="pill">pendente</span>
    </div>
    <div class="actions">
      <button data-act="approve">Aprovar</button>
      <button data-act="reject">Rejeitar</button>
    </div>
  `;
  div.querySelector('[data-act="approve"]').addEventListener("click", () => updateSuggestion(sug.id, "aprovada"));
  div.querySelector('[data-act="reject"]').addEventListener("click", () => updateSuggestion(sug.id, "rejeitada"));
  return div;
}

async function updateSuggestion(id, status){
  try {
    await updateDoc(doc(db, "suggestions", id), {
      status,
      decidedAt: serverTimestamp()
    });
  } catch (err) {
    alert(err.message);
  }
}

// util
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
