// js/register.js (Versão Node.js)

// Função de notificação (mantida igual)
const notify = (msg, type) => {
    if(typeof Toastify !== 'undefined') Toastify({ text: msg, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast();
    else alert(msg);
};

// --- MÁSCARAS (Mantidas iguais) ---
window.mascaraTelRegistro = (el) => {
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    else v = v.replace(/^(\d*)/, "($1");
    el.value = v;
};

window.buscarCepReg = async () => {
    const cepInput = document.getElementById('reg-cep');
    if(!cepInput) return;
    const cep = cepInput.value.replace(/\D/g, '');
    if(cep.length !== 8) return notify("CEP inválido!", "error");
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(!data.erro) {
            document.getElementById('reg-endereco').value = data.logradouro;
            document.getElementById('reg-bairro').value = data.bairro;
            document.getElementById('reg-cidade').value = `${data.localidade}/${data.uf}`;
            document.getElementById('reg-num').focus();
            notify("Endereço encontrado!", "success");
        } else { notify("CEP não encontrado.", "error"); }
    } catch(e) { notify("Erro ao buscar CEP.", "error"); }
}

// --- NOVA LÓGICA DE REGISTRO (CONECTADA AO NODE) ---
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Coleta dos dados
    const dados = {
        nome: document.getElementById('reg-nome').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        senha: document.getElementById('reg-password').value,
        telefone: document.getElementById('reg-tel').value.replace(/\D/g, ''),
        cep: document.getElementById('reg-cep').value,
        endereco: document.getElementById('reg-endereco').value,
        numero: document.getElementById('reg-num').value,
        bairro: document.getElementById('reg-bairro').value,
        cidade: document.getElementById('reg-cidade').value
    };

    const confirm = document.getElementById('reg-confirm').value;
    const btn = this.querySelector('button[type="submit"]');

    // Validações básicas
    if(dados.senha !== confirm) return notify("As senhas não coincidem!", "error");
    if(dados.senha.length < 6) return notify("Senha muito curta (min 6).", "error");
    if(!dados.nome || !dados.email) return notify("Preencha os campos obrigatórios.", "error");

    try {
        btn.innerText = "Criando..."; btn.disabled = true;

        // AQUI ESTÁ A MÁGICA: Conecta com seu servidor local
        const response = await fetch('http://localhost:3000/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const result = await response.json();

        if (response.ok) {
            notify("Conta criada com sucesso!", "success");
            setTimeout(() => window.location.href = 'login.html', 1500);
        } else {
            notify(result.error || "Erro ao criar conta.", "error");
            btn.innerText = "Cadastrar"; btn.disabled = false;
        }

    } catch (error) {
        console.error("Erro API:", error);
        notify("Erro de conexão com o servidor.", "error");
        btn.innerText = "Cadastrar"; btn.disabled = false;
    }
});