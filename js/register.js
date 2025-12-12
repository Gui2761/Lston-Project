import { auth } from "./firebaseConfig.js";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

// Função segura de notificação
const notify = (msg, type) => {
    if(typeof Toastify !== 'undefined') {
        Toastify({ text: msg, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast();
    } else {
        alert(msg); // Fallback caso o visual falhe
    }
};

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = this.querySelector('button');

    if(pass !== confirm) return notify("As senhas não coincidem!", "error");
    if(pass.length < 6) return notify("A senha deve ter pelo menos 6 caracteres.", "error");

    try {
        btn.innerText = "Criando..."; 
        btn.disabled = true;
        
        // 1. Cria o usuário no Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 2. Atualiza o nome de exibição
        await updateProfile(user, { displayName: nome });

        notify("Conta criada com sucesso!", "success");
        
        // Redireciona para a loja
        setTimeout(() => window.location.href = 'index.html', 1500);

    } catch (error) {
        console.error("Erro no registro:", error); // Veja o erro detalhado no Console (F12)
        
        let msg = "Erro ao criar conta.";
        if(error.code === 'auth/email-already-in-use') msg = "Este e-mail já está sendo usado.";
        if(error.code === 'auth/invalid-email') msg = "E-mail inválido.";
        if(error.code === 'auth/weak-password') msg = "Senha muito fraca.";
        
        notify(msg, "error");
        btn.innerText = "Cadastrar"; 
        btn.disabled = false;
    }
});