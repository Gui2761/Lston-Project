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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };