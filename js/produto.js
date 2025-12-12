import { db } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');

const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');

// 1. Carrega o Produto
async function carregarProduto() {
    if(!produtoId) {
        container.innerHTML = "<p>Produto não encontrado.</p>";
        return;
    }

    try {
        const docRef = doc(db, "produtos", produtoId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const prod = docSnap.data();
            renderizarLayoutNovo(prod);
            carregarRelacionados(prod.categoria);
        } else {
            container.innerHTML = "<p>Produto não existe.</p>";
        }
    } catch (error) {
        console.error("Erro:", error);
    }
}

// 2. Renderiza o Layout "Big Tech"
function renderizarLayoutNovo(prod) {
    const imgUrl = prod.img ? prod.img : 'https://via.placeholder.com/500?text=Sem+Imagem';
    const estoque = prod.estoque ? parseInt(prod.estoque) : 0;
    const btnDisabled = estoque === 0 ? 'disabled style="background:#ccc; cursor:not-allowed;"' : '';
    const textoBotao = estoque === 0 ? 'Esgotado' : 'Comprar Agora';

    // HTML Estruturado igual à imagem de referência
    container.innerHTML = `
        <div class="product-page-container">
            
            <h1 class="prod-title-big">${prod.nome}</h1>

            <div class="product-layout">
                <div class="gallery-wrapper">
                    <div class="thumbnails-col">
                        <div class="thumb-box active" onclick="trocarImagem('${imgUrl}')"><img src="${imgUrl}"></div>
                        <div class="thumb-box" onclick="trocarImagem('${imgUrl}')"><img src="${imgUrl}"></div>
                        <div class="thumb-box" onclick="trocarImagem('${imgUrl}')"><img src="${imgUrl}"></div>
                    </div>
                    
                    <div class="main-image-box">
                        <img id="main-img-display" src="${imgUrl}" alt="${prod.nome}">
                    </div>
                </div>

                <div class="details-col">
                    <div class="prod-desc-box">
                        <h3 style="margin-bottom:10px;">Descrição do produto</h3>
                        <p>${prod.descricao || 'Produto de alta qualidade, selecionado especialmente para você. Confira os detalhes técnicos abaixo.'}</p>
                    </div>

                    <div>
                        <p style="font-size:14px; color:#777;">Valor do produto:</p>
                        <div class="prod-price-big">R$ ${prod.preco.toFixed(2)}</div>
                        <p style="font-size:12px; color:#888;">Em até 12x sem juros</p>
                    </div>

                    <p style="margin-bottom: 5px;"><strong>Estoque:</strong> ${estoque > 0 ? estoque + ' un.' : '<span style="color:red">Indisponível</span>'}</p>

                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>
                        ${textoBotao}
                    </button>
                    
                    <div style="margin-top:10px; font-size:12px; color:#555; display:flex; gap:10px; align-items:center;">
                        <i class="fas fa-shield-alt"></i> Compra Garantida
                        <i class="fas fa-trophy"></i> Qualidade Premium
                    </div>
                </div>
            </div>
        </div>
    `;

    if(estoque > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || [];
            carrinho.push({ id: produtoId, ...prod });
            localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
            alert("Adicionado ao carrinho!");
            window.location.href = "index.html"; 
        });
    }
}

window.trocarImagem = function(url) {
    document.getElementById('main-img-display').src = url;
}

// 3. Relacionados
async function carregarRelacionados(categoria) {
    try {
        const q = query(collection(db, "produtos"), where("categoria", "==", categoria || "Geral"), limit(4));
        const querySnapshot = await getDocs(q);
        relatedContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            if (doc.id !== produtoId) {
                const p = doc.data();
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="product-img" style="background-image: url('${p.img || ''}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${doc.id}'"></div>
                    <div><h3>${p.nome}</h3><p style="color:#8bc34a; font-weight:bold;">R$ ${p.preco}</p></div>
                `;
                relatedContainer.appendChild(card);
            }
        });
    } catch (e) { console.error(e); }
}

carregarProduto();