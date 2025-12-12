import { db, auth } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');
const reviewsCollection = collection(db, "reviews");

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let currentUserEmail = null;

// Helpers
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// Tema
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
window.toggleTheme = () => { const b=document.body; const n=b.getAttribute('data-theme')==='dark'?'light':'dark'; b.setAttribute('data-theme', n); localStorage.setItem('lston_theme', n); document.getElementById('theme-toggle').className=n==='dark'?'fas fa-sun':'fas fa-moon'; }

onAuthStateChanged(auth, (user) => { if (user) { currentUserEmail = user.email; document.getElementById('user-name').innerText = user.email.split('@')[0]; } });

async function carregarProduto() {
    if(!produtoId) { container.innerHTML = "<p style='padding:20px;text-align:center;'>Produto não encontrado.</p>"; return; }
    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const prod = docSnap.data();
            // Adiciona o ID ao objeto produto
            prod.id = docSnap.id;
            renderizarLayoutNovo(prod);
            carregarRelacionados(prod.categoria);
            carregarReviews(produtoId);
        } else { container.innerHTML = "<p style='padding:20px;text-align:center;'>Inexistente.</p>"; }
    } catch (e) { console.error(e); }
}

function renderizarLayoutNovo(prod) {
    let imagens = prod.imagens || [prod.img || 'https://via.placeholder.com/500'];
    let thumbsHtml = '';
    imagens.forEach((url, index) => {
        const borderStyle = index === 0 ? '2px solid #2c3e50' : '2px solid #eee';
        thumbsHtml += `<div class="thumb-box" style="width:80px;height:80px;background:var(--bg-secondary);margin-bottom:10px;cursor:pointer;border:${borderStyle};display:flex;justify-content:center;align-items:center;" onclick="trocarImagem('${url}', this)"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    });

    const est = parseInt(prod.estoque) || 0;
    const btnDisabled = est === 0 ? 'disabled style="background:#ccc;cursor:not-allowed;width:100%;padding:20px;border:none;font-weight:bold;"' : 'style="background:#2c3e50;color:white;width:100%;padding:20px;border:none;font-weight:bold;cursor:pointer;"';

    let priceHtml = `<div class="prod-price-big">${window.fmtMoney(prod.preco)}</div>`;
    if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
        priceHtml = `<div class="old-price-big">${window.fmtMoney(prod.precoOriginal)}</div><div class="prod-price-big">${window.fmtMoney(prod.preco)}</div>`;
    }

    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>
            <div class="product-layout">
                <div class="gallery-wrapper">
                    <div class="thumbnails-col">${thumbsHtml}</div>
                    <div class="main-image-box"><img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}"></div>
                </div>
                <div class="details-col">
                    <div class="prod-desc-box"><h3>Descrição</h3><p>${prod.descricao || 'Sem descrição.'}</p></div>
                    <div><p style="color:var(--text-muted)">Preço:</p>${priceHtml}</div>
                    <p style="color:var(--text-color)"><strong>Estoque:</strong> ${est} un.</p>
                    
                    <div class="detail-qty-selector">
                        <button onclick="alterarQtdDetail(-1)">-</button>
                        <input type="text" id="detail-qty" value="1" readonly>
                        <button onclick="alterarQtdDetail(1)">+</button>
                    </div>
                    
                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);window.showToast('Link copiado!')">Compartilhar Link</button>
                    <button onclick="window.open('https://wa.me/5511999999999?text=Olá, interesse no ${prod.nome}', '_blank')" class="btn-whatsapp"><i class="fab fa-whatsapp"></i> Comprar no WhatsApp</button>
                    
                    <div class="shipping-calc"><label style="font-size:14px; font-weight:bold; color:var(--text-color)">Calcular Frete:</label><div class="shipping-input-group"><input type="text" id="calc-cep" placeholder="CEP" maxlength="8"><button onclick="calcularFrete()">OK</button></div><div id="frete-res" style="margin-top:10px; font-size:14px; color:var(--text-color);"></div></div>
                </div>
            </div>
        </div>
    `;

    if(est > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            adicionarComQtdPagina(prod, imagens[0]);
        });
    }
}

