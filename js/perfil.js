import { db, auth } from "./firebaseConfig.js";
import { collection, query, where, getDocs } from "firebase/firestore";
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

const pedidosList = document.getElementById('lista-meus-pedidos');
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    document.getElementById('user-email-display').innerText = user.displayName || user.email;
    carregarPedidos(user.email);
});

async function carregarPedidos(email) {
    try {
        const q = query(collection(db, "pedidos"), where("userEmail", "==", email));
        const querySnapshot = await getDocs(q);

        pedidosList.innerHTML = '';
        if (querySnapshot.empty) { 
            pedidosList.innerHTML = '<p style="color:var(--text-muted)">Você ainda não fez nenhum pedido.</p>'; 
            return; 
        }

        querySnapshot.forEach((doc) => {
            const p = doc.data();
            const data = new Date(p.data).toLocaleDateString('pt-BR');
            let itensHtml = '';
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

            // Aplica a classe CSS do perfil.css
            const card = document.createElement('div');
            card.className = "order-card"; 
            card.innerHTML = `
                <div class="order-header">
                    <span><strong>Data:</strong> ${data}</span>
                    <span class="status-badge status-${p.status.toLowerCase()}">${p.status}</span>
                </div>
                <div>${itensHtml}</div>
                <div class="order-total">Total: ${fmtMoney(p.total)}</div>
            `;
            pedidosList.appendChild(card);
        });
    } catch (error) { console.error(error); }
}

document.getElementById('btn-logout-client').addEventListener('click', async () => {
    await signOut(auth); window.location.href = "login.html";
});