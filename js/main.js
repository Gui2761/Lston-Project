// js/main.js (Versão Final: Backend Node.js)

import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, setDoc, increment, query, where, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// --- 1. CONFIGURAÇÃO INICIAL ---
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) {
    document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// --- 2. VARIÁVEIS GLOBAIS ---
let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || []; 
let todosProdutos = []; 
let desconto = 0; 
let freteValor = 0; 
let currentUserEmail = null;
let currentUserId = null;
const container = document.getElementById('products-container');

// --- 3. TABELA DE FRETE ---
const TABELA_FRETE = {
    'SE': { base: 10.00, adicional: 0.50, prazo: '1-2 dias' },
    'BA': { base: 18.00, adicional: 1.00, prazo: '3-5 dias' },
    'AL': { base: 18.00, adicional: 1.00, prazo: '3-5 dias' },
    'PE': { base: 20.00, adicional: 1.00, prazo: '4-6 dias' },
    'NORDESTE': { base: 22.00, adicional: 1.50, prazo: '5-8 dias' },
    'SP': { base: 30.00, adicional: 2.00, prazo: '7-10 dias' },
    'RJ': { base: 32.00, adicional: 2.00, prazo: '7-10 dias' },
    'SUL': { base: 40.00, adicional: 3.00, prazo: '8-15 dias' },
    'PADRAO': { base: 35.00, adicional: 5.00, prazo: '10-20 dias' }
};

// --- 4. HELPERS ---
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.mascaraTel = (el) => {
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    el.value = v;
}
const checkoutTelInput = document.getElementById('check-tel');
if(checkoutTelInput) { checkoutTelInput.addEventListener('input', function() { window.mascaraTel(this); }); }

window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }
window.toggleTheme = () => { 
    const b = document.body; 
    const n = b.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; 
    b.setAttribute('data-theme', n); 
    localStorage.setItem('lston_theme', n); 
    const icon = document.getElementById('theme-toggle');
    if(icon) icon.className = n === 'dark' ? 'fas fa-sun' : 'fas fa-moon'; 
}

// --- 5. AUTH (Híbrido) ---
onAuthStateChanged(auth, (user) => {
    const localUser = localStorage.getItem('lston_user');
    if (localUser) {
        // Usuário do PostgreSQL (Prioridade)
        const u = JSON.parse(localUser);
        currentUserEmail = u.email;
        currentUserId = u.id; // ID Numérico
        const userDisplay = document.getElementById('user-name');
        if(userDisplay) userDisplay.innerText = u.nome.split(' ')[0];
    } else if (user) {
        // Usuário legado do Firebase
        currentUserEmail = user.email;
        currentUserId = user.uid;
        const userDisplay = document.getElementById('user-name');
        if(userDisplay) userDisplay.innerText = user.email.split('@')[0];
    }
});

// --- 6. LOJA (Busca no Node.js) ---
async function carregarLoja() {
    if(container) container.innerHTML = '<p style="text-align:center; padding: 50px;">Carregando produtos...</p>';
    if(typeof contarVisita === 'function') contarVisita(); 

    // Banners e Categorias (Mantido Firebase por enquanto)
    if(typeof carregarBanners === 'function') carregarBanners().catch(console.error);
    if(typeof carregarMenuCategorias === 'function') carregarMenuCategorias().catch(console.error);

    try {
        const response = await fetch('http://127.0.0.1:3000/products');
        todosProdutos = await response.json();

        if(todosProdutos.length === 0) {
            if(container) container.innerHTML = '<p style="text-align:center;">Nenhum produto cadastrado.</p>';
            return;
        }

        todosProdutos = todosProdutos.map(p => ({
            ...p,
            id: p.id,
            preco: parseFloat(p.preco),
            precoOriginal: p.preco_original ? parseFloat(p.preco_original) : 0,
            imagens: p.imagens || [], 
            estoque: parseInt(p.estoque)
        }));

        // Limpa favoritos fantasmas
        const idsExistentes = todosProdutos.map(p => p.id);
        const totalAntes = favoritos.length;
        favoritos = favoritos.filter(id => idsExistentes.includes(parseInt(id)) || idsExistentes.includes(String(id)));
        
        if(favoritos.length !== totalAntes) localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));

        if(container) exibirProdutos(todosProdutos);
        if(typeof atualizarFavoritosUI === 'function') atualizarFavoritosUI();

    } catch (e) { 
        console.error("Erro loja:", e); 
        if(container) container.innerHTML = '<p style="text-align:center; color:red;">Erro de conexão com o servidor.</p>';
    }
}

