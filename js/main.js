import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let todosProdutos = []; 
let desconto = 0;
let currentUserEmail = null;
const container = document.getElementById('products-container');

// UX Helpers
window.showToast = (msg, type='success') => { Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleTheme = () => {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('theme-toggle').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// AUTH
onAuthStateChanged(auth, (user) => {
    const userDisplay = document.getElementById('user-name');
    if (user) {
        currentUserEmail = user.email;
        if(userDisplay) userDisplay.innerText = user.email.split('@')[0];
    } else {
        if(userDisplay) userDisplay.innerText = "Entrar";
    }
});

// BANNERS
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

// PRODUTOS
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
    const seteDiasMs = 7 * 24 * 60 * 60 * 1000;
    const agora = new Date().getTime();

    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'product-card';
        let capa = (prod.imagens && prod.imagens.length > 0) ? prod.imagens[0] : (prod.img || 'https://via.placeholder.com/150');
        const est = parseInt(prod.estoque) || 0;
        
        // De/Por
        let priceHtml = `<div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
        let badgeOffHtml = '';
        let badgeNewHtml = '';
        let leftPos = 10; // Posição inicial para badges na esquerda

        if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
            const off = Math.round(((prod.precoOriginal - prod.preco) / prod.precoOriginal) * 100);
            priceHtml = `<div class="old-price">${window.fmtMoney(prod.precoOriginal)}</div><div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
            badgeOffHtml = `<div class="badge-off" style="left:${leftPos}px">${off}% OFF</div>`;
            leftPos += 70; // Empurra o próximo badge
        }

        // CORREÇÃO: Badge Novo na ESQUERDA (empilhado ou ao lado do OFF)
        if(prod.dataCriacao && (agora - prod.dataCriacao.seconds * 1000) < seteDiasMs) {
            badgeNewHtml = `<div class="badge-new" style="left:${leftPos}px">Novo</div>`;
        }

        let stockHtml = (est > 0 && est < 5) ? `<span class="badge-stock">Restam ${est}!</span>` : '';
        const heartClass = favoritos.includes(prod.id) ? 'fas fa-heart fav-btn active' : 'far fa-heart fav-btn';

        card.innerHTML = `
            ${badgeOffHtml} ${badgeNewHtml}
            <i class="${heartClass}" onclick="toggleFavorito('${prod.id}', this, event)"></i>
            <div class="product-img" style="background-image: url('${capa}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'"></div>
            <div style="width:100%;">
                <h3>${prod.nome}</h3>
                ${stockHtml}
                <div class="price-box">${priceHtml}</div>
            </div>
            <button class="btn-comprar" ${est===0?'disabled':''}>${est===0?'Esgotado':'Adicionar'}</button>
        `;
        container.appendChild(card);
        if(est > 0) card.querySelector('.btn-comprar').addEventListener('click', () => adicionarAoCarrinho(prod));
    });
}

// Filtros e Carrinho
window.filtrarPorPreco = () => {
    const min = parseFloat(document.getElementById('price-min').value) || 0;
    const max = parseFloat(document.getElementById('price-max').value) || Infinity;
    exibirProdutos(todosProdutos.filter(p => p.preco >= min && p.preco <= max));
}
window.ordenarProdutos = () => {
    const tipo = document.getElementById('sort-select').value;
    let l = [...todosProdutos];
    if(tipo === 'menor') l.sort((a,b) => a.preco - b.preco);
    if(tipo === 'maior') l.sort((a,b) => b.preco - a.preco);
    exibirProdutos(l);
}
window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }

window.toggleFavorito = (id, el, e) => {
    e.stopPropagation();
    if(favoritos.includes(id)) { favoritos = favoritos.filter(f => f !== id); el.className = 'far fa-heart fav-btn'; window.showToast("Removido"); }
    else { favoritos.push(id); el.className = 'fas fa-heart fav-btn active'; window.showToast("Favoritado!"); }
    localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
}
window.filtrarFavoritos = () => { document.getElementById('titulo-secao').innerText="Favoritos"; exibirProdutos(todosProdutos.filter(p=>favoritos.includes(p.id))); }

