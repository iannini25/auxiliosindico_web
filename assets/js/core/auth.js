// auth.js
import { auth, db, serverTimestamp, doc, setDoc, runTransaction } from "./firebaseStore.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // use caminho relativo para funcionar no Netlify/GitHub Pages
      window.location.href = "signup.html";
    } else {
      onReady?.(user);
    }
  });
}

// regra do seu projeto: senha = nº do apartamento (normalizada)
function normalizeAptPassword(v) {
  const s = String(v).trim();
  // mantém apenas dígitos; evita "604 " diferente de "604"
  return s.replace(/\D/g, "");
}

// apartamentos válidos: 201–204, 301–304, …, 601–604
export function isValidApartment(apt) {
  const n = Number(apt);
  const andar = Math.floor(n / 100);
  const num = n % 100;
  return [2,3,4,5,6].includes(andar) && [1,2,3,4].includes(Math.floor(num/1)) && (andar*100 + num) >= 201 && (andar*100 + num) <= 604;
}

// Cadastro + criação de documentos no Firestore em transação
export async function signUp({ name, phone, apt, email }) {
  const password = normalizeAptPassword(apt);
  if (!isValidApartment(apt)) {
    throw new Error("Apartamento inválido. Use algo entre 201–204, 301–304, …, 601–604.");
  }

  // cria usuário no Auth
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCred.user.uid;

  try {
    // garante limite de 2 moradores por apartamento
    const aptRef = doc(db, "apartments", String(apt));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(aptRef);
      const data = snap.exists() ? snap.data() : { count: 0, residents: [] };
      if ((data.count || 0) >= 2) {
        throw new Error("Este apartamento já possui 2 usuários.");
      }
      tx.set(
        aptRef,
        {
          count: (data.count || 0) + 1,
          residents: Array.from(new Set([...(data.residents || []), uid])),
          updatedAt: serverTimestamp(),
          createdAt: snap.exists() ? (data.createdAt ?? serverTimestamp()) : serverTimestamp(),
        },
        { merge: true }
      );
    });

    // cria perfil do usuário
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      name: name?.trim() || "",
      phone: phone?.trim() || "",
      apt: Number(apt),
      email: email?.trim()?.toLowerCase() || "",
      role: "resident",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // rollback de segurança
    try { await userCred.user.delete(); } catch (_) {}
    try { await signOut(auth); } catch (_) {}
    throw err;
  }
}

export async function loginWithEmail({ email, aptPassword }) {
  await signInWithEmailAndPassword(auth, String(email).trim().toLowerCase(), normalizeAptPassword(aptPassword));
}
