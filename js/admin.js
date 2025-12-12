import { db, auth } from "./firebaseConfig.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// 1. Proteção de Rota: Só carrega se estiver logado
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        renderizarTabela();
    }
});

const produtosCollection = collection(db, "produtos");

// 2. Funções Globais (para abrir/fechar modal pelo HTML)
window.abrirModalProduto = function() {
    document.getElementById('modalProduto').style.display = 'flex';
}
window.fecharModal = function() {
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-preco').value = '';
    document.getElementById('prod-img').value = '';
    document.getElementById('modalProduto').style.display = 'none';
}

// 3. Renderizar Tabela (Ler do Firestore)
async function renderizarTabela() {
    const tbody = document.getElementById('tabela-produtos');
    const contador = document.getElementById('total-produtos-count');
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';

    try {
        const querySnapshot = await getDocs(produtosCollection);
        tbody.innerHTML = '';
        
        let count = 0;
        querySnapshot.forEach((docSnap) => {
            count++;
            const prod = docSnap.data();
            const id = docSnap.id; // ID único do Firestore
            
            const tr = document.createElement('tr');
            const imgDisplay = prod.img ? `<img src="${prod.img}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">` : '<i class="fas fa-image"></i>';

            tr.innerHTML = `
                <td>${imgDisplay}</td>
                <td>${prod.nome}</td>
                <td>R$ ${prod.preco}</td>
                <td class="actions">
                    <i class="fas fa-trash" id="btn-del-${id}" title="Excluir" style="cursor:pointer; color:red;"></i>
                </td>
            `;
            tbody.appendChild(tr);

            // Adiciona evento de clique no botão de lixeira
            document.getElementById(`btn-del-${id}`).addEventListener('click', () => deletarProduto(id));
        });

        contador.innerText = count + " Itens";

        if(count === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum produto cadastrado.</td></tr>';
        }

    } catch (error) {
        console.error("Erro ao ler dados:", error);
        tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar dados.</td></tr>';
    }
}

// 4. Salvar Produto (Escrever no Firestore)
document.getElementById('btn-save-prod').addEventListener('click', async () => {
    const nome = document.getElementById('prod-nome').value;
    const preco = document.getElementById('prod-preco').value;
    const img = document.getElementById('prod-img').value;

    if(nome && preco) {
        try {
            await addDoc(produtosCollection, {
                nome: nome,
                preco: parseFloat(preco),
                img: img,
                dataCriacao: new Date()
            });
            alert('Produto salvo com sucesso!');
            fecharModal();
            renderizarTabela();
        } catch (e) {
            console.error("Erro ao salvar:", e);
            alert("Erro ao salvar produto.");
        }
    } else {
        alert("Preencha nome e preço.");
    }
});

// 5. Deletar Produto
async function deletarProduto(id) {
    if(confirm('Tem certeza que deseja excluir?')) {
        try {
            await deleteDoc(doc(db, "produtos", id));
            renderizarTabela();
        } catch (e) {
            console.error("Erro ao deletar:", e);
            alert("Erro ao excluir.");
        }
    }
}

// 6. Logout
document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});