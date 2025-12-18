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

// --- HELPERS ---
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// TEMA
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

window.toggleTheme = () => { 
    const b=document.body; const n=b.getAttribute('data-theme')==='dark'?'light':'dark'; 
    b.setAttribute('data-theme', n); localStorage.setItem('lston_theme', n); 
    document.getElementById('theme-toggle').className=n==='dark'?'fas fa-sun':'fas fa-moon'; 
}

// AUTH
onAuthStateChanged(auth, (user) => { if (user) { currentUserEmail = user.email; document.getElementById('user-name').innerText = user.email.split('@')[0]; } });

// --- FAVORITOS (MODAL) ---
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
    
    // Busca detalhes dos favoritos (limitado a 10 para performance)
    carregarProdutosFavoritos(lista);
}

async function carregarProdutosFavoritos(listaEl) {
    if(favoritos.length === 0) return;
    const idsParaBuscar = favoritos.slice(0, 10);
    const q = query(collection(db, "produtos"), where("__name__", "in", idsParaBuscar));
    const snap = await getDocs(q);
    
    const idsEncontrados = [];
    snap.forEach(d => {
        const item = d.data(); item.id = d.id;
        idsEncontrados.push(item.id);
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

    if(idsEncontrados.length < idsParaBuscar.length) {
        const novosFavoritos = favoritos.filter(id => !idsParaBuscar.includes(id) || idsEncontrados.includes(id));
        favoritos = novosFavoritos;
        localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
        const favCount = document.getElementById('fav-count');
        if(favCount) favCount.innerText = favoritos.length;
    }
}

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
    if(!produtoId) { container.innerHTML = "<p style='text-align:center;padding:50px;'>Produto não encontrado.</p>"; return; }
    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const prod = docSnap.data(); prod.id = docSnap.id;
            renderizarLayoutNovo(prod);
            carregarReviews(produtoId);
            carregarRelacionados(prod.categoria); 
        }
    } catch (e) { console.error(e); }
}

// --- RELACIONADOS ---
async function carregarRelacionados(categoria) {
    if(!categoria || !relatedContainer) return;
    const q = query(collection(db, "produtos"), where("categoria", "==", categoria), limit(5));
    const snap = await getDocs(q);
    relatedContainer.innerHTML = "";
    let count = 0;
    snap.forEach(d => {
        const p = d.data();
        if(d.id !== produtoId && count < 4) { 
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
    
    // Configuração do Link do WhatsApp
    const textoZap = `Olá, tenho interesse no produto *${prod.nome}* que vi no site!`;
    const linkZap = `https://wa.me/5511999999999?text=${encodeURIComponent(textoZap)}`; // Substitua pelo seu número

    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>
            <div class="product-layout">
                <div class="gallery-wrapper"><div class="thumbnails-col">${thumbsHtml}</div><div class="main-image-box"><img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}"></div></div>
                <div class="details-col">
                    <div class="prod-desc-box"><h3>Descrição</h3><p>${prod.descricao || 'Sem descrição.'}</p></div>
                    <div>${priceHtml}</div>
                    <p style="color:${est<5?'#e74c3c':'var(--text-muted)'}; font-weight:bold;">
                        ${est < 5 && est > 0 ? `<i class="fas fa-exclamation-triangle"></i> Restam apenas ${est} unidades!` : `Estoque: ${est} un.`}
                    </p>
                    <div class="detail-qty-selector"><button onclick="alterarQtdDetail(-1)">-</button><input type="text" id="detail-qty" value="1" readonly><button onclick="alterarQtdDetail(1)">+</button></div>
                    
                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    
                    <a href="${linkZap}" target="_blank" class="btn-whatsapp" style="text-decoration:none; margin-top:10px;">
                        <i class="fab fa-whatsapp"></i> Comprar pelo WhatsApp
                    </a>

                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);window.showToast('Link copiado!')" style="margin-top:10px;">Compartilhar Link</button>
                    
                    <div class="shipping-calc"><label style="font-size:14px; font-weight:bold; color:var(--text-color)">Calcular Frete:</label><div class="shipping-input-group"><input type="text" id="calc-cep" placeholder="CEP" maxlength="9" oninput="mascaraCep(this)"><button onclick="calcularFrete()">OK</button></div><div id="frete-res" style="margin-top:10px; font-size:14px; color:var(--text-color);"></div></div>
                </div>
            </div>
        </div>`;
    if(est > 0) document.getElementById('btn-add-cart').addEventListener('click', () => adicionarComQtdPagina(prod, imagens[0]));
}

// --- FUNÇÕES DE CARRINHO ---
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

function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { count.innerText = carrinho.reduce((acc, i) => acc + i.qtd, 0); count.style.display = carrinho.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;
    let subtotal = 0; lista.innerHTML = '';
    if(carrinho.length === 0) lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>';
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco) * item.qtd;
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}<div class="cart-qty-control"><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, -1)">-</button><span class="cart-qty-val">${item.qtd}</span><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, 1)">+</button></div></div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`;
    });
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = window.fmtMoney(subtotal);
}

