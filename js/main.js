import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, query, where, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let favoritos = JSON.parse(localStorage.getItem('lston_favoritos')) || [];
let todosProdutos = []; 
let desconto = 0;
let freteValor = 0; 
let currentUserEmail = null;
let currentUserId = null;
const container = document.getElementById('products-container');

// --- TABELA DE FRETE ---
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

// --- HELPERS E MÁSCARAS ---
window.showToast = (msg, type='success') => { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#e74c3c":"#2c3e50" } }).showToast(); else alert(msg); }
window.fmtMoney = (val) => { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
window.toggleLoading = (show) => { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }
window.mascaraCep = (el) => { el.value = el.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"); };

// Máscara de Telefone (Formata (XX) XXXXX-XXXX e bloqueia letras)
window.mascaraTel = (el) => {
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    el.value = v;
}
const checkoutTelInput = document.getElementById('check-tel');
if(checkoutTelInput) checkoutTelInput.addEventListener('input', function() { window.mascaraTel(this); });

window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserEmail = user.email;
        currentUserId = user.uid;
        const userDisplay = document.getElementById('user-name');
        if(userDisplay) userDisplay.innerText = user.email.split('@')[0];
    }
});

// --- FAVORITOS (NOVO: MODAL) ---
window.toggleFavoritosModal = () => {
    const m = document.getElementById('favoritos-modal');
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
    if(m.style.display === 'flex') atualizarFavoritosUI();
}

window.toggleFavorito = (id, el, e) => { 
    e.stopPropagation(); 
    if(favoritos.includes(id)) { 
        favoritos = favoritos.filter(f => f !== id); 
        el.className = 'far fa-heart fav-btn'; 
        window.showToast("Removido"); 
    } else { 
        favoritos.push(id); 
        el.className = 'fas fa-heart fav-btn active'; 
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
    
    // Filtra da lista geral de produtos
    const produtosFav = todosProdutos.filter(p => favoritos.includes(p.id));
    produtosFav.forEach(item => {
        let img = (item.imagens && item.imagens.length > 0) ? item.imagens[0] : (item.img || '');
        lista.innerHTML += `
            <div class="cart-item">
                <div style="display:flex;align-items:center;">
                    <img src="${img}" style="width:50px;height:50px;object-fit:cover;margin-right:10px;border-radius:4px;">
                    <div><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}</div>
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <i class="fas fa-cart-plus" style="cursor:pointer;color:green;" title="Mover para Carrinho" onclick="adicionarAoCarrinho(todosProdutos.find(p=>p.id=='${item.id}'))"></i>
                    <i class="fas fa-trash" style="cursor:pointer;color:red;" title="Remover" onclick="window.toggleFavorito('${item.id}', this, event)"></i>
                </div>
            </div>`;
    });
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
        atualizarFavoritosUI();
    } catch (e) { console.error(e); }
}

