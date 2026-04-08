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
// ==========================================
// 3. LÓGICA DE LOGIN E SISTEMA DE CARGOS
// ==========================================
window.userRole = 'membro'; // Padrão para todo mundo que entra

// Aqui você pode colocar os e-mails dos donos do estúdio que SEMPRE serão Admins absolutos
const SUPER_ADMINS = ["devao.developer@gmail.com", "seu_socio@gmail.com"]; 

onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('login-screen');
    if (user) {
        loginScreen.classList.add('hidden');
        document.querySelector('.user-email').textContent = user.email;
        
        // 1. Busca os dados do usuário no banco de dados
        const userDocRef = doc(db, "usuarios", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        let cargoAtual = 'membro';
        
        if (userDoc.exists()) {
            const d = userDoc.data();
            cargoAtual = d.role || 'membro'; // Puxa o cargo salvo (se não tiver, é membro)
            window.aplicarTema(d.corTema, d.bgTema, d.modoTema, d.opacidadeTema);
        }

        // 2. Trava de Segurança: Se for um dos donos, força o cargo de admin
        if (SUPER_ADMINS.includes(user.email.toLowerCase())) {
            cargoAtual = 'admin';
        }
        
        window.userRole = cargoAtual; // Salva globalmente para o resto do código usar

        // 3. Atualiza os dados no banco (agora salvando o cargo junto)
        await setDoc(userDocRef, {
            email: user.email.toLowerCase(),
            uid: user.uid,
            nome: user.displayName || 'Membro',
            ultimoAcesso: new Date().toISOString(),
            role: cargoAtual
        }, { merge: true });

        // 4. APLICA AS REGRAS VISUAIS DA TELA
        window.aplicarPermissoes(cargoAtual);

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

// FUNÇÃO QUE ESCONDE/MOSTRA AS COISAS BASEADO NO CARGO
window.aplicarPermissoes = (cargo) => {
    const painelAdm = document.getElementById('admin-panel');
    const btnNovoProj = document.getElementById('btn-novo-projeto');
    const btnNovaTask = document.getElementById('btn-nova-tarefa');

    // Só Admin vê o painel de enviar reuniões oficiais
    if (painelAdm) painelAdm.style.display = (cargo === 'admin') ? "block" : "none";

    // Só Admin e Gerente podem CRIAR projetos e tarefas
    const podeCriar = (cargo === 'admin' || cargo === 'gerente');
    if (btnNovoProj) btnNovoProj.style.display = podeCriar ? "block" : "none";
    if (btnNovaTask) btnNovaTask.style.display = podeCriar ? "block" : "none";
};

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
window.pomodoroMinutosOriginais = 25;
window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
window.pomodoroIntervalo = null;
window.tarefaEmFocoAtual = null; // Guarda a tarefa selecionada

// Atualiza o relógio no mini-card e na tela cheia
window.atualizarDisplayPomodoro = () => {
    const m = Math.floor(window.pomodoroTempo / 60).toString().padStart(2, '0');
    const s = (window.pomodoroTempo % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    
    const miniDisplay = document.getElementById('pomodoro-display');
    const focusDisplay = document.getElementById('focus-time-display');
    
    if (miniDisplay) miniDisplay.innerText = timeStr;
    if (focusDisplay) focusDisplay.innerText = timeStr;
};

// Lógica de Contagem
window.iniciarPomodoro = () => {
    if (window.pomodoroIntervalo) return;
    window.pomodoroIntervalo = setInterval(() => {
        if (window.pomodoroTempo > 0) {
            window.pomodoroTempo--;
            window.atualizarDisplayPomodoro();
        } else {
            clearInterval(window.pomodoroIntervalo);
            window.pomodoroIntervalo = null;
            window.pontuarGamificacao('pomodoro');
            alert("🍅 Tempo de foco concluído! Faça uma pausa.");
            
            // Reseta pro tempo padrão
            window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
            window.atualizarDisplayPomodoro();
        }
    }, 1000);
};

window.pausarPomodoro = () => { 
    clearInterval(window.pomodoroIntervalo); 
    window.pomodoroIntervalo = null; 
};

window.resetarPomodoro = () => { 
    window.pausarPomodoro(); 
    window.pomodoroTempo = window.pomodoroMinutosOriginais * 60; 
    window.atualizarDisplayPomodoro(); 
};

// Editar Tempo clicando no relógio gigante
window.editarTempoPomodoro = () => {
    window.pausarPomodoro(); // Pausa por segurança
    const novoTempo = prompt("Quantos minutos você quer focar?", window.pomodoroMinutosOriginais);
    if (novoTempo && !isNaN(novoTempo) && parseInt(novoTempo) > 0) {
        window.pomodoroMinutosOriginais = parseInt(novoTempo);
        window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
        window.atualizarDisplayPomodoro();
    }
};

// --- MODO FOCO (TELAS E TAREFAS) ---
window.abrirFocusMode = () => {
    document.getElementById('pomodoro-focus-mode').classList.add('active');
    window.carregarTarefasFocus(); // Carrega as tarefas pra escolher
};

window.fecharFocusMode = () => {
    document.getElementById('pomodoro-focus-mode').classList.remove('active');
    document.getElementById('focus-tasks-panel').classList.remove('open');
};

window.togglePainelTarefasFoco = () => {
    document.getElementById('focus-tasks-panel').classList.toggle('open');
};

window.selecionarTarefaFoco = (id, titulo, tag) => {
    window.tarefaEmFocoAtual = { id, titulo, tag };
    const label = document.getElementById('focus-current-task');
    label.innerHTML = `<span style="color:var(--primary)">🎯 Focando em:</span> ${titulo}`;
    window.togglePainelTarefasFoco(); // Fecha o painel lateral
};

window.carregarTarefasFocus = async () => {
    if (!auth.currentUser) return;
    const lista = document.getElementById('focus-tasks-list');
    lista.innerHTML = '<p style="color:#666; text-align:center;">Buscando suas tarefas...</p>';
    
    try {
        const qTsk = query(collection(db, "tarefas"), where("userId", "==", auth.currentUser.uid));
        const snapTsk = await getDocs(qTsk);
        let pendentes = [];
        
        snapTsk.forEach(d => {
            if (d.data().status !== 'done') pendentes.push({id: d.id, ...d.data()});
        });

        if(pendentes.length === 0) {
            lista.innerHTML = '<p style="color:#4caf50; text-align:center;">Tudo limpo! Nenhuma tarefa pendente.</p>';
            return;
        }

        lista.innerHTML = pendentes.map(t => `
            <li onclick="selecionarTarefaFoco('${t.id}', '${t.titulo}', '${t.tag}')">
                <strong>${t.titulo}</strong>
                <span>Tag: ${t.tag.toUpperCase()}</span>
            </li>
        `).join('');
    } catch(e) { console.error("Erro ao carregar tarefas pro Foco:", e); }
};

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

// ATUALIZADO: Carregar Projetos (Agora com Suporte a Capa e Avatar)
window.carregarProjetos = async () => {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const q = query(collection(db, "projetos"), where("colaboradores", "array-contains", auth.currentUser.email.toLowerCase()));
    
    onSnapshot(q, (snap) => {
        grid.innerHTML = snap.docs.map(d => {
            const p = d.data();
            const iniciais = p.nome.substring(0,2).toUpperCase();
            
            // Verifica se é o dono para poder apagar
            let btnApagar = (p.userId === auth.currentUser.uid) ? `<button class="icon-btn" onclick="event.stopPropagation(); deletarProjeto('${d.id}')" style="color:#ff5252; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;">🗑️</button>` : '';
            
            // Lógica Visual: Tem Capa? Aplica com gradiente escuro em cima pra ler o texto.
            const bgStyle = p.capaBase64 ? `background: linear-gradient(rgba(15,15,15,0.7), rgba(15,15,15,0.95)), url('${p.capaBase64}') center/cover; border-color: rgba(255,255,255,0.2);` : '';
            
            // Lógica Visual: Tem Avatar? Coloca a imagem, senão usa as Iniciais.
            const avatarHtml = p.avatarBase64 ? `<img src="${p.avatarBase64}" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">` : iniciais;

            return `
                <div class="client-card" onclick="abrirProjeto('${d.id}', '${p.nome}', '${p.githubRepo}')" style="cursor:pointer; ${bgStyle}">
                    <div class="client-header" style="border-bottom-color: rgba(255,255,255,0.1);">
                        <div class="client-avatar" style="padding:0; overflow:hidden;">${avatarHtml}</div>
                        <div class="client-title" style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3 style="margin:0;">${p.nome}</h3>
                                ${btnApagar}
                            </div>
                            <p class="client-role" style="margin-top:5px;">Equipe: ${p.colaboradores.length} membro(s)</p>
                        </div>
                    </div>
                    <div class="client-body">
                        <p style="color: #e0e0e0;">${p.descricao}</p>
                    </div>
                </div>`;
        }).join('');
    });
};

window.abrirModalEditarProjeto = async () => {
    if (!window.projetoAtualId) return;
    
    // Puxa os dados frescos do banco
    const docSnap = await getDoc(doc(db, "projetos", window.projetoAtualId));
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById('editProjNome').value = p.nome;
        document.getElementById('editProjDesc').value = p.descricao;
        
        // Remove o próprio e-mail da lista pra não ficar confuso
        const colabsSemDono = p.colaboradores.filter(em => em !== auth.currentUser.email.toLowerCase());
        document.getElementById('editProjColabs').value = colabsSemDono.join(', ');
        
        document.getElementById('editProjRepo').value = p.githubRepo || '';
        
        window.openModal('modalEditarProjeto');
    }
};

window.salvarEdicaoProjeto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "Processando... ⏳";

    const nome = document.getElementById('editProjNome').value.trim();
    const desc = document.getElementById('editProjDesc').value.trim();
    const repo = document.getElementById('editProjRepo').value.trim();
    const colabsInput = document.getElementById('editProjColabs').value;
    
    // Monta a lista de e-mails garantindo que o dono está dentro
    let colaboradores = [auth.currentUser.email.toLowerCase()];
    if (colabsInput) {
        const extras = colabsInput.split(',').map(em => em.trim().toLowerCase()).filter(em => em !== '');
        colaboradores = [...new Set([...colaboradores, ...extras])];
    }

    const avatarFile = document.getElementById('editProjAvatar').files[0];
    const capaFile = document.getElementById('editProjCapa').files[0];

    let updateData = {
        nome: nome,
        descricao: desc,
        colaboradores: colaboradores,
        githubRepo: repo,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        // Converte as imagens para texto (se o usuário enviou alguma)
        if (avatarFile) {
            if (avatarFile.size > 800*1024) throw new Error("A imagem do Avatar é muito pesada (Máx 800kb).");
            updateData.avatarBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(avatarFile); });
        }
        if (capaFile) {
            if (capaFile.size > 800*1024) throw new Error("A imagem da Capa é muito pesada (Máx 800kb).");
            updateData.capaBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(capaFile); });
        }

        // Salva tudo no banco
        await updateDoc(doc(db, "projetos", window.projetoAtualId), updateData);
        
        // Atualiza a tela na mesma hora
        document.getElementById('projeto-titulo-atual').innerText = nome;
        window.projetoAtualRepo = repo;
        
        closeModal('modalEditarProjeto');
        document.getElementById('formEditarProjeto').reset();

    } catch (err) {
        alert(err.message || "Erro inesperado ao salvar o projeto.");
    }
    
    btn.disabled = false;
    btn.innerText = "Salvar Alterações";
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

