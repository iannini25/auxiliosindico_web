import { auth, db } from "./firebaseStore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function onReadyUser() {
  return new Promise((resolve) => onAuthStateChanged(auth, (u) => resolve(u)));
}
export async function getUserDoc(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { id: uid, ...s.data() } : null;
}
export async function getCurrentUserWithRole() {
  const user = await onReadyUser();
  if (!user) return { user: null, profile: null, isModerator: false };
  const profile = await getUserDoc(user.uid);
  return { user, profile, isModerator: profile?.role === "moderator" };
}
export function buildWhatsAppHref(profile, msg = "") {
  if (!profile?.phone) return "https://wa.me/";
  const digits = String(profile.phone).replace(/\D/g, "");
  const withBR = digits.startsWith("55") ? digits : "55" + digits;
  const q = msg ? `?text=${encodeURIComponent(msg)}` : "";
  return `https://wa.me/${withBR}${q}`;
}
