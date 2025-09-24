import { db, serverTimestamp } from "../core/firebaseStore.js";
import { addDoc, collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getCurrentUserWithRole, buildWhatsAppHref } from "../core/store.js";

export async function initQueixas() {
  const { user, profile } = await getCurrentUserWithRole();
  if (!user) return;

  // aplica wa.me do próprio usuário aos botões existentes
  document.querySelectorAll(".whatsapp-btn").forEach((a) => {
    a.href = buildWhatsAppHref(profile, "Olá, gostaria de falar sobre minha queixa.");
  });

  const form = document.querySelector(".complaint-form");
  const list = document.querySelector(".complaints");
  if (!form || !list) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const txt = form.querySelector("#reclamacao")?.value?.trim() || "";
    const cat = form.querySelector('select[name="categoria"]')?.value || "";
    if (!txt) return alert("Descreva o problema.");
    if (!cat) return alert("Selecione a categoria.");

    try {
      await addDoc(collection(db, "complaints"), {
        text: txt,
        category: cat,
        authorUid: user.uid,
        authorName: profile?.name || "",
        authorApt: profile?.apt || null,
        authorPhone: profile?.phone || "",   // <-- guarda o telefone do usuário
        createdAt: serverTimestamp()
      });
      form.reset();
    } catch (err) { alert(err.message); }
  });

  const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => {
      const c = d.data();
      const when = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : "—";
      const waLink = c.authorPhone ? `https://wa.me/${c.authorPhone.replace(/\D/g,"")}` : null;

      const art = document.createElement("article");
      art.className = `complaint-card`;
      art.innerHTML = `
        <div class="complaint-card__head">
          <h2 class="complaint-card__title">${esc(c.text)}</h2>
        </div>
        <div class="complaint-card__meta">
          <span class="complaint-meta__item">Categoria: ${esc(c.category || "—")}</span>
          <span class="complaint-meta__sep">•</span>
          <time class="complaint-meta__item">${when}</time>
          <span class="complaint-meta__sep">•<br></span>
          <span class="complaint-meta__item">Enviado por: ${esc(c.authorName || "Morador")}</span>
          ${waLink ? `
            <span class="complaint-meta__sep">•</span>
            <a class="whatsapp-btn" href="${waLink}" target="_blank" title="Falar no WhatsApp">
              📲 WhatsApp</a>` : ""}
        </div>`;
      items.push(art);
    });

    // limpa e insere na ordem (já vem decrescente do Firestore)
    list.innerHTML = "";
    items.forEach((art) => list.appendChild(art));
  });
}

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
