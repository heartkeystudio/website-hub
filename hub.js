// ==========================================
// 1. IMPORTAÇÕES DO FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, onSnapshot, orderBy, limit, increment, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 2. CONFIGURAÇÃO E INICIALIZAÇÃO
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCIV7ikSQZaIXGO4RqHIHIB-KLBCsaIjPM",
    authDomain: "heartkey-hub.firebaseapp.com",
    projectId: "heartkey-hub",
    storageBucket: "heartkey-hub.firebasestorage.app",
    messagingSenderId: "1024973037596",
    appId: "1:1024973037596:web:badc53e3d522625c8cbfd9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// Wiki Init (Markdown/Mermaid)
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// ==========================================
// 3. LÓGICA DE LOGIN E SESSÃO
// ==========================================
onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('login-screen');
    if (user) {
        loginScreen.classList.add('hidden');
        document.querySelector('.user-email').textContent = user.email;
        
        const ADMIN_EMAIL = "devao.developer@gmail.com";
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.style.display = (user.email === ADMIN_EMAIL) ? "block" : "none";

        // Registro/Atualização do usuário
        await setDoc(doc(db, "usuarios", user.uid), {
            email: user.email.toLowerCase(),
            uid: user.uid,
            nome: user.displayName || 'Membro',
            ultimoAcesso: new Date().toISOString()
        }, { merge: true });

        // Carregar Preferências Visuais
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            const d = userDoc.data();
            window.aplicarTema(d.corTema, d.bgTema, d.modoTema, d.opacidadeTema);
            if(document.getElementById('theme-color')) document.getElementById('theme-color').value = d.corTema || '#81fe4e';
            if(document.getElementById('theme-mode')) document.getElementById('theme-mode').value = d.modoTema || 'dark';
            if(document.getElementById('theme-opacity')) document.getElementById('theme-opacity').value = d.opacidadeTema || 0.8;
        }

        // Inicia todos os módulos do Workspace
        window.carregarDashboard();
        window.carregarProjetos();
        window.carregarNotas();
        window.carregarClientes();
        window.carregarLancamentos();
        window.carregarEventos();
        window.carregarReunioes();
        window.iniciarChatJam();
        window.iniciarTimerGlobal();
        window.iniciarEssentialsJam();
        window.iniciarTarefasJam();
        window.carregarRanking();
        
    } else {
        loginScreen.classList.remove('hidden');
    }
});

document.getElementById('btn-login-google').onclick = () => signInWithPopup(auth, provider).catch(e => console.error(e));
document.querySelector('.logout-btn').onclick = () => signOut(auth).catch(e => console.error(e));

// ==========================================
// 4. NAVEGAÇÃO SPA E MODAIS
// ==========================================
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const section = document.getElementById(target);
        if (section) section.classList.add('active');

        if (window.innerWidth <= 768) document.querySelector('.menu').classList.remove('active');
        document.querySelector('.content-area').scrollTop = 0;
    });
});

const mobileMenuBtn = document.getElementById('mobile-menu-btn');
if (mobileMenuBtn) mobileMenuBtn.onclick = () => document.querySelector('.menu').classList.toggle('active');

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');
document.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); });

// ==========================================
// 5. DASHBOARD E POMODORO
// ==========================================
window.pomodoroTempo = 25 * 60;
window.pomodoroIntervalo = null;

window.iniciarPomodoro = () => {
    if (window.pomodoroIntervalo) return;
    window.pomodoroIntervalo = setInterval(() => {
        if (window.pomodoroTempo > 0) {
            window.pomodoroTempo--;
            const m = Math.floor(window.pomodoroTempo/60).toString().padStart(2,'0');
            const s = (window.pomodoroTempo%60).toString().padStart(2,'0');
            document.getElementById('pomodoro-display').innerText = `${m}:${s}`;
        } else {
            clearInterval(window.pomodoroIntervalo);
            window.pomodoroIntervalo = null;
            window.pontuarGamificacao('pomodoro');
            alert("🍅 Tempo de foco concluído!");
            window.pomodoroTempo = 25 * 60;
            document.getElementById('pomodoro-display').innerText = "25:00";
        }
    }, 1000);
};
window.pausarPomodoro = () => { clearInterval(window.pomodoroIntervalo); window.pomodoroIntervalo = null; };

