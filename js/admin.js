import { db, auth, storage } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- VARIÁVEIS GLOBAIS DE CACHE ---
const produtosCollection = collection(db, "produtos");
const pedidosCollection = collection(db, "pedidos");
const bannersCollection = collection(db, "banners");
const cuponsCollection = collection(db, "cupons");

let chartCat = null;
let chartFat = null;
let todosPedidosCache = [];
let todosProdutosCache = []; 
let filesToUpload = []; 

// --- 1. TEMA E INICIALIZAÇÃO ---
try {
    const savedTheme = localStorage.getItem('lston_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    const themeToggle = document.getElementById('theme-toggle-admin');
    if(themeToggle) {
        themeToggle.className = savedTheme === 'dark' ? 'fas fa-sun theme-toggle-admin' : 'fas fa-moon theme-toggle-admin';
    }
} catch(e) { console.warn(e); }

window.toggleThemeAdmin = () => {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
    const toggle = document.getElementById('theme-toggle-admin');
    if(toggle) toggle.className = newTheme === 'dark' ? 'fas fa-sun theme-toggle-admin' : 'fas fa-moon theme-toggle-admin';
}

// --- 2. AUTH ---
onAuthStateChanged(auth, async (user) => { 
    if(!user) { 
        window.location.href="login.html"; 
    } else if (user.email !== "admin@lston.com") { 
        alert("Acesso restrito a administradores."); 
        await signOut(auth);
        window.location.href = "index.html"; 
    } else { 
        console.log("Admin logado. Iniciando painel...");
        initDragAndDrop();
        
        // Carrega dados iniciais
        await renderizarDashboard(); // Carrega pedidos e gráficos
        renderizarTabela();          // Carrega produtos
        renderizarBanners();
        renderizarCupons();
        
        // Ativa os listeners dos filtros DEPOIS de carregar tudo
        ativarListenersFiltros();
    } 
});

// --- 3. FUNÇÕES DO DASHBOARD (FILTRO DE DATA) ---
async function renderizarDashboard() {
    try {
        const filtroData = document.getElementById('filtro-data-dashboard')?.value || 'total';
        
        // Busca todos os pedidos do Firebase (se cache vazio) ou usa cache
        if(todosPedidosCache.length === 0) {
            const q = await getDocs(pedidosCollection);
            todosPedidosCache = [];
            q.forEach(d => {
                const p = d.data();
                p.id = d.id;
                todosPedidosCache.push(p);
            });
        }

        let cats = {}, dias = {}, totalFat = 0, totalVendas = 0;
        const hoje = new Date().toLocaleDateString('pt-BR');
        
        // Filtra os dados para os KPIs e Gráficos
        todosPedidosCache.forEach(p => {
            let dataPedido = '-';
            try { if(p.data) dataPedido = new Date(p.data).toLocaleDateString('pt-BR'); } catch(e){}

            // Lógica do Filtro de Data
            if (filtroData === 'hoje' && dataPedido !== hoje) return;

            totalVendas++; 
            totalFat += (parseFloat(p.total) || 0);

            // Dados Categoria
            if(p.itens && Array.isArray(p.itens)) {
                p.itens.forEach(i => {
                    const cat = i.categoria || 'Geral';
                    cats[cat] = (cats[cat] || 0) + 1;
                });
            }
            
            // Dados Faturamento Diário
            const dStr = dataPedido.slice(0,5); 
            dias[dStr] = (dias[dStr] || 0) + (parseFloat(p.total) || 0);
        });

        // Atualiza Tela
        const elFat = document.getElementById('kpi-faturamento');
        const elVend = document.getElementById('kpi-vendas');
        if(elFat) elFat.innerText = fmtMoney(totalFat);
        if(elVend) elVend.innerText = totalVendas;

        // Atualiza Estoque
        if(document.getElementById('total-estoque-count')) {
            const totalEst = todosProdutosCache.reduce((sum, p) => sum + (parseInt(p.estoque)||0), 0);
            document.getElementById('total-estoque-count').innerText = totalEst;
        }

        desenharGraficos(cats, dias);
        
        // Chama o filtro da tabela de pedidos para refletir a mudança
        // Nota: A tabela de pedidos geralmente mostra tudo, mas podemos aplicar o filtro de data nela também se quiser
        // Por padrão, vamos apenas recarregar a tabela com os filtros de status atuais
        filtrarPedidos(); 

    } catch (error) {
        console.error("Erro Dashboard:", error);
    }
}
// EXPORTA PARA O HTML USAR NO ONCHANGE
window.renderizarDashboard = renderizarDashboard;


// --- 4. FUNÇÕES DE PEDIDOS (FILTRO DE STATUS E BUSCA) ---
function ativarListenersFiltros() {
    const filtroStatusEl = document.getElementById('filtro-status');
    const buscaEl = document.getElementById('busca-pedido');

    // Remove listeners antigos para evitar duplicação (boa prática)
    if(filtroStatusEl) {
        filtroStatusEl.removeEventListener('change', filtrarPedidos);
        filtroStatusEl.addEventListener('change', filtrarPedidos);
    }
    
    // O input já tem oninput="filtrarPedidos()" no HTML, então não precisa adicionar aqui
    // mas garantimos que a função filtrarPedidos esteja no window
}

// --- HELPER DE BUSCA (Adicione isso antes de filtrarPedidos ou no início do arquivo) ---
function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- FUNÇÃO DE BUSCA CORRIGIDA (ID) ---
window.filtrarPedidos = () => {
    const tbody = document.getElementById('tabela-pedidos');
    if(!tbody) return;

    const filtroStatusEl = document.getElementById('filtro-status');
    const buscaEl = document.getElementById('busca-pedido');
    const filtroDataEl = document.getElementById('filtro-data-dashboard'); // <--- PEGA O FILTRO DE DATA
    
    const filtroStatus = filtroStatusEl ? filtroStatusEl.value : 'Todos';
    const filtroData = filtroDataEl ? filtroDataEl.value : 'total';        // <--- LÊ O VALOR (total ou hoje)
    
    const termoOriginal = buscaEl ? buscaEl.value.trim() : '';
    const termoNormalizado = normalizarTexto(termoOriginal);

    const hoje = new Date().toLocaleDateString('pt-BR'); // Data de hoje formatada (ex: 20/10/2023)

    const lista = todosPedidosCache.filter(p => {
        // --- 1. FILTRO DE DATA (NOVO) ---
        if (filtroData === 'hoje') {
            let dataPedido = '-';
            try { 
                // Converte a data do pedido para o formato local PT-BR
                if(p.data) dataPedido = new Date(p.data).toLocaleDateString('pt-BR'); 
            } catch(e){}
            
            // Se a data do pedido for diferente de hoje, remove da lista
            if (dataPedido !== hoje) return false; 
        }

        // --- 2. FILTRO DE STATUS ---
        const matchStatus = filtroStatus === 'Todos' || (p.status || 'Recebido') === filtroStatus;
        
        // --- 3. BUSCA (ID, NOME, EMAIL) ---
        const pNome = normalizarTexto(p.cliente);
        const pEmail = normalizarTexto(p.userEmail);
        const pId = (p.id || '').toString(); 

        // Busca ID exato (case insensitive) ou texto normalizado
        const matchId = pId.toLowerCase().includes(termoOriginal.toLowerCase());
        const matchTexto = pNome.includes(termoNormalizado) || pEmail.includes(termoNormalizado);
        
        return matchStatus && (matchId || matchTexto);
    });

    // --- RENDERIZAÇÃO (SEM MUDANÇAS) ---
    if(lista.length === 0) {
        let msg = 'Nenhum pedido encontrado.';
        if(termoOriginal) msg = `Nada encontrado para "<strong>${termoOriginal}</strong>".`;
        if(filtroData === 'hoje') msg += ' (Filtrando por: Hoje)';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-light);">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(p => {
        const idCurto = p.id ? p.id.slice(0, 8).toUpperCase() : '???';
        const data = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-';
        const statusAtual = p.status || 'Recebido';
        
        let corStatus = '#333';
        if(statusAtual === 'Recebido') corStatus = '#f39c12';
        if(statusAtual === 'Enviado') corStatus = '#3498db';
        if(statusAtual === 'Entregue') corStatus = '#2ecc71';
        if(statusAtual === 'Cancelado') corStatus = '#e74c3c';

        return `
        <tr>
            <td>
                <span title="${p.id}" style="cursor:help"><strong>#${idCurto}</strong></span>
                <br><small style="color:#888">${data}</small>
            </td>
            <td>
                <div style="font-weight:600;">${p.cliente || 'Desconhecido'}</div>
                <div style="font-size:11px; color:#888;">${p.userEmail || ''}</div>
            </td>
            <td style="font-weight:bold;">${fmtMoney(p.total || 0)}</td>
            <td>
                <select onchange="window.updateStatus('${p.id}', this.value)" 
                        style="padding:5px 10px; border-radius:15px; border:1px solid ${corStatus}; color:${corStatus}; font-weight:600; cursor:pointer; background:transparent;">
                    <option value="Recebido" ${statusAtual==='Recebido'?'selected':''}>Recebido</option>
                    <option value="Enviado" ${statusAtual==='Enviado'?'selected':''}>Enviado</option>
                    <option value="Entregue" ${statusAtual==='Entregue'?'selected':''}>Entregue</option>
                    <option value="Cancelado" ${statusAtual==='Cancelado'?'selected':''}>Cancelado</option>
                </select>
            </td>
            <td>
                <button onclick="window.verDetalhes('${p.id}')" title="Ver Detalhes"
                        style="background:var(--bg-body); color:var(--text-main); border:1px solid var(--border); width:35px; height:35px; border-radius:50%; cursor:pointer; transition:0.2s;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}
// EXPORTA PARA O HTML
window.filtrarPedidos = filtrarPedidos;

window.updateStatus = async (id, novoStatus) => {
    try {
        await updateDoc(doc(db, "pedidos", id), { status: novoStatus });
        const item = todosPedidosCache.find(x => x.id === id);
        if(item) item.status = novoStatus;
        showToast("Status atualizado!");
    } catch(e) { showToast("Erro ao atualizar.", "error"); }
}

window.verDetalhes = (id) => {
    const p = todosPedidosCache.find(x => x.id === id);
    if(!p) return;
    const conteudo = document.getElementById('conteudo-detalhes');
    if(conteudo) {
        const itensHtml = (p.itens || []).map(i => `<li>${i.qtd}x ${i.nome} - ${fmtMoney(i.preco)}</li>`).join('');
        conteudo.innerHTML = `
            <p><strong>Cliente:</strong> ${p.cliente}</p>
            <p><strong>Tel:</strong> ${p.telefone}</p>
            <p><strong>End:</strong> ${p.endereco}, ${p.numero||''} - ${p.bairro||''}</p>
            <p><strong>Cidade:</strong> ${p.cidade}/${p.cep}</p>
            <hr style="margin:10px 0;">
            <ul>${itensHtml}</ul>
            <p style="text-align:right; font-weight:bold; font-size:18px;">Total: ${fmtMoney(p.total)}</p>
        `;
        document.getElementById('modalDetalhes').style.display = 'flex';
    }
}

window.exportarPedidos = () => {
    let csv = "ID,Data,Cliente,Total,Status\n";
    todosPedidosCache.forEach(p => { csv += `${p.id},${p.data},${p.cliente},${p.total},${p.status}\n`; });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'pedidos.csv';
    a.click();
}

// --- 5. GRÁFICOS E HELPERS ---
function desenharGraficos(cats, dias) {
    if(typeof Chart === 'undefined') return;
    try {
        const ctxCat = document.getElementById('graficoCategorias');
        const ctxFat = document.getElementById('graficoFaturamento');
        if(ctxCat && Object.keys(cats).length > 0) {
            if(chartCat) chartCat.destroy();
            chartCat = new Chart(ctxCat, { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{data:Object.values(cats), backgroundColor:['#e74c3c','#3498db','#f1c40f','#2ecc71']}] } });
        }
        if(ctxFat && Object.keys(dias).length > 0) {
            if(chartFat) chartFat.destroy();
            const sorted = Object.keys(dias).sort();
            chartFat = new Chart(ctxFat, { type:'line', data:{ labels:sorted, datasets:[{label:'Faturamento', data:sorted.map(d=>dias[d]), borderColor:'#8bc34a', fill:true}] } });
        }
    } catch(e) {}
}

function showToast(msg, type='success') { 
    if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast();
    else alert(msg);
}
function toggleLoading(show) { 
    const el = document.getElementById('loading-overlay'); 
    if(el) el.style.display = show ? 'flex' : 'none'; 
}
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

// --- 6. PRODUTOS ---
window.abrirModalProduto = () => { 
    document.getElementById('prod-id').value=""; 
    document.getElementById('modal-titulo').innerText="Novo Produto";
    filesToUpload = []; 
    const prev = document.getElementById('preview-container'); if(prev) prev.innerHTML = "";
    ['prod-nome','prod-preco','prod-preco-antigo','prod-estoque','prod-desc'].forEach(id => { 
        const el = document.getElementById(id); if(el) el.value = ""; 
    });
    document.getElementById('modalProduto').style.display='flex'; 
}
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';

async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    if(!tbody) return;
    try {
        const q = await getDocs(produtosCollection);
        todosProdutosCache = [];
        tbody.innerHTML = ''; 
        q.forEach(d => {
            const p = d.data(); p.id = d.id; todosProdutosCache.push(p);
            const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || 'img/no-image.png');
            tbody.innerHTML += `<tr><td><img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"></td><td>${p.nome}</td><td style="font-weight:bold; color:${(parseInt(p.estoque)||0)<5?'red':'green'}">${p.estoque}</td><td>${fmtMoney(p.preco)}</td><td><i class="fas fa-edit" onclick="window.editarProduto('${p.id}')" style="margin-right:10px;cursor:pointer;color:blue;"></i><i class="fas fa-trash" onclick="window.deletarProduto('${p.id}')" style="color:red;cursor:pointer;"></i></td></tr>`;
        });
        verificarEstoqueCritico();
    } catch(e) { console.error(e); }
}

