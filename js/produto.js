import { db } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');

async function carregarProduto() {
    if(!produtoId) { container.innerHTML = "<p>Produto não encontrado.</p>"; return; }
    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const prod = docSnap.data();
            renderizarLayoutNovo(prod);
            carregarRelacionados(prod.categoria);
        } else { container.innerHTML = "<p>Produto não existe.</p>"; }
    } catch (e) { console.error(e); }
}

function renderizarLayoutNovo(prod) {
    // Tenta pegar a lista de imagens. Se não tiver, usa a antiga ou placeholder
    let imagens = (prod.imagens && prod.imagens.length > 0) ? prod.imagens : [(prod.img || 'https://via.placeholder.com/500')];
    
    // 1. Gera as Miniaturas (Loop)
    let thumbsHtml = '';
    imagens.forEach((url, index) => {
        const activeClass = index === 0 ? 'active' : '';
        thumbsHtml += `<div class="thumb-box ${activeClass}" onclick="trocarImagem('${url}', this)"><img src="${url}"></div>`;
    });

    const estoque = prod.estoque ? parseInt(prod.estoque) : 0;
    const btnDisabled = estoque === 0 ? 'disabled style="background:#ccc; cursor:not-allowed;"' : '';
    const textoBotao = estoque === 0 ? 'Esgotado' : 'Comprar Agora';

    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>

            <div class="product-layout">
                <div class="gallery-wrapper">
                    <div class="thumbnails-col">
                        ${thumbsHtml}
                    </div>
                    
                    <div class="main-image-box">
                        <img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}">
                    </div>
                </div>

                <div class="details-col">
                    <div class="prod-desc-box">
                        <h3 style="margin-bottom:10px;">Descrição do produto</h3>
                        <p>${prod.descricao || 'Sem descrição cadastrada.'}</p>
                    </div>

                    <div>
                        <p style="font-size:14px; color:#777;">Valor à vista:</p>
                        <div class="prod-price-big">R$ ${prod.preco.toFixed(2)}</div>
                    </div>

                    <p style="margin-bottom: 5px;"><strong>Estoque:</strong> ${estoque > 0 ? estoque + ' un.' : '<span style="color:red">Indisponível</span>'}</p>

                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>${textoBotao}</button>
                    
                    <div style="margin-top:20px; font-size:12px; color:#555;">
                        <i class="fas fa-shield-alt"></i> Compra 100% Segura
                    </div>
                </div>
            </div>
        </div>
    `;

    if(estoque > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || [];
            // Usa a primeira imagem como capa no carrinho
            carrinho.push({ id: produtoId, img: imagens[0], ...prod });
            localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
            alert("Produto adicionado ao carrinho!");
            window.location.href = "index.html"; 
        });
    }
}

// Troca a imagem grande ao clicar na miniatura
window.trocarImagem = function(url, elemento) {
    document.getElementById('main-img-display').src = url;
    document.querySelectorAll('.thumb-box').forEach(el => el.classList.remove('active'));
    elemento.classList.add('active');
}

async function carregarRelacionados(cat) {
    try {
        const q = query(collection(db, "produtos"), where("categoria", "==", cat || "Geral"), limit(4));
        const qs = await getDocs(q);
        relatedContainer.innerHTML = '';
        qs.forEach((doc) => {
            if (doc.id !== produtoId) {
                const p = doc.data();
                // Usa a primeira imagem para o card
                const imgCapa = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `<div class="product-img" style="background-image: url('${imgCapa}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${doc.id}'"></div><div><h3>${p.nome}</h3><p style="color:#8bc34a; font-weight:bold;">R$ ${p.preco}</p></div>`;
                relatedContainer.appendChild(card);
            }
        });
    } catch (e) { console.error(e); }
}

carregarProduto();