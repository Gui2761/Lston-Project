import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let todosProdutos = []; 
let desconto = 0;
let currentUserEmail = null;
const container = document.getElementById('products-container');

// --- HELPERS ---
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// --- LÓGICA DE BUSCA APROXIMADA (FUZZY SEARCH) ---
function calcularSimilaridade(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

const campoBusca = document.getElementById('campo-busca');
if (campoBusca) {
    campoBusca.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        if (termo.length < 2) { 
            exibirProdutos(todosProdutos); 
            if(document.getElementById('titulo-secao')) document.getElementById('titulo-secao').innerText = "Destaques";
            return; 
        }
        const filtrados = todosProdutos.filter(p => {
            const nome = p.nome.toLowerCase();
            const cat = (p.categoria || "").toLowerCase();
            if (nome.includes(termo) || cat.includes(termo)) return true;
            if (termo.length > 3) {
                return nome.split(" ").some(palavra => calcularSimilaridade(palavra, termo) > 0.7);
            }
            return false;
        });
        if(document.getElementById('titulo-secao')) document.getElementById('titulo-secao').innerText = `Resultados para: "${e.target.value}"`;
        exibirProdutos(filtrados);
    });
}

// --- TEMA ---
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

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserEmail = user.email;
        const userDisplay = document.getElementById('user-name');
        if(userDisplay) userDisplay.innerText = user.email.split('@')[0];
    }
});

// --- CARROSSEL ---
let slideIndex = 0;
async function carregarBanners() {
    try {
        const q = await getDocs(collection(db, "banners"));
        const c = document.getElementById('slider');
        if (q.empty || !c) return; 
        let h=''; 
        q.forEach(d=>{const b=d.data(); h+=`<div class="slide" style="background-image: url('${b.img}');"><div class="slide-content"><h2>${b.titulo}</h2><p>${b.subtitulo}</p></div></div>`;}); 
        c.innerHTML=h; 
        setInterval(()=>{slideIndex=(slideIndex+1)%q.size;c.style.transform=`translateX(-${slideIndex*100}%)`},5000); 
    } catch(e){} 
}
window.mudarSlide = (n) => { 
    const s = document.querySelectorAll('.slide'); 
    if(s.length) {
        slideIndex = (slideIndex + n + s.length) % s.length; 
        document.getElementById('slider').style.transform = `translateX(-${slideIndex * 100}%)`; 
    }
}

// --- LOJA ---
async function carregarLoja() {
    if(container) container.innerHTML = '<p style="text-align:center;">Carregando...</p>';
    carregarBanners();
    try {
        const q = await getDocs(collection(db, "produtos"));
        todosProdutos = []; 
        q.forEach((doc) => { todosProdutos.push({id:doc.id, ...doc.data()}); });
        if(container) exibirProdutos(todosProdutos);
    } catch (e) { console.error(e); }
}

function exibirProdutos(lista) {
    if(!container) return;
    container.innerHTML = ''; 
    const seteDiasMs = 7 * 24 * 60 * 60 * 1000;
    const agora = new Date().getTime();

    if(lista.length === 0) {
        container.innerHTML = '<p style="text-align:center; width:100%; padding:20px;">Nenhum produto encontrado.</p>';
        return;
    }

    lista.forEach(prod => {
        const card = document.createElement('div'); card.className = 'product-card';
        let capa = (prod.imagens && prod.imagens.length > 0) ? prod.imagens[0] : (prod.img || '');
        const est = parseInt(prod.estoque) || 0;
        
        let priceHtml = `<div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
        let badgeOffHtml = '';
        let leftPos = 10;

        if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
            const off = Math.round(((prod.precoOriginal - prod.preco) / prod.precoOriginal) * 100);
            priceHtml = `<div class="old-price">${window.fmtMoney(prod.precoOriginal)}</div><div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
            badgeOffHtml = `<div class="badge-off" style="left:${leftPos}px">${off}% OFF</div>`;
            leftPos += 70;
        }

        let badgeNewHtml = (prod.dataCriacao && (agora - prod.dataCriacao.seconds * 1000) < seteDiasMs) ? `<div class="badge-new" style="left:${leftPos}px">Novo</div>` : '';
        let stockHtml = (est > 0 && est < 5) ? `<span class="badge-stock">Restam ${est}!</span>` : '';
        const heartClass = favoritos.includes(prod.id) ? 'fas fa-heart fav-btn active' : 'far fa-heart fav-btn';

        card.innerHTML = `${badgeOffHtml} ${badgeNewHtml} <i class="${heartClass}" onclick="toggleFavorito('${prod.id}', this, event)"></i>
            <div class="product-img" style="background-image: url('${capa}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'"></div>
            <div style="width:100%;">
                <h3>${prod.nome}</h3>
                ${stockHtml}
                <div class="price-box">${priceHtml}</div>
                <div class="card-qty-selector">
                    <button class="card-qty-btn" onclick="alterarQtdCard(this, -1)">-</button>
                    <input type="text" class="card-qty-input" value="1" readonly>
                    <button class="card-qty-btn" onclick="alterarQtdCard(this, 1)">+</button>
                </div>
            </div>
            <button class="btn-add" onclick="adicionarComQtd('${prod.id}', this)" ${est===0?'disabled':''}>${est===0?'Esgotado':'Adicionar'}</button>`;
        container.appendChild(card);
    });
}

