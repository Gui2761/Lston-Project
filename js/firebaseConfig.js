import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBU5YAhymhe9d3FbXQ8pzfG7gLHnoUZr7w",
  authDomain: "lston-ecommerce.firebaseapp.com",
  projectId: "lston-ecommerce",
  storageBucket: "lston-ecommerce.firebasestorage.app",
  messagingSenderId: "918065694492",
  appId: "1:918065694492:web:bb3bb3cad2dba2d5899cd9"
};

// 1. Inicializa o App
const app = initializeApp(firebaseConfig);

// 2. Inicializa os Serviços (ISSO FALTAVA NO SEU PRINT)
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// 3. Exporta para os outros arquivos usarem (ISSO TAMBÉM FALTAVA)
export { app, auth, db, storage };