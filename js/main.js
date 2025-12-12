import { db } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let todosProdutos = []; 
const container = document.getElementById('products-container');

// UX Helpers
function showToast(msg) { Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: "#2c3e50" } }).showToast(); }
function fmtMoney(val) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val); }
function toggleLoading(show) { const el = document.getElementById('loading-overlay'); if(el) el.style.display = show ? 'flex' : 'none'; }

async function carregarLoja() {
    container.innerHTML = '<p style="text-align:center;">Carregando...</p>';
    try {
        const q = await getDocs(collection(db, "produtos"));
        todosProdutos = []; 
        if (q.empty) { container.innerHTML = '<p style="text-align:center;">Vazio.</p>'; return; }
        q.forEach((doc) => { todosProdutos.push({ id: doc.id, ...doc.data() }); });
        exibirProdutos(todosProdutos);
    } catch (e) { console.error(e); }
}

function exibirProdutos(lista) {
    container.innerHTML = ''; 
    if(lista.length === 0) { container.innerHTML = '<p style="text-align:center;">Nada encontrado.</p>'; return; }
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
                <p style="font-size:12px;color:#555;margin-bottom:5px;text-align:center;">${sem?'<span style="color:red">Esgotado</span>':`Restam: ${est}`}</p>
                <p style="color:#8bc34a;font-weight:bold;font-size:18px;text-align:center;">${fmtMoney(prod.preco)}</p>
            </div>
            <button class="btn-comprar" ${sem?'disabled style="background:#ccc;cursor:not-allowed;"':''}>${sem?'Indisponível':'Adicionar'}</button>
        `;
        container.appendChild(card);
        if(!sem) card.querySelector('.btn-comprar').addEventListener('click', () => adicionarAoCarrinho(prod));
    });
}

window.filtrarCategoria = (cat) => { document.getElementById('titulo-secao').innerText = cat==='Todas'?'Destaques':cat; exibirProdutos(cat==='Todas'?todosProdutos:todosProdutos.filter(p=>p.categoria===cat)); }
document.getElementById('campo-busca').addEventListener('input', (e) => { exibirProdutos(todosProdutos.filter(p=>p.nome.toLowerCase().includes(e.target.value.toLowerCase()))); });

function adicionarAoCarrinho(produto) {
    const qtd = carrinho.filter(p => p.id === produto.id).length;
    if(qtd >= produto.estoque) { showToast("Estoque limite atingido!"); return; }
    let capa = (produto.imagens && produto.imagens.length > 0) ? produto.imagens[0] : (produto.img || 'https://via.placeholder.com/50');
    carrinho.push({ ...produto, img: capa });
    salvarCarrinho(); atualizarCarrinhoUI();
    showToast("Adicionado ao carrinho!");
}

window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); salvarCarrinho(); atualizarCarrinhoUI(); }
function salvarCarrinho() { localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); }

function atualizarCarrinhoUI() {
    document.getElementById('cart-count').innerText = carrinho.length;
    document.getElementById('cart-count').style.display = carrinho.length > 0 ? 'block' : 'none';
    const lista = document.getElementById('itens-carrinho');
    let total = 0;
    lista.innerHTML = '';
    if (carrinho.length === 0) { lista.innerHTML = '<p style="text-align:center;margin-top:20px;color:#777;">Vazio.</p>'; } 
    else {
        carrinho.forEach((item, index) => {
            total += parseFloat(item.preco);
            lista.innerHTML += `
                <div class="cart-item">
                    <div style="display:flex; align-items:center;">
                        <img src="${item.img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; margin-right:10px;">
                        <div class="item-info"><strong>${item.nome}</strong><br>${fmtMoney(item.preco)}</div>
                    </div>
                    <i class="fas fa-trash item-remove" onclick="removerDoCarrinho(${index})"></i>
                </div>`;
        });
    }
    const totFmt = fmtMoney(total);
    if(document.getElementById('cart-total')) document.getElementById('cart-total').innerText = totFmt;
    if(document.getElementById('checkout-total-display')) document.getElementById('checkout-total-display').innerText = totFmt;
}

window.irParaCheckout = function() {
    if(carrinho.length === 0) return showToast("Carrinho vazio!");
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
    const btn = document.querySelector('#etapa-checkout .btn-checkout');

    if(!nome || !endereco || !cidade) return showToast("Preencha todos os campos!");
    btn.innerText = "..."; btn.disabled = true;

    try {
        let total = 0; carrinho.forEach(i => total += parseFloat(i.preco));
        await addDoc(collection(db, "pedidos"), {
            cliente: nome, endereco, cidade, pagamento, itens: carrinho, total, data: new Date().toISOString(), status: "Recebido"
        });
        for (const item of carrinho) {
            const ref = doc(db, "produtos", item.id);
            const nv = parseInt(item.estoque) - 1;
            if (nv >= 0) await updateDoc(ref, { estoque: nv });
        }
        showToast("Pedido confirmado!"); carrinho = []; salvarCarrinho(); atualizarCarrinhoUI();
        window.voltarParaCarrinho(); toggleCarrinho(); carregarLoja();
    } catch (e) { console.error(e); showToast("Erro."); } 
    finally { btn.innerText = "Confirmar"; btn.disabled = false; }
}

window.toggleCarrinho = () => {
    const modal = document.getElementById('carrinho-modal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}
carregarLoja(); atualizarCarrinhoUI();