async function contarVisita() {
    if(sessionStorage.getItem('lston_visitou')) return;
    try {
        const statsRef = doc(db, "stats", "geral");
        await setDoc(statsRef, { visitas: increment(1) }, { merge: true });
        sessionStorage.setItem('lston_visitou', 'true');
    } catch(e) { }
}

async function carregarMenuCategorias() {
    const navMenu = document.getElementById('nav-menu');
    if(!navMenu) return;
    try {
        const q = await getDocs(collection(db, "categorias"));
        let cats = [];
        q.forEach(d => cats.push(d.data().nome));
        cats.sort();
        let html = `<a href="#" onclick="filtrarCategoria('Todas')" class="active-link">Início</a>`;
        cats.forEach(cat => html += `<a href="#" onclick="filtrarCategoria('${cat}')">${cat}</a>`);
        navMenu.innerHTML = html;
    } catch(e) { navMenu.innerHTML = `<a href="#" onclick="filtrarCategoria('Todas')">Início</a>`; }
}

let slideIndex = 0;
async function carregarBanners() { 
    const c = document.getElementById('slider');
    if (!c) return;
    const q = await getDocs(collection(db, "banners"));
    if (q.empty) { c.innerHTML = '<div class="slide" style="background:#2c3e50;display:flex;justify-content:center;align-items:center;color:white;"><h2>Bem-vindo à L&stON</h2></div>'; return; }
    let h=''; 
    q.forEach(d=>{ const b=d.data(); h+=`<div class="slide" style="background-image: url('${b.img}');"><div class="slide-content"><h2>${b.titulo}</h2><p>${b.subtitulo}</p></div></div>`; }); 
    c.innerHTML=h; 
    if(q.size > 1) { setInterval(()=>{ slideIndex = (slideIndex + 1) % q.size; c.style.transform = `translateX(-${slideIndex * 100}%)`; }, 5000); }
}
window.mudarSlide = (n) => { const s = document.querySelectorAll('.slide'); if(s.length > 0) { slideIndex = (slideIndex + n + s.length) % s.length; document.getElementById('slider').style.transform = `translateX(-${slideIndex * 100}%)`; } }

// --- UI PRODUTOS ---
function exibirProdutos(lista) {
    if(!container) return;
    container.innerHTML = ''; 
    if(lista.length === 0) { container.innerHTML = '<p style="text-align:center; width:100%; padding:20px;">Nenhum produto encontrado.</p>'; return; }
    
    lista.forEach(prod => {
        const card = document.createElement('div'); card.className = 'product-card';
        let capa = (prod.imagens && prod.imagens.length > 0) ? prod.imagens[0] : (prod.img || '');
        const est = parseInt(prod.estoque) || 0;
        
        let priceHtml = `<div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
        let badgeHtml = '';

        if(prod.precoOriginal && prod.precoOriginal > prod.preco) {
            priceHtml = `<div class="old-price">${window.fmtMoney(prod.precoOriginal)}</div><div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
            const pct = Math.round(((prod.precoOriginal - prod.preco) / prod.precoOriginal) * 100);
            badgeHtml += `<span class="badge-off" style="position:absolute; top:10px; left:10px; background:#e74c3c; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; z-index:2;">-${pct}% OFF</span>`;
        }
        if(est > 0 && est < 5) {
             const topPos = badgeHtml ? '35px' : '10px';
             badgeHtml += `<span class="badge-stock" style="position:absolute; top:${topPos}; left:10px; background:#f39c12; color:white; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:bold; z-index:2;">ÚLTIMAS UNIDADES</span>`;
        }
        const heartClass = favoritos.includes(prod.id) ? 'fas fa-heart fav-btn active' : 'far fa-heart fav-btn';
        
        card.innerHTML = `
            ${badgeHtml}
            <i class="${heartClass}" onclick="toggleFavorito('${prod.id}', this, event)"></i>
            <div class="product-img" style="background-image: url('${capa}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'"></div>
            <div style="width:100%;">
                <h3 title="${prod.nome}">${prod.nome}</h3>
                <div class="price-box">${priceHtml}</div>
                <div class="card-qty-selector">
                    <button class="card-qty-btn" onclick="alterarQtdCard(this, -1)">-</button>
                    <input type="text" class="card-qty-input" value="1" readonly>
                    <button class="card-qty-btn" onclick="alterarQtdCard(this, 1)">+</button>
                </div>
            </div>
            <button class="btn-add" onclick="adicionarComQtd('${prod.id}', this)" ${est===0?'disabled':''}>
                ${est===0?'Esgotado <i class="far fa-sad-tear"></i>':'Adicionar <i class="fas fa-cart-plus"></i>'}
            </button>`;
        container.appendChild(card);
    });
}

