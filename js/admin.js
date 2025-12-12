import { db, auth, storage } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- TEMA ADMIN (INICIALIZAÇÃO) ---
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
const themeToggleAdmin = document.getElementById('theme-toggle-admin');
if(themeToggleAdmin) {
    themeToggleAdmin.className = savedTheme === 'dark' ? 'fas fa-sun theme-toggle-admin' : 'fas fa-moon theme-toggle-admin';
}

window.toggleThemeAdmin = () => {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
    document.getElementById('theme-toggle-admin').className = newTheme === 'dark' ? 'fas fa-sun theme-toggle-admin' : 'fas fa-moon theme-toggle-admin';
}

// --- AUTH (CHAMA TODAS AS FUNÇÕES DE RENDERIZAÇÃO) ---
onAuthStateChanged(auth, (user) => { if(!user) window.location.href="login.html"; else { renderizarTabela(); renderizarDashboard(); renderizarBanners(); renderizarCupons(); } });

const produtosCollection = collection(db, "produtos");
const pedidosCollection = collection(db, "pedidos");
const bannersCollection = collection(db, "banners");
const cuponsCollection = collection(db, "cupons");
let chartCat=null, chartFat=null;
let todosPedidosCache = [];
let todosProdutosCache = []; // Cache para a tabela de produtos

function showToast(msg, type='success') { Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast(); }
function toggleLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

// --- LÓGICA DE PREVIEW DE IMAGEM ---
['1','2','3','4'].forEach(n => {
    const input = document.getElementById(`img-${n}`);
    const preview = document.getElementById(`preview-${n}`);
    if(input && preview) { // Verifica se os elementos existem
        input.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    preview.src = evt.target.result;
                    preview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else {
                preview.style.display = 'none';
                preview.src = ''; 
            }
        });
    }
});

// --- NAVEGAÇÃO ---
const sections = ['dashboard','produtos','pedidos','banners','cupons'];
sections.forEach(s => {
    const link = document.getElementById(`link-${s}`);
    const section = document.getElementById(`section-${s}`);
    if (link && section) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            sections.forEach(sec => { 
                const secEl = document.getElementById(`section-${sec}`);
                const linkEl = document.getElementById(`link-${sec}`);
                if(secEl) secEl.style.display = 'none'; 
                if(linkEl) linkEl.classList.remove('active'); 
            });
            section.style.display = 'block';
            link.classList.add('active');
        });
    }
});

// --- DASHBOARD ---
async function renderizarDashboard() {
    const q = await getDocs(pedidosCollection);
    let cats={}, dias={}, totalFat=0, totalVendas=0;
    todosPedidosCache = [];
    q.forEach(d => {
        const p = d.data(); p.id = d.id; todosPedidosCache.push(p);
        totalVendas++; totalFat += p.total||0;
        if(p.itens) p.itens.forEach(i => cats[i.categoria||'Geral'] = (cats[i.categoria||'Geral']||0)+1);
        const dStr = new Date(p.data).toLocaleDateString('pt-BR').slice(0,5);
        dias[dStr] = (dias[dStr]||0)+p.total;
    });
    
    // Calcula estoque total após carregar produtos
    const totalEstoqueEl = document.getElementById('total-estoque-count');
    if(totalEstoqueEl) totalEstoqueEl.innerText = todosProdutosCache.reduce((sum, p) => sum + (parseInt(p.estoque)||0), 0);

    document.getElementById('kpi-faturamento').innerText = fmtMoney(totalFat);
    document.getElementById('kpi-vendas').innerText = totalVendas;
    desenharGraficos(cats, dias);
    filtrarPedidos();
}

function desenharGraficos(cats, dias) {
    if(chartCat) chartCat.destroy(); if(chartFat) chartFat.destroy();
    chartCat = new Chart(document.getElementById('graficoCategorias'), { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{data:Object.values(cats), backgroundColor:['#e74c3c','#3498db','#f1c40f','#2ecc71']}] } });
    const sorted = Object.keys(dias).sort();
    chartFat = new Chart(document.getElementById('graficoFaturamento'), { type:'line', data:{ labels:sorted, datasets:[{label:'Faturamento', data:sorted.map(d=>dias[d]), borderColor:'#8bc34a', fill:true}] } });
}

// --- PEDIDOS ---
const filtroStatusEl = document.getElementById('filtro-status');
if(filtroStatusEl) filtroStatusEl.addEventListener('change', filtrarPedidos);