window.alterarQtdCard = (btn, delta) => {
    const input = btn.parentNode.querySelector('input');
    let val = parseInt(input.value) + delta;
    if(val < 1) val = 1;
    input.value = val;
}

window.adicionarComQtd = (id, btnElement) => {
    const prod = todosProdutos.find(p => p.id === id);
    const card = btnElement.parentElement; 
    const qtyInput = card.querySelector('.card-qty-input');
    const qtd = parseInt(qtyInput.value);
    adicionarAoCarrinho(prod, qtd);
}

function adicionarAoCarrinho(produto, qtd = 1) {
    const estoqueDisponivel = parseInt(produto.estoque) || 0;
    const itemExistente = carrinho.find(p => p.id === produto.id);
    const qtdNoCarrinho = itemExistente ? itemExistente.qtd : 0;
    
    if (qtdNoCarrinho + qtd > estoqueDisponivel) {
        window.showToast(`Estoque insuficiente! Você já tem ${qtdNoCarrinho} no carrinho e o limite é ${estoqueDisponivel}.`, "error");
        return;
    }

    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || '');
    if(itemExistente) {
        itemExistente.qtd += qtd;
    } else {
        carrinho.push({ ...produto, img: capa, qtd: qtd });
    }
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado ao carrinho!");
    atualizarCarrinhoUI();
    window.toggleCarrinho();
}

function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { 
        const totalItens = carrinho.reduce((acc, item) => acc + item.qtd, 0);
        count.innerText = totalItens; 
        count.style.display = totalItens > 0 ? 'block' : 'none'; 
    }
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;

    let subtotal = 0; 
    lista.innerHTML = '';
    if(carrinho.length === 0) lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>';

    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco) * item.qtd;
        lista.innerHTML += `
            <div class="cart-item">
                <div style="display:flex;align-items:center;">
                    <img src="${item.img}">
                    <div class="item-info">
                        <strong>${item.nome}</strong><br>
                        ${window.fmtMoney(item.preco)} cada
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
    
    const total = subtotal - (subtotal * desconto);
    const texto = desconto > 0 ? `De: <s>${window.fmtMoney(subtotal)}</s> Por: ${window.fmtMoney(total)}` : window.fmtMoney(total);
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = texto;
}

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
window.toggleCarrinho = () => { const m = document.getElementById('carrinho-modal'); m.style.display = (m.style.display === 'flex') ? 'none' : 'flex'; if(m.style.display==='flex') atualizarCarrinhoUI(); }
window.filtrarPorPreco = () => { const min = parseFloat(document.getElementById('price-min').value)||0; const max = parseFloat(document.getElementById('price-max').value)||Infinity; exibirProdutos(todosProdutos.filter(p => p.preco >= min && p.preco <= max)); }
window.ordenarProdutos = () => { const t = document.getElementById('sort-select').value; let l = [...todosProdutos]; if(t==='menor') l.sort((a,b)=>a.preco-b.preco); if(t==='maior') l.sort((a,b)=>b.preco-a.preco); exibirProdutos(l); }
window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }
window.toggleFavorito = (id, el, e) => { e.stopPropagation(); if(favoritos.includes(id)) { favoritos = favoritos.filter(f=>f!==id); el.className='far fa-heart fav-btn'; window.showToast("Removido"); } else { favoritos.push(id); el.className='fas fa-heart fav-btn active'; window.showToast("Favoritado!"); } localStorage.setItem('lston_favoritos', JSON.stringify(favoritos)); }
window.filtrarFavoritos = () => { document.getElementById('titulo-secao').innerText="Favoritos"; exibirProdutos(todosProdutos.filter(p=>favoritos.includes(p.id))); }
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
    const endereco = document.getElementById('check-endereco').value;
    if(!nome || !endereco) return window.showToast("Preencha tudo!", "error");
    window.toggleLoading(true);
    try {
        let total = 0; carrinho.forEach(i => total += parseFloat(i.preco) * i.qtd);
        total = total - (total * desconto);
        await addDoc(collection(db, "pedidos"), { cliente: nome, endereco, itens: carrinho, total, data: new Date().toISOString(), status: "Recebido", userEmail: currentUserEmail });
        for (const item of carrinho) {
            const ref = doc(db, "produtos", item.id);
            const nv = (parseInt(item.estoque) || 0) - item.qtd; 
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
        if(!data.erro) { document.getElementById('check-endereco').value = `${data.logradouro}, ${data.bairro}`; document.getElementById('check-cidade').value = `${data.localidade}/${data.uf}`; window.showToast("Endereço encontrado!"); }
    } catch(e) {} finally { window.toggleLoading(false); }
}

carregarLoja(); 
atualizarCarrinhoUI();