window.carregarDashboard = async () => {
    if (!auth.currentUser) return;
    const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    try {
        // Financeiro Dashboard
        const qFin = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
        const snapFin = await getDocs(qFin);
        let rec = 0, cus = 0;
        snapFin.forEach(d => { if (d.data().tipo === 'receita') rec += d.data().valor; else cus += d.data().valor; });
        const dashSaldo = document.getElementById('dash-saldo');
        if (dashSaldo) {
            dashSaldo.innerText = formatador.format(rec - cus);
            dashSaldo.style.color = (rec - cus) >= 0 ? 'var(--primary)' : '#ff5252';
        }

        // Tarefas Dashboard
        const qTsk = query(collection(db, "tarefas"), where("userId", "==", auth.currentUser.uid));
        const snapTsk = await getDocs(qTsk);
        let doing = 0, list = [];
        snapTsk.forEach(d => {
            if (d.data().status === 'doing') doing++;
            if (d.data().status !== 'done') list.push({id: d.id, ...d.data()});
        });
        const dashTasks = document.getElementById('dash-tasks');
        if (dashTasks) dashTasks.innerText = `${doing} Em andamento`;
        
        const priorities = document.getElementById('dash-priorities');
        if (priorities) {
            priorities.innerHTML = list.slice(0,3).map(t => `
                <div class="priority-item">
                    <input type="checkbox" onclick="concluirTarefaDash('${t.id}')" style="accent-color: var(--primary); width:16px; height:16px; cursor:pointer;">
                    <label><strong>${t.titulo}</strong> <span style="font-size:0.7rem; color:var(--text-muted); margin-left:10px;">${t.tag.toUpperCase()}</span></label>
                </div>
            `).join('') || '<p style="color:#666">Sem tarefas pendentes hoje.</p>';
        }

        // Eventos Dashboard
        const qEv = query(collection(db, "eventos"), where("userId", "==", auth.currentUser.uid));
        const snapEv = await getDocs(qEv);
        let eventos = [];
        snapEv.forEach(d => eventos.push(d.data()));
        eventos.sort((a,b) => new Date(a.data) - new Date(b.data));
        const dashEvent = document.getElementById('dash-event');
        if (dashEvent) {
            if (eventos.length > 0) {
                const prox = eventos[0]; const partes = prox.data.split('-');
                dashEvent.innerText = `${partes[2]}/${partes[1]} - ${prox.titulo}`;
                dashEvent.style.color = "var(--primary)";
            } else {
                dashEvent.innerText = "Agenda Livre";
                dashEvent.style.color = "var(--text-muted)";
            }
        }
    } catch(e) { console.error(e); }
};

window.concluirTarefaDash = async (id) => {
    await updateDoc(doc(db, "tarefas", id), { status: 'done' });
    window.pontuarGamificacao('tarefa');
    setTimeout(() => {
        window.carregarDashboard();
        if(window.projetoAtualId) window.carregarTarefasDoProjeto(window.projetoAtualId);
    }, 500);
};

// ==========================================
// 6. PROJETOS E KANBAN
// ==========================================
window.projetoAtualId = null;
window.projetoAtualRepo = null;

