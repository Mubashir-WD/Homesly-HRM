// js/services/database.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAQnSbWBx3R1zciZ4-bv62NS5KC312EotI",
    authDomain: "homesly-stays-group.firebaseapp.com",
    projectId: "homesly-stays-group",
    storageBucket: "homesly-stays-group.firebasestorage.app",
    messagingSenderId: "736880412086",
    appId: "1:736880412086:web:2f3fbf17ea1394d863ed17",
    measurementId: "G-K97L3LB1XJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
const db = getFirestore(app);

export {
    app,
    db,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    doc,
    getDoc,
    updateDoc,
    setDoc
};