// 2. CARREGAR TAREFAS E FILTROS (Com Cache Inteligente)
window.tarefasProjetoCache = []; // Guarda as tarefas na memória
window.kanbanFiltroAtual = 'all'; // Começa mostrando tudo

// Função que o botão select do HTML chama quando você escolhe uma área
window.aplicarFiltroKanban = () => {
    window.kanbanFiltroAtual = document.getElementById('kanban-filter').value;
    window.renderizarKanban(); // Re-desenha a tela na hora
};

// Ouve o Firebase e atualiza o Cache invisível
window.carregarTarefasDoProjeto = (pid) => {
    // Se já tivermos um "espião" (listener) antigo rodando, a gente desliga ele primeiro
    if (window.unsubTarefas) window.unsubTarefas();

    window.unsubTarefas = onSnapshot(query(collection(db, "tarefas"), where("projetoId", "==", pid)), (snap) => {
        window.tarefasProjetoCache = [];
        snap.forEach(d => {
            window.tarefasProjetoCache.push({ id: d.id, ...d.data() });
        });
        window.renderizarKanban(); // Manda desenhar a tela
    });
};

// Desenha a tela aplicando os filtros escolhidos
window.renderizarKanban = () => {
    const dropzones = ['todo', 'doing', 'done'];
    dropzones.forEach(s => { const el = document.getElementById(s); if(el) el.innerHTML = ''; });
    let counts = { todo: 0, doing: 0, done: 0 };
    
    const filtro = window.kanbanFiltroAtual;

    window.tarefasProjetoCache.forEach(t => {
        if (filtro !== 'all' && t.tag !== filtro) return;

        const card = document.createElement('div');
        card.className = 'kanban-card'; card.id = t.id; card.draggable = true;
        card.ondragstart = (ev) => ev.dataTransfer.setData("text", t.id);
        card.onclick = () => window.abrirDetalhesTarefa(t.id, t);
        card.dataset.ghIssue = t.githubIssue || '';
        
        // Cores das Tags
        let badgeClass = `badge-${t.tag}`;
        const ghLink = t.githubIssue ? `<span style="color:var(--primary);" title="GitHub Issue">🔗 #${t.githubIssue}</span>` : '☁️';

        // Lógica de Assiduidade/Dono
        let assignedHtml = "";
        if (t.assignedTo) {
            // Se já tem dono, mostra o nome/iniciais
            const iniciais = t.assignedName ? t.assignedName.substring(0, 2).toUpperCase() : "??";
            assignedHtml = `<div class="task-owner" title="Assumido por ${t.assignedName}">${iniciais}</div>`;
        } else {
            // Se não tem dono, mostra o botão de Assumir
            assignedHtml = `<button class="btn-assumir" onclick="event.stopPropagation(); window.assumirTarefa('${t.id}')">Assumir</button>`;
        }

        const btnApagar = (window.userRole === 'admin') ? 
            `<button class="icon-btn" onclick="event.stopPropagation(); window.deletarTarefa('${t.id}')" style="color:#ff5252; padding: 5px;">🗑️</button>` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                <span class="badge ${badgeClass}">${t.tag.toUpperCase()}</span>
                ${btnApagar}
            </div>
            <h4 style="margin-bottom:15px; min-height:40px;">${t.titulo}</h4>
            <div class="card-footer">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${assignedHtml}
                    ${ghLink}
                </div>
                <span style="font-size:0.7rem; color:var(--text-muted);">v1.0</span>
            </div>
        `;
        
        const alvo = document.getElementById(t.status);
        if (alvo) { alvo.appendChild(card); counts[t.status]++; }
    });
    
    document.getElementById('count-todo').innerText = counts.todo;
    document.getElementById('count-doing').innerText = counts.doing;
    document.getElementById('count-done').innerText = counts.done;
};

window.salvarTarefa = async (e) => {
    e.preventDefault();
    if (!auth.currentUser || !window.projetoAtualId) return;
    
    // Proteção 1: Pega o botão com segurança
    const btnSubmit = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
    let textoOriginal = "Criar Tarefa";
    if (btnSubmit) {
        textoOriginal = btnSubmit.innerText;
        btnSubmit.innerText = "Criando... ⏳";
        btnSubmit.disabled = true;
    }
    
    try {
        // Proteção 2: Pega os valores com "?" (Optional Chaining) para não crashar se o HTML faltar
        const titulo = document.getElementById('taskTitle')?.value || "Tarefa sem título";
        const tag = document.getElementById('taskTag')?.value || "feature";
        const desc = document.getElementById('taskDesc')?.value || ""; 
        
        let issueNumber = null;
        let issueUrl = null;
        const token = localStorage.getItem('github_token');

        // Tenta enviar pro GitHub
        if (window.projetoAtualRepo && token) {
            try {
                const res = await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues`, {
                    method: "POST",
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        title: titulo,
                        body: desc || `Tarefa gerada via HeartKey Hub.`,
                        labels: [tag]
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    issueNumber = data.number;
                    issueUrl = data.html_url;
                }
            } catch (err) { console.error("Falha Git:", err); } // Se o Git falhar, ele apenas ignora e segue pro Firebase
        }

        // Salva no nosso banco (Firebase)
        await addDoc(collection(db, "tarefas"), {
            titulo: titulo, 
            tag: tag, 
            descricao: desc, 
            projetoId: window.projetoAtualId,
            status: 'todo', 
            githubIssue: issueNumber, 
            githubUrl: issueUrl,
            userId: auth.currentUser.uid, 
            dataCriacao: new Date().toISOString()
        });
        
        // Limpa o formulário e tenta fechar o modal com segurança
        document.getElementById('formTarefa')?.reset();
        
        if (typeof closeModal === 'function') {
            closeModal('modalTarefa');
        } else if (typeof window.closeModal === 'function') {
            window.closeModal('modalTarefa');
        }
        
    } catch(erroFatal) { 
        console.error("Erro fatal ao salvar tarefa:", erroFatal); 
        alert("Ops! Ocorreu um erro ao salvar a tarefa. Aperte F12 e olhe o Console.");
    } finally {
        // Proteção 3: O bloco FINALLY roda de qualquer jeito, garantindo que o botão destrave!
        if (btnSubmit) {
            btnSubmit.innerText = textoOriginal;
            btnSubmit.disabled = false;
        }
    }
};

