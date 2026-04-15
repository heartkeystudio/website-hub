import { auth, db, collection, addDoc, getDocs, query, deleteDoc, doc, updateDoc, onSnapshot, orderBy, limit } from './firebase.js';

window.salvarPostMural = async (e) => {
    e.preventDefault();
    
    // Lemos dos IDs fixos do modal da Incubadora
    const titulo = document.getElementById('brainTitulo').value;
    const tag = document.getElementById('brainTag').value;
    const conteudo = document.getElementById('brainDesc').value;

    if (!conteudo) return;

    try {
        await addDoc(collection(db, "mural_mensagens"), {
            titulo: titulo,
            tag: tag,
            texto: conteudo,
            autor: window.obterNomeExibicao(),
            autorId: auth.currentUser.uid,
            upvotes: [auth.currentUser.uid], 
            downvotes: [],
            dataCriacao: new Date().toISOString()
        });

        console.log("✅ Mural atualizado com sucesso!");
        window.closeModal('modalNovaIdeia');
        window.mostrarToastNotificacao("Mural", "Mensagem publicada!", "geral");
    } catch(err) { console.error(err); }
};

window.carregarMural = () => {
    const feed = document.getElementById('mural-feed');
    if (!feed || !auth.currentUser) return;

    const qMural = query(collection(db, "mural_mensagens"), orderBy("dataCriacao", "desc"), limit(20));

    onSnapshot(qMural, (snap) => {
        let posts = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const agora = new Date().getTime();

        posts.forEach(p => {
            const saldoVotos = (p.upvotes?.length || 0) - (p.downvotes?.length || 0);
            const horasVida = (agora - new Date(p.dataCriacao).getTime()) / (1000 * 60 * 60);
            p.temperatura = saldoVotos - (horasVida * 0.5);
            p.saldoExibicao = saldoVotos;
        });

        posts.sort((a, b) => b.temperatura - a.temperatura);

        feed.innerHTML = posts.map(p => {
            const meuUid = auth.currentUser.uid;
            const upActive = p.upvotes?.includes(meuUid) ? 'active' : '';
            const downActive = p.downvotes?.includes(meuUid) ? 'active' : '';
            
            let textoMencoes = (p.texto || "").replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>');
            const textoHTML = marked.parse(textoMencoes);
            
            let badgeTemp = p.temperatura >= 3 ? '<span class="mural-temp-badge temp-hot">🔥 QUENTE</span>' : 
                            p.temperatura < -2 ? '<span class="mural-temp-badge temp-dead">💀 FRIO</span>' : '';

            // Travas de segurança para posts antigos ou sem dados
            const tituloExibicao = p.titulo || "Postagem Geral";
            const tagExibicao = (p.tag || "aviso").toLowerCase();
            const tagTexto = (p.tag || "Aviso").toUpperCase();

            return `
                <div class="mural-post" style="opacity: ${p.temperatura < -2 ? '0.6' : '1'};">
                    <div class="mural-votes">
                        <button class="vote-arrow up ${upActive}" onclick="window.votarMural('${p.id}', 'up')">▲</button>
                        <span class="vote-score">${p.saldoExibicao}</span>
                        <button class="vote-arrow down ${downActive}" onclick="window.votarMural('${p.id}', 'down')">▼</button>
                    </div>
                    <div class="mural-content">
                        <div class="mural-header">
                            <span class="badge badge-${tagExibicao}" style="font-size:0.6rem;">${tagTexto}</span>
                            <span class="mural-author">${p.autor}</span>
                            <span class="mural-time">${new Date(p.dataCriacao).toLocaleDateString()}</span>
                            ${badgeTemp}
                            ${(p.autorId === meuUid || window.userRole === 'admin') ? `<button class="icon-btn" onclick="window.deletarPostMural('${p.id}')" style="margin-left:auto; color:#ff5252;">🗑️</button>` : ''}
                        </div>
                        <h3 style="margin: 5px 0; color: #fff; font-size: 1.1rem; border:none;">${tituloExibicao}</h3>
                        <div class="markdown-body" style="background:transparent!important; padding:0!important; color: #ccc; font-size:0.9rem;">
                            ${textoHTML}
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<div class="dash-panel" style="text-align:center;">Mural vazio.</div>';
    });
};

window.votarMural = async (id, tipoVoto) => {
    const meuUid = auth.currentUser.uid;
    const docRef = doc(db, "mural_mensagens", id);
    try {
        if (tipoVoto === 'up') {
            await updateDoc(docRef, { upvotes: arrayUnion(meuUid), downvotes: arrayRemove(meuUid) });
        } else {
            await updateDoc(docRef, { downvotes: arrayUnion(meuUid), upvotes: arrayRemove(meuUid) });
        }
    } catch(e) { console.error("Erro ao votar:", e); }
};

window.deletarPostMural = async (id) => {
    if(confirm("Apagar sua mensagem?")) await deleteDoc(doc(db, "mural_mensagens", id));
};