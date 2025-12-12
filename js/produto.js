import { db } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc, limit } from "firebase/firestore";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');
const reviewsCollection = collection(db, "reviews");

function showToast(msg) { Toastify({ text: msg, duration: 3000, style: { background: "#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

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
        thumbsHtml += `<div class="thumb-box" style="width:80px;height:80px;background:#f4f4f4;margin-bottom:10px;cursor:pointer;border:${borderStyle};display:flex;justify-content:center;align-items:center;" onclick="trocarImagem('${url}', this)"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    });

    const est = parseInt(prod.estoque) || 0;
    const btnDisabled = est === 0 ? 'disabled style="background:#ccc;cursor:not-allowed;width:100%;padding:20px;border:none;font-weight:bold;"' : 'style="background:#2c3e50;color:white;width:100%;padding:20px;border:none;font-weight:bold;cursor:pointer;"';

    let priceHtml = `<div class="prod-price-big">${fmtMoney(prod.preco)}</div>`;
    if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
        priceHtml = `<div class="old-price-big">${fmtMoney(prod.precoOriginal)}</div><div class="prod-price-big">${fmtMoney(prod.preco)}</div>`;
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
                    <div><p>Preço:</p>${priceHtml}</div>
                    <p><strong>Estoque:</strong> ${est} un.</p>
                    <button id="btn-add-cart" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);showToast('Link copiado!')">Compartilhar</button>
                    <button onclick="window.open('https://wa.me/5511999999999?text=Olá, interesse no ${prod.nome}', '_blank')" class="btn-whatsapp"><i class="fab fa-whatsapp"></i> Comprar no WhatsApp</button>
                </div>
            </div>
        </div>
    `;

    if(est > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || [];
            carrinho.push({ id: produtoId, img: imagens[0], ...prod });
            localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
            showToast("Produto adicionado!");
            setTimeout(() => window.location.href = "index.html", 800); 
        });
    }
}

window.trocarImagem = function(url, elemento) {
    const mainImg = document.getElementById('main-img-display');
    if(mainImg) mainImg.src = url;
    document.querySelectorAll('.thumb-box').forEach(el => el.style.border = '2px solid #eee');
    if(elemento) elemento.style.border = '2px solid #2c3e50';
}

window.enviarReview = async () => {
    const texto = document.getElementById('rev-text').value;
    const stars = document.getElementById('rev-stars').value;
    if(!texto) return showToast("Escreva algo!");
    await addDoc(reviewsCollection, { produtoId, texto, stars, data: new Date() });
    showToast("Enviado!");
    carregarReviews(produtoId);
}

async function carregarReviews(pid) {
    const q = query(reviewsCollection, where("produtoId", "==", pid));
    const snap = await getDocs(q);
    const list = document.getElementById('reviews-list');
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p>Seja o primeiro a avaliar!</p>'; return; }
    snap.forEach(d => {
        const r = d.data();
        const s = "★".repeat(r.stars);
        list.innerHTML += `<div class="review-item"><div class="stars">${s}</div><p>${r.texto}</p></div>`;
    });
}

async function carregarRelacionados(cat) {
    try {
        const q = query(collection(db, "produtos"), where("categoria", "==", cat || "Geral"), limit(4));
        const qs = await getDocs(q);
        relatedContainer.innerHTML = '';
        qs.forEach((doc) => {
            if (doc.id !== produtoId) {
                const p = doc.data();
                let imgCapa = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || 'https://via.placeholder.com/150');
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `<div class="product-img" style="background-image: url('${imgCapa}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${doc.id}'"></div><div><h3>${p.nome}</h3><p style="color:#8bc34a;font-weight:bold;">${fmtMoney(p.preco)}</p></div>`;
                relatedContainer.appendChild(card);
            }
        });
    } catch (e) { console.error(e); }
}
carregarProduto();