// 5. APAGAR TAREFA (E cancelar a Issue no GitHub)
window.deletarTarefa = async (id) => {
    if(confirm("Apagar esta tarefa permanentemente?")) {
        try {
            // 1. Pega os dados da tarefa para saber qual é o número da Issue no Git
            const docRef = doc(db, "tarefas", id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const tarefa = docSnap.data();
                const token = localStorage.getItem('github_token');
                
                // 2. Se ela estiver atrelada a uma Issue, avisa o GitHub para cancelar!
                if (window.projetoAtualRepo && token && tarefa.githubIssue) {
                    await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${tarefa.githubIssue}`, {
                        method: "PATCH",
                        headers: {
                            "Accept": "application/vnd.github+json",
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ 
                            state: "closed", 
                            state_reason: "not_planned" // O pulo do gato: marca como "Cancelada/Excluída"
                        }) 
                    });
                }
            }
            
            // 3. Finalmente, apaga a tarefa do nosso banco de dados no Firebase
            await deleteDoc(docRef);
            
        } catch(err) {
            console.error("Erro ao apagar tarefa e sincronizar com Git:", err);
            alert("Erro ao excluir. Olhe o console (F12).");
        }
    }
};

window.allowDrop = (e) => e.preventDefault();

window.drop = async (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    const zone = e.target.closest('.kanban-dropzone');
    
    if (zone) {
        const novoStatus = zone.id;
        const taskRef = doc(db, "tarefas", id);
        const docSnap = await getDoc(taskRef);
        
        if (docSnap.exists()) {
            const t = docSnap.data();

            // Atualiza status no Firebase
            await updateDoc(taskRef, { status: novoStatus });

            // GAMIFICAÇÃO: Se foi concluída, pontua para quem estava assumido!
            if (novoStatus === 'done' && t.assignedTo) {
                // Passamos o ID de quem estava na tarefa para o ranking
                window.pontuarGamificacao('tarefa', t.assignedTo, t.tag);
            }

            // Sync GitHub (mesma lógica de antes...)
            const token = localStorage.getItem('github_token');
            if (window.projetoAtualRepo && token && t.githubIssue) {
                const state = novoStatus === 'done' ? 'closed' : 'open';
                fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${t.githubIssue}`, {
                    method: "PATCH",
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ state: state })
                });
            }
        }
    }
};