window.editarProduto = async (id) => {
    toggleLoading(true);
    try {
        const d = await getDoc(doc(db,"produtos",id));
        if(d.exists()) {
            const p = d.data();
            filesToUpload = [];
            document.getElementById('prod-id').value = id;
            document.getElementById('modal-titulo').innerText = "Editar Produto";
            document.getElementById('prod-nome').value = p.nome;
            document.getElementById('prod-preco').value = p.preco;
            document.getElementById('prod-preco-antigo').value = p.precoOriginal||"";
            document.getElementById('prod-estoque').value = p.estoque;
            document.getElementById('prod-cat').value = p.categoria||"Geral";
            document.getElementById('prod-desc').value = p.descricao||"";
            const prev = document.getElementById('preview-container'); prev.innerHTML = "";
            if(p.imagens) p.imagens.forEach(url => prev.innerHTML += `<div class="preview-card"><img src="${url}"><div class="remove-btn" style="background:#555;">x</div></div>`);
            document.getElementById('modalProduto').style.display='flex';
        }
    } catch(e){} finally { toggleLoading(false); }
}

window.deletarProduto = async (id) => {
    if(confirm("Excluir produto?")) {
        try { await deleteDoc(doc(db,"produtos",id)); renderizarTabela(); showToast("Excluído!"); } catch(e){}
    }
}