function filtrarPedidos() {
    const filtro = filtroStatusEl ? filtroStatusEl.value : 'Todos';
    const tbody = document.getElementById('tabela-pedidos');
    if(!tbody) return;
    tbody.innerHTML = '';
    const lista = filtro === 'Todos' ? todosPedidosCache : todosPedidosCache.filter(p => p.status === filtro);
    lista.forEach(p => {
        const opts = ['Recebido','Enviado','Entregue'];
        let sel = `<select id="st-${p.id}" style="padding:5px;">`;
        opts.forEach(o => sel += `<option value="${o}" ${p.status===o?'selected':''}>${o}</option>`);
        sel += `</select>`;
        tbody.innerHTML += `<tr><td>${new Date(p.data).toLocaleDateString('pt-BR')}</td><td>${p.cliente}</td><td>${fmtMoney(p.total)}</td><td>${sel}</td><td><button onclick="window.verDetalhes('${p.id}')" style="background:#2196f3; color:white; border:none; padding:5px;"><i class="fas fa-eye"></i></button></td></tr>`;
        setTimeout(() => {
            const stEl = document.getElementById(`st-${p.id}`);
            if(stEl) stEl.addEventListener('change', (e)=>updateStatus(p.id, e.target.value));
        }, 100);
    });
}
async function updateStatus(id, st) { try { await updateDoc(doc(db,"pedidos",id), {status:st}); showToast("Atualizado!"); } catch(e) { showToast("Erro", "error"); } }
window.exportarPedidos = () => {
    let csv = "Data,Cliente,Total,Status\n";
    todosPedidosCache.forEach(p => { csv += `${new Date(p.data).toLocaleDateString()},${p.cliente},${p.total},${p.status}\n`; });
    const a = document.createElement('a'); a.href = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'pedidos.csv'; a.click();
};

// --- PRODUTOS ---
async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    const q = await getDocs(produtosCollection);
    todosProdutosCache = [];
    tbody.innerHTML=''; 
    q.forEach(d => {
        const p = d.data(); todosProdutosCache.push(p);
        const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
        tbody.innerHTML += `<tr><td><img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"></td><td>${p.nome}</td><td style="font-weight:bold; color:${p.estoque<5?'red':'green'}">${p.estoque}</td><td>${fmtMoney(p.preco)}</td><td><i class="fas fa-edit" onclick="window.editarProduto('${d.id}')" style="margin-right:10px;cursor:pointer;"></i><i class="fas fa-trash" onclick="window.deletarProduto('${d.id}')" style="color:red;cursor:pointer;"></i></td></tr>`;
    });
}

window.editarProduto = async (id) => {
    toggleLoading(true);
    const d = await getDoc(doc(db,"produtos",id));
    toggleLoading(false);
    if(d.exists()) {
        const p = d.data();
        document.getElementById('prod-id').value=id; document.getElementById('modal-titulo').innerText="Editar Produto";
        document.getElementById('prod-nome').value=p.nome; document.getElementById('prod-preco').value=p.preco;
        document.getElementById('prod-preco-antigo').value=p.precoOriginal || "";
        document.getElementById('prod-estoque').value=p.estoque; document.getElementById('prod-cat').value=p.categoria;
        document.getElementById('prod-desc').value=p.descricao;
        
        // Limpa inputs e carrega previews
        for(let i=1; i<=4; i++) {
            const input = document.getElementById(`img-${i}`);
            const preview = document.getElementById(`preview-${i}`);
            if(input) input.value = ""; // Limpa campo de arquivo
            preview.style.display = 'none';
            preview.src = ''; 
            
            if(p.imagens && p.imagens[i-1]) {
                preview.src = p.imagens[i-1];
                preview.style.display = 'block';
            }
        }
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
        let dados = { nome, preco:parseFloat(preco), precoOriginal: precoAntigo ? parseFloat(precoAntigo) : null, estoque:parseInt(est), categoria:cat, descricao:desc };
        
        if(id) { 
            const docSnap = await getDoc(doc(db, "produtos", id));
            let imagensAtuais = docSnap.exists() ? (docSnap.data().imagens || []) : [];
            
            // Se houver novas URLs, sobrescreve. Caso contrário, mantém as antigas.
            if(urls.length > 0) {
                dados.imagens = urls;
            } else {
                dados.imagens = imagensAtuais;
            }
            await updateDoc(doc(db,"produtos",id), dados); 
        } else { 
            dados.imagens=urls; dados.dataCriacao=new Date(); 
            await addDoc(produtosCollection, dados); 
        }
        showToast("Salvo!"); window.fecharModal(); renderizarTabela(); renderizarDashboard();
    } catch(e){ console.error(e); showToast("Erro ao salvar.", "error"); } finally { toggleLoading(false); }
});

