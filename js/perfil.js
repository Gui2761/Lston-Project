// js/perfil.js (Completo - Dados via PostgreSQL)
import { auth } from "./firebaseConfig.js";
import { onAuthStateChanged, signOut } from "firebase/auth";

// --- TEMA E HELPERS ---
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

window.toggleTheme = () => {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
    document.getElementById('theme-toggle').className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
function showToast(msg, type='success') { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

const pedidosList = document.getElementById('lista-meus-pedidos');
let currentUserId = null;

// --- AUTH & INICIALIZAÇÃO ---
// Verifica se tem sessão do Node.js (preferencial) ou do Firebase
function checkSession() {
    const localUser = localStorage.getItem('lston_user');
    if (localUser) {
        const u = JSON.parse(localUser);
        initProfile(u);
    } else {
        // Fallback: Tenta Firebase Auth se não tiver localUser (migração suave)
        onAuthStateChanged(auth, (user) => {
            if (!user) { window.location.href = "login.html"; return; }
            initProfile({ id: user.uid, nome: user.displayName || user.email, email: user.email });
        });
    }
}

function initProfile(user) {
    currentUserId = user.id;
    if(document.getElementById('user-email-display')) {
        document.getElementById('user-email-display').innerText = user.nome;
    }
    
    // Busca dados detalhados do servidor (endereco atualizado)
    carregarDadosPerfil(user.id);
    carregarPedidos(user.id);
}

// --- CARREGAR DADOS DO USUÁRIO ---
async function carregarDadosPerfil(uid) {
    try {
        const res = await fetch(`http://127.0.0.1:3000/users/${uid}`);
        if(res.ok) {
            const data = await res.json();
            // Preenche o formulário
            if(document.getElementById('perfil-nome')) document.getElementById('perfil-nome').value = data.nome || '';
            if(document.getElementById('perfil-tel')) document.getElementById('perfil-tel').value = data.telefone || '';
            if(document.getElementById('perfil-cep')) document.getElementById('perfil-cep').value = data.cep || '';
            if(document.getElementById('perfil-endereco')) document.getElementById('perfil-endereco').value = data.endereco || '';
            if(document.getElementById('perfil-num')) document.getElementById('perfil-num').value = data.numero || '';
            if(document.getElementById('perfil-bairro')) document.getElementById('perfil-bairro').value = data.bairro || '';
            if(document.getElementById('perfil-cidade')) document.getElementById('perfil-cidade').value = data.cidade || '';
        }
    } catch (e) { console.error("Erro ao carregar perfil:", e); }
}

window.salvarDadosPerfil = async () => {
    if(!currentUserId) return;
    const dados = {
        nome: document.getElementById('perfil-nome').value,
        telefone: document.getElementById('perfil-tel').value,
        cep: document.getElementById('perfil-cep').value,
        endereco: document.getElementById('perfil-endereco').value,
        numero: document.getElementById('perfil-num').value,
        bairro: document.getElementById('perfil-bairro').value,
        cidade: document.getElementById('perfil-cidade').value
    };

    try {
        const res = await fetch(`http://127.0.0.1:3000/users/${currentUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        if(res.ok) showToast("Dados atualizados com sucesso!");
        else showToast("Erro ao salvar.", "error");
        
    } catch (e) {
        console.error(e);
        showToast("Erro de conexão.", "error");
    }
}

// --- HISTÓRICO DE PEDIDOS (TIMELINE) ---
async function carregarPedidos(uid) {
    try {
        const res = await fetch(`http://127.0.0.1:3000/orders/user/${uid}`);
        const pedidos = await res.json();

        pedidosList.innerHTML = '';
        if (pedidos.length === 0) { 
            pedidosList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fas fa-shopping-bag" style="font-size:40px; margin-bottom:10px; opacity:0.5;"></i><p>Você ainda não fez nenhum pedido.</p></div>'; 
            return; 
        }

        pedidos.forEach((p) => {
            const data = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-';
            const idCurto = String(p.id).slice(0, 8).toUpperCase();
            
            // Lógica da Timeline
            const statusSteps = ['Recebido', 'Enviado', 'Entregue'];
            const statusAtual = p.status || 'Recebido';
            
            let stepIndex = statusSteps.indexOf(statusAtual);
            if(statusAtual === 'Cancelado') stepIndex = -1;

            let timelineHtml = '';
            if(stepIndex !== -1) {
                timelineHtml = `<div class="order-timeline">`;
                statusSteps.forEach((step, index) => {
                    const active = index <= stepIndex ? 'active' : '';
                    timelineHtml += `
                        <div class="timeline-step ${active}">
                            <div class="circle"><i class="fas fa-check"></i></div>
                            <div class="label">${step}</div>
                        </div>
                        ${index < statusSteps.length - 1 ? `<div class="line ${index < stepIndex ? 'active' : ''}"></div>` : ''}
                    `;
                });
                timelineHtml += `</div>`;
            } else {
                timelineHtml = `<div style="background:#ffebee; color:#c62828; padding:10px; border-radius:6px; text-align:center; margin-top:10px; font-weight:bold;"><i class="fas fa-times-circle"></i> Pedido Cancelado</div>`;
            }

            let itensHtml = '';
            if(p.itens) {
                p.itens.forEach(item => {
                    const img = item.img || (item.imagens && item.imagens[0]) || '';
                    itensHtml += `
                        <div class="order-item">
                            <img src="${img}" style="width:50px; height:50px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:600;">${item.nome}</div>
                                <div style="font-size:12px; color:var(--text-muted);">${item.qtd}x ${fmtMoney(item.preco)}</div>
                            </div>
                        </div>`;
                });
            }

            const card = document.createElement('div');
            card.className = "order-card"; 
            card.onclick = function(e) { 
                if(e.target.closest('.order-details')) return;
                this.classList.toggle('active'); 
            };
            
            card.innerHTML = `
                <div class="order-header">
                    <div>
                        <span style="font-weight:bold; font-size:16px; color:var(--accent-color);">#${idCurto}</span>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;"><i class="far fa-calendar-alt"></i> ${data}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; color:var(--text-color); font-size:16px;">${fmtMoney(p.total)}</div>
                        <span class="status-badge status-${(statusAtual).toLowerCase()}">${statusAtual}</span>
                    </div>
                </div>
                
                <div class="order-details">
                    ${timelineHtml}
                    <div style="background:var(--bg-secondary); padding:15px; border-radius:8px; margin: 15px 0;">
                        <p style="font-size:13px; margin-bottom:5px; color:var(--text-muted);">Endereço de Entrega:</p>
                        <p style="font-weight:600; font-size:14px;">${p.endereco || ''}, ${p.numero||''} - ${p.bairro||''}</p>
                        <p style="font-size:13px;">${p.cidade || ''} - ${p.cep || ''}</p>
                    </div>
                    ${itensHtml}
                    <div class="order-total">
                        <span>Frete: ${fmtMoney(p.frete||0)}</span>
                        <span style="font-size:18px; margin-left:15px;">Total: ${fmtMoney(p.total)}</span>
                    </div>
                </div>
            `;
            pedidosList.appendChild(card);
        });
    } catch (error) { console.error(error); }
}

const btnLogout = document.getElementById('btn-logout-client');
if(btnLogout) {
    btnLogout.addEventListener('click', async () => {
        localStorage.removeItem('lston_user');
        localStorage.removeItem('lston_token');
        await signOut(auth); // Desloga do Firebase também só pra garantir
        window.location.href = "login.html";
    });
}

checkSession();