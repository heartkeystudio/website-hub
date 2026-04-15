import { auth, db, collection, addDoc, query, where, doc, updateDoc, onSnapshot, getDoc, increment, deleteDoc } from './firebase.js';

window.abrirModalNovaIdeiaProjeto = () => {
    window.ideiaEditandoId = null;
    window.projetoAtualIdBackup = null;
    document.getElementById('formBrainstorm')?.reset();
    document.getElementById('modalBrainTitle').innerText = "💡 Nova Sacada";
    window.openModal('modalNovaIdeia');
};

window.abrirModalNovaIdeiaGlobal = () => {
    window.ideiaEditandoId = null; 
    window.projetoAtualIdBackup = window.projetoAtualId;
    window.projetoAtualId = "global";
    document.getElementById('formBrainstorm')?.reset();
    document.getElementById('modalBrainTitle').innerText = "💡 Nova Ideia Global";
    window.openModal('modalNovaIdeia');
};

window.salvarIdeiaBrainstorm = async (e) => {
    e.preventDefault();
    if (!window.projetoAtualId) return;

    const titulo = document.getElementById('brainTitulo')?.value;
    const desc = document.getElementById('brainDesc')?.value;
    const tag = document.getElementById('brainTag')?.value;

    if (!titulo || !desc) return alert("Preencha título e descrição.");

    const dados = {
        titulo, descricao: desc, tag,
        projetoId: window.projetoAtualId,
        autor: window.obterNomeExibicao(),
        autorId: auth.currentUser.uid,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.ideiaEditandoId) {
            await updateDoc(doc(db, "brainstorm_ideias", window.ideiaEditandoId), dados);
            window.ideiaEditandoId = null;
        } else {
            dados.votos = [];
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "brainstorm_ideias"), dados);
        }
        
        window.closeModal('modalNovaIdeia');
        if (window.projetoAtualId === "global" && window.projetoAtualIdBackup) {
            window.projetoAtualId = window.projetoAtualIdBackup;
            window.projetoAtualIdBackup = null;
        }
    } catch(err) { console.error(err); }
};

window.carregarBrainstorm = (pid) => {
    const grid = document.getElementById('brainstorm-grid');
    if (!grid) return;
    onSnapshot(query(collection(db, "brainstorm_ideias"), where("projetoId", "==", pid)), (snap) => {
        let ideias = snap.docs.map(d => ({id: d.id, ...d.data()}));
        ideias.sort((a,b) => (b.votos?.length || 0) - (a.votos?.length || 0));
        grid.innerHTML = ideias.map(i => renderizarCardIdeia(i)).join('') || '<p style="text-align:center; color:#666;">Vazio.</p>';
    });
};

window.carregarIncubadora = () => {
    const grid = document.getElementById('incubadora-grid');
    if (!grid) return;
    onSnapshot(query(collection(db, "brainstorm_ideias"), where("projetoId", "==", "global")), (snap) => {
        let ideias = snap.docs.map(d => ({id: d.id, ...d.data()}));
        ideias.sort((a,b) => (b.votos?.length || 0) - (a.votos?.length || 0));
        grid.innerHTML = ideias.map(i => renderizarCardIdeia(i)).join('') || '<p style="text-align:center; color:#666;">Sem ideias na incubadora.</p>';
    });
};

