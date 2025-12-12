import { db } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const reviewsCollection = collection(db, "reviews");

function showToast(msg) { Toastify({ text: msg, style: { background: "#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }

async function carregarProduto() {
    const docRef = doc(db, "produtos", produtoId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const prod = docSnap.data();
        renderizarLayoutNovo(prod);
        carregarReviews(produtoId);
    }
}

function renderizarLayoutNovo(prod) {
    // ... (Lógica de imagens igual ao anterior) ...
    let imagens = prod.imagens || [prod.img || ''];
    let thumbsHtml = ''; 
    imagens.forEach(url => thumbsHtml += `<div class="thumb-box" onclick="trocarImagem('${url}')"><img src="${url}"></div>`);

    let priceHtml = `<div class="prod-price-big">${fmtMoney(prod.preco)}</div>`;
    if(prod.precoOriginal > prod.preco) {
        priceHtml = `<div class="old-price-big">${fmtMoney(prod.precoOriginal)}</div><div class="prod-price-big">${fmtMoney(prod.preco)}</div>`;
    }

    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>
            <div class="product-layout">
                <div class="gallery-wrapper">
                    <div class="thumbnails-col">${thumbsHtml}</div>
                    <div class="main-image-box"><img id="main-img-display" src="${imagens[0]}"></div>
                </div>
                <div class="details-col">
                    <div class="prod-desc-box">${prod.descricao || 'Sem descrição.'}</div>
                    <div>${priceHtml}</div>
                    <button class="btn-buy-big">Adicionar ao Carrinho</button>
                    <button class="btn-share" onclick="compartilharProduto()"><i class="fas fa-share-alt"></i> Compartilhar Link</button>
                </div>
            </div>
        </div>
    `;
    // ... (Listener do botão comprar) ...
}

window.compartilharProduto = () => {
    navigator.clipboard.writeText(window.location.href);
    showToast("Link copiado!");
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
    snap.forEach(d => {
        const r = d.data();
        const s = "★".repeat(r.stars);
        list.innerHTML += `<div class="review-item"><div class="stars">${s}</div><p>${r.texto}</p></div>`;
    });
}

carregarProduto();