function adicionarAoCarrinho(produto) {
    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || '');
    carrinho.push({ ...produto, img: capa });
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!");
    document.getElementById('cart-count').innerText = carrinho.length;
    document.getElementById('cart-count').style.display = 'block';
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }

function atualizarCarrinhoUI() {
    const lista = document.getElementById('itens-carrinho');
    let subtotal = 0; lista.innerHTML = '';
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco);
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px;"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}</div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`;
    });
    const total = subtotal - (subtotal * desconto);
    const texto = desconto > 0 ? `De: <s>${window.fmtMoney(subtotal)}</s> Por: ${window.fmtMoney(total)}` : window.fmtMoney(total);
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = texto;
}

// CORREÇÃO: Função para fechar carrinho
window.toggleCarrinho = () => { 
    const modal = document.getElementById('carrinho-modal');
    // Alterna entre flex e none
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
        atualizarCarrinhoUI();
    }
}

window.irParaCheckout = () => { document.getElementById('etapa-carrinho').style.display='none'; document.getElementById('etapa-checkout').style.display='flex'; }
window.voltarParaCarrinho = () => { document.getElementById('etapa-checkout').style.display='none'; document.getElementById('etapa-carrinho').style.display='block'; }

window.aplicarCupom = async () => {
    const codigo = document.getElementById('cupom-input').value.toUpperCase();
    window.toggleLoading(true);
    try {
        const q = query(collection(db, "cupons"), where("codigo", "==", codigo));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const cupom = snap.docs[0].data();
            if(cupom.validade && new Date() > new Date(cupom.validade)) window.showToast("Expirado!", "error");
            else { desconto = cupom.desconto / 100; window.showToast(`-${cupom.desconto}% aplicado!`); }
        } else { desconto = 0; window.showToast("Inválido", "error"); }
        atualizarCarrinhoUI();
    } catch(e) { window.showToast("Erro", "error"); } finally { window.toggleLoading(false); }
}

window.confirmarPedido = async () => {
    const nome = document.getElementById('check-nome').value;
    if(!nome) return window.showToast("Preencha tudo!", "error");
    window.toggleLoading(true);
    try {
        let total = 0; carrinho.forEach(i => total += parseFloat(i.preco));
        total = total - (total * desconto);
        await addDoc(collection(db, "pedidos"), { cliente: nome, itens: carrinho, total, data: new Date().toISOString(), status: "Recebido", userEmail: currentUserEmail });
        for (const item of carrinho) {
            const ref = doc(db, "produtos", item.id);
            const nv = parseInt(item.estoque) - 1;
            if (nv >= 0) await updateDoc(ref, { estoque: nv });
        }
        window.showToast("Sucesso!"); carrinho=[]; localStorage.setItem('lston_carrinho', '[]'); atualizarCarrinhoUI(); window.location.href="index.html";
    } catch(e){ window.showToast("Erro", "error"); } finally { window.toggleLoading(false); }
}
window.buscarCep = async () => {
    const cep = document.getElementById('check-cep').value.replace(/\D/g, '');
    if(cep.length !== 8) return;
    window.toggleLoading(true);
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(!data.erro) {
            document.getElementById('check-endereco').value = `${data.logradouro}, ${data.bairro}`;
            document.getElementById('check-cidade').value = `${data.localidade}/${data.uf}`;
            window.showToast("Endereço encontrado!");
        }
    } catch(e) {} finally { window.toggleLoading(false); }
}
window.assinarNews = async () => { const email = document.getElementById('news-email').value; if(email) { await addDoc(collection(db, "newsletter"), { email, data: new Date() }); window.showToast("Inscrito!"); } }

carregarLoja(); atualizarCarrinhoUI();