window.salvarProjeto = async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    const nome = document.getElementById('projetoNome').value;
    const colabs = document.getElementById('projetoColabs').value.toLowerCase().split(',').map(s => s.trim()).filter(s => s !== '');
    colabs.push(auth.currentUser.email.toLowerCase());

    try {
        await addDoc(collection(db, "projetos"), {
            nome, descricao: document.getElementById('projetoDesc').value,
            colaboradores: [...new Set(colabs)], userId: auth.currentUser.uid,
            githubRepo: document.getElementById('projetoRepo').value || '', 
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('formProjeto').reset();
        closeModal('modalNovoProjeto');
        window.carregarProjetos();
    } catch (e) { console.error("Erro ao criar projeto:", e); }
};

window.carregarProjetos = async () => {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const q = query(collection(db, "projetos"), where("colaboradores", "array-contains", auth.currentUser.email.toLowerCase()));
    
    onSnapshot(q, (snap) => {
        grid.innerHTML = snap.docs.map(d => {
            const p = d.data();
            const iniciais = p.nome.substring(0,2).toUpperCase();
            let btnApagar = (p.userId === auth.currentUser.uid) ? `<button class="icon-btn" onclick="event.stopPropagation(); deletarProjeto('${d.id}')" style="float:right; color:#ff5252;">🗑️</button>` : '';
            return `
                <div class="client-card" onclick="abrirProjeto('${d.id}', '${p.nome}', '${p.githubRepo}')" style="cursor:pointer;">
                    <div class="client-header">
                        <div class="client-avatar">${iniciais}</div>
                        <div class="client-title" style="flex:1;">
                            <h3>${p.nome} ${btnApagar}</h3>
                            <p class="client-role">${p.descricao}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');
    });
};

window.deletarProjeto = async (id) => { if(confirm("Apagar projeto?")) { await deleteDoc(doc(db, "projetos", id)); window.carregarProjetos(); } };

window.abrirProjeto = (id, nome, repo) => {
    window.projetoAtualId = id;
    window.projetoAtualRepo = repo;
    document.getElementById('projetos-home').style.display = 'none';
    document.getElementById('projeto-view').style.display = 'block';
    document.getElementById('projeto-titulo-atual').innerText = nome;
    
    // Switch forçado para a aba Kanban sempre que abre o projeto
    const btnKanban = document.querySelector('.itab-btn');
    if(btnKanban) window.switchProjectTab('tab-kanban', btnKanban);

    window.carregarTarefasDoProjeto(id);
    window.carregarWikiDoProjeto(id);
    window.carregarAudiosDoProjeto(id);
};

window.voltarParaProjetos = () => {
    window.projetoAtualId = null;
    document.getElementById('projetos-home').style.display = 'block';
    document.getElementById('projeto-view').style.display = 'none';
};

window.switchProjectTab = (id, btn) => {
    document.querySelectorAll('.project-tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.itab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(id);
    if (tab) tab.style.display = 'block'; 
    btn.classList.add('active');
};

window.carregarTarefasDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "tarefas"), where("projetoId", "==", pid)), (snap) => {
        const dropzones = ['todo', 'doing', 'done'];
        dropzones.forEach(s => { const el = document.getElementById(s); if(el) el.innerHTML = ''; });
        let counts = { todo: 0, doing: 0, done: 0 };
        
        snap.forEach(d => {
            const t = d.data();
            const card = document.createElement('div');
            card.className = 'kanban-card'; card.id = d.id; card.draggable = true;
            card.ondragstart = (ev) => ev.dataTransfer.setData("text", d.id);
            
            let badgeClass = 'badge-feature';
            if (t.tag === 'bug') badgeClass = 'badge-bug';
            if (t.tag === 'art') badgeClass = 'badge-art';
            if (t.tag === 'docs') badgeClass = 'badge-docs';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span class="badge ${badgeClass}">${t.tag.toUpperCase()}</span>
                    <button class="icon-btn" onclick="deletarTarefa('${d.id}')" style="color:#ff5252;">🗑️</button>
                </div>
                <h4>${t.titulo}</h4>
                <div style="margin-top:15px; font-size:0.75rem; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:10px;">
                    Criado por: Você
                </div>
            `;
            const alvo = document.getElementById(t.status);
            if (alvo) { alvo.appendChild(card); counts[t.status]++; }
        });
        
        document.getElementById('count-todo').innerText = counts.todo;
        document.getElementById('count-doing').innerText = counts.doing;
        document.getElementById('count-done').innerText = counts.done;
    });
};

window.salvarTarefa = async (e) => {
    e.preventDefault();
    if (!auth.currentUser || !window.projetoAtualId) return;
    try {
        await addDoc(collection(db, "tarefas"), {
            titulo: document.getElementById('taskTitle').value,
            tag: document.getElementById('taskTag').value,
            projetoId: window.projetoAtualId,
            status: 'todo',
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('formTarefa').reset();
        closeModal('modalTarefa');
    } catch(e) { console.error(e); }
};

window.deletarTarefa = async (id) => { if(confirm("Apagar tarefa?")) await deleteDoc(doc(db, "tarefas", id)); };

window.allowDrop = (e) => e.preventDefault();
window.drop = async (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    const zone = e.target.closest('.kanban-dropzone');
    if (zone) {
        await updateDoc(doc(db, "tarefas", id), { status: zone.id });
        if (zone.id === 'done') window.pontuarGamificacao('tarefa');
    }
};

window.configurarGitHub = function() {
    const token = prompt("Cole seu Personal Access Token do GitHub:");
    if(token) { localStorage.setItem('github_token', token.trim()); alert("Token salvo no navegador!"); }
};

// ==========================================
// 7. WIKI OBSIDIAN E ÁUDIOS
// ==========================================
window.wikiAtualId = null;
window.wikiCache = {};

window.setWikiMode = (mode) => {
    const edit = document.getElementById('wiki-conteudo');
    const prev = document.getElementById('wiki-preview-area');
    if (mode === 'preview') {
        prev.innerHTML = marked.parse(edit.value);
        edit.style.display = 'none'; prev.style.display = 'block';
        document.getElementById('btn-wiki-preview').classList.add('active');
        document.getElementById('btn-wiki-edit').classList.remove('active');
        mermaid.run({ nodes: document.querySelectorAll('.language-mermaid') });
    } else {
        edit.style.display = 'block'; prev.style.display = 'none';
        document.getElementById('btn-wiki-edit').classList.add('active');
        document.getElementById('btn-wiki-preview').classList.remove('active');
    }
};

window.novaPaginaWiki = () => {
    window.wikiAtualId = null;
    document.getElementById('wiki-titulo').value = "";
    document.getElementById('wiki-conteudo').value = "";
    window.setWikiMode('edit');
};

window.salvarPaginaWiki = async () => {
    const t = document.getElementById('wiki-titulo').value;
    const c = document.getElementById('wiki-conteudo').value;
    if (!t) return alert("Título obrigatório.");
    const data = { titulo: t, conteudo: c, projetoId: window.projetoAtualId };
    
    if (window.wikiAtualId) await updateDoc(doc(db, "wiki", window.wikiAtualId), data);
    else await addDoc(collection(db, "wiki"), { ...data, dataCriacao: new Date().toISOString() });
    alert("Documento Salvo!");
};

window.carregarWikiDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "wiki"), where("projetoId", "==", pid)), (snap) => {
        const list = document.getElementById('wiki-pages-list');
        if (!list) return;
        list.innerHTML = snap.docs.map(d => `<li onclick="abrirWiki('${d.id}')" style="cursor:pointer; padding:8px 0; border-bottom:1px solid var(--border-color); color:var(--text-main);">📄 ${d.data().titulo}</li>`).join('');
        snap.forEach(d => window.wikiCache[d.id] = d.data());
    });
};

