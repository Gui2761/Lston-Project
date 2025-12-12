import { auth } from "./firebaseConfig.js";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

const notify = (msg, type) => Toastify({ text: msg, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast();

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = this.querySelector('button');

    if(pass !== confirm) return notify("Senhas não conferem!", "error");
    if(pass.length < 6) return notify("Senha muito curta (mín 6).", "error");

    try {
        btn.innerText = "Criando..."; btn.disabled = true;
        
        // Cria usuário
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // Atualiza o nome do usuário no perfil
        await updateProfile(user, { displayName: nome });

        notify("Conta criada com sucesso!", "success");
        setTimeout(() => window.location.href = 'index.html', 1500);

    } catch (error) {
        console.error(error);
        if(error.code === 'auth/email-already-in-use') notify("E-mail já cadastrado.", "error");
        else notify("Erro ao criar conta.", "error");
        btn.innerText = "Cadastrar"; btn.disabled = false;
    }
});