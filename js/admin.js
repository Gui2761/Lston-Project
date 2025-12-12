import { db, auth, storage } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

onAuthStateChanged(auth, (user) => { if(!user) window.location.href="login.html"; else { renderizarTabela(); renderizarDashboard(); } });

const produtosCollection = collection(db, "produtos");
const pedidosCollection = collection(db, "pedidos");
let chartCat=null, chartFat=null;
let todosPedidosCache = []; // Cache para filtro

// --- UX HELPERS (Funções Novas) ---
function showToast(msg, type='success') {
    Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast();
}
function toggleLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

// Navegação
document.getElementById('link-dashboard').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('dashboard');});
document.getElementById('link-produtos').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('produtos');});
document.getElementById('link-pedidos').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('pedidos');});
function mostrarSecao(s) { ['dashboard','produtos','pedidos'].forEach(x=>document.getElementById(`section-${x}`).style.display='none'); document.getElementById(`section-${s}`).style.display='block'; }

async function renderizarDashboard() {
    const q = await getDocs(pedidosCollection);
    let cats={}, dias={}, totalFat=0, totalVendas=0;
    todosPedidosCache = []; // Limpa cache

    q.forEach(d => {
        const p = d.data();
        p.id = d.id; // Salva ID no objeto
        todosPedidosCache.push(p); // Guarda no cache para filtro
        
        totalVendas++; totalFat += p.total||0;
        p.itens.forEach(i => cats[i.categoria||'Geral'] = (cats[i.categoria||'Geral']||0)+1);
        const dStr = new Date(p.data).toLocaleDateString('pt-BR').slice(0,5);
        dias[dStr] = (dias[dStr]||0)+p.total;
    });

    document.getElementById('kpi-faturamento').innerText = fmtMoney(totalFat);
    document.getElementById('kpi-vendas').innerText = totalVendas;
    desenharGraficos(cats, dias);
    filtrarPedidos(); // Renderiza tabela usando o filtro
}

// Filtro de Pedidos
document.getElementById('filtro-status').addEventListener('change', filtrarPedidos);

function filtrarPedidos() {
    const filtro = document.getElementById('filtro-status').value;
    const tbody = document.getElementById('tabela-pedidos');
    tbody.innerHTML = '';

    const lista = filtro === 'Todos' ? todosPedidosCache : todosPedidosCache.filter(p => p.status === filtro);

    if(lista.length === 0) { tbody.innerHTML = '<tr><td colspan="5">Nenhum pedido encontrado.</td></tr>'; return; }

    lista.forEach(p => {
        const tr = document.createElement('tr');
        const opts = ['Recebido','Preparando','Enviado','Entregue'];
        let sel = `<select id="st-${p.id}" style="padding:5px; border-radius:4px; border:1px solid #ccc;">`;
        opts.forEach(o => sel += `<option value="${o}" ${p.status===o?'selected':''}>${o}</option>`);
        sel += `</select>`;

        tr.innerHTML = `
            <td>${new Date(p.data).toLocaleDateString('pt-BR')}</td>
            <td>${p.cliente}</td>
            <td>${fmtMoney(p.total)}</td>
            <td>${sel}</td>
            <td><button id="ver-${p.id}" style="background:#2196f3; color:white; border:none; padding:5px; cursor:pointer;"><i class="fas fa-eye"></i></button></td>
        `;
        tbody.appendChild(tr);
        document.getElementById(`st-${p.id}`).addEventListener('change', (e)=>updateStatus(p.id, e.target.value));
        document.getElementById(`ver-${p.id}`).addEventListener('click', ()=>verDetalhes(p));
    });
}

async function updateStatus(id, st) {
    try { await updateDoc(doc(db,"pedidos",id), {status:st}); showToast("Status atualizado!"); }
    catch(e) { showToast("Erro ao atualizar", "error"); }
}

function desenharGraficos(cats, dias) {
    if(chartCat) chartCat.destroy(); if(chartFat) chartFat.destroy();
    chartCat = new Chart(document.getElementById('graficoCategorias'), { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{data:Object.values(cats), backgroundColor:['#e74c3c','#3498db','#f1c40f','#2ecc71','#9b59b6']}] } });
    const sorted = Object.keys(dias).sort();
    chartFat = new Chart(document.getElementById('graficoFaturamento'), { type:'line', data:{ labels:sorted, datasets:[{label:'Faturamento', data:sorted.map(d=>dias[d]), borderColor:'#8bc34a', fill:true, backgroundColor:'rgba(139,195,74,0.2)'}] } });
}