// SALVAR PRODUTO
const btnSave = document.getElementById('btn-save-prod');
if(btnSave) {
    btnSave.addEventListener('click', async () => {
        const id = document.getElementById('prod-id').value;
        const nome = document.getElementById('prod-nome').value;
        const preco = document.getElementById('prod-preco').value;
        const estoque = document.getElementById('prod-estoque').value;
        if(!nome || !preco) return showToast("Preencha campos!", "error");
        toggleLoading(true);
        try {
            let urls = [];
            for (const file of filesToUpload) {
                const s = await uploadBytes(ref(storage, `produtos/${Date.now()}_${file.name}`), file);
                urls.push(await getDownloadURL(s.ref));
            }
            const dados = { nome, preco:parseFloat(preco), precoOriginal:document.getElementById('prod-preco-antigo').value?parseFloat(document.getElementById('prod-preco-antigo').value):null, estoque:parseInt(estoque)||0, categoria:document.getElementById('prod-cat').value, descricao:document.getElementById('prod-desc').value, dataAtualizacao:new Date() };
            if(id) {
                const snap = await getDoc(doc(db,"produtos",id));
                const imgsAtuais = snap.exists() ? (snap.data().imagens||[]) : [];
                if(urls.length>0) dados.imagens = urls; else dados.imagens = imgsAtuais;
                await updateDoc(doc(db,"produtos",id), dados);
            } else {
                dados.imagens = urls; dados.dataCriacao = new Date();
                await addDoc(produtosCollection, dados);
            }
            document.getElementById('modalProduto').style.display='none';
            renderizarTabela(); renderizarDashboard(); showToast("Salvo!");
        } catch(e){ console.error(e); showToast("Erro ao salvar", "error"); } finally { toggleLoading(false); }
    });
}

