import { db, auth, storage } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

onAuthStateChanged(auth, (user) => { if(!user) window.location.href="login.html"; else { renderizarTabela(); renderizarDashboard(); } });

const produtosCollection = collection(db, "produtos");
const pedidosCollection = collection(db, "pedidos");
let chartCat=null, chartFat=null;

document.getElementById('link-dashboard').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('dashboard');});
document.getElementById('link-produtos').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('produtos');});
document.getElementById('link-pedidos').addEventListener('click', (e)=>{e.preventDefault(); mostrarSecao('pedidos');});
function mostrarSecao(s) { ['dashboard','produtos','pedidos'].forEach(x=>document.getElementById(`section-${x}`).style.display='none'); document.getElementById(`section-${s}`).style.display='block'; }

async function renderizarDashboard() {
    const tbody = document.getElementById('tabela-pedidos');
    const q = await getDocs(pedidosCollection);
    let cats={}, dias={}, totalFat=0, totalVendas=0;
    tbody.innerHTML='';
    q.forEach(d => {
        const p = d.data(); totalVendas++; totalFat += p.total||0;
        p.itens.forEach(i => cats[i.categoria||'Geral'] = (cats[i.categoria||'Geral']||0)+1);
        dias[new Date(p.data).toLocaleDateString('pt-BR').slice(0,5)] = (dias[new Date(p.data).toLocaleDateString('pt-BR').slice(0,5)]||0)+p.total;
        
        const tr = document.createElement('tr');
        const opts = ['Recebido','Preparando','Enviado','Entregue'];
        let sel = `<select id="st-${d.id}" style="padding:5px;">`;
        opts.forEach(o => sel += `<option value="${o}" ${p.status===o?'selected':''}>${o}</option>`);
        sel += `</select>`;
        tr.innerHTML = `<td>${new Date(p.data).toLocaleDateString('pt-BR')}</td><td>${p.cliente}</td><td>R$ ${p.total.toFixed(2)}</td><td>${sel}</td><td><button id="ver-${d.id}" style="background:#2196f3; color:white; border:none; padding:5px; cursor:pointer;"><i class="fas fa-eye"></i></button></td>`;
        tbody.appendChild(tr);
        document.getElementById(`st-${d.id}`).addEventListener('change', (e)=>updateDoc(doc(db,"pedidos",d.id), {status:e.target.value}));
        document.getElementById(`ver-${d.id}`).addEventListener('click', ()=>verDetalhes(p));
    });
    document.getElementById('kpi-faturamento').innerText = `R$ ${totalFat.toFixed(2)}`;
    document.getElementById('kpi-vendas').innerText = totalVendas;
    desenharGraficos(cats, dias);
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
        const tr = document.createElement('tr');
        tr.innerHTML=`<td><img src="${p.img||''}" style="width:40px;height:40px;object-fit:cover;"></td><td>${p.nome}</td><td style="color:${p.estoque<5?'red':'green'}">${p.estoque}</td><td>R$ ${p.preco}</td><td><i class="fas fa-edit" id="ed-${d.id}" style="color:#2196f3;cursor:pointer;margin-right:10px;"></i><i class="fas fa-trash" id="dl-${d.id}" style="color:red;cursor:pointer;"></i></td>`;
        tbody.appendChild(tr);
        document.getElementById(`dl-${d.id}`).addEventListener('click', ()=>deletarProduto(d.id));
        document.getElementById(`ed-${d.id}`).addEventListener('click', ()=>editarProduto(d.id));
    });
    count.innerText = est;
}

window.editarProduto = async (id) => {
    const d = await getDoc(doc(db,"produtos",id));
    if(d.exists()) {
        const p = d.data();
        document.getElementById('prod-id').value=id; document.getElementById('modal-titulo').innerText="Editar";
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
    const arq = document.getElementById('prod-img').files[0];
    const btn = this;

    if(!nome || !preco || !est) return alert("Preencha tudo!");
    btn.innerText="..."; btn.disabled=true;
    try {
        let url = null;
        if(arq) {
            const s = await uploadBytes(ref(storage, `produtos/${Date.now()}_${arq.name}`), arq);
            url = await getDownloadURL(s.ref);
        }
        const dados = { nome, preco:parseFloat(preco), estoque:parseInt(est), categoria:cat, descricao:desc };
        if(url) dados.img = url; else if(!id) dados.img = "";

        if(id) await updateDoc(doc(db,"produtos",id), dados);
        else { dados.dataCriacao=new Date(); await addDoc(produtosCollection, dados); }
        alert("Salvo!"); window.fecharModal(); renderizarTabela(); renderizarDashboard();
    } catch(e) { console.error(e); alert("Erro."); }
    finally { btn.innerText="Salvar"; btn.disabled=false; }
});

function verDetalhes(p) { document.getElementById('conteudo-detalhes').innerHTML=`<p><strong>Cliente:</strong> ${p.cliente}</p><p>${p.endereco||''}</p><hr><ul>${p.itens.map(i=>`<li>${i.nome}</li>`).join('')}</ul><p>Total: R$ ${p.total.toFixed(2)}</p>`; document.getElementById('modalDetalhes').style.display='flex'; }
window.abrirModalProduto = () => { document.getElementById('prod-id').value=""; document.getElementById('modal-titulo').innerText="Novo"; document.getElementById('prod-nome').value=""; document.getElementById('prod-preco').value=""; document.getElementById('prod-estoque').value=""; document.getElementById('prod-desc').value=""; document.getElementById('modalProduto').style.display='flex'; }
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';
async function deletarProduto(id) { if(confirm('Apagar?')) { await deleteDoc(doc(db,"produtos",id)); renderizarTabela(); renderizarDashboard(); } }
document.getElementById('btn-logout').addEventListener('click', async (e)=>{e.preventDefault(); await signOut(auth); window.location.href="login.html";});