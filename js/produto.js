import { db, auth } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// --- PERSISTÊNCIA DE TEMA ---
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

window.toggleTheme = () => {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('lston_theme', newTheme);
    document.getElementById('theme-toggle').className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

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

onAuthStateChanged(auth, (user) => { if (user) { currentUserEmail = user.email; document.getElementById('user-name').innerText = user.email.split('@')[0]; } });

async function carregarProduto() {
    if(!produtoId) { container.innerHTML = "<p style='padding:20px;text-align:center;'>Produto não encontrado.</p>"; return; }
    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const prod = docSnap.data();
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
                    
                    <button id="btn-add-cart" class="btn-buy-big" ${est===0?'disabled':''}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    
                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);window.showToast('Link copiado!')">Compartilhar Link</button>
                    
                    <button onclick="window.open('https://wa.me/5511999999999?text=Olá, interesse no ${prod.nome}', '_blank')" class="btn-whatsapp"><i class="fab fa-whatsapp"></i> Comprar no WhatsApp</button>
                    
                    <div class="shipping-calc">
                        <label style="font-size:14px; font-weight:bold; color:var(--text-color)">Calcular Frete:</label>
                        <div class="shipping-input-group">
                            <input type="text" id="calc-cep" placeholder="CEP" maxlength="8">
                            <button onclick="calcularFrete()">OK</button>
                        </div>
                        <div id="frete-res" style="margin-top:10px; font-size:14px; color:var(--text-color);"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if(est > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            let item = { id: produtoId, img: imagens[0], ...prod };
            carrinho.push(item);
            localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
            window.showToast("Adicionado!");
            atualizarCarrinhoUI();
            window.toggleCarrinho();
        });
    }
}

window.trocarImagem = function(url, elemento) {
    document.getElementById('main-img-display').src = url;
    document.querySelectorAll('.thumb-box').forEach(el => el.style.border = '2px solid #eee');
    elemento.style.border = '2px solid #2c3e50';
}

window.calcularFrete = () => {
    const res = document.getElementById('frete-res');
    res.innerText = "Calculando...";
    setTimeout(() => { res.innerHTML = `Frete Econômico: R$ ${(Math.random()*20+10).toFixed(2)} (5 dias)`; }, 1000);
}

// Funções de Carrinho (Necessárias aqui para o modal funcionar)
function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { count.innerText = carrinho.length; count.style.display = carrinho.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;
    let subtotal = 0; lista.innerHTML = '';
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco);
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px;"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}</div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`;
    });
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = window.fmtMoney(subtotal);
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { document.getElementById('carrinho-modal').style.display = 'flex'; atualizarCarrinhoUI(); }
window.irParaCheckout = () => { document.getElementById('etapa-carrinho').style.display='none'; document.getElementById('etapa-checkout').style.display='flex'; }
window.voltarParaCarrinho = () => { document.getElementById('etapa-checkout').style.display='none'; document.getElementById('etapa-carrinho').style.display='block'; }
window.aplicarCupom = async () => { window.showToast("Cupom indisponível nesta página (vá para home)", "error"); } // Simplificado no produto
window.confirmarPedido = async () => { window.showToast("Finalize na Home", "error"); } // Simplificado
window.buscarCep = async () => { /* ... (igual main) ... */ }

window.enviarReview = async () => {
    const texto = document.getElementById('rev-text').value;
    const stars = document.getElementById('rev-stars').value;
    if(!texto) return window.showToast("Escreva algo!");
    await addDoc(reviewsCollection, { produtoId, texto, stars, data: new Date() });
    window.showToast("Enviado!"); carregarReviews(produtoId);
}
async function carregarReviews(pid) {
    const q = query(reviewsCollection, where("produtoId", "==", pid));
    const snap = await getDocs(q);
    const list = document.getElementById('reviews-list');
    list.innerHTML = '';
    snap.forEach(d => { const r = d.data(); list.innerHTML += `<div class="review-item"><div class="stars">${"★".repeat(r.stars)}</div><p style="color:var(--text-color)">${r.texto}</p></div>`; });
}
async function carregarRelacionados(cat) {
    try {
        const q = query(collection(db, "produtos"), where("categoria", "==", cat || "Geral"), limit(4));
        const qs = await getDocs(q);
        relatedContainer.innerHTML = '';
        qs.forEach((doc) => {
            if (doc.id !== produtoId) {
                const p = doc.data();
                const img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
                relatedContainer.innerHTML += `<div class="product-card"><div class="product-img" style="background-image: url('${img}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${doc.id}'"></div><div><h3 style="color:var(--text-color)">${p.nome}</h3><p style="color:var(--green-color);font-weight:bold;">${window.fmtMoney(p.preco)}</p></div></div>`;
            }
        });
    } catch (e) { }
}

carregarProduto();
atualizarCarrinhoUI();