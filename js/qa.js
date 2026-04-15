import { auth, db, collection, addDoc, getDocs, query, where, doc, updateDoc, onSnapshot, orderBy, deleteDoc } from './firebase.js';

window.carregarBuildsPlaytest = (pid) => {
    const list = document.getElementById('builds-list');
    if (!list) return;

    const q = query(collection(db, "projetos_builds"), where("projetoId", "==", pid), orderBy("dataCriacao", "desc"));
    
    onSnapshot(q, (snap) => {
        list.innerHTML = snap.docs.map(d => {
            const b = d.data();
            const dataF = new Date(b.dataCriacao).toLocaleDateString();
            
            return `
                <div class="build-card">
                    <span class="build-tag">${b.versao || 'v0.0'}</span>
                    <div class="build-info">
                        <h4>${b.titulo}</h4>
                        <p>Postado em: ${dataF}</p>
                        <p style="margin-top:5px; color:#ccc;">${b.notas || ''}</p>
                    </div>
                    <a href="${b.url}" target="_blank" class="btn-download-build">🎮 Baixar / Jogar</a>
                    ${window.userRole === 'admin' ? `<button onclick="window.deletarBuild('${d.id}')" style="background:none; border:none; color:#ff5252; font-size:0.6rem; margin-top:10px; cursor:pointer; width:100%;">🗑️ Remover Build</button>` : ''}
                </div>
            `;
        }).join('') || '<p style="color:#666; font-size:0.8rem; text-align:center;">Nenhuma build disponível.</p>';
    });
};

window.abrirModalNovaBuild = () => {
    const titulo = prompt("Título da Build (Ex: Alpha 0.4 - Sistema de Salto):");
    if (!titulo) return;
    const url = prompt("Link da Build (Drive, itch.io, Dropbox):");
    if (!url) return;
    const versao = prompt("Versão (Ex: v0.4.2):", "v0.1");

    addDoc(collection(db, "projetos_builds"), {
        projetoId: window.projetoAtualId,
        titulo, url, versao,
        autor: window.obterNomeExibicao(),
        dataCriacao: new Date().toISOString()
    });

    window.enviarNotificacaoDiscord(
    "🎮 Nova Build Disponível!",
    `**${titulo}** (${versao}) foi postada por **${window.obterNomeExibicao()}**.`,
    8519476, // Verde
    [{ name: "Link de Acesso", value: `[Clique para Jogar](${url})` }]
);
};

window.enviarBugReport = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "Sincronizando Kanban... ⏳";

    const titulo = document.getElementById('bug-titulo').value;
    const prio = document.getElementById('bug-prio').value;
    const desc = document.getElementById('bug-desc').value;
    const evidencia = document.getElementById('bug-evidencia').value;

    try {
        await addDoc(collection(db, "tarefas"), {
            projetoId: window.projetoAtualId,
            titulo: `[BUG] ${titulo}`,
            descricao: `**Relatado por:** ${window.obterNomeExibicao()}\n\n**O Problema:**\n${desc}\n\n**Evidência:** ${evidencia || 'Nenhuma'}`,
            status: 'todo',
            tag: 'bug',
            prioridade: prio,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });

        // DISPARO DISCORD (Removida a trava de prioridade para testar)
        let corEmoji = prio === "1" ? "🚨" : (prio === "2" ? "🟡" : "⚪");
        let corHex = prio === "1" ? 16711680 : (prio === "2" ? 16761035 : 10066329);

        window.enviarNotificacaoDiscord(
            `${corEmoji} NOVO BUG RELATADO`,
            `**${titulo}**\nRelatado por: **${window.obterNomeExibicao()}**`,
            corHex,
            [
                { name: "Prioridade", value: prio === "1" ? "CRÍTICO" : (prio === "2" ? "Média" : "Baixa"), inline: true },
                { name: "Descrição", value: desc.substring(0, 1000) }
            ]
        );

        window.mostrarToastNotificacao("QA Report", "Bug enviado ao Kanban e ao Discord!", "geral");
        e.target.reset();

    } catch (err) { console.error(err); }
    finally { btn.innerText = "🚀 Lançar para o Kanban"; btn.disabled = false; }
};

window.deletarBuild = (id) => { if(confirm("Apagar registro da build?")) deleteDoc(doc(db, "projetos_builds", id)); };