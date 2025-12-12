import { db, auth } from "./firebaseConfig.js";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

const pedidosList = document.getElementById('lista-meus-pedidos');

function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    
    document.getElementById('user-email-display').innerText = user.email;
    carregarPedidos(user.email);
});

async function carregarPedidos(email) {
    try {
        // Busca pedidos onde o campo 'userEmail' é igual ao email do usuário
        const q = query(collection(db, "pedidos"), where("userEmail", "==", email));
        const querySnapshot = await getDocs(q); // Nota: index composto pode ser necessário para orderBy, então simplificamos

        pedidosList.innerHTML = '';
        if (querySnapshot.empty) {
            pedidosList.innerHTML = '<p>Você ainda não fez nenhum pedido.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const p = doc.data();
            const data = new Date(p.data).toLocaleDateString('pt-BR');
            
            let itensHtml = '';
            p.itens.forEach(item => {
                itensHtml += `<div style="display:flex; gap:10px; margin-bottom:5px; align-items:center;">
                    <img src="${item.img}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                    <span style="font-size:14px;">${item.nome}</span>
                </div>`;
            });

            // Card do Pedido
            const card = document.createElement('div');
            card.style = "background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:10px;">
                    <strong>Data: ${data}</strong>
                    <span class="status-badge status-${p.status.toLowerCase()}">${p.status}</span>
                </div>
                <div style="margin-bottom:10px;">${itensHtml}</div>
                <div style="text-align:right; font-weight:bold; color:#2c3e50;">Total: ${fmtMoney(p.total)}</div>
            `;
            pedidosList.appendChild(card);
        });

    } catch (error) {
        console.error("Erro:", error);
        pedidosList.innerHTML = '<p>Erro ao carregar pedidos.</p>';
    }
}

document.getElementById('btn-logout-client').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = "login.html";
});