// --- BANNERS & CUPONS ---
async function renderizarBanners() {
    const tbody = document.getElementById('tabela-banners');
    const q = await getDocs(bannersCollection);
    tbody.innerHTML = '';
    q.forEach(d => {
        const b = d.data();
        tbody.innerHTML += `<tr><td><img src="${b.img}" style="width:100px;"></td><td>${b.titulo}</td><td>${b.subtitulo}</td><td><i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="window.delBanner('${d.id}')"></i></td></tr>`;
    });
}
document.getElementById('btn-save-banner').addEventListener('click', async () => {
    const titulo = document.getElementById('banner-titulo').value;
    const sub = document.getElementById('banner-sub').value;
    const arq = document.getElementById('banner-img').files[0];
    if(!titulo || !arq) return showToast("Preencha!", "error");
    toggleLoading(true);
    try {
        const s = await uploadBytes(ref(storage, `banners/${Date.now()}`), arq);
        const url = await getDownloadURL(s.ref);
        await addDoc(bannersCollection, { titulo, subtitulo:sub, img:url });
        showToast("Criado!"); document.getElementById('modalBanner').style.display='none'; renderizarBanners();
    } catch(e){ showToast("Erro", "error"); } finally { toggleLoading(false); }
});
window.delBanner = async (id) => { if(confirm("Excluir?")) await deleteDoc(doc(db,"banners",id)); renderizarBanners(); };

async function renderizarCupons() {
    const tbody = document.getElementById('tabela-cupons');
    const q = await getDocs(cuponsCollection);
    tbody.innerHTML = '';
    q.forEach(d => {
        const c = d.data();
        tbody.innerHTML += `<tr><td>${c.codigo}</td><td>${c.desconto}%</td><td>${c.validade || '-'}</td><td><i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="window.delCupom('${d.id}')"></i></td></tr>`;
    });
}
document.getElementById('btn-save-cupom').addEventListener('click', async () => {
    const codigo = document.getElementById('cupom-code').value.toUpperCase();
    const desconto = document.getElementById('cupom-val').value;
    const validade = document.getElementById('cupom-validade').value;
    if(!codigo) return showToast("Preencha!", "error");
    try { await addDoc(cuponsCollection, { codigo, desconto, validade }); showToast("Criado!"); document.getElementById('modalCupom').style.display='none'; renderizarCupons(); } catch(e){}
});
window.delCupom = async (id) => { if(confirm("Excluir?")) await deleteDoc(doc(db,"cupons",id)); renderizarCupons(); };

window.verDetalhes = (id) => { const p = todosPedidosCache.find(x => x.id === id); if(p) { document.getElementById('conteudo-detalhes').innerHTML=`<p><strong>Cliente:</strong> ${p.cliente}</p><p>End: ${p.endereco}</p><hr><ul>${p.itens.map(i=>`<li>${i.nome} (${i.qtd}x)</li>`).join('')}</ul><p>Total: ${fmtMoney(p.total)}</p>`; document.getElementById('modalDetalhes').style.display='flex'; } }
window.abrirModalProduto = () => { 
    document.getElementById('prod-id').value=""; document.getElementById('modal-titulo').innerText="Novo Produto";
    ['prod-nome','prod-preco','prod-preco-antigo','prod-estoque','prod-desc'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    // Limpa inputs de arquivo e previews
    for(let i=1; i<=4; i++) {
        const imgInput = document.getElementById(`img-${i}`);
        const preview = document.getElementById(`preview-${i}`);
        if(imgInput) imgInput.value = "";
        if(preview) { preview.style.display = 'none'; preview.src = ''; }
    }
    document.getElementById('modalProduto').style.display='flex'; 
}
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';
window.deletarProduto = async (id) => { if(confirm('Apagar?')) { await deleteDoc(doc(db,"produtos",id)); renderizarTabela(); } }
document.getElementById('btn-logout').addEventListener('click', async (e)=>{e.preventDefault(); await signOut(auth); window.location.href="login.html";});