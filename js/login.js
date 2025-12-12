import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    const notify = (msg, type) => {
        if(typeof Toastify !== 'undefined') Toastify({ text: msg, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast();
        else alert(msg);
    };

    try {
        btn.innerText = "..."; btn.disabled = true;
        await signInWithEmailAndPassword(auth, email, password);
        notify("Sucesso!", "success");
        setTimeout(() => {
            if (email === 'admin@lston.com') window.location.href = 'admin.html';
            else window.location.href = 'index.html';
        }, 1000);
    } catch (error) {
        notify("Erro ao entrar. Verifique seus dados.", "error");
        btn.innerText = "Entrar"; btn.disabled = false;
    }
});

window.recuperarSenha = async () => {
    const email = prompt("Digite seu e-mail:");
    if(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            if(typeof Toastify !== 'undefined') Toastify({ text: "E-mail enviado!", style: { background: "#2ecc71" } }).showToast();
            else alert("E-mail enviado!");
        } catch(e) {
            alert("Erro. Verifique o e-mail.");
        }
    }
}