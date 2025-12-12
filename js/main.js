import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let todosProdutos = []; 
let desconto = 0;
const container = document.getElementById('products-container');

// Helpers
function showToast(msg, type='success') { Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
function toggleLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }

// DARK MODE
window.toggleTheme = () => {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('theme-toggle').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}

// BANNERS DINÂMICOS
let slideIndex = 0;
async function carregarBanners() {
    try {
        const q = await getDocs(collection(db, "banners"));
        const sliderContainer = document.getElementById('slider');
        if (q.empty) return; 
        let html = '';
        q.forEach(d => {
            const b = d.data();
            html += `<div class="slide" style="background-image: url('${b.img}');"><div class="slide-content"><h2>${b.titulo}</h2><p>${b.subtitulo}</p></div></div>`;
        });
        sliderContainer.innerHTML = html;
        iniciarSlider();
    } catch (e) { console.error(e); }
}
function iniciarSlider() {
    const slides = document.querySelectorAll('.slide');
    if(slides.length < 2) return;
    setInterval(() => { slideIndex = (slideIndex + 1) % slides.length; atualizarSlider(); }, 5000);
}
function atualizarSlider() { document.getElementById('slider').style.transform = `translateX(-${slideIndex * 100}%)`; }
window.mudarSlide = (n) => {
    const slides = document.querySelectorAll('.slide');
    slideIndex = (slideIndex + n + slides.length) % slides.length;
    atualizarSlider();
}

// FAVORITOS
window.toggleFavorito = (id, el, e) => {
    e.stopPropagation();
    if(favoritos.includes(id)) {
        favoritos = favoritos.filter(f => f !== id);
        el.className = 'far fa-heart fav-btn';
        showToast("Removido dos favoritos");
    } else {
        favoritos.push(id);
        el.className = 'fas fa-heart fav-btn active';
        showToast("Favoritado!");
    }
    localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
}
window.filtrarFavoritos = () => {
    document.getElementById('titulo-secao').innerText = "Seus Favoritos";
    exibirProdutos(todosProdutos.filter(p => favoritos.includes(p.id)));
}

// CUPONS
window.aplicarCupom = async () => {
    const codigo = document.getElementById('cupom-input').value.toUpperCase();
    toggleLoading(true);
    try {
        const q = query(collection(db, "cupons"), where("codigo", "==", codigo));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const cupom = snap.docs[0].data();
            desconto = cupom.desconto / 100;
            showToast(`Cupom de ${cupom.desconto}% aplicado!`);
        } else { desconto = 0; showToast("Inválido", "error"); }
        atualizarCarrinhoUI();
    } catch(e) { showToast("Erro", "error"); } finally { toggleLoading(false); }
}

// VIACEP
window.buscarCep = async () => {
    const cep = document.getElementById('check-cep').value.replace(/\D/g, '');
    if(cep.length !== 8) return;
    toggleLoading(true);
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(!data.erro) {
            document.getElementById('check-endereco').value = `${data.logradouro}, ${data.bairro}`;
            document.getElementById('check-cidade').value = `${data.localidade}/${data.uf}`;
            showToast("Endereço encontrado!");
        } else showToast("CEP não encontrado", "error");
    } catch(e) { showToast("Erro no CEP", "error"); } finally { toggleLoading(false); }
}

async function carregarLoja() {
    container.innerHTML = '<p style="text-align:center;">Carregando...</p>';
    carregarBanners();
    try {
        const q = await getDocs(collection(db, "produtos"));
        todosProdutos = []; 
        q.forEach((doc) => { todosProdutos.push({ id: doc.id, ...doc.data() }); });
        exibirProdutos(todosProdutos);
    } catch (e) { console.error(e); }
}