function exibirProdutos(lista) {
    if(!container) return;
    container.innerHTML = ''; 
    if(lista.length === 0) { container.innerHTML = '<p style="text-align:center; width:100%; padding:20px;">Nenhum produto encontrado.</p>'; return; }
    lista.forEach(prod => {
        const card = document.createElement('div'); card.className = 'product-card';
        let capa = (prod.imagens && prod.imagens.length > 0) ? prod.imagens[0] : (prod.img || '');
        const est = parseInt(prod.estoque) || 0;
        let priceHtml = `<div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
        if(prod.precoOriginal && prod.precoOriginal > prod.preco) priceHtml = `<div class="old-price">${window.fmtMoney(prod.precoOriginal)}</div><div class="new-price">${window.fmtMoney(prod.preco)}</div>`;
        const heartClass = favoritos.includes(prod.id) ? 'fas fa-heart fav-btn active' : 'far fa-heart fav-btn';
        card.innerHTML = `<i class="${heartClass}" onclick="toggleFavorito('${prod.id}', this, event)"></i><div class="product-img" style="background-image: url('${capa}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'"></div><div style="width:100%;"><h3>${prod.nome}</h3><div class="price-box">${priceHtml}</div><div class="card-qty-selector"><button class="card-qty-btn" onclick="alterarQtdCard(this, -1)">-</button><input type="text" class="card-qty-input" value="1" readonly><button class="card-qty-btn" onclick="alterarQtdCard(this, 1)">+</button></div></div><button class="btn-add" onclick="adicionarComQtd('${prod.id}', this)" ${est===0?'disabled':''}>${est===0?'Esgotado':'Adicionar'}</button>`;
        container.appendChild(card);
    });
}

// --- CHECKOUT ---
window.irParaCheckout = async () => { 
    document.getElementById('etapa-carrinho').style.display='none'; 
    document.getElementById('etapa-checkout').style.display='flex'; 
    if(currentUserId) {
        try {
            const docRef = doc(db, "users", currentUserId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const dados = docSnap.data();
                if(dados.nome) document.getElementById('check-nome').value = dados.nome;
                if(dados.telefone) {
                    const telField = document.getElementById('check-tel');
                    telField.value = dados.telefone;
                    window.mascaraTel(telField);
                }
                if(dados.cep) document.getElementById('check-cep').value = dados.cep;
                if(dados.endereco) document.getElementById('check-endereco').value = `${dados.endereco}, ${dados.numero || ''} - ${dados.bairro || ''}`;
                if(dados.cidade) document.getElementById('check-cidade').value = dados.cidade;
            }
        } catch(e) {}
    }
}

// --- CONFIRMAR PEDIDO (VERIFICAÇÃO DUPLA) ---
window.confirmarPedido = async () => {
    const nome = document.getElementById('check-nome').value;
    const telefone = document.getElementById('check-tel').value;
    const endereco = document.getElementById('check-endereco').value;
    const cidade = document.getElementById('check-cidade').value;
    const cep = document.getElementById('check-cep').value;
    const pagamento = document.getElementById('check-pagamento').value;

    if(!nome || !endereco || !telefone) return window.showToast("Preencha Nome, Endereço e Telefone!", "error");
    
    // Validação de Telefone
    const telLimpo = telefone.replace(/\D/g, '');
    if (telLimpo.length < 10 || telLimpo.length > 11) {
        return window.showToast("Telefone inválido! Digite DDD + Número.", "error");
    }
    
    let subtotal = 0; carrinho.forEach(i => subtotal += parseFloat(i.preco) * i.qtd);
    const totalFinal = (subtotal - (subtotal * desconto)) + freteValor;

    // Resumo
    const resumoHtml = carrinho.map(i => `<li style="margin-bottom:5px;">${i.qtd}x ${i.nome} - <b>${window.fmtMoney(i.preco)}</b></li>`).join('');
    const confirmacao = await Swal.fire({
        title: 'Confirmar Pedido?',
        html: `<div style="text-align:left;font-size:14px;"><p><strong>Cliente:</strong> ${nome}</p><p><strong>Tel:</strong> ${telefone}</p><p><strong>End:</strong> ${endereco}</p><hr><ul style="list-style:none;padding:0;">${resumoHtml}</ul><hr><p style="text-align:right;">Total: <strong>${window.fmtMoney(totalFinal)}</strong></p></div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#8bc34a',
        cancelButtonColor: '#d33',
        confirmButtonText: '✅ Confirmar'
    });

    if (!confirmacao.isConfirmed) return;

    window.toggleLoading(true);
    try {
        // Verifica Estoque no Servidor
        for (const item of carrinho) {
            const prodSnap = await getDoc(doc(db, "produtos", item.id));
            if (!prodSnap.exists()) throw new Error(`Produto removido: ${item.nome}`);
            if (parseInt(prodSnap.data().estoque) < item.qtd) throw new Error(`Estoque insuficiente: ${item.nome}`);
        }

        // Salva Pedido
        await addDoc(collection(db, "pedidos"), { 
            cliente: nome, telefone, endereco, cidade, cep, pagamento, itens: carrinho, 
            total: totalFinal, frete: freteValor, data: new Date().toISOString(), 
            status: "Recebido", userEmail: currentUserEmail 
        });
        
        // Baixa Estoque
        for (const item of carrinho) {
            const ref = doc(db, "produtos", item.id);
            const snap = await getDoc(ref);
            const nv = (parseInt(snap.data().estoque) || 0) - item.qtd; 
            await updateDoc(ref, { estoque: nv });
        }
        
        await Swal.fire('Sucesso!', `Pedido realizado!`, 'success');
        carrinho=[]; localStorage.setItem('lston_carrinho', '[]'); atualizarCarrinhoUI(); window.location.href="index.html";
    } catch(e) { 
        window.toggleLoading(false);
        Swal.fire('Erro', e.message || "Erro ao processar.", 'error');
    }
}