window.configurarGitHub = function() {
    const token = prompt("Cole seu Personal Access Token do GitHub:");
    if(token) { localStorage.setItem('github_token', token.trim()); alert("Token salvo no navegador!"); }
};

// ==========================================
// IMPORTAR ISSUES DO GITHUB PARA O HUB
// ==========================================
window.sincronizarGitHub = async () => {
    if (!auth.currentUser || !window.projetoAtualId) return;
    
    const token = localStorage.getItem('github_token');
    if (!token || !window.projetoAtualRepo) {
        alert("⚠️ Conecte seu Token do GitHub e garanta que o repositório do projeto está configurado (ex: heartkeystudio/freakhunter).");
        return;
    }

    const btn = document.querySelector('button[onclick="sincronizarGitHub()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = "Sincronizando... ⏳";
    btn.disabled = true;

    try {
        // 1. Vai no GitHub buscar TODAS as issues
        const res = await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues?state=all&per_page=100`, {
            method: "GET",
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error("Não foi possível ler o repositório.");
        const issuesGit = await res.json();

        // 2. Busca as tarefas que JÁ EXISTEM no Firebase
        const q = query(collection(db, "tarefas"), where("projetoId", "==", window.projetoAtualId));
        const snap = await getDocs(q);
        const issuesNativas = new Set();
        
        snap.forEach(doc => {
            if (doc.data().githubIssue) issuesNativas.add(doc.data().githubIssue);
        });

        // 3. Compara e salva as que estão faltando
        let importadas = 0;
        
        for (const issue of issuesGit) {
            // IGNORA Pull Requests
            if (issue.pull_request) continue;

            // O PULO DO GATO: Ignora as issues que foram "apagadas/canceladas"
            if (issue.state_reason === 'not_planned') continue; 

            // Se essa Issue ainda não existe no nosso Kanban e NÃO foi cancelada...
            if (!issuesNativas.has(issue.number)) {
                
                let statusColuna = issue.state === 'closed' ? 'done' : 'todo';
                
                let tag = 'feature'; 
                if (issue.labels && issue.labels.length > 0) {
                    const labelStr = issue.labels[0].name.toLowerCase();
                    if (labelStr.includes('bug')) tag = 'bug';
                    else if (labelStr.includes('art')) tag = 'art';
                    else if (labelStr.includes('doc')) tag = 'docs';
                }

                await addDoc(collection(db, "tarefas"), {
                    titulo: issue.title,
                    descricao: issue.body || "", // Já puxa a descrição original também!
                    tag: tag,
                    projetoId: window.projetoAtualId,
                    status: statusColuna,
                    githubIssue: issue.number,
                    githubUrl: issue.html_url,
                    userId: auth.currentUser.uid, 
                    dataCriacao: issue.created_at
                });
                importadas++;
            }
        }

        alert(`✅ Sincronização concluída! ${importadas} novas Issues importadas para o Kanban.`);
    } catch (err) {
        console.error("Erro na Sincronização:", err);
        alert(err.message || "Erro ao sincronizar. Olhe o console (F12).");
    }

    btn.innerText = textoOriginal;
    btn.disabled = false;
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

window.assumirTarefa = async (taskId) => {
    if (!auth.currentUser) return;
    
    // Pega o nome do usuário atual (do perfil ou e-mail)
    const nomeUser = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];

    try {
        await updateDoc(doc(db, "tarefas", taskId), {
            assignedTo: auth.currentUser.uid,
            assignedName: nomeUser,
            status: 'doing' // Opcional: Já move pra "Fazendo" ao assumir
        });
        // A renderização acontece automaticamente via onSnapshot
    } catch (e) { console.error("Erro ao assumir tarefa:", e); }
};

// ==========================================
// ÁUDIOS E FEEDBACK COM TIMESTAMPS
// ==========================================

window.adicionarNovaMusica = async function() {
    if (!window.projetoAtualId) return alert("Abra um projeto primeiro.");
    
    const titulo = prompt("Digite o nome da música ou SFX:");
    if (!titulo) return;
    
    let url = prompt("Cole o link do áudio (Google Drive, Discord, etc):");
    if (!url) return;

    // MÁGICA: Se for link do Google Drive, converte para link de reprodução direta
    if (url.includes("drive.google.com")) {
        // Extrai o ID do arquivo do link
        const fileId = url.match(/[-\w]{25,}/); 
        if (fileId) {
            url = `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
        }
    }

    try {
        await addDoc(collection(db, "audios"), {
            projetoId: window.projetoAtualId,
            titulo: titulo,
            url: url,
            adicionadoPor: auth.currentUser.email.split('@')[0], 
            autorEmail: auth.currentUser.email,
            dataCriacao: new Date().toISOString()
        });
        window.carregarAudiosDoProjeto(window.projetoAtualId);
    } catch (e) { console.error("Erro ao adicionar áudio:", e); }
};

