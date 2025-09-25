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

// regra: senha = número do apto repetido até ter 6 dígitos (ex.: 604 -> 604604)
function normalizeAptPassword(v) {
  const digits = String(v).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 6) return digits.slice(0, 72); // limite seguro
  const times = Math.ceil(6 / digits.length);
  return (digits.repeat(times)).slice(0, 72); // >=6 e com teto
}

// apartamentos válidos: 201–204, 301–304, …, 601–604
export function isValidApartment(apt) {
  const n = Number(apt);
  const andar = Math.floor(n / 100);
  const num = n % 100;
  return [2, 3, 4, 5, 6].includes(andar) && (num >= 1 && num <= 4) && n >= 201 && n <= 604;
}

// Cadastro + criação de documentos no Firestore em transação
export async function signUp({ name, phone, apt, email }) {
  const password = normalizeAptPassword(apt);
  if (!isValidApartment(apt)) {
    throw new Error("Apartamento inválido. Use algo entre 201–204, 301–304, …, 601–604.");
  }

  // cria usuário no Auth
  const userCred = await createUserWithEmailAndPassword(auth, String(email).trim().toLowerCase(), password);
  const uid = userCred.user.uid;

  // Aguarda autenticação real antes de acessar Firestore (garante request.auth.uid nas rules)
  await new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user && user.uid === uid) resolve();
    });
  });

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
      email: String(email).trim().toLowerCase(),
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

// Login com fallback p/ contas antigas (pré-regra da repetição)
export async function loginWithEmail({ email, aptPassword }) {
  const emailLower = String(email).trim().toLowerCase();
  const passPrimary = normalizeAptPassword(aptPassword);      // regra nova (repetida até 6)
  const passRaw     = String(aptPassword).replace(/\D/g, ""); // compat com contas antigas

  try {
    await signInWithEmailAndPassword(auth, emailLower, passPrimary);
    return;
  } catch (err) {
    if (err?.code === "auth/invalid-credential" && passRaw && passRaw !== passPrimary) {
      // tenta com a senha “crua” (ex.: 604) se a “repetida” falhar
      await signInWithEmailAndPassword(auth, emailLower, passRaw);
      return;
    }
    throw err;
  }
}
