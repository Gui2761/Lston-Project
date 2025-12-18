import { auth, db } from "./firebaseConfig.js";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

const notify = (msg, type) => {
    if(typeof Toastify !== 'undefined') Toastify({ text: msg, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast();
    else alert(msg);
};

// --- MÁSCARAS E HELPERS ---

// Máscara de Telefone em Tempo Real
window.mascaraTelRegistro = (el) => {
    let v = el.value.replace(/\D/g, ""); // Remove tudo que não é dígito
    v = v.substring(0, 11); // Limita a 11 números

    // Aplica a formatação (XX) XXXXX-XXXX
    if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (v.length > 5) {
        v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    } else {
        v = v.replace(/^(\d*)/, "($1");
    }
    
    el.value = v;
};

// Busca CEP
window.buscarCepReg = async () => {
    const cepInput = document.getElementById('reg-cep');
    if(!cepInput) return;
    
    const cep = cepInput.value.replace(/\D/g, '');
    if(cep.length !== 8) return notify("CEP inválido! Digite 8 números.", "error");
    
    const btn = document.querySelector('.btn-cep');
    const txtOriginal = btn ? btn.innerText : 'Buscar';
    if(btn) { btn.innerText = "..."; btn.disabled = true; }

    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        
        if(!data.erro) {
            document.getElementById('reg-endereco').value = data.logradouro;
            document.getElementById('reg-bairro').value = data.bairro;
            document.getElementById('reg-cidade').value = `${data.localidade}/${data.uf}`;
            document.getElementById('reg-num').focus();
            notify("Endereço encontrado!", "success");
        } else {
            notify("CEP não encontrado.", "error");
        }
    } catch(e) {
        console.error(e);
        notify("Erro de conexão ao buscar CEP.", "error");
    } finally {
        if(btn) { btn.innerText = txtOriginal; btn.disabled = false; }
    }
}

// --- LOGICA DE REGISTRO ---
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const telefone = document.getElementById('reg-tel').value;
    const cep = document.getElementById('reg-cep').value;
    const endereco = document.getElementById('reg-endereco').value;
    const numero = document.getElementById('reg-num').value;
    const bairro = document.getElementById('reg-bairro').value;
    const cidade = document.getElementById('reg-cidade').value;

    const btn = this.querySelector('button[type="submit"]');

    // Validações
    if(pass !== confirm) return notify("As senhas não coincidem!", "error");
    if(pass.length < 6) return notify("A senha deve ter pelo menos 6 caracteres.", "error");

    // Validação Estrita de Telefone (11 dígitos)
    const telLimpo = telefone.replace(/\D/g, ''); 
    if (telLimpo.length !== 11) {
        return notify("Telefone inválido! Digite DDD + 9 números (Ex: 11999999999).", "error");
    }

    if(!nome || !email || !endereco || !numero) {
        return notify("Preencha todos os campos obrigatórios.", "error");
    }

    try {
        btn.innerText = "Criando..."; 
        btn.disabled = true;
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        await updateProfile(user, { displayName: nome });

        // Salva no Firestore
        await setDoc(doc(db, "users", user.uid), {
            nome: nome,
            email: email,
            telefone: telLimpo, // Salva limpo (apenas números)
            cep: cep,
            endereco: endereco,
            numero: numero,
            bairro: bairro,
            cidade: cidade,
            dataCadastro: new Date().toISOString()
        });

        notify("Conta criada com sucesso!", "success");
        setTimeout(() => window.location.href = 'index.html', 1500);

    } catch (error) {
        console.error("Erro no registro:", error); 
        let msg = "Erro ao criar conta.";
        if(error.code === 'auth/email-already-in-use') msg = "Este e-mail já está sendo usado.";
        if(error.code === 'auth/invalid-email') msg = "E-mail inválido.";
        notify(msg, "error");
        btn.innerText = "Cadastrar"; 
        btn.disabled = false;
    }
});