window.audioAtualId = null; // Guarda qual música está selecionada no momento

// 1. Carregar Playlist (Atualizado para passar o ID da música)
window.carregarAudiosDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "audios"), where("projetoId", "==", pid)), (snap) => {
        const list = document.getElementById('audio-playlist');
        if(list) list.innerHTML = snap.docs.map(d => `
            <li onclick="abrirAudio('${d.data().url}', '${d.data().titulo}', '${d.id}')" style="cursor:pointer; padding:8px 0; border-bottom:1px solid var(--border-color); color:var(--text-main); display:flex; justify-content:space-between;">
                <span>🎵 ${d.data().titulo}</span>
                <button class="icon-btn" onclick="event.stopPropagation(); deletarAudio('${d.id}')" style="color:#ff5252; font-size:0.8rem;">🗑️</button>
            </li>
        `).join('');
    });
};

// 2. Apagar Áudio
window.deletarAudio = async (id) => {
    if(confirm("Apagar esta música da playlist?")) {
        await deleteDoc(doc(db, "audios", id));
        if (window.audioAtualId === id) {
            document.getElementById('review-audio').src = '';
            document.getElementById('audio-tocando-nome').innerText = 'Selecione';
            document.getElementById('audio-comments-list').innerHTML = '';
        }
    }
};

