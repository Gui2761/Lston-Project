// js/admin.js (Híbrido: Node.js para dados, Firebase para Storage)
import { app } from "./firebaseConfig.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const storage = getStorage(app);

// --- VARIÁVEIS GLOBAIS ---
let chartCat = null;
let chartFat = null;
let todosPedidosCache = [];
let pedidosFiltrados = []; 
let todosProdutosCache = []; 
let todasCategoriasCache = []; 
let filesToUpload = []; 

// Paginação
let paginaAtual = 1;
const itensPorPagina = 20;

// --- 1. INICIALIZAÇÃO E AUTH ---
function checkAuth() {
    const userStr = localStorage.getItem('lston_user');
    if(!userStr) {
        window.location.href="login.html";
        return;
    }
    const user = JSON.parse(userStr);
    
    // Verificação de segurança no front
    if (!user.is_admin) { 
        alert("Acesso restrito."); 
        window.location.href = "index.html"; 
    } else {
        console.log("Admin logado.");
        initDragAndDrop();
        
        // Inicia carregamento
        carregarTudo();
        ativarListenersFiltros();
    }
}

async function carregarTudo() {
    await renderizarCategorias(); 
    await renderizarDashboard(); // Carrega pedidos e gráficos
    renderizarTabela();          // Carrega produtos
    // Banners e Cupons: Você pode criar tabelas para eles no banco depois
    // Por enquanto deixo placeholders ou comentados para não dar erro
}

// --- 3. DASHBOARD E PEDIDOS (Conectado ao Node.js) ---
async function renderizarDashboard() {
    try {
        const filtroData = document.getElementById('filtro-data-dashboard')?.value || 'total';
        
        // BUSCA DO NODE.JS
        const res = await fetch('http://127.0.0.1:3000/admin/orders');
        todosPedidosCache = await res.json();
        
        // Conversão de ID para string para facilitar busca
        todosPedidosCache = todosPedidosCache.map(p => ({
            ...p, 
            id: String(p.id),
            data: p.data // O backend já manda como 'data' no formato Date string
        }));

        let cats = {}, dias = {}, totalFat = 0, totalVendas = 0;
        const hoje = new Date().toLocaleDateString('pt-BR');
        
        todosPedidosCache.forEach(p => {
            let dataPedido = '-';
            try { if(p.data) dataPedido = new Date(p.data).toLocaleDateString('pt-BR'); } catch(e){}

            if (filtroData === 'hoje' && dataPedido !== hoje) return;

            totalVendas++; 
            totalFat += (parseFloat(p.total) || 0);

            if(p.itens && Array.isArray(p.itens)) {
                p.itens.forEach(i => {
                    const cat = i.categoria || 'Geral';
                    cats[cat] = (cats[cat] || 0) + 1;
                });
            }
            const dStr = dataPedido.slice(0,5); 
            dias[dStr] = (dias[dStr] || 0) + (parseFloat(p.total) || 0);
        });

        document.getElementById('kpi-faturamento').innerText = fmtMoney(totalFat);
        document.getElementById('kpi-vendas').innerText = totalVendas;

        if(document.getElementById('total-estoque-count')) {
            const totalEst = todosProdutosCache.reduce((sum, p) => sum + (parseInt(p.estoque)||0), 0);
            document.getElementById('total-estoque-count').innerText = totalEst;
        }

        desenharGraficos(cats, dias);
        filtrarPedidos(); 

    } catch (error) { console.error("Erro Dashboard:", error); }
}
window.renderizarDashboard = renderizarDashboard;

