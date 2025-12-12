import { db } from "./firebaseConfig.js";
import { collection, getDocs } from "firebase/firestore";

const container = document.getElementById('products-container');

async function carregarLoja() {
    container.innerHTML = '<p style="text-align:center; width:100%;">Buscando ofertas...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "produtos"));
        container.innerHTML = ''; 

        if (querySnapshot.empty) {
            container.innerHTML = '<div style="text-align:center; width:100%; padding: 20px;">Nenhum produto encontrado.</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const prod = doc.data();
            const card = document.createElement('div');
            card.className = 'product-card';
            
            const imgUrl = prod.img ? prod.img : 'https://via.placeholder.com/150?text=Sem+Foto';

            card.innerHTML = `
                <div class="product-img" style="background-image: url('${imgUrl}');"></div>
                <div>
                    <h3>${prod.nome}</h3>
                    <p style="color:#8bc34a; font-weight:bold; font-size: 18px; text-align:center;">R$ ${prod.preco}</p>
                </div>
                <button class="btn-comprar">Comprar</button>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error("Erro:", error);
        container.innerHTML = '<p>Erro ao carregar loja.</p>';
    }
}

carregarLoja();