async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    const count = document.getElementById('total-estoque-count');
    tbody.innerHTML='<tr><td>Carregando...</td></tr>';
    const q = await getDocs(produtosCollection);
    tbody.innerHTML=''; let est=0;
    q.forEach(d => {
        const p = d.data(); est += parseInt(p.estoque)||0;
        const imgCapa = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
        const tr = document.createElement('tr');
        tr.innerHTML=`<td><img src="${imgCapa}" style="width:40px;height:40px;object-fit:cover;"></td><td>${p.nome}</td><td style="color:${p.estoque<5?'red':'green'}">${p.estoque}</td><td>${fmtMoney(p.preco)}</td><td><i class="fas fa-edit" id="ed-${d.id}" style="color:#2196f3;cursor:pointer;margin-right:10px;"></i><i class="fas fa-trash" id="dl-${d.id}" style="color:red;cursor:pointer;"></i></td>`;
        tbody.appendChild(tr);
        document.getElementById(`dl-${d.id}`).addEventListener('click', ()=>deletarProduto(d.id));
        document.getElementById(`ed-${d.id}`).addEventListener('click', ()=>editarProduto(d.id));
    });
    count.innerText = est;
}

window.editarProduto = async (id) => {
    toggleLoading(true);
    const d = await getDoc(doc(db,"produtos",id));
    toggleLoading(false);
    if(d.exists()) {
        const p = d.data();
        document.getElementById('prod-id').value=id; document.getElementById('modal-titulo').innerText="Editar Produto";
        document.getElementById('prod-nome').value=p.nome; document.getElementById('prod-preco').value=p.preco;
        document.getElementById('prod-estoque').value=p.estoque; document.getElementById('prod-cat').value=p.categoria||'Geral';
        document.getElementById('prod-desc').value=p.descricao||'';
        document.getElementById('modalProduto').style.display='flex';
    }
}

document.getElementById('btn-save-prod').addEventListener('click', async function() {
    const id = document.getElementById('prod-id').value;
    const nome = document.getElementById('prod-nome').value;
    const preco = document.getElementById('prod-preco').value;
    const est = document.getElementById('prod-estoque').value;
    const cat = document.getElementById('prod-cat').value;
    const desc = document.getElementById('prod-desc').value;

    if(!nome || !preco || !est) return showToast("Preencha todos os campos!", "error");
    toggleLoading(true);

    try {
        let urlsNovas = [];
        for(let i=1; i<=4; i++) {
            const arq = document.getElementById(`img-${i}`).files[0];
            if(arq) {
                const s = await uploadBytes(ref(storage, `produtos/${Date.now()}_${i}_${arq.name}`), arq);
                const url = await getDownloadURL(s.ref);
                urlsNovas.push(url);
            }
        }
        let dados = { nome, preco:parseFloat(preco), estoque:parseInt(est), categoria:cat, descricao:desc };
        if(id) {
            if(urlsNovas.length > 0) dados.imagens = urlsNovas;
            await updateDoc(doc(db,"produtos",id), dados);
        } else {
            dados.imagens = urlsNovas; dados.dataCriacao = new Date();
            await addDoc(produtosCollection, dados);
        }
        showToast("Salvo com sucesso!"); window.fecharModal(); renderizarTabela(); renderizarDashboard();
    } catch(e) { console.error(e); showToast("Erro ao salvar.", "error"); }
    finally { toggleLoading(false); }
});

function verDetalhes(p) { document.getElementById('conteudo-detalhes').innerHTML=`<p><strong>Cliente:</strong> ${p.cliente}</p><p>${p.endereco||''}</p><hr><ul>${p.itens.map(i=>`<li>${i.nome}</li>`).join('')}</ul><p>Total: ${fmtMoney(p.total)}</p>`; document.getElementById('modalDetalhes').style.display='flex'; }
window.abrirModalProduto = () => { 
    document.getElementById('prod-id').value=""; document.getElementById('modal-titulo').innerText="Novo";
    ['prod-nome','prod-preco','prod-estoque','prod-desc','img-1','img-2','img-3','img-4'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('modalProduto').style.display='flex'; 
}
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';
async function deletarProduto(id) { if(confirm('Apagar?')) { toggleLoading(true); await deleteDoc(doc(db,"produtos",id)); renderizarTabela(); renderizarDashboard(); toggleLoading(false); showToast("Deletado!"); } }
document.getElementById('btn-logout').addEventListener('click', async (e)=>{e.preventDefault(); await signOut(auth); window.location.href="login.html";});