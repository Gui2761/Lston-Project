import { db } from "./firebaseConfig.js";
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore";

const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');

// UX Helpers
function showToast(msg) { Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: "#2c3e50" } }).showToast(); }
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
        } else { container.innerHTML = "<p style='padding:20px;text-align:center;'>Inexistente.</p>"; }
    } catch (e) { console.error(e); }
}

function renderizarLayoutNovo(prod) {
    let imagens = [];
    if (prod.imagens && prod.imagens.length > 0) imagens = prod.imagens;
    else if (prod.img) imagens = [prod.img];
    else imagens = ['https://via.placeholder.com/500?text=Sem+Foto'];

    let thumbsHtml = '';
    imagens.forEach((url, index) => {
        const borderStyle = index === 0 ? '2px solid #2c3e50' : '2px solid #eee';
        thumbsHtml += `<div class="thumb-box" style="width:80px;height:80px;background:#f4f4f4;margin-bottom:10px;cursor:pointer;border:${borderStyle};display:flex;justify-content:center;align-items:center;" onclick="trocarImagem('${url}', this)"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    });

    const est = parseInt(prod.estoque) || 0;
    const btnDisabled = est === 0 ? 'disabled style="background:#ccc;cursor:not-allowed;width:100%;padding:20px;border:none;font-weight:bold;"' : 'style="background:#2c3e50;color:white;width:100%;padding:20px;border:none;font-weight:bold;cursor:pointer;"';

    container.innerHTML = `
        <div class="product-page-container" style="max-width:1200px;margin:0 auto;padding:20px;">
            <h1 class="prod-title-big" style="font-size:32px;margin-bottom:20px;word-wrap:break-word;">${prod.nome}</h1>
            <div class="product-layout" style="display:flex;gap:40px;flex-wrap:wrap;">
                <div class="gallery-wrapper" style="display:flex;gap:15px;flex:1.5;min-width:300px;">
                    <div class="thumbnails-col" style="display:flex;flex-direction:column;">${thumbsHtml}</div>
                    <div class="main-image-box" style="flex:1;background:#fff;border:1px solid #eee;height:500px;display:flex;justify-content:center;align-items:center;overflow:hidden;">
                        <img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}" style="max-width:95%;max-height:95%;object-fit:contain;">
                    </div>
                </div>
                <div class="details-col" style="flex:1;min-width:300px;display:flex;flex-direction:column;gap:20px;">
                    <div class="prod-desc-box">
                        <h3 style="margin-bottom:10px;">Descrição</h3>
                        <p style="color:#555;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;max-width:100%;">${prod.descricao || 'Sem descrição.'}</p>
                    </div>
                    <div><p style="font-size:14px;color:#777;">Preço:</p><div style="font-size:42px;color:#333;font-weight:bold;">${fmtMoney(prod.preco)}</div></div>
                    <p><strong>Estoque:</strong> ${est} un.</p>
                    <button id="btn-add-cart" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    <button onclick="window.open('https://wa.me/5511999999999?text=Olá, tenho interesse no ${prod.nome}', '_blank')" class="btn-whatsapp">
                        <i class="fab fa-whatsapp"></i> Comprar pelo WhatsApp
                    </button>
                </div>
            </div>
        </div>
    `;

    if(est > 0) {
        document.getElementById('btn-add-cart').addEventListener('click', () => {
            let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || [];
            carrinho.push({ id: produtoId, img: imagens[0], ...prod });
            localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
            showToast("Produto adicionado ao carrinho!");
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