// --- FAVORITOS ---
window.toggleFavoritosModal = () => { const m = document.getElementById('favoritos-modal'); if(m) { m.style.display = (m.style.display === 'flex') ? 'none' : 'flex'; if(m.style.display === 'flex') atualizarFavoritosUI(); } }
window.toggleFavorito = (id, el, e) => { 
    e.stopPropagation(); 
    const idNum = parseInt(id) || id;
    const exists = favoritos.some(f => f == id);
    if(exists) { favoritos = favoritos.filter(f => f != id); if(el) el.className = 'far fa-heart fav-btn'; window.showToast("Removido dos favoritos"); } 
    else { favoritos.push(idNum); if(el) el.className = 'fas fa-heart fav-btn active'; window.showToast("Favoritado!"); } 
    localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
    atualizarFavoritosUI();
}
function atualizarFavoritosUI() {
    const favCount = document.getElementById('fav-count');
    if(favCount) { favCount.innerText = favoritos.length; favCount.style.display = favoritos.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-favoritos');
    if(!lista) return;
    lista.innerHTML = '';
    if(favoritos.length === 0) { lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Sua lista de desejos está vazia.</p>'; return; }
    const produtosFav = todosProdutos.filter(p => favoritos.some(f => f == p.id));
    produtosFav.forEach(item => {
        let img = (item.imagens && item.imagens.length > 0) ? item.imagens[0] : (item.img || '');
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px;"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}</div></div><div style="display:flex; gap:10px; align-items:center;"><i class="fas fa-cart-plus" title="Mover para Carrinho" style="cursor:pointer; color:var(--green-color);" onclick="adicionarAoCarrinho(todosProdutos.find(p=>p.id=='${item.id}'))"></i><i class="fas fa-trash" title="Remover" style="cursor:pointer; color:var(--danger-color);" onclick="window.toggleFavorito('${item.id}', null, event); atualizarFavoritosUI(); if(window.carregarLoja) window.carregarLoja();"></i></div></div>`;
    });
}

// --- CARRINHO ---
window.alterarQtdCard = (btn, delta) => { const input = btn.parentNode.querySelector('input'); let val = parseInt(input.value) + delta; if(val < 1) val = 1; input.value = val; }
window.adicionarComQtd = (id, btnElement) => { const prod = todosProdutos.find(p => p.id == id); if(!prod) return; const card = btnElement.parentElement; const qtyInput = card.querySelector('.card-qty-input'); const qtd = parseInt(qtyInput.value); adicionarAoCarrinho(prod, qtd); }
function adicionarAoCarrinho(produto, qtd = 1) {
    if(!produto) return;
    const estoqueDisponivel = parseInt(produto.estoque) || 0;
    const itemExistente = carrinho.find(p => p.id == produto.id);
    const qtdNoCarrinho = itemExistente ? itemExistente.qtd : 0;
    if (qtdNoCarrinho + qtd > estoqueDisponivel) { window.showToast(`Estoque insuficiente!`, "error"); return; }
    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || '');
    if(itemExistente) { itemExistente.qtd += qtd; } else { carrinho.push({ ...produto, img: capa, qtd: qtd }); }
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!"); atualizarCarrinhoUI(); window.toggleCarrinho();
}
function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { const totalItens = carrinho.reduce((acc, i) => acc + i.qtd, 0); count.innerText = totalItens; count.style.display = totalItens > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;
    let subtotal = 0; lista.innerHTML = '';
    if(carrinho.length === 0) { lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>'; if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = "R$ 0,00"; return; }
    
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco) * item.qtd;
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}<div class="cart-qty-control"><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, -1)">-</button><span class="cart-qty-val">${item.qtd}</span><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, 1)">+</button></div></div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`;
    });

    let total = subtotal - (subtotal * desconto); 
    total += freteValor;
    let textoTotal = `Total: ${window.fmtMoney(total)}`;
    if(freteValor > 0) textoTotal += ` <br><small>(c/ frete)</small>`;
    if(desconto > 0) textoTotal += ` <br><small style="color:var(--green-color);">(-${desconto*100}% cupom)</small>`;
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = textoTotal;
}
window.alterarQtdCarrinho = (index, delta) => { const item = carrinho[index]; const estoque = parseInt(item.estoque) || 0; if (delta > 0 && item.qtd + delta > estoque) { window.showToast("Limite!", "error"); return; } item.qtd += delta; if(item.qtd < 1) carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { const m = document.getElementById('carrinho-modal'); if(m) { m.style.display = (m.style.display === 'flex') ? 'none' : 'flex'; atualizarCarrinhoUI(); } }

window.irParaCheckout = async () => { 
    document.getElementById('etapa-carrinho').style.display='none'; 
    document.getElementById('etapa-checkout').style.display='flex'; 
    if(currentUserId) {
        try {
            const localUser = JSON.parse(localStorage.getItem('lston_user'));
            if(localUser) {
                 if(localUser.nome) document.getElementById('check-nome').value = localUser.nome;
                 if(localUser.telefone) document.getElementById('check-tel').value = localUser.telefone;
                 if(localUser.cep) document.getElementById('check-cep').value = localUser.cep;
                 if(localUser.endereco) {
                     let endCompleto = localUser.endereco;
                     if(localUser.numero) endCompleto += `, ${localUser.numero}`;
                     if(localUser.bairro) endCompleto += ` - ${localUser.bairro}`;
                     document.getElementById('check-endereco').value = endCompleto;
                 }
                 if(localUser.cidade) document.getElementById('check-cidade').value = localUser.cidade;
            }
        } catch(e) {}
    }
}
window.voltarParaCarrinho = () => { document.getElementById('etapa-checkout').style.display='none'; document.getElementById('etapa-carrinho').style.display='block'; }
window.buscarCep = async () => { 
    const cep = document.getElementById('check-cep').value.replace(/\D/g, ''); 
    if(cep.length !== 8) return window.showToast("CEP inválido"); 
    window.toggleLoading(true); 
    try { 
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`); 
        const data = await res.json(); 
        if(!data.erro) { document.getElementById('check-endereco').value = `${data.logradouro}, ${data.bairro}`; document.getElementById('check-cidade').value = `${data.localidade}/${data.uf}`; window.showToast("Encontrado!"); } 
    } catch(e) {} finally { window.toggleLoading(false); } 
}
window.calcularFreteCarrinho = async () => {
    const cepEl = document.getElementById('cart-cep-input');
    const resultDiv = document.getElementById('cart-frete-result');
    if(!cepEl) return;
    const cep = cepEl.value.replace(/\D/g, '');
    if (cep.length !== 8) { resultDiv.innerText = "CEP inválido."; return; }
    resultDiv.innerText = "Calculando..."; window.toggleLoading(true);
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(data.erro) { resultDiv.innerText = "CEP não encontrado."; } 
        else {
            const uf = data.uf;
            let regra = TABELA_FRETE[uf];
            if(!regra) { if(['PR','SC','RS'].includes(uf)) regra = TABELA_FRETE['SUL']; else if(['MA','CE','RN','PB','PI'].includes(uf)) regra = TABELA_FRETE['NORDESTE']; else regra = TABELA_FRETE['PADRAO']; }
            const qtd = carrinho.reduce((acc, i) => acc + i.qtd, 0);
            freteValor = regra.base + (regra.adicional * Math.max(0, qtd-1));
            resultDiv.innerHTML = `Frete ${uf}: ${window.fmtMoney(freteValor)} <small>(${regra.prazo})</small>`;
            localStorage.setItem('lston_cep', cep);
            atualizarCarrinhoUI();
        }
    } catch(e){ resultDiv.innerText = "Erro."; } finally { window.toggleLoading(false); }
}

