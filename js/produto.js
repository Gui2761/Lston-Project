import { db, auth } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc, limit, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');
const reviewsCollection = collection(db, "reviews");

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let currentUserEmail = null;

// Helpers
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }
window.toggleTheme = () => { const b=document.body; const n=b.getAttribute('data-theme')==='dark'?'light':'dark'; b.setAttribute('data-theme', n); localStorage.setItem('lston_theme', n); document.getElementById('theme-toggle').className=n==='dark'?'fas fa-sun':'fas fa-moon'; }

const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

onAuthStateChanged(auth, (user) => { if (user) { currentUserEmail = user.email; document.getElementById('user-name').innerText = user.email.split('@')[0]; } });

// --- FAVORITOS (MODAL - Adaptação para a página de produto) ---
window.toggleFavoritosModal = () => {
    const m = document.getElementById('favoritos-modal');
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
    if(m.style.display === 'flex') atualizarFavoritosUI();
}

window.toggleFavorito = (id, el, e) => { 
    e.stopPropagation(); 
    if(favoritos.includes(id)) { 
        favoritos = favoritos.filter(f => f !== id); 
        el.className = 'far fa-heart fav-btn'; 
        window.showToast("Removido dos favoritos"); 
    } else { 
        favoritos.push(id); 
        el.className = 'fas fa-heart fav-btn active'; 
        window.showToast("Favoritado!"); 
    } 
    localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
    atualizarFavoritosUI();
}

function atualizarFavoritosUI() {
    const favCount = document.getElementById('fav-count');
    if(favCount) { favCount.innerText = favoritos.length; favCount.style.display = favoritos.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-favoritos');
    if(!lista) return;
    lista.innerHTML = '';
    if(favoritos.length === 0) { lista.innerHTML = '<p style="text-align:center; padding:20px;">Lista vazia.</p>'; return; }
    
    // Nesta página, não temos "todosProdutos", então buscamos os favoritos no Firestore
    carregarProdutosFavoritos(lista);
}

async function carregarProdutosFavoritos(listaEl) {
    if(favoritos.length === 0) return;
    // Busca até 10 favoritos para não pesar (limitação do 'in')
    const idsParaBuscar = favoritos.slice(0, 10);
    const q = query(collection(db, "produtos"), where("__name__", "in", idsParaBuscar));
    const snap = await getDocs(q);
    
    snap.forEach(d => {
        const item = d.data(); item.id = d.id;
        let img = (item.imagens && item.imagens.length > 0) ? item.imagens[0] : (item.img || '');
        listaEl.innerHTML += `
            <div class="cart-item">
                <div style="display:flex;align-items:center;">
                    <img src="${img}" style="width:50px;height:50px;object-fit:cover;margin-right:10px;border-radius:4px;">
                    <div><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}</div>
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <i class="fas fa-cart-plus" style="cursor:pointer;color:green;" title="Adicionar" onclick="adicionarComQtdDireto('${item.id}', 1, '${img}', '${item.nome}', ${item.preco}, ${item.estoque})"></i>
                    <i class="fas fa-trash" style="cursor:pointer;color:red;" title="Remover" onclick="window.toggleFavorito('${item.id}', this, event); atualizarFavoritosUI()"></i>
                </div>
            </div>`;
    });
}

// Função auxiliar para adicionar direto do modal de favoritos (sem precisar do objeto completo)
window.adicionarComQtdDireto = (id, qtd, img, nome, preco, estoque) => {
    const itemExistente = carrinho.find(p => p.id === id);
    if (itemExistente && itemExistente.qtd + qtd > estoque) { window.showToast("Estoque insuficiente!", "error"); return; }
    if (qtd > estoque) { window.showToast("Estoque insuficiente!", "error"); return; }

    if(itemExistente) { itemExistente.qtd += qtd; } 
    else { carrinho.push({ id, img, nome, preco, estoque, qtd }); }
    
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!"); atualizarCarrinhoUI();
}

// --- PRODUTO PRINCIPAL ---
async function carregarProduto() {
    if(!produtoId) { container.innerHTML = "<p>Produto não encontrado.</p>"; return; }
    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const prod = docSnap.data(); prod.id = docSnap.id;
            renderizarLayoutNovo(prod);
            carregarReviews(produtoId);
            carregarRelacionados(prod.categoria); // Carrega Relacionados
        }
    } catch (e) { console.error(e); }
}

// --- PRODUTOS RELACIONADOS (VENDA CRUZADA) ---
async function carregarRelacionados(categoria) {
    if(!categoria || !relatedContainer) return;
    // Busca produtos da mesma categoria, limita a 4
    const q = query(collection(db, "produtos"), where("categoria", "==", categoria), limit(5));
    const snap = await getDocs(q);
    relatedContainer.innerHTML = "";
    
    let count = 0;
    snap.forEach(d => {
        const p = d.data();
        if(d.id !== produtoId && count < 4) { // Ignora o produto atual e limita a 4
            count++;
            let img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
            relatedContainer.innerHTML += `
                <div class="product-card" style="width:220px; min-width:220px;">
                    <div class="product-img" style="background-image: url('${img}'); height:180px; cursor:pointer;" onclick="window.location.href='produto.html?id=${d.id}'"></div>
                    <div style="padding:10px; text-align:center;">
                        <h4 style="font-size:14px; margin-bottom:5px; height:40px; overflow:hidden;">${p.nome}</h4>
                        <div class="new-price" style="font-size:16px;">${window.fmtMoney(p.preco)}</div>
                        <button class="btn-add" onclick="window.location.href='produto.html?id=${d.id}'" style="margin-top:10px; font-size:12px; padding:8px;">Ver Detalhes</button>
                    </div>
                </div>`;
        }
    });
    
    if(count === 0) relatedContainer.innerHTML = "<p>Sem produtos relacionados.</p>";
}

