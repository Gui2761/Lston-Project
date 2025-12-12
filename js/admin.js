import { db, auth, storage } from "./firebaseConfig.js"; // Adicionado storage
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; // Funções de Upload

// 1. Proteção de Rota
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        renderizarTabela();
    }
});

const produtosCollection = collection(db, "produtos");

// 2. Funções Globais
window.abrirModalProduto = function() {
    document.getElementById('modalProduto').style.display = 'flex';
}
window.fecharModal = function() {
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-preco').value = '';
    document.getElementById('prod-img').value = ''; // Limpa o input de arquivo
    document.getElementById('modalProduto').style.display = 'none';
}

// 3. Renderizar Tabela
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
            const id = docSnap.id;
            
            const tr = document.createElement('tr');
            // Verifica se tem imagem
            const imgDisplay = prod.img ? `<img src="${prod.img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">` : '<i class="fas fa-image"></i>';

            tr.innerHTML = `
                <td>${imgDisplay}</td>
                <td>${prod.nome}</td>
                <td>R$ ${prod.preco}</td>
                <td class="actions">
                    <i class="fas fa-trash" id="btn-del-${id}" title="Excluir" style="cursor:pointer; color:red;"></i>
                </td>
            `;
            tbody.appendChild(tr);

            document.getElementById(`btn-del-${id}`).addEventListener('click', () => deletarProduto(id));
        });

        contador.innerText = count + " Itens";
        if(count === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum produto cadastrado.</td></tr>';

    } catch (error) {
        console.error("Erro ao ler dados:", error);
    }
}

// 4. Salvar Produto (COM UPLOAD)
document.getElementById('btn-save-prod').addEventListener('click', async function() {
    const nome = document.getElementById('prod-nome').value;
    const preco = document.getElementById('prod-preco').value;
    const arquivoInput = document.getElementById('prod-img');
    const arquivo = arquivoInput.files[0]; // Pega o arquivo selecionado
    const btn = this;

    if(nome && preco) {
        try {
            btn.innerText = "Salvando...";
            btn.disabled = true;

            let urlImagem = "";

            // Se o usuário selecionou uma foto, faz o upload
            if (arquivo) {
                // Cria uma referência no Storage (ex: produtos/tenis.jpg)
                const storageRef = ref(storage, `produtos/${new Date().getTime()}_${arquivo.name}`);
                
                // Sobe o arquivo
                const snapshot = await uploadBytes(storageRef, arquivo);
                
                // Pega o link da internet para essa foto
                urlImagem = await getDownloadURL(snapshot.ref);
            }

            // Salva no Banco de Dados com o link da foto
            await addDoc(produtosCollection, {
                nome: nome,
                preco: parseFloat(preco),
                img: urlImagem, // Salva a URL gerada pelo Firebase
                dataCriacao: new Date()
            });

            alert('Produto salvo com sucesso!');
            fecharModal();
            renderizarTabela();

        } catch (e) {
            console.error("Erro ao salvar:", e);
            alert("Erro ao salvar produto: " + e.message);
        } finally {
            btn.innerText = "Salvar";
            btn.disabled = false;
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
        }
    }
}

// 6. Logout
document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});