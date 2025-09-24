import { auth, db, serverTimestamp, doc, setDoc, runTransaction } from "./firebaseStore.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ---- NOVO: protege páginas privadas ----
export function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // se não estiver logado, manda pro cadastro/login
      window.location.href = "/signup.html";
    } else {
      onReady?.(user);
    }
  });
}

// ---- já era seu (mantive) ----

// helper: "604" -> "604604" (>=6 chars)
function normalizeAptPassword(apt) {
  const s = String(apt).trim();
  return s.length >= 6 ? s : s + s;
}

const ALLOWED_APTS = (() => {
  const apts = [];
  const floors = [2,3,4,5,6];
  const nums = [1,2,3,4];
  for (const f of floors) for (const n of nums) apts.push(Number(`${f}0${n}`));
  return new Set(apts);
})();
export function isValidApartment(apt) { return ALLOWED_APTS.has(Number(apt)); }

export async function signUp({ name, phone, apt, email }) {
  if (!isValidApartment(apt)) throw new Error("Apartamento inválido.");

  const initialPass = normalizeAptPassword(apt);
  const userCred = await createUserWithEmailAndPassword(auth, email, initialPass);
  const uid = userCred.user.uid;

  try {
    const aptRef = doc(db, "apartments", String(apt));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(aptRef);
      const data = snap.exists() ? snap.data() : { count: 0, residents: [] };
      if ((data.count || 0) >= 2) throw new Error("Este apartamento já possui 2 usuários.");
      tx.set(aptRef, {
        count: (data.count || 0) + 1,
        residents: Array.from(new Set([...(data.residents || []), uid])),
        updatedAt: serverTimestamp(),
        createdAt: snap.exists() ? (data.createdAt ?? serverTimestamp()) : serverTimestamp()
      }, { merge: true });
    });

    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      name, phone, apt: Number(apt), email,
      role: "resident",
      createdAt: serverTimestamp()
    });

  } catch (err) {
    try { await userCred.user.delete(); } catch (_) {}
    try { await signOut(auth); } catch (_) {}
    throw err;
  }
}

export async function loginWithEmail({ email, aptPassword }) {
  await signInWithEmailAndPassword(auth, email, normalizeAptPassword(aptPassword));
}