// --- CUPOM (Firebase por enquanto) ---
window.aplicarCupom = async () => {
    const input = document.getElementById('cupom-input');
    const codigoDigitado = input.value.trim().toUpperCase();
    if(!codigoDigitado) return window.showToast("Digite um código!", "error");
    window.toggleLoading(true);
    try {
        const q = query(collection(db, "cupons"), where("codigo", "==", codigoDigitado));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { window.toggleLoading(false); return window.showToast("Cupom inválido.", "error"); }
        let cupomValido = null; querySnapshot.forEach(doc => { cupomValido = doc.data(); });
        if(cupomValido.validade) {
            const hoje = new Date(); const validade = new Date(cupomValido.validade); validade.setHours(23, 59, 59);
            if(hoje > validade) { window.toggleLoading(false); return window.showToast("Este cupom venceu!", "error"); }
        }
        const percentual = parseFloat(cupomValido.desconto);
        if(percentual > 0) {
            desconto = percentual / 100; window.showToast(`Desconto de ${percentual}% aplicado!`, "success");
            input.disabled = true; input.style.borderColor = "green"; input.value += " (Aplicado)"; atualizarCarrinhoUI();
        }
    } catch (e) { console.error(e); window.showToast("Erro ao validar cupom.", "error"); } finally { window.toggleLoading(false); }
}