function renderizarLayoutNovo(prod) {
    let imagens = prod.imagens || [prod.img || 'https://via.placeholder.com/500'];
    let thumbsHtml = '';
    imagens.forEach((url, index) => {
        const borderStyle = index === 0 ? '2px solid #2c3e50' : '2px solid #eee';
        thumbsHtml += `<div class="thumb-box" style="width:80px;height:80px;background:var(--bg-secondary);margin-bottom:10px;cursor:pointer;border:${borderStyle};display:flex;justify-content:center;align-items:center;" onclick="trocarImagem('${url}', this)"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    });
    const est = parseInt(prod.estoque) || 0;
    const btnDisabled = est === 0 ? 'disabled style="background:#ccc;"' : '';
    let priceHtml = `<div class="prod-price-big">${window.fmtMoney(prod.preco)}</div>`;
    
    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>
            <div class="product-layout">
                <div class="gallery-wrapper"><div class="thumbnails-col">${thumbsHtml}</div><div class="main-image-box"><img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}"></div></div>
                <div class="details-col">
                    <div class="prod-desc-box"><h3>Descrição</h3><p>${prod.descricao || 'Sem descrição.'}</p></div>
                    <div>${priceHtml}</div>
                    <p><strong>Estoque:</strong> ${est} un.</p>
                    <div class="detail-qty-selector"><button onclick="alterarQtdDetail(-1)">-</button><input type="text" id="detail-qty" value="1" readonly><button onclick="alterarQtdDetail(1)">+</button></div>
                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);window.showToast('Link copiado!')">Compartilhar Link</button>
                    <div class="shipping-calc"><input type="text" id="calc-cep" placeholder="CEP" oninput="mascaraCep(this)"><button onclick="calcularFrete()">OK</button><div id="frete-res"></div></div>
                </div>
            </div>
        </div>`;
    if(est > 0) document.getElementById('btn-add-cart').addEventListener('click', () => adicionarComQtdPagina(prod, imagens[0]));
}

// --- OUTRAS FUNÇÕES ---
window.trocarImagem = function(url, elemento) { document.getElementById('main-img-display').src = url; document.querySelectorAll('.thumb-box').forEach(el => el.style.border = '2px solid #eee'); if(elemento) elemento.style.border = '2px solid #2c3e50'; }
window.alterarQtdDetail = (delta) => { const input = document.getElementById('detail-qty'); let val = parseInt(input.value) + delta; if(val < 1) val = 1; input.value = val; }
function adicionarComQtdPagina(prod, img) {
    const qtdInput = document.getElementById('detail-qty');
    const qtd = parseInt(qtdInput.value);
    const estoqueDisponivel = parseInt(prod.estoque) || 0;
    const itemExistente = carrinho.find(p => p.id === prod.id);
    const qtdNoCarrinho = itemExistente ? itemExistente.qtd : 0;
    if (qtdNoCarrinho + qtd > estoqueDisponivel) { window.showToast(`Estoque insuficiente!`, "error"); return; }
    if(itemExistente) { itemExistente.qtd += qtd; } else { carrinho.push({ id: prod.id, img: img, ...prod, qtd: qtd }); }
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!"); atualizarCarrinhoUI(); window.toggleCarrinho();
}
function atualizarCarrinhoUI() { const count = document.getElementById('cart-count'); if(count) { count.innerText = carrinho.reduce((acc, i) => acc + i.qtd, 0); count.style.display = carrinho.length > 0 ? 'block' : 'none'; } }
window.toggleCarrinho = () => { document.getElementById('carrinho-modal').style.display = (document.getElementById('carrinho-modal').style.display === 'flex') ? 'none' : 'flex'; atualizarCarrinhoUI(); }
window.irParaCheckout = () => { window.location.href = "index.html"; } 
window.calcularFrete = async () => { const cep = document.getElementById('calc-cep').value.replace(/\D/g,''); const res = document.getElementById('frete-res'); res.innerText = "Calculando..."; try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const d = await r.json(); if(d.erro) res.innerText="CEP inválido"; else res.innerHTML=`Frete para ${d.uf}: R$ 25,00 (Simulação)`; } catch(e){ res.innerText="Erro"; } }
window.enviarReview = async () => { const t = document.getElementById('rev-text').value; if(!t) return window.showToast("Escreva algo!", "error"); await addDoc(reviewsCollection, { produtoId, texto:t, nome:document.getElementById('rev-name').value||'Anônimo', stars:document.getElementById('rev-stars').value, data:new Date() }); window.showToast("Enviado!"); document.getElementById('rev-text').value=''; carregarReviews(produtoId); }
async function carregarReviews(pid) { const q = query(collection(db,"reviews"),where("produtoId","==",pid)); const s = await getDocs(q); const l = document.getElementById('reviews-list'); l.innerHTML=''; s.forEach(d=>{ const r=d.data(); l.innerHTML+=`<div class="review-item"><strong>${r.nome}</strong> (${r.stars}★)<p>${r.texto}</p></div>`; }); }

carregarProduto(); atualizarCarrinhoUI(); atualizarFavoritosUI();