// --- 7. UPLOAD & HELPERS ---
function initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const input = document.getElementById('prod-imgs-hidden');
    if(!dropZone || !input) return;
    dropZone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => handleFiles(Array.from(input.files)));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(Array.from(e.dataTransfer.files)); });
}
function handleFiles(files) {
    const valid = files.filter(f => f.type.startsWith('image/'));
    filesToUpload = [...filesToUpload, ...valid];
    const c = document.getElementById('preview-container'); c.innerHTML='';
    filesToUpload.forEach((f, i) => {
        const r = new FileReader();
        r.onload = (e) => c.innerHTML += `<div class="preview-card"><img src="${e.target.result}"><div class="remove-btn" onclick="window.removeFile(${i})">x</div></div>`;
        r.readAsDataURL(f);
    });
}
window.removeFile = (i) => { filesToUpload.splice(i, 1); const fs = []; filesToUpload.forEach(f => fs.push(f)); handleFiles(fs); } // Re-renderiza

async function verificarEstoqueCritico() {
    const al = document.getElementById('alerta-estoque-container');
    const crit = todosProdutosCache.filter(p => (parseInt(p.estoque)||0) <= 5);
    if(al && crit.length>0) { al.style.display='block'; al.innerHTML=`<div style="background:#fff3cd;padding:10px;border-radius:6px;border-left:4px solid #ffc107;">⚠️ <strong>${crit.length}</strong> produtos com estoque baixo.</div>`; }
    else if(al) al.style.display='none';
}