// 3. Abrir Música no Player e carregar os comentários dela
window.abrirAudio = (url, tit, id) => {
    window.audioAtualId = id; 
    document.getElementById('review-audio').src = url;
    document.getElementById('audio-tocando-nome').innerText = tit;
    window.carregarComentariosDoAudio(id);
};

// 4. Salvar o Feedback com o Tempo da Música
window.adicionarComentarioAudioReal = async () => {
    if (!window.audioAtualId) return alert("Selecione uma música na playlist primeiro!");
    
    const inputTexto = document.getElementById('new-audio-comment');
    const texto = inputTexto.value.trim();
    if (!texto) return;

    // Pega onde a "agulha" do player está neste exato milissegundo
    const player = document.getElementById('review-audio');
    const tempoAtual = player.currentTime; 

    try {
        await addDoc(collection(db, "comentarios_audio"), {
            audioId: window.audioAtualId,
            texto: texto,
            tempo: tempoAtual,
            autor: auth.currentUser.email.split('@')[0],
            dataCriacao: new Date().toISOString()
        });
        inputTexto.value = ''; // Limpa o campo
    } catch (e) { console.error("Erro ao comentar:", e); }
};

// 5. Renderizar a lista de comentários
window.carregarComentariosDoAudio = (audioId) => {
    const lista = document.getElementById('audio-comments-list');
    if (!lista) return;

    onSnapshot(query(collection(db, "comentarios_audio"), where("audioId", "==", audioId)), (snap) => {
        let comentarios = [];
        snap.forEach(d => comentarios.push({ id: d.id, ...d.data() }));
        
        // Ordena os comentários pelo tempo da música (do início pro fim)
        comentarios.sort((a, b) => a.tempo - b.tempo);

        if (comentarios.length === 0) {
            lista.innerHTML = '<li style="color: #666; padding: 10px;">Nenhum feedback ainda. Seja o primeiro!</li>';
            return;
        }

        lista.innerHTML = comentarios.map(c => {
            // Transforma os segundos (ex: 65.4) no formato de relógio (01:05)
            const min = Math.floor(c.tempo / 60).toString().padStart(2, '0');
            const seg = Math.floor(c.tempo % 60).toString().padStart(2, '0');
            const tempoFormatado = `${min}:${seg}`;

            // Mostra lixeirinha só se o comentário for da pessoa logada
            const meuComentario = c.autor === auth.currentUser.email.split('@')[0];
            const btnApagar = meuComentario ? `<button class="icon-btn" onclick="deletarComentarioAudio('${c.id}')" style="color: #ff5252; font-size: 0.8rem;">🗑️</button>` : '';

            return `
                <li style="padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; align-items: flex-start; gap: 12px; transition: 0.2s;">
                    <button class="timestamp-btn" onclick="pularParaTempo(${c.tempo})" style="background: var(--primary); color: #000; border: none; padding: 4px 8px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size:0.8rem;">${tempoFormatado}</button>
                    <div style="flex: 1;">
                        <strong style="color: var(--primary); font-size: 0.85rem;">${c.autor}</strong>
                        <p style="font-size: 0.9rem; color: #e0e0e0; margin-top: 4px;">${c.texto}</p>
                    </div>
                    ${btnApagar}
                </li>
            `;
        }).join('');
    });
};

// 6. Fazer o player pular pra parte exata do comentário
window.pularParaTempo = (segundos) => {
    const player = document.getElementById('review-audio');
    if (player) {
        player.currentTime = parseFloat(segundos);
        player.play(); // Opcional: já dá o play direto na parte
    }
};

window.deletarComentarioAudio = async (id) => {
    if(confirm("Apagar este feedback?")) await deleteDoc(doc(db, "comentarios_audio", id));
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
window.pontuarGamificacao = async (tipo, userIdAlvo, tag) => {
    const uid = userIdAlvo || auth.currentUser.uid;
    const userRef = doc(db, "usuarios", uid);
    
    // Define pontos por tipo
    let pontos = 0;
    if (tipo === 'tarefa') pontos = 10;
    if (tipo === 'pomodoro') pontos = 5;

    // Incrementa no banco de dados
    await updateDoc(userRef, {
        xp: increment(pontos),
        [`stats.${tag || 'geral'}`]: increment(1) // Salva que ele fez +1 de 'art', 'bug', etc.
    });
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