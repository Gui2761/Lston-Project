// js/login.js (Versão Node.js)

const notify = (msg, type='success') => {
    if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); 
    else alert(msg);
};

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('password').value;
    const btn = this.querySelector('button');

    if(!email || !senha) return notify("Preencha todos os campos.", "error");

    try {
        btn.innerText = "Entrando..."; btn.disabled = true;

        // Conecta com seu servidor local
        // Dentro de js/login.js
    const response = await fetch('http://127.0.0.1:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
    });
        const data = await response.json();

        if (response.ok) {
            // Salva o Token e os dados do usuário no navegador
            localStorage.setItem('lston_token', data.token);
            localStorage.setItem('lston_user', JSON.stringify(data.user));

            notify("Login com sucesso!", "success");
            
            setTimeout(() => {
                // Se for admin (vamos configurar isso depois), manda pro admin
                // Por enquanto manda todos pra home
                window.location.href = 'index.html';
            }, 1500);
        } else {
            notify(data.error || "Login falhou.", "error");
            btn.innerText = "Entrar"; btn.disabled = false;
        }

    } catch (error) {
        console.error("Erro API:", error);
        notify("Erro ao conectar com o servidor.", "error");
        btn.innerText = "Entrar"; btn.disabled = false;
    }
});