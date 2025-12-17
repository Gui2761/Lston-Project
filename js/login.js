import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

window.toggleThemeLogin = () => {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
}
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);

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

// RECUPERAÇÃO DE SENHA MODERNA
window.recuperarSenha = async () => {
    if(typeof Swal === 'undefined') {
        // Fallback se o SweetAlert não carregar
        const email = prompt("Digite seu e-mail:");
        if(email) enviarEmailRecuperacao(email);
        return;
    }

    const { value: email } = await Swal.fire({
        title: 'Recuperar Senha',
        input: 'email',
        inputLabel: 'Digite seu e-mail cadastrado',
        inputPlaceholder: 'exemplo@email.com',
        showCancelButton: true,
        confirmButtonColor: '#2c3e50',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Enviar Link'
    });

    if (email) {
        enviarEmailRecuperacao(email);
    }
}

async function enviarEmailRecuperacao(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        if(typeof Swal !== 'undefined') Swal.fire('Enviado!', 'Verifique sua caixa de entrada (e spam).', 'success');
        else notify("Link enviado para o e-mail!", "success");
    } catch(e) {
        notify("Erro: Verifique o e-mail digitado.", "error");
    }
}