// --- FILTROS DE PEDIDOS ---
function ativarListenersFiltros() {
    const filtroStatusEl = document.getElementById('filtro-status');
    if(filtroStatusEl) {
        filtroStatusEl.removeEventListener('change', filtrarPedidos);
        filtroStatusEl.addEventListener('change', filtrarPedidos);
    }
}
function normalizarTexto(texto) { if (!texto) return ""; return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

window.filtrarPedidos = () => {
    const filtroStatus = document.getElementById('filtro-status') ? document.getElementById('filtro-status').value : 'Todos';
    const filtroData = document.getElementById('filtro-data-dashboard') ? document.getElementById('filtro-data-dashboard').value : 'total';
    const termoOriginal = document.getElementById('busca-pedido') ? document.getElementById('busca-pedido').value.trim() : '';
    const termoNormalizado = normalizarTexto(termoOriginal);
    const hoje = new Date().toLocaleDateString('pt-BR');

    pedidosFiltrados = todosPedidosCache.filter(p => {
        if (filtroData === 'hoje') {
            let dataPedido = '-';
            try { if(p.data) dataPedido = new Date(p.data).toLocaleDateString('pt-BR'); } catch(e){}
            if (dataPedido !== hoje) return false; 
        }
        const matchStatus = filtroStatus === 'Todos' || (p.status || 'Recebido') === filtroStatus;
        const pNome = normalizarTexto(p.cliente);
        const pId = (p.id || '').toString(); 
        const matchId = pId.toLowerCase().includes(termoOriginal.toLowerCase());
        const matchTexto = pNome.includes(termoNormalizado);
        
        return matchStatus && (matchId || matchTexto);
    });

    paginaAtual = 1;
    renderizarTabelaPedidos();
}

window.mudarPagina = (delta) => {
    const totalPaginas = Math.ceil(pedidosFiltrados.length / itensPorPagina);
    const novaPagina = paginaAtual + delta;
    if(novaPagina >= 1 && novaPagina <= totalPaginas) { paginaAtual = novaPagina; renderizarTabelaPedidos(); }
}

function renderizarTabelaPedidos() {
    const tbody = document.getElementById('tabela-pedidos');
    const infoPage = document.getElementById('page-info');
    if(!tbody) return;

    if(pedidosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-light);">Nenhum pedido encontrado.</td></tr>`;
        if(infoPage) infoPage.innerText = "Pág 0 de 0";
        return;
    }

    const inicio = (paginaAtual - 1) * itensPorPagina;
    const itensPagina = pedidosFiltrados.slice(inicio, inicio + itensPorPagina);
    const totalPaginas = Math.ceil(pedidosFiltrados.length / itensPorPagina);

    tbody.innerHTML = itensPagina.map(p => {
        // ID no PostgreSQL é número, converte pra string pra slice
        const idStr = String(p.id);
        const idCurto = idStr.length > 8 ? idStr.slice(0, 8) : idStr;
        const data = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-';
        const statusAtual = p.status || 'Recebido';
        let corStatus = '#333';
        if(statusAtual === 'Recebido') corStatus = '#f39c12';
        if(statusAtual === 'Enviado') corStatus = '#3498db';
        if(statusAtual === 'Entregue') corStatus = '#2ecc71';
        if(statusAtual === 'Cancelado') corStatus = '#e74c3c';

        return `
        <tr>
            <td><span title="${p.id}" style="cursor:help"><strong>#${idCurto}</strong></span><br><small style="color:#888">${data}</small></td>
            <td><div style="font-weight:600;">${p.cliente || 'Desconhecido'}</div></td>
            <td style="font-weight:bold;">${fmtMoney(p.total || 0)}</td>
            <td>
                <select onchange="window.updateStatus('${p.id}', this.value)" style="padding:5px 10px; border-radius:15px; border:1px solid ${corStatus}; color:${corStatus}; font-weight:600; cursor:pointer; background:transparent;">
                    <option value="Recebido" ${statusAtual==='Recebido'?'selected':''}>Recebido</option>
                    <option value="Enviado" ${statusAtual==='Enviado'?'selected':''}>Enviado</option>
                    <option value="Entregue" ${statusAtual==='Entregue'?'selected':''}>Entregue</option>
                    <option value="Cancelado" ${statusAtual==='Cancelado'?'selected':''}>Cancelado</option>
                </select>
            </td>
            <td><button onclick="window.verDetalhes('${p.id}')" title="Ver Detalhes" style="background:var(--bg-body); color:var(--text-main); border:1px solid var(--border); width:35px; height:35px; border-radius:50%; cursor:pointer;"><i class="fas fa-eye"></i></button></td>
        </tr>`;
    }).join('');

    if(infoPage) infoPage.innerText = `Pág ${paginaAtual} de ${totalPaginas}`;
    document.getElementById('btn-prev-page').disabled = paginaAtual === 1;
    document.getElementById('btn-next-page').disabled = paginaAtual === totalPaginas;
}

