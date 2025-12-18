import { db, auth } from "./firebaseConfig.js";
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// --- TEMA ---
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

// Helpers
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
function showToast(msg, type='success') { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

const pedidosList = document.getElementById('lista-meus-pedidos');
let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    currentUserId = user.uid;
    document.getElementById('user-email-display').innerText = user.displayName || user.email;
    
    // Carrega dados pessoais e pedidos
    carregarDadosPerfil(user.uid);
    carregarPedidos(user.email);
});

// --- DADOS PESSOAIS ---
async function carregarDadosPerfil(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
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
        // Usa setDoc com merge para não apagar outros campos se existirem
        await setDoc(doc(db, "users", currentUserId), dados, { merge: true });
        showToast("Dados atualizados com sucesso!");
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar dados.", "error");
    }
}

// --- PEDIDOS (EXPANSÍVEL) ---
async function carregarPedidos(email) {
    try {
        const q = query(collection(db, "pedidos"), where("userEmail", "==", email));
        const querySnapshot = await getDocs(q);

        pedidosList.innerHTML = '';
        if (querySnapshot.empty) { 
            pedidosList.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Você ainda não fez nenhum pedido.</p>'; 
            return; 
        }

        querySnapshot.forEach((doc) => {
            const p = doc.data();
            const data = new Date(p.data).toLocaleDateString('pt-BR');
            const idCurto = doc.id.slice(0, 8).toUpperCase();
            
            let itensHtml = '';
            if(p.itens) {
                p.itens.forEach(item => {
                    itensHtml += `
                        <div class="order-item">
                            <img src="${item.img}" style="width:50px; height:50px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:600;">${item.nome}</div>
                                <div style="font-size:12px; color:var(--text-muted);">${item.qtd}x ${fmtMoney(item.preco)}</div>
                            </div>
                        </div>`;
                });
            }

            const card = document.createElement('div');
            card.className = "order-card"; 
            // Adiciona evento de clique para o acordeão
            card.onclick = function() { this.classList.toggle('active'); };
            
            card.innerHTML = `
                <div class="order-header">
                    <div>
                        <span style="font-weight:bold; font-size:14px;">Pedido #${idCurto}</span>
                        <br>
                        <span style="font-size:12px; color:var(--text-muted);">${data}</span>
                        <br>
                        <span class="status-badge status-${(p.status||'recebido').toLowerCase()}">${p.status||'Recebido'}</span>
                    </div>
                    <div style="text-align:right; padding-right: 25px;">
                        <div style="font-weight:bold; color:var(--text-color); font-size:16px;">${fmtMoney(p.total)}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${p.itens ? p.itens.length : 0} itens</div>
                    </div>
                </div>
                
                <div class="order-details">
                    <p style="font-size:13px; margin-bottom:10px;"><strong>Entrega em:</strong> ${p.endereco}, ${p.numero||''} - ${p.bairro||''}</p>
                    ${itensHtml}
                    <div class="order-total">Total: ${fmtMoney(p.total)}</div>
                </div>
            `;
            pedidosList.appendChild(card);
        });
    } catch (error) { console.error(error); }
}

document.getElementById('btn-logout-client').addEventListener('click', async () => {
    await signOut(auth); window.location.href = "login.html";
});