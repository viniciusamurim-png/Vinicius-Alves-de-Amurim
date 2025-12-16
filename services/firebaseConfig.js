
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDPYom8PC1Xb6mc7N9ixyGh1_lXOAnASpA",
  authDomain: "escalas-facil-ai-21c8f.firebaseapp.com",
  projectId: "escalas-facil-ai-21c8f",
  storageBucket: "escalas-facil-ai-21c8f.firebasestorage.app",
  messagingSenderId: "335828009958",
  appId: "1:335828009958:web:4596ae4eee59d0ef230c27"
};

let app = null;
let db = null;

try {
    // Inicializa o Firebase
    app = initializeApp(firebaseConfig);
    // Inicializa o Firestore
    db = getFirestore(app);
    console.log("🔥 Firebase (JS) conectado com sucesso:", firebaseConfig.projectId);
} catch (error) {
    console.error("❌ Erro ao conectar com Firebase:", error);
}

// Exporta as instâncias
export { app, db };