function renderizarCardIdeia(i) {
    const jaVotou = i.votos?.includes(auth.currentUser.uid);
    const isMe = i.autorId === auth.currentUser.uid;
    const menuHtml = (isMe || window.userRole === 'admin') ? `
        <div class="comment-menu-container" style="position:absolute; top:15px; right:15px;">
            <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
            <div class="dropdown-content" style="right:0; min-width: 150px;">
                <button onclick="window.promoverIdeiaParaProjeto('${i.id}')" style="color:var(--primary);">🚀 Iniciar Projeto</button>
                <button onclick="window.abrirEdicaoIdeia('${i.id}')">✏️ Editar</button>
                <button class="del" onclick="window.deletarIdeia('${i.id}')">🗑️ Apagar</button>
            </div>
        </div>` : '';

    return `
        <div class="idea-card ${i.tag}" style="display: flex; flex-direction: column;">
            ${menuHtml}
            <h4>${i.titulo}</h4>
            <div class="markdown-body idea-desc" style="flex: 1; max-height: 150px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; margin-bottom: 15px;">
                ${marked.parse(i.descricao || "")}
            </div>
            
            <button class="btn-secondary" style="width: 100%; margin-bottom: 15px; font-size: 0.8rem;" onclick="window.abrirLeituraIdeia('${i.id}')">📖 Ler Ideia Completa</button>
            
            <div class="idea-footer" style="margin-top: auto;">
                <span style="font-size:0.65rem; color:#666;">Por ${i.autor}</span>
                <button class="vote-btn ${jaVotou ? 'voted' : ''}" onclick="window.votarIdeia('${i.id}', ${jaVotou})">
                    ${jaVotou ? '✅' : '🚀'} ${i.votos?.length || 0}
                </button>
            </div>
        </div>`;
}

window.abrirLeituraIdeia = async (id) => {
    const docSnap = await getDoc(doc(db, "brainstorm_ideias", id));
    if (docSnap.exists()) {
        const i = docSnap.data();
        document.getElementById('detalheTaskTitulo').innerText = "💡 " + i.titulo;
        document.getElementById('detalheTaskDesc').innerHTML = marked.parse(i.descricao);
        
        // Esconde as informações de GitHub e Tags para deixar a leitura limpa
        document.getElementById('detalheTaskTag').style.display = 'none';
        document.getElementById('detalheTaskGit').style.display = 'none';
        document.getElementById('btn-abrir-git').style.display = 'none';

        window.openModal('modalDetalhesTarefa');
    }
};

window.promoverIdeiaParaProjeto = async (id) => {
    const docSnap = await getDoc(doc(db, "brainstorm_ideias", id));
    if (docSnap.exists()) {
        const i = docSnap.data();
        document.getElementById('projName').value = i.titulo;
        document.getElementById('projetoDesc').value = i.descricao;
        window.ideiaPromovendoId = id;
        window.openModal('modalNovoProjeto');
    }
};

window.abrirEdicaoIdeia = async (id) => {
    const docSnap = await getDoc(doc(db, "brainstorm_ideias", id));
    if (docSnap.exists()) {
        const i = docSnap.data();
        window.ideiaEditandoId = id;
        document.getElementById('brainTitulo').value = i.titulo;
        document.getElementById('brainTag').value = i.tag;
        document.getElementById('brainDesc').value = i.descricao;
        document.getElementById('modalBrainTitle').innerText = "✏️ Editar Ideia";
        window.openModal('modalNovaIdeia');
    }
};

window.deletarIdeia = async (id) => { if(confirm("Remover permanentemente?")) await deleteDoc(doc(db, "brainstorm_ideias", id)); };

window.votarIdeia = async (id, jaVotou) => {
    const docRef = doc(db, "brainstorm_ideias", id);
    const meuUid = auth.currentUser.uid;
    const snap = await getDoc(docRef);
    const ideia = snap.data();
    
    let votos = ideia.votos || [];
    votos = jaVotou ? votos.filter(u => u !== meuUid) : [...votos, meuUid];
    await updateDoc(docRef, { votos });

    // MÁGICA: Se alguém votou na sua ideia, você ganha 2 XP! (E perde 2 XP se tirarem o voto)
    if (ideia.autorId && ideia.autorId !== meuUid) {
        const autorRef = doc(db, "usuarios", ideia.autorId);
        const valorXp = jaVotou ? -2 : 2; 
        await updateDoc(autorRef, { xp: increment(valorXp) });
    }
};