window.verDetalhes = (id) => {
    const p = todosPedidosCache.find(x => String(x.id) === String(id));
    if(!p) return;
    const conteudo = document.getElementById('conteudo-detalhes');
    if(conteudo) {
        const itensHtml = (p.itens || []).map(i => `<li>${i.qtd}x ${i.nome} - ${fmtMoney(i.preco)}</li>`).join('');
        conteudo.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h4 style="margin:0;">Info do Pedido #${p.id}</h4>
                <button onclick="window.imprimirPedido('${p.id}')" style="background:#2c3e50; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;"><i class="fas fa-print"></i> Imprimir</button>
            </div>
            <p><strong>Cliente:</strong> ${p.cliente}</p>
            <p><strong>Tel:</strong> ${p.telefone}</p>
            <p><strong>End:</strong> ${p.endereco}, ${p.numero||''} - ${p.bairro||''}</p>
            <p><strong>Cidade:</strong> ${p.cidade}/${p.cep}</p>
            <p><strong>Pagamento:</strong> ${p.pagamento || 'Não info'}</p>
            <hr style="margin:10px 0;">
            <ul>${itensHtml}</ul>
            <p style="text-align:right; font-weight:bold; font-size:18px;">Total: ${fmtMoney(p.total)}</p>
        `;
        document.getElementById('modalDetalhes').style.display = 'flex';
    }
}

window.imprimirPedido = (id) => {
    const p = todosPedidosCache.find(x => String(x.id) === String(id));
    if(!p) return;
    const itensHtml = (p.itens || []).map(i => `<tr><td style="padding:5px; border-bottom:1px solid #eee;">${i.nome}</td><td style="padding:5px; border-bottom:1px solid #eee; text-align:center;">${i.qtd}</td><td style="padding:5px; border-bottom:1px solid #eee; text-align:right;">${fmtMoney(i.preco)}</td></tr>`).join('');
    const conteudoImpressao = `<html><head><title>Pedido #${id}</title><style>body { font-family: monospace; padding: 20px; max-width: 80mm; margin: 0 auto; } h2 { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin: 0 0 10px 0; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; } .info { margin-bottom: 10px; font-size: 12px; line-height: 1.4; } .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 15px; border-top: 2px dashed #000; padding-top: 10px; }</style></head><body><h2>L&stON - Pedido</h2><div class="info"><strong>Data:</strong> ${new Date(p.data).toLocaleDateString()}<br><strong>Cliente:</strong> ${p.cliente}<br><strong>Tel:</strong> ${p.telefone}<br><strong>Endereço:</strong><br>${p.endereco}, ${p.numero || ''}<br>${p.bairro || ''} - ${p.cidade || ''}<br>CEP: ${p.cep || ''}</div><table><thead><tr style="text-align:left;"><th>Item</th><th style="text-align:center;">Qtd</th><th style="text-align:right;">$</th></tr></thead><tbody>${itensHtml}</tbody></table><div class="total">Total: ${fmtMoney(p.total)}</div><p style="text-align:center; font-size:10px; margin-top:20px;">Obrigado pela preferência!</p><script>window.print(); window.onafterprint = function(){ window.close(); }</script></body></html>`;
    const janela = window.open('', '', 'height=600,width=400');
    janela.document.write(conteudoImpressao);
    janela.document.close();
};

window.updateStatus = async (id, novoStatus) => {
    try {
        await fetch(`http://127.0.0.1:3000/admin/orders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });
        
        const item = todosPedidosCache.find(x => String(x.id) === String(id));
        if(item) item.status = novoStatus;
        showToast("Status atualizado!");
        filtrarPedidos();
    } catch(e) { showToast("Erro ao atualizar.", "error"); }
}

window.exportarPedidos = () => {
    let csv = "ID,Data,Cliente,Total,Status\n";
    todosPedidosCache.forEach(p => { csv += `${p.id},${p.data},${p.cliente},${p.total},${p.status}\n`; });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'pedidos.csv';
    a.click();
}

// --- 5. CLIENTES (Sem backend ainda, mantido vazio ou mock) ---
async function renderizarClientes() {
    // Implementar rota /users no backend futuramente para listar todos
    const tbody = document.getElementById('tabela-clientes');
    if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Listagem de clientes via banco em breve.</td></tr>';
}

// --- 6. CATEGORIAS, PRODUTOS E OUTROS ---
async function renderizarCategorias() {
    try {
        // Pega categorias existentes dos produtos (dinâmico)
        const res = await fetch('http://127.0.0.1:3000/categories');
        const cats = await res.json();
        todasCategoriasCache = cats;
        
        const tbody = document.getElementById('tabela-categorias');
        if(tbody) {
            tbody.innerHTML = '';
            todasCategoriasCache.forEach(c => {
                tbody.innerHTML += `<tr><td>${c.nome}</td><td>-</td></tr>`;
            });
        }
        atualizarSelectCategorias();
    } catch(e) { console.warn(e); }
}

function atualizarSelectCategorias() {
    const select = document.getElementById('prod-cat');
    if(!select) return;
    select.innerHTML = '<option value="Geral">Geral</option>';
    todasCategoriasCache.forEach(c => { select.innerHTML += `<option value="${c.nome}">${c.nome}</option>`; });
}

// --- PRODUTOS ---
async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    if(!tbody) return;
    try {
        const res = await fetch('http://127.0.0.1:3000/products');
        todosProdutosCache = await res.json();
        tbody.innerHTML = ''; 
        todosProdutosCache.forEach(p => {
            const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || 'img/no-image.png');
            // ID numérico para string
            const pId = String(p.id);
            tbody.innerHTML += `<tr><td><img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"></td><td>${p.nome}</td><td style="font-weight:bold; color:${(parseInt(p.estoque)||0)<5?'red':'green'}">${p.estoque}</td><td>${fmtMoney(p.preco)}</td><td><i class="fas fa-edit" onclick="window.editarProduto('${pId}')" style="margin-right:10px;cursor:pointer;color:blue;"></i><i class="fas fa-trash" onclick="window.deletarProduto('${pId}')" style="color:red;cursor:pointer;"></i></td></tr>`;
        });
        verificarEstoqueCritico();
    } catch(e) { console.error(e); }
}

