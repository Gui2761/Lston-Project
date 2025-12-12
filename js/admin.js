import { db, auth, storage } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

onAuthStateChanged(auth, (user) => { 
    if(!user) window.location.href="login.html"; 
    else { renderizarTabela(); renderizarDashboard(); renderizarBanners(); renderizarCupons(); } 
});

const produtosCollection = collection(db, "produtos");
const pedidosCollection = collection(db, "pedidos");
const bannersCollection = collection(db, "banners");
const cuponsCollection = collection(db, "cupons");
let chartCat=null, chartFat=null;
let todosPedidosCache = [];

// Helpers
function showToast(msg, type='success') { Toastify({ text: msg, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast(); }
function toggleLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

// Navegação
const sections = ['dashboard','produtos','pedidos','banners','cupons'];
sections.forEach(s => {
    document.getElementById(`link-${s}`).addEventListener('click', (e) => {
        e.preventDefault();
        sections.forEach(sec => { document.getElementById(`section-${sec}`).style.display = 'none'; document.getElementById(`link-${sec}`).classList.remove('active'); });
        document.getElementById(`section-${s}`).style.display = 'block'; document.getElementById(`link-${s}`).classList.add('active');
    });
});

// --- BANNERS ---
async function renderizarBanners() {
    const tbody = document.getElementById('tabela-banners');
    const q = await getDocs(bannersCollection);
    tbody.innerHTML = '';
    q.forEach(d => {
        const b = d.data();
        tbody.innerHTML += `<tr><td><img src="${b.img}" style="width:100px; height:40px; object-fit:cover;"></td><td>${b.titulo}</td><td>${b.subtitulo}</td><td><i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="window.delBanner('${d.id}')"></i></td></tr>`;
    });
}
document.getElementById('btn-save-banner').addEventListener('click', async () => {
    const titulo = document.getElementById('banner-titulo').value;
    const sub = document.getElementById('banner-sub').value;
    const arq = document.getElementById('banner-img').files[0];
    if(!titulo || !arq) return showToast("Preencha título e imagem", "error");
    toggleLoading(true);
    try {
        const s = await uploadBytes(ref(storage, `banners/${Date.now()}_${arq.name}`), arq);
        const url = await getDownloadURL(s.ref);
        await addDoc(bannersCollection, { titulo, subtitulo: sub, img: url });
        showToast("Banner criado!"); document.getElementById('modalBanner').style.display='none'; renderizarBanners();
    } catch(e) { showToast("Erro", "error"); } finally { toggleLoading(false); }
});
window.delBanner = async (id) => { if(confirm("Excluir banner?")) { await deleteDoc(doc(db,"banners",id)); renderizarBanners(); } };

// --- CUPONS ---
async function renderizarCupons() {
    const tbody = document.getElementById('tabela-cupons');
    const q = await getDocs(cuponsCollection);
    tbody.innerHTML = '';
    q.forEach(d => {
        const c = d.data();
        tbody.innerHTML += `<tr><td><strong>${c.codigo}</strong></td><td>${c.desconto}%</td><td><i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="window.delCupom('${d.id}')"></i></td></tr>`;
    });
}
document.getElementById('btn-save-cupom').addEventListener('click', async () => {
    const codigo = document.getElementById('cupom-code').value.toUpperCase();
    const desconto = parseInt(document.getElementById('cupom-val').value);
    if(!codigo || !desconto) return showToast("Preencha campos", "error");
    toggleLoading(true);
    try { await addDoc(cuponsCollection, { codigo, desconto }); showToast("Cupom criado!"); document.getElementById('modalCupom').style.display='none'; renderizarCupons(); } catch(e) { showToast("Erro", "error"); } finally { toggleLoading(false); }
});
window.delCupom = async (id) => { if(confirm("Excluir cupom?")) { await deleteDoc(doc(db,"cupons",id)); renderizarCupons(); } };

// --- PRODUTOS (Com Preço Original) ---
async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    const count = document.getElementById('total-estoque-count');
    const q = await getDocs(produtosCollection);
    tbody.innerHTML=''; let est=0;
    q.forEach(d => {
        const p = d.data(); est += parseInt(p.estoque)||0;
        const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
        tbody.innerHTML += `<tr><td><img src="${img}" style="width:40px;"></td><td>${p.nome}</td><td>${p.estoque}</td><td>${fmtMoney(p.preco)}</td><td><i class="fas fa-edit" onclick="window.editarProduto('${d.id}')" style="margin-right:10px;cursor:pointer;"></i><i class="fas fa-trash" onclick="window.deletarProduto('${d.id}')" style="color:red;cursor:pointer;"></i></td></tr>`;
    });
    count.innerText = est;
}

window.editarProduto = async (id) => {
    toggleLoading(true);
    const d = await getDoc(doc(db,"produtos",id));
    toggleLoading(false);
    if(d.exists()) {
        const p = d.data();
        document.getElementById('prod-id').value=id; document.getElementById('modal-titulo').innerText="Editar";
        document.getElementById('prod-nome').value=p.nome; document.getElementById('prod-preco').value=p.preco;
        document.getElementById('prod-preco-antigo').value=p.precoOriginal || "";
        document.getElementById('prod-estoque').value=p.estoque; document.getElementById('prod-cat').value=p.categoria;
        document.getElementById('prod-desc').value=p.descricao;
        document.getElementById('modalProduto').style.display='flex';
    }
}

document.getElementById('btn-save-prod').addEventListener('click', async function() {
    const id = document.getElementById('prod-id').value;
    const nome = document.getElementById('prod-nome').value;
    const preco = document.getElementById('prod-preco').value;
    const precoAntigo = document.getElementById('prod-preco-antigo').value;
    const est = document.getElementById('prod-estoque').value;
    const cat = document.getElementById('prod-cat').value;
    const desc = document.getElementById('prod-desc').value;

    if(!nome || !preco) return showToast("Preencha campos!", "error");
    toggleLoading(true);

    try {
        let urls = [];
        for(let i=1; i<=4; i++) {
            const arq = document.getElementById(`img-${i}`).files[0];
            if(arq) {
                const s = await uploadBytes(ref(storage, `produtos/${Date.now()}_${i}`), arq);
                urls.push(await getDownloadURL(s.ref));
            }
        }
        let dados = { 
            nome, preco:parseFloat(preco), 
            precoOriginal: precoAntigo ? parseFloat(precoAntigo) : null,
            estoque:parseInt(est), categoria:cat, descricao:desc 
        };
        
        if(id) { if(urls.length>0) dados.imagens=urls; await updateDoc(doc(db,"produtos",id), dados); }
        else { dados.imagens=urls; dados.dataCriacao=new Date(); await addDoc(produtosCollection, dados); }
        showToast("Salvo!"); window.fecharModal(); renderizarTabela();
    } catch(e){ showToast("Erro", "error"); } finally { toggleLoading(false); }
});

// ... (Dashboard e Filtros de Pedidos iguais ao anterior) ...
async function renderizarDashboard() {
    const q = await getDocs(pedidosCollection);
    let cats={}, dias={}, totalFat=0, totalVendas=0;
    todosPedidosCache = [];
    q.forEach(d => {
        const p = d.data(); p.id = d.id; todosPedidosCache.push(p);
        totalVendas++; totalFat += p.total||0;
        p.itens.forEach(i => cats[i.categoria||'Geral'] = (cats[i.categoria||'Geral']||0)+1);
        const dStr = new Date(p.data).toLocaleDateString('pt-BR').slice(0,5);
        dias[dStr] = (dias[dStr]||0)+p.total;
    });
    document.getElementById('kpi-faturamento').innerText = fmtMoney(totalFat);
    document.getElementById('kpi-vendas').innerText = totalVendas;
    desenharGraficos(cats, dias);
    filtrarPedidos();
}
document.getElementById('filtro-status').addEventListener('change', filtrarPedidos);
function filtrarPedidos() {
    const filtro = document.getElementById('filtro-status').value;
    const tbody = document.getElementById('tabela-pedidos');
    tbody.innerHTML = '';
    const lista = filtro === 'Todos' ? todosPedidosCache : todosPedidosCache.filter(p => p.status === filtro);
    lista.forEach(p => {
        const opts = ['Recebido','Enviado','Entregue'];
        let sel = `<select id="st-${p.id}" style="padding:5px;">`;
        opts.forEach(o => sel += `<option value="${o}" ${p.status===o?'selected':''}>${o}</option>`);
        sel += `</select>`;
        tbody.innerHTML += `<tr><td>${new Date(p.data).toLocaleDateString('pt-BR')}</td><td>${p.cliente}</td><td>${fmtMoney(p.total)}</td><td>${sel}</td><td><button onclick="window.verDetalhes('${p.id}')" style="background:#2196f3; color:white; border:none; padding:5px;"><i class="fas fa-eye"></i></button></td></tr>`;
        setTimeout(() => document.getElementById(`st-${p.id}`).addEventListener('change', (e)=>updateStatus(p.id, e.target.value)), 100);
    });
}
async function updateStatus(id, st) { try { await updateDoc(doc(db,"pedidos",id), {status:st}); showToast("Atualizado!"); } catch(e) { showToast("Erro", "error"); } }
function desenharGraficos(cats, dias) {
    if(chartCat) chartCat.destroy(); if(chartFat) chartFat.destroy();
    chartCat = new Chart(document.getElementById('graficoCategorias'), { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{data:Object.values(cats), backgroundColor:['#e74c3c','#3498db','#f1c40f','#2ecc71']}] } });
    const sorted = Object.keys(dias).sort();
    chartFat = new Chart(document.getElementById('graficoFaturamento'), { type:'line', data:{ labels:sorted, datasets:[{label:'R$', data:sorted.map(d=>dias[d]), borderColor:'#8bc34a', fill:true}] } });
}
window.verDetalhes = (id) => { const p = todosPedidosCache.find(x => x.id === id); if(p) { document.getElementById('conteudo-detalhes').innerHTML=`<p><strong>Cliente:</strong> ${p.cliente}</p><p>End: ${p.endereco}</p><hr><ul>${p.itens.map(i=>`<li>${i.nome}</li>`).join('')}</ul><p>Total: ${fmtMoney(p.total)}</p>`; document.getElementById('modalDetalhes').style.display='flex'; } }
window.abrirModalProduto = () => { document.getElementById('prod-id').value=""; document.getElementById('modalProduto').style.display='flex'; }
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';
window.deletarProduto = async (id) => { if(confirm('Apagar?')) { await deleteDoc(doc(db,"produtos",id)); renderizarTabela(); } }
document.getElementById('btn-logout').addEventListener('click', async (e)=>{e.preventDefault(); await signOut(auth); window.location.href="login.html";});