// --- OUTRAS ---
window.alterarQtdCard = (btn, delta) => { const input = btn.parentNode.querySelector('input'); let val = parseInt(input.value) + delta; if(val < 1) val = 1; input.value = val; }
window.adicionarComQtd = (id, btnElement) => { const prod = todosProdutos.find(p => p.id === id); const card = btnElement.parentElement; const qtyInput = card.querySelector('.card-qty-input'); const qtd = parseInt(qtyInput.value); adicionarAoCarrinho(prod, qtd); }
function adicionarAoCarrinho(produto, qtd = 1) { const estoqueDisponivel = parseInt(produto.estoque) || 0; const itemExistente = carrinho.find(p => p.id === produto.id); const qtdNoCarrinho = itemExistente ? itemExistente.qtd : 0; if (qtdNoCarrinho + qtd > estoqueDisponivel) { window.showToast(`Estoque insuficiente!`, "error"); return; } let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || ''); if(itemExistente) { itemExistente.qtd += qtd; } else { carrinho.push({ ...produto, img: capa, qtd: qtd }); } localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); window.showToast("Adicionado!"); atualizarCarrinhoUI(); window.toggleCarrinho(); }
function atualizarCarrinhoUI() { const count = document.getElementById('cart-count'); if(count) { const totalItens = carrinho.reduce((acc, item) => acc + item.qtd, 0); count.innerText = totalItens; count.style.display = totalItens > 0 ? 'block' : 'none'; } const lista = document.getElementById('itens-carrinho'); if(!lista) return; let subtotal = 0; lista.innerHTML = ''; if(carrinho.length === 0) { lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Vazio.</p>'; if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = "R$ 0,00"; return; } carrinho.forEach((item, index) => { subtotal += parseFloat(item.preco) * item.qtd; lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}"><div class="item-info"><strong>${item.nome}</strong><br>${window.fmtMoney(item.preco)}<div class="cart-qty-control"><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, -1)">-</button><span class="cart-qty-val">${item.qtd}</span><button class="cart-qty-btn" onclick="alterarQtdCarrinho(${index}, 1)">+</button></div></div></div><i class="fas fa-trash item-remove" onclick="window.removerDoCarrinho(${index})"></i></div>`; }); let total = subtotal - (subtotal * desconto); total += freteValor; let texto = freteValor > 0 ? `Total: ${window.fmtMoney(total)} <br><small style="font-size:11px;">(c/ frete)</small>` : `Total: ${window.fmtMoney(total)}`; if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = texto; }
window.alterarQtdCarrinho = (index, delta) => { const item = carrinho[index]; const estoque = parseInt(item.estoque) || 0; if (delta > 0 && item.qtd + delta > estoque) { window.showToast("Limite!", "error"); return; } item.qtd += delta; if(item.qtd < 1) carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); atualizarCarrinhoUI(); }
window.toggleCarrinho = () => { const m = document.getElementById('carrinho-modal'); m.style.display = (m.style.display === 'flex') ? 'none' : 'flex'; if(m.style.display==='flex') atualizarCarrinhoUI(); }
window.filtrarPorPreco = () => { const min = parseFloat(document.getElementById('price-min').value)||0; const max = parseFloat(document.getElementById('price-max').value)||Infinity; exibirProdutos(todosProdutos.filter(p => p.preco >= min && p.preco <= max)); }
window.ordenarProdutos = () => { const t = document.getElementById('sort-select').value; let l = [...todosProdutos]; if(t==='menor') l.sort((a,b)=>a.preco-b.preco); if(t==='maior') l.sort((a,b)=>b.preco-a.preco); exibirProdutos(l); }
window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }
window.voltarParaCarrinho = () => { document.getElementById('etapa-checkout').style.display='none'; document.getElementById('etapa-carrinho').style.display='block'; }
window.aplicarCupom = async () => { const codigo = document.getElementById('cupom-input').value.toUpperCase(); window.toggleLoading(true); try { const q = query(collection(db, "cupons"), where("codigo", "==", codigo)); const snap = await getDocs(q); if (!snap.empty) { const cupom = snap.docs[0].data(); if(cupom.validade && new Date() > new Date(cupom.validade)) window.showToast("Expirado!", "error"); else { desconto = cupom.desconto / 100; window.showToast(`-${cupom.desconto}% aplicado!`); } } else { desconto = 0; window.showToast("Inválido", "error"); } atualizarCarrinhoUI(); } catch(e) { window.showToast("Erro", "error"); } finally { window.toggleLoading(false); } }
window.calcularFreteCarrinho = async () => { const cep = document.getElementById('cart-cep-input').value.replace(/\D/g, ''); const resultDiv = document.getElementById('cart-frete-result'); if (cep.length !== 8) { resultDiv.innerText = "CEP inválido."; return; } resultDiv.innerText = "Calculando..."; window.toggleLoading(true); try { const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const data = await res.json(); if(data.erro) { resultDiv.innerText = "CEP não encontrado."; } else { const uf = data.uf; let regra = TABELA_FRETE[uf]; if(!regra) { if(['PR','SC','RS'].includes(uf)) regra = TABELA_FRETE['SUL']; else if(['MA','CE','RN','PB','PI'].includes(uf)) regra = TABELA_FRETE['NORDESTE']; else regra = TABELA_FRETE['PADRAO']; } const qtd = carrinho.reduce((acc, i) => acc + i.qtd, 0); freteValor = regra.base + (regra.adicional * Math.max(0, qtd-1)); resultDiv.innerHTML = `Frete ${uf}: ${window.fmtMoney(freteValor)} <small>(${regra.prazo})</small>`; localStorage.setItem('lston_cep', cep); atualizarCarrinhoUI(); } } catch(e){ resultDiv.innerText = "Erro."; } finally { window.toggleLoading(false); } }
window.buscarCep = async () => { const cep = document.getElementById('check-cep').value.replace(/\D/g, ''); if(cep.length !== 8) return; window.toggleLoading(true); try { const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const data = await res.json(); if(!data.erro) { document.getElementById('check-endereco').value = `${data.logradouro}, ${data.bairro}`; document.getElementById('check-cidade').value = `${data.localidade}/${data.uf}`; window.showToast("Endereço encontrado!"); } } catch(e) {} finally { window.toggleLoading(false); } }
window.assinarNews = async () => { const email = document.getElementById('news-email').value; if(email) { await addDoc(collection(db, "newsletter"), { email, data: new Date() }); window.showToast("Inscrito!"); } }

