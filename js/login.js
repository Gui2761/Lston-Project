import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth";

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault(); // Impede a página de recarregar
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    try {
        btn.innerText = "Entrando...";
        btn.disabled = true;

        // Tenta fazer login no Firebase
        await signInWithEmailAndPassword(auth, email, password);
        
        console.log("Login realizado com sucesso!");

        // Redirecionamento simples
        if (email === 'admin@lston.com') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'index.html';
        }

    } catch (error) {
        console.error("Erro no login:", error);
        let msg = "Erro ao fazer login.";
        if(error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
        if(error.code === 'auth/user-not-found') msg = "Usuário não encontrado.";
        if(error.code === 'auth/wrong-password') msg = "Senha errada.";
        alert(msg);
    } finally {
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
});