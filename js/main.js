import { db } from "./firebaseConfig.js";
import { collection, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";

let carrinho = JSON.parse(localStorage.getItem('lston_carrinho')) || []; 
let todosProdutos = []; 
const container = document.getElementById('products-container');

// --- 1. Carregar Loja ---
async function carregarLoja() {
    container.innerHTML = '<p style="text-align:center; width:100%;">Buscando ofertas...</p>';
    try {
        const querySnapshot = await getDocs(collection(db, "produtos"));
        todosProdutos = []; 
        if (querySnapshot.empty) { container.innerHTML = '<div style="text-align:center; padding: 20px;">Nada encontrado.</div>'; return; }
        querySnapshot.forEach((documento) => { todosProdutos.push({ id: documento.id, ...documento.data() }); });
        exibirProdutos(todosProdutos);
    } catch (error) { console.error(error); container.innerHTML = '<p>Erro ao carregar.</p>'; }
}

// --- 2. Exibir Produtos ---
function exibirProdutos(lista) {
    container.innerHTML = ''; 
    if(lista.length === 0) { container.innerHTML = '<p style="text-align:center; width:100%;">Nada encontrado.</p>'; return; }

    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const imgUrl = prod.img ? prod.img : 'https://via.placeholder.com/150?text=Sem+Foto';
        const estoque = prod.estoque ? parseInt(prod.estoque) : 0;
        const semEstoque = estoque === 0;
        const textoEstoque = semEstoque ? '<span style="color:red;">Esgotado</span>' : `Restam: ${estoque}`;
        const btnDisabled = semEstoque ? 'disabled style="background-color:#ccc; cursor:not-allowed;"' : '';

        card.innerHTML = `
            <div class="product-img" style="background-image: url('${imgUrl}'); cursor: pointer;" onclick="window.location.href='produto.html?id=${prod.id}'">
                <span style="position:absolute; top:5px; left:5px; background:rgba(0,0,0,0.6); color:white; padding:2px 6px; font-size:10px; border-radius:4px;">${prod.categoria || 'Geral'}</span>
            </div>
            <div style="width:100%;">
                <h3>${prod.nome}</h3>
                <p style="font-size:12px; color:#555; text-align:center; margin-bottom:5px;">${textoEstoque}</p>
                <p style="color:#8bc34a; font-weight:bold; font-size: 18px; text-align:center;">R$ ${prod.preco}</p>
            </div>
            <button class="btn-comprar" ${btnDisabled}>${semEstoque ? 'Indisponível' : 'Adicionar'}</button>
        `;
        container.appendChild(card);
        if(!semEstoque) {
            card.querySelector('.btn-comprar').addEventListener('click', () => adicionarAoCarrinho(prod));
        }
    });
}

// --- 3. Filtros ---
window.filtrarCategoria = (cat) => {
    document.getElementById('titulo-secao').innerText = cat === 'Todas' ? 'Destaques' : cat;
    exibirProdutos(cat === 'Todas' ? todosProdutos : todosProdutos.filter(p => p.categoria === cat));
}
document.getElementById('campo-busca').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase();
    exibirProdutos(todosProdutos.filter(p => p.nome.toLowerCase().includes(termo)));
});

// --- 4. Carrinho ---
function adicionarAoCarrinho(produto) {
    const qtdNoCarrinho = carrinho.filter(p => p.id === produto.id).length;
    if(qtdNoCarrinho >= produto.estoque) { alert("Limite de estoque atingido!"); return; }
    carrinho.push(produto); salvarCarrinho(); atualizarCarrinhoUI();
    if(document.getElementById('carrinho-modal').style.display !== 'flex') toggleCarrinho();
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); salvarCarrinho(); atualizarCarrinhoUI(); }
function salvarCarrinho() { localStorage.setItem('lston_carrinho', JSON.stringify(carrinho)); }

function atualizarCarrinhoUI() {
    document.getElementById('cart-count').innerText = carrinho.length;
    document.getElementById('cart-count').style.display = carrinho.length > 0 ? 'block' : 'none';
    const lista = document.getElementById('itens-carrinho');
    let total = 0;
    lista.innerHTML = '';
    if (carrinho.length === 0) { lista.innerHTML = '<p style="text-align:center; margin-top:20px; color:#777;">Vazio.</p>'; } 
    else {
        carrinho.forEach((item, index) => {
            total += parseFloat(item.preco);
            lista.innerHTML += `
                <div class="cart-item">
                    <div style="display:flex; align-items:center;">
                        <img src="${item.img || 'https://via.placeholder.com/50'}" alt="${item.nome}">
                        <div class="item-info"><strong>${item.nome}</strong><br>R$ ${item.preco}</div>
                    </div>
                    <i class="fas fa-trash item-remove" onclick="removerDoCarrinho(${index})"></i>
                </div>`;
        });
    }
    const totalFormatado = total.toFixed(2);
    document.getElementById('cart-total').innerText = totalFormatado;
    document.getElementById('checkout-total-display').innerText = totalFormatado;
}

// --- 5. Checkout ---
window.irParaCheckout = function() {
    if(carrinho.length === 0) return alert("Carrinho vazio!");
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
    const total = parseFloat(document.getElementById('cart-total').innerText);
    const btn = document.querySelector('#etapa-checkout .btn-checkout');

    if(!nome || !endereco || !cidade) return alert("Preencha todos os campos!");

    try {
        btn.innerText = "Processando..."; btn.disabled = true;
        await addDoc(collection(db, "pedidos"), {
            cliente: nome, endereco: endereco, cidade: cidade, pagamento: pagamento,
            itens: carrinho, total: total, data: new Date().toISOString(), status: "Recebido"
        });
        for (const item of carrinho) {
            const produtoRef = doc(db, "produtos", item.id);
            const novoEstoque = parseInt(item.estoque) - 1;
            if (novoEstoque >= 0) await updateDoc(produtoRef, { estoque: novoEstoque });
        }
        alert(`Sucesso! Pedido confirmado para ${nome}.`);
        carrinho = []; salvarCarrinho(); atualizarCarrinhoUI();
        window.voltarParaCarrinho(); toggleCarrinho(); carregarLoja();
    } catch (error) { console.error(error); alert("Erro ao processar."); } 
    finally { btn.innerText = "Confirmar Pedido"; btn.disabled = false; }
}

window.toggleCarrinho = () => {
    const modal = document.getElementById('carrinho-modal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}

carregarLoja();
atualizarCarrinhoUI();