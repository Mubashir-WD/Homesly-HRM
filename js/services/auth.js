// js/services/auth.js
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { app } from "./database.js";

// Initialize Firebase Authentication
const auth = getAuth(app);

export {
    auth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};
