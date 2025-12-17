import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth";

const notify = (msg, type='success') => {
    if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); 
    else alert(msg);
};

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    if(!email || !password) return notify("Preencha todos os campos.", "error");

    try {
        btn.innerText = "Entrando..."; btn.disabled = true;
        await signInWithEmailAndPassword(auth, email, password);
        notify("Login com sucesso!", "success");
        setTimeout(() => {
            if (email === 'admin@lston.com') window.location.href = 'admin.html';
            else window.location.href = 'index.html';
        }, 1500);
    } catch (error) {
        console.error("Erro Firebase:", error);
        let msg = "E-mail ou senha incorretos.";
        notify(msg, "error");
        btn.innerText = "Entrar"; btn.disabled = false;
    }
});