window.abrirWiki = (id) => {
    window.wikiAtualId = id;
    const d = window.wikiCache[id];
    document.getElementById('wiki-titulo').value = d.titulo;
    document.getElementById('wiki-conteudo').value = d.conteudo;
    window.setWikiMode('edit');
};

window.deletarPaginaWiki = async () => {
    if(window.wikiAtualId && confirm("Apagar documento para todos?")) {
        await deleteDoc(doc(db, "wiki", window.wikiAtualId));
        window.novaPaginaWiki();
    }
};

// Áudios
window.adicionarNovaMusica = async () => {
    if (!window.projetoAtualId) return;
    const tit = prompt("Nome da música/SFX:"); if (!tit) return;
    const url = prompt("Link do áudio (mp3/wav):"); if (!url) return;
    await addDoc(collection(db, "audios"), { projetoId: window.projetoAtualId, titulo: tit, url: url, dataCriacao: new Date().toISOString() });
};

window.carregarAudiosDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "audios"), where("projetoId", "==", pid)), (snap) => {
        const list = document.getElementById('audio-playlist');
        if(list) list.innerHTML = snap.docs.map(d => `<li onclick="abrirAudio('${d.data().url}', '${d.data().titulo}')" style="cursor:pointer; padding:8px 0; border-bottom:1px solid var(--border-color);">🎵 ${d.data().titulo}</li>`).join('');
    });
};
window.abrirAudio = (url, tit) => {
    document.getElementById('review-audio').src = url;
    document.getElementById('audio-tocando-nome').innerText = tit;
};
window.adicionarComentarioAudioReal = () => {
    alert("Sistema de timestamp será ativado quando vinculado ao áudio selecionado!");
    document.getElementById('new-audio-comment').value = '';
};


// ==========================================
// 8. GAME JAM WAR ROOM
// ==========================================
window.enviarMensagemJam = async () => {
    const inp = document.getElementById('jam-msg-input');
    if (!inp.value.trim() || !auth.currentUser) return;
    await addDoc(collection(db, "gamejam_chat"), {
        texto: inp.value, autor: auth.currentUser.email.split('@')[0],
        uid: auth.currentUser.uid, dataCriacao: new Date().toISOString()
    });
    inp.value = '';
};