function exibirProdutos(lista) {
    container.innerHTML = ''; 
    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'product-card';
        let capa = (prod.imagens && prod.imagens.length > 0) ? prod.imagens[0] : (prod.img || 'https://via.placeholder.com/150');
        const est = parseInt(prod.estoque) || 0;
        
        // DE/POR
        let priceHtml = `<div class="new-price">${fmtMoney(prod.preco)}</div>`;
        let badgeHtml = '';
        if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
            const off = Math.round(((prod.precoOriginal - prod.preco) / prod.precoOriginal) * 100);
            priceHtml = `<div class="old-price">${fmtMoney(prod.precoOriginal)}</div><div class="new-price">${fmtMoney(prod.preco)}</div>`;
            badgeHtml = `<div class="badge-off">${off}% OFF</div>`;
        }
        
        // FAVORITO
        const isFav = favoritos.includes(prod.id);
        const heartClass = isFav ? 'fas fa-heart fav-btn active' : 'far fa-heart fav-btn';

        card.innerHTML = `
            ${badgeHtml}
            <i class="${heartClass}" onclick="toggleFavorito('${prod.id}', this, event)"></i>
            <div class="product-img" style="background-image: url('${capa}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'"></div>
            <div style="width:100%;">
                <h3>${prod.nome}</h3>
                ${(est>0 && est<5) ? `<span class="badge-stock">Restam ${est}</span>` : ''}
                <div class="price-box">${priceHtml}</div>
            </div>
            <button class="btn-comprar" ${est===0?'disabled':''}>${est===0?'Esgotado':'Adicionar'}</button>
        `;
        container.appendChild(card);
        if(est > 0) card.querySelector('.btn-comprar').addEventListener('click', () => adicionarAoCarrinho(prod));
    });
}

// ... (Restante das funções: adicionarAoCarrinho, confirmarPedido, etc. IDÊNTICAS AO ANTERIOR) ...
// Vou incluir as funções essenciais que mudaram para garantir funcionamento:

window.ordenarProdutos = () => {
    const tipo = document.getElementById('sort-select').value;
    let lista = [...todosProdutos];
    if(tipo === 'menor') lista.sort((a,b) => a.preco - b.preco);
    if(tipo === 'maior') lista.sort((a,b) => b.preco - a.preco);
    exibirProdutos(lista);
}

function adicionarAoCarrinho(produto) {
    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || '');
    carrinho.push({ ...produto, img: capa });
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    showToast("Adicionado!");
    document.getElementById('cart-count').innerText = carrinho.length;
    document.getElementById('cart-count').style.display = 'block';
}

function atualizarCarrinhoUI() {
    const lista = document.getElementById('itens-carrinho');
    let subtotal = 0;
    lista.innerHTML = '';
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco);
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px;"><div class="item-info"><strong>${item.nome}</strong><br>${fmtMoney(item.preco)}</div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`;
    });
    const total = subtotal - (subtotal * desconto);
    const textoTotal = desconto > 0 ? `De: <s>${fmtMoney(subtotal)}</s> Por: ${fmtMoney(total)}` : fmtMoney(total);
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = textoTotal;
}

window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { document.getElementById('carrinho-modal').style.display = 'flex'; atualizarCarrinhoUI(); }
window.irParaCheckout = () => { document.getElementById('etapa-carrinho').style.display='none'; document.getElementById('etapa-checkout').style.display='flex'; }
window.voltarParaCarrinho = () => { document.getElementById('etapa-checkout').style.display='none'; document.getElementById('etapa-carrinho').style.display='block'; }
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }
window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }
window.assinarNews = async () => { const email = document.getElementById('news-email').value; if(email) { await addDoc(collection(db, "newsletter"), { email, data: new Date() }); showToast("Inscrito!"); } }

window.confirmarPedido = async () => {
    // (Mesma lógica de pedido do anterior)
    const nome = document.getElementById('check-nome').value;
    if(!nome) return showToast("Preencha tudo", "error");
    toggleLoading(true);
    try {
        let total = 0; carrinho.forEach(i => total += parseFloat(i.preco));
        total = total - (total * desconto);
        await addDoc(collection(db, "pedidos"), { cliente: nome, itens: carrinho, total, data: new Date().toISOString(), status: "Recebido" });
        showToast("Sucesso!"); carrinho=[]; localStorage.setItem('lston_carrinho', '[]'); atualizarCarrinhoUI(); window.location.href="index.html";
    } catch(e){ showToast("Erro", "error"); } finally { toggleLoading(false); }
}

carregarLoja(); atualizarCarrinhoUI();