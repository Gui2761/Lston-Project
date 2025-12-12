import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth";

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    const notify = (msg, type) => Toastify({ text: msg, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast();

    try {
        btn.innerText = "..."; btn.disabled = true;
        await signInWithEmailAndPassword(auth, email, password);
        notify("Login com sucesso!", "success");
        setTimeout(() => {
            if (email === 'admin@lston.com') window.location.href = 'admin.html';
            else window.location.href = 'index.html';
        }, 1000);
    } catch (error) {
        console.error(error);
        notify("Erro no login. Verifique seus dados.", "error");
        btn.innerText = "Entrar"; btn.disabled = false;
    }
});