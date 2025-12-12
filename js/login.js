import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

// --- CORREÇÃO DO TEMA (Modo Escuro no Login) ---
// Define a função no objeto window para o HTML conseguir ler
window.toggleThemeLogin = () => {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
}

// Carrega o tema salvo ao abrir a página
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);


// --- LÓGICA DE LOGIN ---
const notify = (msg, type='success') => {
    if(typeof Toastify !== 'undefined') {
        Toastify({ 
            text: msg, 
            duration: 3000,
            style: { background: type==='error'?"#e74c3c":"#2c3e50" } 
        }).showToast();
    } else {
        alert(msg);
    }
};

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log("Botão clicado. Iniciando login..."); // Debug no Console

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = this.querySelector('button');

    if(!email || !password) return notify("Preencha todos os campos.", "error");

    try {
        btn.innerText = "Entrando..."; 
        btn.disabled = true;

        // Tenta logar usando o 'auth' importado do firebaseConfig.js
        await signInWithEmailAndPassword(auth, email, password);
        
        console.log("Login bem sucedido!");
        notify("Login com sucesso!", "success");
        
        setTimeout(() => {
            if (email === 'admin@lston.com') window.location.href = 'admin.html';
            else window.location.href = 'index.html';
        }, 1500);

    } catch (error) {
        console.error("Erro Firebase:", error); // Mostra o erro detalhado no console
        
        let msg = "Erro ao entrar.";
        if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') msg = "E-mail ou senha incorretos.";
        if(error.code === 'auth/wrong-password') msg = "Senha incorreta.";
        if(error.code === 'auth/too-many-requests') msg = "Muitas tentativas. Tente mais tarde.";
        
        notify(msg, "error");
        btn.innerText = "Entrar"; 
        btn.disabled = false;
    }
});

// Recuperação de Senha
window.recuperarSenha = async () => {
    const email = prompt("Digite seu e-mail para recuperar a senha:");
    if(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            notify("E-mail enviado! Verifique sua caixa de entrada.", "success");
        } catch(e) {
            console.error(e);
            notify("Erro: Verifique se o e-mail está correto.", "error");
        }
    }
}