window.iniciarChatJam = () => {
    const box = document.getElementById('jam-chat-box');
    if(!box) return;
    onSnapshot(query(collection(db, "gamejam_chat"), orderBy("dataCriacao", "asc"), limit(50)), (snap) => {
        box.innerHTML = snap.docs.map(d => {
            const m = d.data(); const me = m.uid === auth.currentUser.uid;
            return `<div class="chat-msg ${me?'me':''}"><strong>${m.autor}:</strong> ${m.texto}</div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    });
};

window.iniciarTimerGlobal = () => {
    onSnapshot(doc(db, "gamejam_config", "timer"), (d) => {
        if (d.exists()) {
            const fim = new Date(d.data().dataFim);
            if(window.jamInterval) clearInterval(window.jamInterval);
            window.jamInterval = setInterval(() => {
                const diff = fim - new Date();
                if (diff <= 0) { document.getElementById('jam-timer').innerText = "00:00:00"; document.getElementById('jam-timer').style.color="#ff5252"; return; }
                const h = Math.floor(diff/3600000).toString().padStart(2,'0');
                const m = Math.floor((diff%3600000)/60000).toString().padStart(2,'0');
                const s = Math.floor((diff%60000)/1000).toString().padStart(2,'0');
                document.getElementById('jam-timer').innerText = `${h}:${m}:${s}`;
                document.getElementById('jam-timer').style.color="#fff";
            }, 1000);
        }
    });
};

window.configurarTimerJam = async () => {
    const h = prompt("Quantas horas durará a Jam?"); if (!h) return;
    const f = new Date(); f.setHours(f.getHours() + parseInt(h));
    await setDoc(doc(db, "gamejam_config", "timer"), { dataFim: f.toISOString() });
};

window.novaTarefaJam = async () => {
    const tit = document.getElementById('jam-new-task-title');
    const tag = document.getElementById('jam-new-task-tag');
    if (!tit.value.trim() || !auth.currentUser) return;
    await addDoc(collection(db, "gamejam_tarefas"), {
        titulo: tit.value, tag: tag.value, concluida: false, 
        responsavel: "", criadoPor: auth.currentUser.email.split('@')[0], 
        dataCriacao: new Date().toISOString()
    });
    tit.value = '';
};

window.iniciarTarefasJam = () => {
    onSnapshot(query(collection(db, "gamejam_tarefas"), orderBy("dataCriacao", "asc")), (snap) => {
        const list = document.getElementById('jam-task-list');
        if(!list) return;
        list.innerHTML = snap.docs.map(d => {
            const t = d.data();
            let corTag = '#666'; let icon = '📝';
            if(t.tag === 'dev') { corTag = '#00eaff'; icon = '💻'; }
            if(t.tag === 'arte') { corTag = '#ffc107'; icon = '🎨'; }
            if(t.tag === 'audio') { corTag = '#81fe4e'; icon = '🎵'; }
            if(t.tag === 'gdd') { corTag = '#ff5252'; icon = '📖'; }

            return `
                <li style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:12px; margin-bottom:10px; border-radius:8px;">
                    <input type="checkbox" ${t.concluida?'checked':''} onchange="toggleTarefaJam('${d.id}', ${t.concluida})" style="accent-color:var(--primary); width:18px; height:18px; cursor:pointer; margin-bottom:0;">
                    <div style="flex:1; display:flex; flex-direction:column;">
                        <span style="font-size:0.95rem; ${t.concluida?'text-decoration:line-through;color:#666':''}"><span style="color:${corTag};">${icon}</span> ${t.titulo}</span>
                    </div>
                    <button class="icon-btn" onclick="deletarTarefaJam('${d.id}')" style="color:#ff5252;">🗑️</button>
                </li>`;
        }).join('');
    });
};

window.toggleTarefaJam = async (id, status) => await updateDoc(doc(db, "gamejam_tarefas", id), { concluida: !status });
window.deletarTarefaJam = async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, "gamejam_tarefas", id)); };

window.iniciarEssentialsJam = () => {
    onSnapshot(doc(db, "gamejam_config", "essentials"), (d) => {
        if(d.exists()) {
            const v = d.data();
            document.getElementById('jam-tema').innerText = v.tema;
            document.getElementById('jam-link-itch').href = v.itch;
            document.getElementById('jam-link-repo').href = v.repo;
        }
    });
};
window.editarEssentialsJam = async () => {
    const t = prompt("Tema Oficial:"); const i = prompt("Link Itch.io:"); const r = prompt("Link GitHub:");
    await setDoc(doc(db, "gamejam_config", "essentials"), { tema: t||'-', itch: i||'#', repo: r||'#' });
};

// ==========================================
// 9. CLIENTES, FINANCEIRO, AGENDA, DIÁRIO
// ==========================================

/* --- CLIENTES --- */
window.salvarCliente = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "clientes"), {
            nome: document.getElementById('clienteNome').value,
            tipo: document.getElementById('clienteTipo').value,
            email: document.getElementById('clienteEmail').value,
            discord: document.getElementById('clienteDiscord').value,
            notas: document.getElementById('clienteNotas').value,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('formCliente').reset();
        closeModal('modalCliente');
        window.carregarClientes();
    } catch(e) { console.error(e); }
};

window.carregarClientes = async function() {
    const grid = document.getElementById('client-entries');
    if (!grid || !auth.currentUser) return;
    const q = query(collection(db, "clientes"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    grid.innerHTML = snap.docs.map(d => {
        const c = d.data();
        const iniciais = c.nome.substring(0,2).toUpperCase();
        return `
        <div class="client-card">
            <div class="client-header">
                <div class="client-avatar">${iniciais}</div>
                <div class="client-title"><h3>${c.nome}</h3><p class="client-role">${c.tipo.toUpperCase()}</p></div>
            </div>
            <div class="client-body">
                <p><strong>Email:</strong> ${c.email}</p>
                <p><strong>Contato:</strong> ${c.discord || '-'}</p>
            </div>
            <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px; text-align:right;">
                <button class="icon-btn" style="color: #ff5252;" onclick="deletarCliente('${d.id}')">🗑️ Excluir</button>
            </div>
        </div>`;
    }).join('') || '<p style="color:#666">Nenhum cliente cadastrado.</p>';
};
window.deletarCliente = async function(id) { if(confirm("Apagar cliente?")) { await deleteDoc(doc(db, "clientes", id)); window.carregarClientes(); } };


/* --- FINANCEIRO --- */
window.salvarLancamento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "lancamentos"), {
            tipo: document.getElementById('financeTipo').value,
            origem: document.getElementById('financeOrigem').value,
            descricao: document.getElementById('financeDescricao').value,
            valor: parseFloat(document.getElementById('financeValor').value),
            dataVencimento: document.getElementById('financeData').value,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('formFinanceiro').reset();
        closeModal('modalLancamento');
        window.carregarLancamentos();
        window.carregarDashboard();
    } catch(e) { console.error(e); }
};

window.carregarLancamentos = async function() {
    const tbody = document.getElementById('finance-entries');
    if (!tbody || !auth.currentUser) return;
    const q = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    let rec = 0, cus = 0;
    const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    
    let html = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.tipo === 'receita') rec += d.valor; else cus += d.valor;
        const badge = d.tipo === 'receita' ? 'badge-receita' : 'badge-custo';
        const partes = d.dataVencimento ? d.dataVencimento.split('-') : ['00','00','0000'];
        const dataF = `${partes[2]}/${partes[1]}/${partes[0]}`;
        
        html += `<tr>
            <td>${dataF}</td>
            <td><strong>${d.origem}</strong></td>
            <td><span class="badge ${badge}">${d.tipo.toUpperCase()}</span></td>
            <td style="color: ${d.tipo === 'receita' ? '#4caf50' : '#ff5252'}; font-weight:bold;">${d.tipo === 'receita' ? '+' : '-'} ${formatador.format(d.valor)}</td>
            <td><button class="icon-btn" style="color:#ff5252" onclick="deletarLancamento('${docSnap.id}')">🗑️</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; color:#666;">Nenhum lançamento.</td></tr>';
    
    document.getElementById('resumoReceita').innerText = formatador.format(rec);
    document.getElementById('resumoCusto').innerText = formatador.format(cus);
    document.getElementById('resumoSaldo').innerText = formatador.format(rec - cus);
    document.getElementById('resumoSaldo').className = (rec - cus) >= 0 ? 'valor text-neon' : 'valor text-red';
};
window.deletarLancamento = async function(id) { if(confirm("Apagar lançamento?")) { await deleteDoc(doc(db, "lancamentos", id)); window.carregarLancamentos(); window.carregarDashboard();} };


/* --- CRONOGRAMA / EVENTOS --- */
window.salvarEvento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "eventos"), {
            titulo: document.getElementById('eventoTitulo').value,
            data: document.getElementById('eventoData').value,
            hora: document.getElementById('eventoHora').value || '',
            tipo: document.getElementById('eventoTipo').value,
            link: document.getElementById('eventoLink').value || '',
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('formEvento').reset();
        closeModal('modalEvento');
        window.carregarEventos();
        window.carregarDashboard();
    } catch(e) { console.error(e); }
};

window.carregarEventos = async function() {
    const lista = document.getElementById('event-entries');
    if (!lista || !auth.currentUser) return;
    const q = query(collection(db, "eventos"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    let eventos = [];
    snap.forEach(d => eventos.push({id: d.id, ...d.data()}));
    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    lista.innerHTML = eventos.map(e => {
        const dataObj = new Date(e.data + "T00:00:00");
        const dia = String(dataObj.getDate()).padStart(2, '0');
        const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        
        let badge = 'badge-meeting'; let label = 'Reunião';
        if (e.tipo === 'deadline') { badge = 'badge-deadline'; label = 'Deadline'; }
        if (e.tipo === 'release') { badge = 'badge-release'; label = 'Lançamento'; }
        if (e.tipo === 'geral') { badge = 'badge-docs'; label = 'Aviso'; }

        return `
        <div class="event-item">
            <div class="event-date">
                <span class="e-day">${dia}</span>
                <span class="e-month">${meses[dataObj.getMonth()]}</span>
            </div>
            <div class="event-details">
                <h4>${e.titulo}</h4>
                <p>${e.hora} ${e.link ? `<a href="${e.link}" target="_blank" style="color:var(--primary); margin-left:5px;">Link</a>` : ''}</p>
                <span class="badge ${badge}">${label}</span>
            </div>
            <button class="icon-btn" style="color:#ff5252" onclick="deletarEvento('${e.id}')">🗑️</button>
        </div>`;
    }).join('') || '<p style="color:#666">Nenhum evento agendado.</p>';
};
window.deletarEvento = async function(id) { if(confirm("Cancelar evento?")) { await deleteDoc(doc(db, "eventos", id)); window.carregarEventos(); window.carregarDashboard();} };


/* --- DIÁRIO PESSOAL --- */
window.salvarNota = async () => {
    const tit = document.getElementById('noteTitle').value;
    const cont = document.getElementById('noteContent').value;
    if (!cont || !auth.currentUser) return;
    await addDoc(collection(db, "diario"), { title: tit, content: cont, userId: auth.currentUser.uid, dataCriacao: new Date().toISOString() });
    document.getElementById('noteTitle').value = ''; document.getElementById('noteContent').value = '';
    window.carregarNotas();
};

window.carregarNotas = async () => {
    const grid = document.getElementById('diary-entries');
    if(!grid || !auth.currentUser) return;
    const q = query(collection(db, "diario"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    let notas = []; snap.forEach(d => notas.push({id: d.id, ...d.data()}));
    notas.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

    grid.innerHTML = notas.map(d => {
        const dataObj = new Date(d.dataCriacao);
        const dataF = `${String(dataObj.getDate()).padStart(2,'0')}/${String(dataObj.getMonth()+1).padStart(2,'0')}`;
        return `
        <div class="diary-card">
            <div class="diary-card-header">
                <h4>${d.title || 'Sem título'}</h4>
                <span class="diary-card-date">${dataF}</span>
            </div>
            <div class="diary-card-body"><p>${d.content.replace(/\n/g, '<br>')}</p></div>
            <div class="diary-card-footer">
                <button class="icon-btn" style="color:#ff5252" onclick="deletarNota('${d.id}')">🗑️ Apagar</button>
            </div>
        </div>`;
    }).join('');
};
window.deletarNota = async (id) => { if(confirm("Apagar nota?")) { await deleteDoc(doc(db, "diario", id)); window.carregarNotas(); } };

/* --- REUNIÕES (CONVITES) --- */
window.enviarConviteAdmin = async function(event) {
    event.preventDefault();
    const emailAlvo = document.getElementById('admConviteEmail').value.trim().toLowerCase();
    const titulo = document.getElementById('admConviteTitulo').value;
    try {
        const q = query(collection(db, "usuarios"), where("email", "==", emailAlvo));
        const snap = await getDocs(q);
        if (snap.empty) return alert("Usuário não encontrado!");
        let targetId = ""; snap.forEach(d => targetId = d.data().uid);
        
        await addDoc(collection(db, "reunioes"), {
            titulo, remetente: auth.currentUser.email,
            status: 'pendente', userId: targetId,
            dataCriacao: new Date().toISOString()
        });
        alert("Convite Enviado!");
        event.target.reset();
        window.carregarReunioes();
    } catch(e) { console.error(e); }
};

window.carregarReunioes = async function() {
    const invites = document.getElementById('invites-entries');
    const confirms = document.getElementById('confirmed-entries');
    if(!invites || !auth.currentUser) return;
    
    const q = query(collection(db, "reunioes"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    let htmlP = ''; let htmlC = '';
    snap.forEach(d => {
        const r = d.data();
        if (r.status === 'pendente') {
            htmlP += `
            <div class="invite-card">
                <div>
                    <h3>${r.titulo}</h3>
                    <p style="font-size:0.8rem; color:#aaa;">De: ${r.remetente}</p>
                </div>
                <div class="invite-actions">
                    <button class="btn-primary" style="padding:8px 15px;" onclick="responderConvite('${d.id}', 'confirmado')">Aceitar</button>
                    <button class="btn-secondary" style="padding:8px 15px; border-color:#ff5252; color:#ff5252;" onclick="responderConvite('${d.id}', 'recusado')">Recusar</button>
                </div>
            </div>`;
        } else if (r.status === 'confirmado') {
            htmlC += `
            <div class="confirmed-item">
                <div class="c-date"><strong>HK</strong></div>
                <div>
                    <h4 style="color:#fff; margin-bottom:5px;">${r.titulo}</h4>
                    <p style="font-size:0.8rem; color:var(--primary);"><span class="status-dot green"></span> Confirmado</p>
                </div>
            </div>`;
        }
    });
    invites.innerHTML = htmlP || '<p style="color:#666">Nenhum convite pendente.</p>';
    if(confirms) confirms.innerHTML = htmlC || '<p style="color:#666">Nenhuma reunião confirmada.</p>';
};

window.responderConvite = async function(id, novoStatus) {
    if (novoStatus === 'recusado') await deleteDoc(doc(db, "reunioes", id));
    else await updateDoc(doc(db, "reunioes", id), { status: novoStatus });
    window.carregarReunioes();
};

// ==========================================
// 10. PERFIL E CUSTOMIZAÇÃO
// ==========================================
window.pontuarGamificacao = async (tipo) => {
    if(!auth.currentUser) return;
    const ref = doc(db, "usuarios", auth.currentUser.uid);
    if (tipo === 'pomodoro') await updateDoc(ref, { pomodoros: increment(1) });
    if (tipo === 'tarefa') await updateDoc(ref, { tasksFeitas: increment(1) });
};

window.carregarRanking = () => {
    const list = document.getElementById('ranking-list');
    if(!list) return;
    onSnapshot(collection(db, "usuarios"), (snap) => {
        let u = []; snap.forEach(d => u.push(d.data()));
        u.sort((a,b) => ((b.pomodoros||0) + (b.tasksFeitas||0)) - ((a.pomodoros||0) + (a.tasksFeitas||0)));
        list.innerHTML = u.map((user, i) => `
            <div class="ranking-item" style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:15px; border-radius:12px;">
                <span style="font-weight:bold; color:#fff;">${i+1}º ${user.nome}</span>
                <span style="font-size:0.9rem;">🍅 ${user.pomodoros||0} | ✅ ${user.tasksFeitas||0}</span>
            </div>
        `).join('');
    });
};

window.salvarPreferencias = async (e) => {
    const btn = e.target; btn.disabled = true; btn.innerText = "Salvando...";
    const cor = document.getElementById('theme-color').value;
    const modo = document.getElementById('theme-mode').value;
    const op = document.getElementById('theme-opacity').value;
    const file = document.getElementById('theme-bg-file').files[0];
    let bg64 = null;

    if (file && file.size <= 800*1024) {
        bg64 = await new Promise(r => {
            const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(file);
        });
    } else if (file) {
        alert("Imagem pesada! Máximo de 800kb."); btn.disabled = false; btn.innerText = "Salvar Meu Estilo"; return;
    }

    const upd = { corTema: cor, modoTema: modo, opacidadeTema: op };
    if (bg64) upd.bgTema = bg64;
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), upd);
    window.aplicarTema(cor, bg64, modo, op);
    
    btn.disabled = false; btn.innerText = "✓ Estilo Guardado";
    setTimeout(() => btn.innerText = "Salvar Meu Estilo", 2000);
};

window.aplicarTema = (cor, bg, modo, op) => {
    document.documentElement.style.setProperty('--primary', cor || '#81fe4e');
    const overlay = (modo === 'light') ? `rgba(240,242,245,${op||0.8})` : `rgba(0,0,0,${op||0.8})`;
    if (modo === 'light') document.body.classList.add('light-theme'); else document.body.classList.remove('light-theme');
    
    if (bg) {
        document.body.style.backgroundImage = `linear-gradient(${overlay},${overlay}), url('${bg}')`;
        document.body.style.backgroundSize = 'cover'; document.body.style.backgroundAttachment = 'fixed';
    } else { document.body.style.backgroundImage = 'none'; }
};