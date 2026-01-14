// js/produto.js (VERSÃO COMPLETA RESTAURADA - Conectada ao Node.js)

import { db, auth } from "./firebaseConfig.js";
// Mantemos Firestore APENAS para Reviews e Auth (Legado)
import { collection, addDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// --- VARIÁVEIS GLOBAIS ---
const urlParams = new URLSearchParams(window.location.search);
const produtoId = urlParams.get('id');
const container = document.getElementById('product-detail-container');
const relatedContainer = document.getElementById('related-container');
const reviewsCollection = collection(db, "reviews");

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let currentUserEmail = null;
let currentUserId = null;
let desconto = 0;
let freteValor = 0;

// --- TABELA DE FRETE (RESTAURADA) ---
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

// --- HELPERS VISUAIS ---
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// Máscara de Telefone
window.mascaraTel = (el) => {
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    el.value = v;
}
const checkoutTelInput = document.getElementById('check-tel');
if(checkoutTelInput) { checkoutTelInput.addEventListener('input', function() { window.mascaraTel(this); }); }

// TEMA
const savedTheme = localStorage.getItem('lston_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

window.toggleTheme = () => { 
    const b=document.body; const n=b.getAttribute('data-theme')==='dark'?'light':'dark'; 
    b.setAttribute('data-theme', n); localStorage.setItem('lston_theme', n); 
    document.getElementById('theme-toggle').className=n==='dark'?'fas fa-sun':'fas fa-moon'; 
}

// --- AUTHENTICAÇÃO (Híbrida: SQL + Firebase) ---
function checkAuth() {
    // 1. Tenta pegar usuário do Login novo (PostgreSQL)
    const localUser = localStorage.getItem('lston_user');
    if (localUser) {
        const u = JSON.parse(localUser);
        currentUserEmail = u.email;
        currentUserId = u.id; // ID Numérico do SQL
        if(document.getElementById('user-name')) document.getElementById('user-name').innerText = u.nome.split(' ')[0];
    } 
    // 2. Monitora Firebase (caso seja usuário antigo)
    onAuthStateChanged(auth, (user) => { 
        if (user && !localUser) { 
            currentUserEmail = user.email; 
            currentUserId = user.uid;
            if(document.getElementById('user-name')) document.getElementById('user-name').innerText = user.email.split('@')[0]; 
        } 
    });
}
checkAuth();

// --- LOGICA DE FAVORITOS (Mantida) ---
window.toggleFavoritosModal = () => {
    const m = document.getElementById('favoritos-modal');
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
    if(m.style.display === 'flex') atualizarFavoritosUI();
}

window.toggleFavorito = (id, el, e) => { 
    e.stopPropagation(); 
    // Garante compatibilidade de IDs (String vs Numero)
    const idSafe = isNaN(id) ? id : parseInt(id);
    const exists = favoritos.some(f => f == id);

    if(exists) { 
        favoritos = favoritos.filter(f => f != id); 
        if(el) el.className = 'far fa-heart fav-btn'; 
        window.showToast("Removido dos favoritos"); 
    } else { 
        favoritos.push(idSafe); 
        if(el) el.className = 'fas fa-heart fav-btn active'; 
        window.showToast("Favoritado!"); 
    } 
    localStorage.setItem('lston_favoritos', JSON.stringify(favoritos));
    atualizarFavoritosUI();
}

function atualizarFavoritosUI() {
    const favCount = document.getElementById('fav-count');
    if(favCount) { favCount.innerText = favoritos.length; favCount.style.display = favoritos.length > 0 ? 'block' : 'none'; }
    const lista = document.getElementById('itens-favoritos');
    if(!lista) return;
    lista.innerHTML = '';
    if(favoritos.length === 0) { lista.innerHTML = '<p style="text-align:center; padding:20px;">Lista vazia.</p>'; return; }
    
    // Busca produtos para exibir nos favoritos
    // Como agora os IDs podem vir do SQL, fazemos um fetch geral para renderizar (idealmente seria um endpoint específico)
    fetch('http://127.0.0.1:3000/products').then(r=>r.json()).then(todos => {
        const meusFavs = todos.filter(p => favoritos.some(f => f == p.id));
        
        meusFavs.forEach(item => {
            let img = (item.imagens && item.imagens.length > 0) ? item.imagens[0] : (item.img || '');
            lista.innerHTML += `
                <div class="cart-item">
                    <div style="display:flex;align-items:center;">
                        <img src="${img}" style="width:50px;height:50px;object-fit:cover;margin-right:10px;border-radius:4px;">
                        <div><strong>${item.nome}</strong><br>${window.fmtMoney(parseFloat(item.preco))}</div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <i class="fas fa-cart-plus" style="cursor:pointer;color:green;" title="Adicionar" onclick="adicionarComQtdDireto('${item.id}', 1, '${img}', '${item.nome}', ${item.preco}, ${item.estoque})"></i>
                        <i class="fas fa-trash" style="cursor:pointer;color:red;" title="Remover" onclick="window.toggleFavorito('${item.id}', this, event); atualizarFavoritosUI()"></i>
                    </div>
                </div>`;
        });
    });
}

window.adicionarComQtdDireto = (id, qtd, img, nome, preco, estoque) => {
    const itemExistente = carrinho.find(p => p.id == id);
    if (itemExistente && itemExistente.qtd + qtd > estoque) { window.showToast("Estoque insuficiente!", "error"); return; }
    if (qtd > estoque) { window.showToast("Estoque insuficiente!", "error"); return; }
    
    if(itemExistente) { itemExistente.qtd += qtd; } 
    else { carrinho.push({ id, img, nome, preco: parseFloat(preco), estoque, qtd }); }
    
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!"); 
    atualizarCarrinhoUI();
}

// --- CARREGAMENTO DO PRODUTO (MODIFICADO PARA NODE.JS) ---
async function carregarProduto() {
    if(!produtoId) { container.innerHTML = "<p style='text-align:center;padding:50px;'>Produto não encontrado.</p>"; return; }
    
    try {
        // BUSCA DO SEU SERVIDOR LOCAL
        const res = await fetch(`http://127.0.0.1:3000/products/${produtoId}`);
        if(!res.ok) throw new Error("Produto não encontrado");
        
        const prod = await res.json();
        
        // Normalização de dados (Postgres retorna strings às vezes)
        prod.preco = parseFloat(prod.preco);
        prod.estoque = parseInt(prod.estoque);
        
        renderizarLayoutNovo(prod);
        
        // Mantém reviews no Firebase (não migramos isso)
        carregarReviews(produtoId); 
        
        // Busca relacionados (usando o endpoint geral e filtrando)
        carregarRelacionados(prod.categoria); 
        
    } catch (e) { 
        console.error(e); 
        container.innerHTML = "<p style='text-align:center;padding:50px;'>Erro ao carregar produto.</p>";
    }
}

async function carregarRelacionados(categoria) {
    if(!categoria || !relatedContainer) return;
    try {
        const res = await fetch('http://127.0.0.1:3000/products');
        const todos = await res.json();
        
        // Filtra no front
        const rel = todos.filter(p => p.categoria === categoria && String(p.id) !== String(produtoId)).slice(0, 4);
        
        relatedContainer.innerHTML = "";
        if(rel.length === 0) { relatedContainer.innerHTML = "<p>Sem produtos relacionados.</p>"; return; }

        rel.forEach(p => {
            let img = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : (p.img || '');
            relatedContainer.innerHTML += `
                <div class="product-card" style="width:220px; min-width:220px;">
                    <div class="product-img" style="background-image: url('${img}'); height:180px; cursor:pointer;" onclick="window.location.href='produto.html?id=${p.id}'"></div>
                    <div style="padding:10px; text-align:center;">
                        <h4 style="font-size:14px; margin-bottom:5px; height:40px; overflow:hidden;">${p.nome}</h4>
                        <div class="new-price" style="font-size:16px;">${window.fmtMoney(parseFloat(p.preco))}</div>
                        <button class="btn-add" onclick="window.location.href='produto.html?id=${p.id}'" style="margin-top:10px; font-size:12px; padding:8px;">Ver Detalhes</button>
                    </div>
                </div>`;
        });
    } catch(e){ console.error("Erro relacionados:", e); }
}

function renderizarLayoutNovo(prod) {
    let imagens = (prod.imagens && prod.imagens.length > 0) ? prod.imagens : ['https://via.placeholder.com/500'];
    let thumbsHtml = '';
    imagens.forEach((url, index) => {
        const borderStyle = index === 0 ? '2px solid #2c3e50' : '2px solid #eee';
        thumbsHtml += `<div class="thumb-box" style="width:80px;height:80px;background:var(--bg-secondary);margin-bottom:10px;cursor:pointer;border:${borderStyle};display:flex;justify-content:center;align-items:center;" onclick="trocarImagem('${url}', this)"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    });
    
    const est = prod.estoque;
    const btnDisabled = est === 0 ? 'disabled style="background:#ccc;"' : '';
    
    // Link do WhatsApp
    const textoZap = `Olá, tenho interesse no produto *${prod.nome}* que vi no site!`;
    const linkZap = `https://wa.me/5579999999999?text=${encodeURIComponent(textoZap)}`;

    container.innerHTML = `
        <div class="product-page-container">
            <h1 class="prod-title-big">${prod.nome}</h1>
            <div class="product-layout">
                <div class="gallery-wrapper"><div class="thumbnails-col">${thumbsHtml}</div><div class="main-image-box"><img id="main-img-display" src="${imagens[0]}" alt="${prod.nome}"></div></div>
                <div class="details-col">
                    <div class="prod-desc-box"><h3>Descrição</h3><p>${prod.descricao || 'Sem descrição.'}</p></div>
                    <div class="prod-price-big">${window.fmtMoney(prod.preco)}</div>
                    <p style="color:${est<5?'#e74c3c':'var(--text-muted)'}; font-weight:bold;">
                        ${est < 5 && est > 0 ? `<i class="fas fa-exclamation-triangle"></i> Restam apenas ${est} unidades!` : `Estoque: ${est} un.`}
                    </p>
                    <div class="detail-qty-selector"><button onclick="alterarQtdDetail(-1)">-</button><input type="text" id="detail-qty" value="1" readonly><button onclick="alterarQtdDetail(1)">+</button></div>
                    
                    <button id="btn-add-cart" class="btn-buy-big" ${btnDisabled}>${est===0?'Esgotado':'Adicionar ao Carrinho'}</button>
                    
                    <a href="${linkZap}" target="_blank" class="btn-whatsapp" style="text-decoration:none; margin-top:10px;">
                        <i class="fab fa-whatsapp"></i> Comprar pelo WhatsApp
                    </a>

                    <button class="btn-share" onclick="navigator.clipboard.writeText(window.location.href);window.showToast('Link copiado!')" style="margin-top:10px;">Compartilhar Link</button>
                    
                    <div class="shipping-calc"><label style="font-size:14px; font-weight:bold; color:var(--text-color)">Calcular Frete:</label><div class="shipping-input-group"><input type="text" id="calc-cep" placeholder="CEP" maxlength="9" oninput="mascaraCep(this)"><button onclick="calcularFretePagina()">OK</button></div><div id="frete-res" style="margin-top:10px; font-size:14px; color:var(--text-color);"></div></div>
                </div>
            </div>
        </div>`;
        
    if(est > 0) document.getElementById('btn-add-cart').addEventListener('click', () => adicionarComQtdPagina(prod, imagens[0]));
}

// --- FUNÇÕES DE UI E CARRINHO (RESTAURADAS COMPLETO) ---
window.trocarImagem = function(url, elemento) { document.getElementById('main-img-display').src = url; document.querySelectorAll('.thumb-box').forEach(el => el.style.border = '2px solid #eee'); if(elemento) elemento.style.border = '2px solid #2c3e50'; }
window.alterarQtdDetail = (delta) => { const input = document.getElementById('detail-qty'); let val = parseInt(input.value) + delta; if(val < 1) val = 1; input.value = val; }

function adicionarComQtdPagina(prod, img) {
    const qtdInput = document.getElementById('detail-qty');
    const qtd = parseInt(qtdInput.value);
    const itemExistente = carrinho.find(p => p.id == prod.id);
    
    if (itemExistente && itemExistente.qtd + qtd > prod.estoque) { window.showToast(`Estoque insuficiente!`, "error"); return; }
    if (qtd > prod.estoque) { window.showToast(`Estoque insuficiente!`, "error"); return; }
    
    if(itemExistente) { itemExistente.qtd += qtd; } 
    else { carrinho.push({ id: prod.id, img: img, nome: prod.nome, preco: prod.preco, estoque: prod.estoque, qtd: qtd }); }
    
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    window.showToast("Adicionado!"); 
    atualizarCarrinhoUI();
    window.toggleCarrinho();
}

function atualizarCarrinhoUI() {
    const count = document.getElementById('cart-count');
    if(count) { const totalItens = carrinho.reduce((acc, i) => acc + i.qtd, 0); count.innerText = totalItens; count.style.display = totalItens > 0 ? 'block' : 'none'; }
    
    const lista = document.getElementById('itens-carrinho');
    if(!lista) return;
    
    let subtotal = 0; 
    lista.innerHTML = '';
    
    if(carrinho.length === 0) { 
        lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>'; 
        if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = "R$ 0,00"; 
        return; 
    }
    
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

window.alterarQtdCarrinho = (index, delta) => {
    const item = carrinho[index];
    const estoque = parseInt(item.estoque) || 0;
    if (delta > 0 && item.qtd + delta > estoque) { window.showToast("Limite!", "error"); return; }
    item.qtd += delta;
    if(item.qtd < 1) carrinho.splice(index, 1);
    localStorage.setItem('lston_carrinho', JSON.stringify(carrinho));
    atualizarCarrinhoUI();
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { const m = document.getElementById('carrinho-modal'); if(m) { m.style.display = (m.style.display === 'flex') ? 'none' : 'flex'; atualizarCarrinhoUI(); } }

// --- CHECKOUT LOGIC (MANTIDA E CONECTADA AO NODE) ---
window.irParaCheckout = async () => { 
    document.getElementById('etapa-carrinho').style.display='none'; 
    document.getElementById('etapa-checkout').style.display='flex'; 
    
    // Tenta preencher dados do usuário
    if(currentUserId) {
        try {
            // Tenta cache local primeiro (Usuário SQL)
            const localUser = localStorage.getItem('lston_user');
            if(localUser) {
                const u = JSON.parse(localUser);
                if(u.nome) document.getElementById('check-nome').value = u.nome;
                if(u.telefone) document.getElementById('check-tel').value = u.telefone;
                if(u.cep) document.getElementById('check-cep').value = u.cep;
                if(u.endereco) document.getElementById('check-endereco').value = u.endereco;
                if(u.cidade) document.getElementById('check-cidade').value = u.cidade;
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

// Cupom (Ainda usando Firestore pois não criamos tabela de cupons no SQL, mas poderia migrar)
window.aplicarCupom = async () => {
    const input = document.getElementById('cupom-input');
    const codigoDigitado = input.value.trim().toUpperCase();
    if(!codigoDigitado) return window.showToast("Digite um código!", "error");
    window.toggleLoading(true);
    try {
        const cuponsRef = collection(db, "cupons"); // Mantém no Firebase por enquanto
        const q = query(cuponsRef, where("codigo", "==", codigoDigitado));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) { window.toggleLoading(false); return window.showToast("Cupom inválido.", "error"); }
        
        let cupomValido = null;
        querySnapshot.forEach(doc => { cupomValido = doc.data(); });
        
        if(cupomValido.validade) {
            const hoje = new Date();
            const validade = new Date(cupomValido.validade);
            validade.setHours(23, 59, 59);
            if(hoje > validade) { window.toggleLoading(false); return window.showToast("Este cupom venceu!", "error"); }
        }
        
        const percentual = parseFloat(cupomValido.desconto);
        if(percentual > 0) {
            desconto = percentual / 100;
            window.showToast(`Desconto de ${percentual}% aplicado!`, "success");
            input.disabled = true; input.style.borderColor = "green"; input.value += " (Aplicado)";
            atualizarCarrinhoUI();
        }
    } catch (e) { window.showToast("Erro ao validar cupom.", "error"); } finally { window.toggleLoading(false); }
}

// --- CONFIRMAÇÃO DE PEDIDO (AQUI ESTÁ A MUDANÇA PRINCIPAL) ---
window.confirmarPedido = async () => {
    const nome = document.getElementById('check-nome').value;
    const telefone = document.getElementById('check-tel').value;
    const endereco = document.getElementById('check-endereco').value;
    const cidade = document.getElementById('check-cidade').value;
    const cep = document.getElementById('check-cep').value;
    const pagamento = document.getElementById('check-pagamento').value;

    if(!nome || !endereco || !telefone) return window.showToast("Preencha Nome, Endereço e Telefone!", "error");
    const telLimpo = telefone.replace(/\D/g, '');
    if (telLimpo.length < 10 || telLimpo.length > 11) return window.showToast("Telefone inválido!", "error");
    
    let subtotal = 0; carrinho.forEach(i => subtotal += parseFloat(i.preco) * i.qtd);
    const totalFinal = (subtotal - (subtotal * desconto)) + freteValor;
    
    const resumoHtml = carrinho.map(i => `<li style="margin-bottom:5px;">${i.qtd}x ${i.nome} - <b>${window.fmtMoney(i.preco)}</b></li>`).join('');
    
    document.getElementById('carrinho-modal').style.display = 'none';

    const confirmacao = await Swal.fire({
        title: 'Confirmar Pedido?',
        html: `<div style="text-align:left;font-size:14px;"><p><strong>Cliente:</strong> ${nome}</p><p><strong>Tel:</strong> ${telefone}</p><p><strong>End:</strong> ${endereco}</p><hr><ul style="list-style:none;padding:0;">${resumoHtml}</ul><hr><p style="text-align:right;">Total: <strong>${window.fmtMoney(totalFinal)}</strong></p></div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Confirmar'
    });

    if (!confirmacao.isConfirmed) return;

    window.toggleLoading(true);

    try {
        // ENVIANDO PARA O NODE.JS (PostgreSQL)
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
            // Redireciona com ID do pedido
            window.location.href = `sucesso.html?id=${data.orderId}&method=${pagamento}`;
        } else {
            throw new Error(data.error || "Erro desconhecido ao processar pedido.");
        }

    } catch(e) { 
        window.toggleLoading(false);
        Swal.fire('Erro', e.message, 'error');
    }
}

// Frete Visual da Página
window.calcularFretePagina = async () => { 
    const cep = document.getElementById('calc-cep').value.replace(/\D/g,''); 
    const res = document.getElementById('frete-res'); 
    if(cep.length !== 8) { res.innerText="CEP inválido"; return; }
    res.innerText = "Calculando..."; 
    try { 
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); 
        const d = await r.json(); 
        if(d.erro) res.innerText="CEP não encontrado"; 
        else {
            const regra = TABELA_FRETE[d.uf] || TABELA_FRETE['PADRAO'];
            res.innerHTML=`Frete para ${d.uf}: R$ ${regra.base.toFixed(2)} (Prazo: ${regra.prazo})`; 
        }
    } catch(e){ res.innerText="Erro"; } 
}

// --- REVIEWS (MANTIDO FIREBASE) ---
window.enviarReview = async () => { 
    const t = document.getElementById('rev-text').value; 
    if(!t) return window.showToast("Escreva algo!", "error"); 
    await addDoc(reviewsCollection, { 
        produtoId: String(produtoId), // Garante string para compatibilidade
        texto:t, 
        nome:document.getElementById('rev-name').value||'Anônimo', 
        stars:document.getElementById('rev-stars').value, 
        data:new Date() 
    }); 
    window.showToast("Enviado!"); document.getElementById('rev-text').value=''; carregarReviews(produtoId); 
}

async function carregarReviews(pid) { 
    const q = query(reviewsCollection, where("produtoId","==", String(pid))); 
    const s = await getDocs(q); 
    const l = document.getElementById('reviews-list'); 
    if(!l) return;
    l.innerHTML=''; 
    if (s.empty) { l.innerHTML = '<p style="color:var(--text-muted);">Seja o primeiro a avaliar!</p>'; return; }
    s.forEach(d=>{ const r=d.data(); l.innerHTML+=`<div class="review-item"><strong>${r.nome}</strong> (${r.stars}★)<p>${r.texto}</p></div>`; }); 
}

// Inicializa
carregarProduto(); 
atualizarCarrinhoUI(); 
atualizarFavoritosUI();