window.editarProduto = async (id) => {
    toggleLoading(true);
    try {
        // Busca do cache local para agilidade
        const p = todosProdutosCache.find(x => String(x.id) === String(id));
        if(p) {
            filesToUpload = [];
            document.getElementById('prod-id').value = id;
            document.getElementById('modal-titulo').innerText = "Editar Produto";
            document.getElementById('prod-nome').value = p.nome;
            document.getElementById('prod-preco').value = p.preco;
            document.getElementById('prod-preco-antigo').value = p.preco_original||"";
            document.getElementById('prod-estoque').value = p.estoque;
            atualizarSelectCategorias();
            document.getElementById('prod-cat').value = p.categoria || "Geral";
            document.getElementById('prod-desc').value = p.descricao||"";
            const prev = document.getElementById('preview-container'); prev.innerHTML = "";
            if(p.imagens) p.imagens.forEach(url => prev.innerHTML += `<div class="preview-card"><img src="${url}"><div class="remove-btn" style="background:#555;">x</div></div>`);
            document.getElementById('modalProduto').style.display='flex';
        }
    } catch(e){} finally { toggleLoading(false); }
}

window.deletarProduto = async (id) => { 
    if(confirm("Excluir?")) { 
        await fetch(`http://127.0.0.1:3000/products/${id}`, { method: 'DELETE' });
        renderizarTabela(); 
    } 
}

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
            // --- UPLOAD PARA FIREBASE STORAGE (MANTIDO) ---
            for (const file of filesToUpload) {
                const s = await uploadBytes(ref(storage, `produtos/${Date.now()}_${file.name}`), file);
                urls.push(await getDownloadURL(s.ref));
            }
            
            const dados = { 
                nome, 
                preco:parseFloat(preco), 
                preco_original:document.getElementById('prod-preco-antigo').value?parseFloat(document.getElementById('prod-preco-antigo').value):null, 
                estoque:parseInt(estoque)||0, 
                categoria:document.getElementById('prod-cat').value, 
                descricao:document.getElementById('prod-desc').value 
            };

            // Se for edição e não teve upload novo, mantém as imagens antigas
            if(id) {
                if(urls.length === 0) {
                    const prodAtual = todosProdutosCache.find(p => String(p.id) === String(id));
                    if(prodAtual) urls = prodAtual.imagens || [];
                }
                dados.imagens = urls;
                
                await fetch(`http://127.0.0.1:3000/products/${id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(dados)
                });
            } else { 
                // Criação
                dados.imagens = urls; 
                await fetch('http://127.0.0.1:3000/products', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(dados)
                });
            }
            document.getElementById('modalProduto').style.display='none';
            renderizarTabela(); renderizarDashboard(); showToast("Salvo!");
        } catch(e){ console.error(e); showToast("Erro ao salvar", "error"); } finally { toggleLoading(false); }
    });
}

function showToast(msg, type='success') { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast(); else alert(msg); }
function toggleLoading(show) { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

// --- ARRASTAR E SOLTAR (MANTIDO IGUAL) ---
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
window.removeFile = (i) => { filesToUpload.splice(i, 1); const fs = []; filesToUpload.forEach(f => fs.push(f)); handleFiles(fs); } 

async function verificarEstoqueCritico() {
    const al = document.getElementById('alerta-estoque-container');
    const crit = todosProdutosCache.filter(p => (parseInt(p.estoque)||0) <= 5);
    if(al && crit.length>0) { al.style.display='block'; al.innerHTML=`<div style="background:#fff3cd;padding:10px;border-radius:6px;border-left:4px solid #ffc107;">⚠️ <strong>${crit.length}</strong> produtos com estoque baixo.</div>`; }
    else if(al) al.style.display='none';
}

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

const sections = ['dashboard','produtos','pedidos','categorias','clientes','banners','cupons']; 
sections.forEach(s => {
    const l = document.getElementById(`link-${s}`);
    if(l) l.addEventListener('click', (e) => {
        e.preventDefault();
        sections.forEach(x => {
            document.getElementById(`section-${x}`).style.display='none';
            const ln = document.getElementById(`link-${x}`); if(ln) ln.classList.remove('active');
        });
        document.getElementById(`section-${s}`).style.display='block';
        l.classList.add('active');
    });
});

window.abrirModalProduto = () => { 
    document.getElementById('prod-id').value=""; 
    document.getElementById('modal-titulo').innerText="Novo Produto";
    filesToUpload = []; 
    const prev = document.getElementById('preview-container'); if(prev) prev.innerHTML = "";
    ['prod-nome','prod-preco','prod-preco-antigo','prod-estoque','prod-desc'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
    atualizarSelectCategorias();
    document.getElementById('modalProduto').style.display='flex'; 
}
window.fecharModal = () => document.getElementById('modalProduto').style.display='none';

// Inicializa
checkAuth();