// LÓGICA DE ADICIONAR COM PROTEÇÃO DE ESTOQUE (DETALHES)
function adicionarComQtdPagina(prod, img) {
    const qtdInput = document.getElementById('detail-qty');
    const qtd = parseInt(qtdInput.value);
    const estoqueDisponivel = parseInt(prod.estoque) || 0;
    
    // Verifica item no carrinho
    const itemExistente = carrinho.find(p => p.id === prod.id);
    const qtdNoCarrinho = itemExistente ? itemExistente.qtd : 0;
    
    if (qtdNoCarrinho + qtd > estoqueDisponivel) {
        window.showToast(`Estoque insuficiente! Limite de ${estoqueDisponivel}.`, "error");
        return;
    }
    
    // Se passou na validação, adiciona
    if(itemExistente) {
        itemExistente.qtd += qtd;
    } else {
        carrinho.push({ id: prod.id, img: img, ...prod, qtd: qtd });
    }
    
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!");
    atualizarCarrinhoUI();
    window.toggleCarrinho();
}

// Alterar número no input da página (sem afetar carrinho ainda)
window.alterarQtdDetail = (delta) => {
    const input = document.getElementById('detail-qty');
    let val = parseInt(input.value) + delta;
    if(val < 1) val = 1;
    input.value = val;
}

// CARRINHO (Cópia necessária da lógica para funcionar nesta página)
function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { count.innerText = carrinho.reduce((acc, i) => acc + i.qtd, 0); count.style.display = carrinho.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;
    let subtotal = 0; lista.innerHTML = '';
    
    if(carrinho.length === 0) lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>';

    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco) * item.qtd;
        lista.innerHTML += `
            <div class="cart-item">
                <div style="display:flex;align-items:center;">
                    <img src="${item.img}">
                    <div class="item-info">
                        <strong>${item.nome}</strong><br>
                        ${window.fmtMoney(item.preco)}
                        <div class="cart-qty-control">
                            <button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, -1)">-</button>
                            <span class="cart-qty-val">${item.qtd}</span>
                            <button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, 1)">+</button>
                        </div>
                    </div>
                </div>
                <i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i>
            </div>`;
    });
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = window.fmtMoney(subtotal);
}

// Alterar Qtd DENTRO do Carrinho (Com proteção)
window.alterarQtdCarrinho = (index, delta) => {
    const item = carrinho[index];
    const estoque = parseInt(item.estoque) || 0;
    
    if (delta > 0 && item.qtd + delta > estoque) {
        window.showToast("Limite de estoque!", "error");
        return;
    }
    
    item.qtd += delta;
    if(item.qtd < 1) carrinho.splice(index, 1);
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    atualizarCarrinhoUI();
}

window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { document.getElementById('carrinho-modal').style.display = (document.getElementById('carrinho-modal').style.display === 'flex') ? 'none' : 'flex'; atualizarCarrinhoUI(); }
window.trocarImagem = function(url, elemento) { document.getElementById('main-img-display').src = url; document.querySelectorAll('.thumb-box').forEach(el => el.style.border = '2px solid #eee'); if(elemento) elemento.style.border = '2px solid #2c3e50'; }
window.calcularFrete = () => { const res = document.getElementById('frete-res'); res.innerText = "Calculando..."; setTimeout(() => { res.innerHTML = `Frete Econômico: R$ ${(Math.random()*20+10).toFixed(2)} (5 dias)`; }, 1000); }
window.enviarReview = async () => { const texto = document.getElementById('rev-text').value; const stars = document.getElementById('rev-stars').value; if(!texto) return window.showToast("Escreva algo!"); await addDoc(reviewsCollection, { produtoId, texto, stars, data: new Date() }); window.showToast("Enviado!"); carregarReviews(produtoId); }
async function carregarReviews(pid) { const q = query(reviewsCollection, where("produtoId", "==", pid)); const snap = await getDocs(q); const list = document.getElementById('reviews-list'); list.innerHTML = ''; snap.forEach(d => { const r = d.data(); list.innerHTML += `<div class="review-item"><div class="stars">${"★".repeat(r.stars)}</div><p style="color:var(--text-color)">${r.texto}</p></div>`; }); }
async function carregarRelacionados(cat) { try { const q = query(collection(db, "produtos"), where("categoria", "==", cat || "Geral"), limit(4)); const qs = await getDocs(q); relatedContainer.innerHTML = ''; qs.forEach((doc) => { if (doc.id !== produtoId) { const p = doc.data(); const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || ''); relatedContainer.innerHTML += `<div class="product-card"><div class="product-img" style="background-image: url('${img}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${doc.id}'"></div><div><h3 style="color:var(--text-color)">${p.nome}</h3><p style="color:var(--green-color);font-weight:bold;">${window.fmtMoney(p.preco)}</p></div></div>`; } }); } catch (e) { } }

carregarProduto();
atualizarCarrinhoUI();