// --- CHECKOUT NOVO (VIA NODE.JS) ---
window.confirmarPedido = async () => {
    const nome = document.getElementById('check-nome').value;
    const telefone = document.getElementById('check-tel').value;
    const endereco = document.getElementById('check-endereco').value;
    const cidade = document.getElementById('check-cidade').value;
    const cep = document.getElementById('check-cep').value;
    const pagamento = document.getElementById('check-pagamento').value;

    if(!nome || !endereco || !telefone) return window.showToast("Preencha Nome, Endereço e Telefone!", "error");
    
    let subtotal = 0; carrinho.forEach(i => subtotal += parseFloat(i.preco) * i.qtd);
    const totalFinal = (subtotal - (subtotal * desconto)) + freteValor;
    
    document.getElementById('carrinho-modal').style.display = 'none';

    const confirmacao = await Swal.fire({
        title: 'Confirmar Pedido?',
        text: `Total: ${window.fmtMoney(totalFinal)}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Confirmar'
    });

    if (!confirmacao.isConfirmed) return;

    window.toggleLoading(true);

    try {
        // --- ENVIA PARA O SERVIDOR NODE.JS ---
        const response = await fetch('http://127.0.0.1:3000/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                cliente_nome: nome,
                total: totalFinal,
                frete_valor: freteValor,
                metodo_pagamento: pagamento,
                endereco_entrega: { rua: endereco, cidade, cep, telefone },
                itens: carrinho
            })
        });

        const data = await response.json();

        if (response.ok) {
            carrinho=[]; 
            localStorage.setItem('lston_carrinho', '[]'); 
            atualizarCarrinhoUI(); 
            window.location.href = `sucesso.html?id=${data.orderId}&method=${pagamento}`;
        } else {
            throw new Error(data.error || "Erro desconhecido.");
        }

    } catch(e) { 
        window.toggleLoading(false);
        console.error(e);
        Swal.fire('Erro', e.message, 'error');
    }
}

// Inicializa
carregarLoja(); 
atualizarCarrinhoUI();
window.assinarNews = async () => { const email = document.getElementById('news-email').value; if(email) { await addDoc(collection(db, "newsletter"), { email, data: new Date() }); window.showToast("Inscrito!"); } }