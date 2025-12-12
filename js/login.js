// js/login.js
import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth";

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    try {
        btn.innerText = "Entrando...";
        btn.disabled = true;

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log("Login sucesso:", user.email);

        // Verificação simples de admin
        if (email === 'admin@lston.com') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'index.html';
        }

    } catch (error) {
        console.error("Erro:", error);
        let msg = "Erro ao fazer login.";
        if(error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
        alert(msg);
    } finally {
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
});