// TEMA
const campoBusca = document.getElementById('campo-busca'); if (campoBusca) { campoBusca.addEventListener('input', (e) => { const termo = e.target.value.toLowerCase(); if (termo.length < 2) { exibirProdutos(todosProdutos); if(document.getElementById('titulo-secao')) document.getElementById('titulo-secao').innerText = "Destaques"; return; } const filtrados = todosProdutos.filter(p => { const nome = p.nome.toLowerCase(); const cat = (p.categoria || "").toLowerCase(); if (nome.includes(termo) || cat.includes(termo)) return true; if (termo.length > 3) return nome.split(" ").some(palavra => calcularSimilaridade(palavra, termo) > 0.7); return false; }); if(document.getElementById('titulo-secao')) document.getElementById('titulo-secao').innerText = `Resultados: "${e.target.value}"`; exibirProdutos(filtrados); }); }
window.toggleTheme = () => { const body = document.body; const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; body.setAttribute('data-theme', newTheme); localStorage.setItem('lston_theme', newTheme); document.getElementById('theme-toggle').className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'; }
const savedTheme = localStorage.getItem('lston_theme') || 'light'; document.body.setAttribute('data-theme', savedTheme); if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
async function carregarBanners() { try { const q = await getDocs(collection(db, "banners")); const c = document.getElementById('slider'); if (q.empty || !c) return; let h=''; q.forEach(d=>{const b=d.data(); h+=`<div class="slide" style="background-image: url('${b.img}');"><div class="slide-content"><h2>${b.titulo}</h2><p>${b.subtitulo}</p></div></div>`;}); c.innerHTML=h; setInterval(()=>{slideIndex=(slideIndex+1)%q.size;c.style.transform=`translateX(-${slideIndex*100}%)`},5000); } catch(e){} }
window.mudarSlide = (n) => { const s = document.querySelectorAll('.slide'); if(s.length) { slideIndex = (slideIndex + n + s.length) % s.length; document.getElementById('slider').style.transform = `translateX(-${slideIndex * 100}%)`; } }

carregarLoja(); atualizarCarrinhoUI();