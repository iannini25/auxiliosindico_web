// Cole a config do seu projeto Firebase aqui:
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
  doc, getDoc, setDoc, updateDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// TODO: substitua pelos seus valores do console Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDtGhMWxAELs8BWHbVDO2hlNUgv_prwH54",
    authDomain: "auxiliosindico-cf26d.firebaseapp.com",
    projectId: "auxiliosindico-cf26d",
    storageBucket: "auxiliosindico-cf26d.firebasestorage.app",
    messagingSenderId: "981852297227",
    appId: "1:981852297227:web:198a053a4692dd1ca00f0e",
    measurementId: "G-87MBZ3GXST"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app, auth, db,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, runTransaction
};