// Funções de Gestão do Modal de Carrinho
window.alterarQtdCarrinho = (index, delta) => {
    const item = carrinho[index];
    const estoque = parseInt(item.estoque) || 0;
    if (delta > 0 && item.qtd + delta > estoque) { window.showToast("Limite de estoque!", "error"); return; }
    item.qtd += delta;
    if(item.qtd < 1) carrinho.splice(index, 1);
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    atualizarCarrinhoUI();
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { 
    const modal = document.getElementById('carrinho-modal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex'; 
    atualizarCarrinhoUI(); 
}

// Checkout Simplificado
window.irParaCheckout = () => { window.location.href = "index.html"; } 
window.voltarParaCarrinho = () => { document.getElementById('carrinho-modal').style.display='none'; } 
window.aplicarCupom = async () => { window.showToast("Use os cupons na página inicial.", "info"); }
window.confirmarPedido = async () => { window.location.href = "index.html"; }

// Frete da Página
window.calcularFrete = async () => { 
    const cep = document.getElementById('calc-cep').value.replace(/\D/g,''); 
    const res = document.getElementById('frete-res'); 
    if(cep.length !== 8) { res.innerText="CEP inválido"; return; }
    res.innerText = "Calculando..."; 
    try { 
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); 
        const d = await r.json(); 
        if(d.erro) res.innerText="CEP não encontrado"; 
        else res.innerHTML=`Frete para ${d.uf}: R$ 25,00 (Simulação)`; 
    } catch(e){ res.innerText="Erro"; } 
}

// --- REVIEWS ---
window.enviarReview = async () => { 
    const t = document.getElementById('rev-text').value; 
    if(!t) return window.showToast("Escreva algo!", "error"); 
    await addDoc(reviewsCollection, { produtoId, texto:t, nome:document.getElementById('rev-name').value||'Anônimo', stars:document.getElementById('rev-stars').value, data:new Date() }); 
    window.showToast("Enviado!"); document.getElementById('rev-text').value=''; carregarReviews(produtoId); 
}
async function carregarReviews(pid) { 
    const q = query(collection(db,"reviews"),where("produtoId","==",pid)); 
    const s = await getDocs(q); 
    const l = document.getElementById('reviews-list'); l.innerHTML=''; 
    if (s.empty) { l.innerHTML = '<p style="color:var(--text-muted);">Seja o primeiro a avaliar!</p>'; return; }
    s.forEach(d=>{ const r=d.data(); l.innerHTML+=`<div class="review-item"><strong>${r.nome}</strong> (${r.stars}★)<p>${r.texto}</p></div>`; }); 
}

carregarProduto(); atualizarCarrinhoUI(); atualizarFavoritosUI();