// NAV & LOGOUT
['dashboard','produtos','pedidos','banners','cupons'].forEach(s => {
    const l = document.getElementById(`link-${s}`);
    if(l) l.addEventListener('click', (e) => {
        e.preventDefault();
        ['dashboard','produtos','pedidos','banners','cupons'].forEach(x => {
            document.getElementById(`section-${x}`).style.display='none';
            const ln = document.getElementById(`link-${x}`); if(ln) ln.classList.remove('active');
        });
        document.getElementById(`section-${s}`).style.display='block';
        l.classList.add('active');
    });
});
const btnLogout = document.getElementById('btn-logout');
if(btnLogout) btnLogout.addEventListener('click', async (e)=>{ e.preventDefault(); await signOut(auth); window.location.href="login.html"; });

// BANNERS & CUPONS (Placeholders Funcionais)
async function renderizarBanners() {
    const tb = document.getElementById('tabela-banners');
    if(!tb) return;
    const q = await getDocs(bannersCollection); tb.innerHTML='';
    q.forEach(d => { const b=d.data(); tb.innerHTML += `<tr><td><img src="${b.img}" style="width:80px;"></td><td>${b.titulo}</td><td>${b.subtitulo}</td><td><i class="fas fa-trash" style="color:red;cursor:pointer;" onclick="window.delBanner('${d.id}')"></i></td></tr>`; });
}
const btnBan = document.getElementById('btn-save-banner');
if(btnBan) btnBan.addEventListener('click', async () => {
    const t = document.getElementById('banner-titulo').value;
    const f = document.getElementById('banner-img').files[0];
    if(t && f) { 
        toggleLoading(true);
        const snap = await uploadBytes(ref(storage, `banners/${Date.now()}`), f);
        const url = await getDownloadURL(snap.ref);
        await addDoc(bannersCollection, { titulo:t, subtitulo:document.getElementById('banner-sub').value, img:url });
        document.getElementById('modalBanner').style.display='none'; renderizarBanners(); toggleLoading(false);
    }
});
window.delBanner = async(id)=>{ if(confirm("Apagar?")) { await deleteDoc(doc(db,"banners",id)); renderizarBanners(); }};

async function renderizarCupons() {
    const tb = document.getElementById('tabela-cupons');
    if(!tb) return;
    const q = await getDocs(cuponsCollection); tb.innerHTML='';
    q.forEach(d => { const c=d.data(); tb.innerHTML += `<tr><td>${c.codigo}</td><td>${c.desconto}%</td><td>${c.validade||'-'}</td><td><i class="fas fa-trash" style="color:red;cursor:pointer;" onclick="window.delCupom('${d.id}')"></i></td></tr>`; });
}
const btnCup = document.getElementById('btn-save-cupom');
if(btnCup) btnCup.addEventListener('click', async () => {
    const c = document.getElementById('cupom-code').value;
    if(c) { await addDoc(cuponsCollection, { codigo:c, desconto:document.getElementById('cupom-val').value, validade:document.getElementById('cupom-validade').value }); document.getElementById('modalCupom').style.display='none'; renderizarCupons(); }
});
window.delCupom = async(id)=>{ if(confirm("Apagar?")) { await deleteDoc(doc(db,"cupons",id)); renderizarCupons(); }};