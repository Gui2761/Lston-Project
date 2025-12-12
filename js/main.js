import { db, auth } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let todosProdutos = []; 
let desconto = 0;
const container = document.getElementById('products-container');

// UX Helpers
function showToast(msg, type='success') { Toastify({ text: msg, duration: 3000, style: { background: type==='error'?"#c62828":"#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
function toggleLoading(show) { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }

// 1. Identificação do Usuário
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('user-name').innerText = user.email.split('@')[0];
        document.getElementById('user-display').href = "#"; // Futuro: Link para Perfil
    }
});

// 2. Carrossel Dinâmico
let slideIndex = 0;
async function carregarBanners() {
    try {
        const q = await getDocs(collection(db, "banners"));
        const sliderContainer = document.getElementById('slider');
        if (q.empty) return; // Mantém placeholder se não tiver banner
        
        let html = '';
        q.forEach(d => {
            const b = d.data();
            html += `<div class="slide" style="background-image: url('${b.img}');"><div class="slide-content"><h2>${b.titulo}</h2><p>${b.subtitulo}</p></div></div>`;
        });
        sliderContainer.innerHTML = html;
        iniciarSlider();
    } catch (e) { console.error("Erro banner", e); }
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

// 3. Cupons Dinâmicos
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
        } else {
            desconto = 0;
            showToast("Cupom inválido", "error");
        }
        atualizarCarrinhoUI();
    } catch(e) { showToast("Erro ao validar", "error"); }
    finally { toggleLoading(false); }
}

// 4. Busca CEP (ViaCEP)
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
        } else { showToast("CEP não encontrado", "error"); }
    } catch(e) { showToast("Erro no CEP", "error"); }
    finally { toggleLoading(false); }
}

// ... (Restante das funções: carregarLoja, exibirProdutos, adicionarCarrinho, confirmarPedido IGUAIS AO ANTERIOR) ...
// Vou incluir as funções essenciais para garantir que tudo funcione:

async function carregarLoja() {
    container.innerHTML = '<p style="text-align:center;">Carregando...</p>';
    carregarBanners(); // Chama os banners
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
        const sem = est === 0;
        
        card.innerHTML = `
            <div class="product-img" style="background-image: url('${capa}'); cursor:pointer;" onclick="window.location.href='produto.html?id=${prod.id}'">
                <span style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,0.6);color:white;padding:2px 6px;font-size:10px;border-radius:4px;">${prod.categoria || 'Geral'}</span>
            </div>
            <div style="width:100%;">
                <h3>${prod.nome}</h3>
                <p style="font-size:12px;color:#555;margin-bottom:5px;">${sem?'<span style="color:red">Esgotado</span>':`Restam: ${est}`}</p>
                <p style="color:#8bc34a;font-weight:bold;font-size:18px;">${fmtMoney(prod.preco)}</p>
            </div>
            <button class="btn-comprar" ${sem?'disabled style="background:#ccc;"':''}>${sem?'Indisponível':'Adicionar'}</button>
        `;
        container.appendChild(card);
        if(!sem) card.querySelector('.btn-comprar').addEventListener('click', () => adicionarAoCarrinho(prod));
    });
}

// Funções de Carrinho e Filtro (resumidas pois já enviadas anteriormente, mas necessárias)
window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }
document.getElementById('campo-busca').addEventListener('input', (e) => { exibirProdutos(todosProdutos.filter(p=>p.nome.toLowerCase().includes(e.target.value.toLowerCase()))); });

function adicionarAoCarrinho(produto) {
    const qtd = carrinho.filter(p => p.id === produto.id).length;
    if(qtd >= produto.estoque) { showToast("Estoque limite!", "error"); return; }
    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || 'https://via.placeholder.com/50');
    carrinho.push({ ...produto, img: capa });
    salvarCarrinho(); atualizarCarrinhoUI(); showToast("Adicionado!");
    if(document.getElementById('carrinho-modal').style.display !== 'flex') toggleCarrinho();
}

window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); salvarCarrinho(); atualizarCarrinhoUI(); }
function salvarCarrinho() { localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); }

function atualizarCarrinhoUI() {
    document.getElementById('cart-count').innerText = carrinho.length;
    document.getElementById('cart-count').style.display = carrinho.length > 0 ? 'block' : 'none';
    const lista = document.getElementById('itens-carrinho');
    let subtotal = 0;
    lista.innerHTML = '';
    
    carrinho.forEach((item, index) => {
        subtotal += parseFloat(item.preco);
        lista.innerHTML += `<div class="cart-item"><div style="display:flex;align-items:center;"><img src="${item.img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px;"><div class="item-info"><strong>${item.nome}</strong><br>${fmtMoney(item.preco)}</div></div><i class="fas fa-trash item-remove" onclick="removerDoCarrinho(${index})"></i></div>`;
    });

    const valorDesconto = subtotal * desconto;
    const total = subtotal - valorDesconto;
    const textoTotal = desconto > 0 ? `De: <s>${fmtMoney(subtotal)}</s> Por: ${fmtMoney(total)}` : fmtMoney(total);
    
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerHTML = textoTotal;
    if(document.getElementById('checkout-total-display')) document.getElementById('checkout-total-display').innerHTML = textoTotal;
}

window.irParaCheckout = function() {
    if(carrinho.length === 0) return showToast("Vazio!", "error");
    document.getElementById('etapa-carrinho').style.display = 'none';
    document.getElementById('etapa-checkout').style.display = 'flex';
}
window.voltarParaCarrinho = function() {
    document.getElementById('etapa-checkout').style.display = 'none';
    document.getElementById('etapa-carrinho').style.display = 'block';
}

window.confirmarPedido = async function() {
    const nome = document.getElementById('check-nome').value;
    const endereco = document.getElementById('check-endereco').value;
    const cidade = document.getElementById('check-cidade').value;
    const pagamento = document.getElementById('check-pagamento').value;
    
    // Recalcula total com desconto
    let subtotal = 0; carrinho.forEach(i => subtotal += parseFloat(i.preco));
    const total = subtotal - (subtotal * desconto);

    if(!nome || !endereco) return showToast("Preencha endereço!", "error");
    toggleLoading(true);

    try {
        await addDoc(collection(db, "pedidos"), {
            cliente: nome, endereco, cidade, pagamento, itens: carrinho, total, data: new Date().toISOString(), status: "Recebido"
        });
        for (const item of carrinho) {
            const ref = doc(db, "produtos", item.id);
            const nv = parseInt(item.estoque) - 1;
            if (nv >= 0) await updateDoc(ref, { estoque: nv });
        }
        showToast("Sucesso!"); carrinho = []; salvarCarrinho(); atualizarCarrinhoUI();
        window.voltarParaCarrinho(); toggleCarrinho(); carregarLoja();
    } catch (e) { showToast("Erro.", "error"); } 
    finally { toggleLoading(false); }
}

window.toggleCarrinho = () => {
    const modal = document.getElementById('carrinho-modal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}
window.toggleMenu = () => { document.getElementById('nav-menu').classList.toggle('active'); }

carregarLoja(); atualizarCarrinhoUI();