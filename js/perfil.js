import { db, auth } from "./firebaseConfig.js";
import { collection, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// Tema persistente
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);

const pedidosList = document.getElementById('lista-meus-pedidos');
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    document.getElementById('user-email-display').innerText = user.email;
    carregarPedidos(user.email);
});

async function carregarPedidos(email) {
    try {
        const q = query(collection(db, "pedidos"), where("userEmail", "==", email));
        const querySnapshot = await getDocs(q);

        pedidosList.innerHTML = '';
        if (querySnapshot.empty) { pedidosList.innerHTML = '<p style="color:var(--text-muted)">Nenhum pedido encontrado.</p>'; return; }

        querySnapshot.forEach((doc) => {
            const p = doc.data();
            const data = new Date(p.data).toLocaleDateString('pt-BR');
            let itensHtml = '';
            p.itens.forEach(item => {
                itensHtml += `<div style="display:flex; gap:10px; margin-bottom:5px; align-items:center; color:var(--text-color);">
                    <img src="${item.img}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                    <span style="font-size:14px;">${item.nome}</span>
                </div>`;
            });

            const card = document.createElement('div');
            card.style = "background: var(--card-bg); border: 1px solid var(--border-color); padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:10px; margin-bottom:10px; color:var(--text-color);">
                    <strong>Data: ${data}</strong>
                    <span class="status-badge status-${p.status.toLowerCase()}">${p.status}</span>
                </div>
                <div style="margin-bottom:10px;">${itensHtml}</div>
                <div style="text-align:right; font-weight:bold; color:var(--accent-color);">Total: ${fmtMoney(p.total)}</div>
            `;
            pedidosList.appendChild(card);
        });
    } catch (error) { console.error(error); }
}

document.getElementById('btn-logout-client').addEventListener('click', async () => {
    await signOut(auth); window.location.href = "login.html";
});