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
        window.verificarAgendaDoDia();

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
        window.iniciarSistemaNotificacoes();
        window.verificarAgendaDoDia();
        
        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
            window.intervaloLembrete = setInterval(() => {
            window.verificarLembretesProximos();
        }, 5 * 60 * 1000); // 5 minutos

    } else {
        loginScreen.classList.remove('hidden');
        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
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
// 4. NAVEGAÇÃO SPA E MODAIS (ATUALIZADO)
// ==========================================
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        
        // --- A MÁGICA DE SEGURANÇA ---
        if (target !== 'wiki') {
            if (typeof window.fecharSessaoWiki === 'function') {
                window.fecharSessaoWiki();
            }
        }

        // --- A MÁGICA DA BOLINHA QUE SOME ---
        // Passa exatamente o nome da aba clicada (ex: 'reunioes', 'projetos')
        // O sistema vai no banco e apaga todas as bolinhas que pertencem a ela!
        if (typeof window.marcarNotificacoesComoLidas === 'function') {
            window.marcarNotificacoesComoLidas(target);
        }

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

// --- Lógica de Encolher/Expandir a Sidebar ---
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const mainSidebar = document.getElementById('main-sidebar');

if (toggleSidebarBtn && mainSidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
        mainSidebar.classList.toggle('collapsed');
    });
}


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
// 6. PROJETOS, KANBAN E EXP DA VERSÃO
// ==========================================
window.projetoAtualId = null;
window.projetoAtualRepo = null;
window.projetoAtualVersaoAlvo = 1; // O cérebro da versão começa no 1

// 1. CRIAR PROJETO
window.salvarProjeto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const textoOriginal = btn.innerText;
    btn.innerText = "Criando... ⏳";
    btn.disabled = true;

    const nome = document.getElementById('projName')?.value || "Projeto Sem Nome";
    const desc = document.getElementById('projetoDesc')?.value || ""; 
    const repo = document.getElementById('projRepo')?.value || "";
    const bannerFile = document.getElementById('projBanner')?.files[0]; 
    
    let capaBase64 = "";

    try {
        if (bannerFile) {
            if (bannerFile.size > 800 * 1024) throw new Error("A imagem do Banner é muito pesada (Máx 800kb).");
            capaBase64 = await new Promise(r => { 
                const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(bannerFile); 
            });
        }

        await addDoc(collection(db, "projetos"), {
            nome: nome,
            descricao: desc,
            githubRepo: repo,
            capaBase64: capaBase64, 
            versaoAlvo: 1, // Por padrão, todo projeto nasce buscando a v1.0
            colaboradores: [auth.currentUser.email.toLowerCase()],
            userId: auth.currentUser.uid, 
            dataCriacao: new Date().toISOString()
        });
        
        const form = document.getElementById('formNovoProjeto');
        if (form) form.reset();
        window.closeModal('modalNovoProjeto');
    } catch(err) { console.error(err); alert(err.message); }

    btn.innerText = textoOriginal;
    btn.disabled = false;
};

// 2. CARREGAR PROJETOS (A grade inicial)
window.carregarProjetos = async () => {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const q = query(collection(db, "projetos"), where("colaboradores", "array-contains", auth.currentUser.email.toLowerCase()));
    
    onSnapshot(q, (snap) => {
        grid.innerHTML = snap.docs.map(d => {
            const p = d.data();
            const iniciais = p.nome.substring(0,2).toUpperCase();
            let btnApagar = (p.userId === auth.currentUser.uid) ? `<button class="icon-btn" onclick="event.stopPropagation(); deletarProjeto('${d.id}')" style="color:#ff5252; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;">🗑️</button>` : '';
            const bgStyle = p.capaBase64 ? `background: linear-gradient(rgba(15,15,15,0.7), rgba(15,15,15,0.95)), url('${p.capaBase64}') center/cover; border-color: rgba(255,255,255,0.2);` : '';
            const avatarHtml = p.avatarBase64 ? `<img src="${p.avatarBase64}" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">` : iniciais;

            // Passando a versaoAlvo para a tela do projeto saber que nível está
            return `
                <div class="client-card" id="proj-card-${d.id}" onclick="window.abrirProjeto('${d.id}', '${p.nome}', '${p.githubRepo}', '${p.capaBase64 || ""}', ${p.versaoAlvo || 1})" style="cursor:pointer; position:relative; ${bgStyle}">
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
                        <p style="color: #e0e0e0;">${p.descricao || "Sem descrição."}</p>
                    </div>
                </div>`;
        }).join('');
        setTimeout(() => { if(window.atualizarTrilhaNotificacoes) window.atualizarTrilhaNotificacoes(); }, 100);
    });
};

// 3. EDITAR PROJETO
window.abrirModalEditarProjeto = async () => {
    if (!window.projetoAtualId) return;
    const docSnap = await getDoc(doc(db, "projetos", window.projetoAtualId));
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById('editProjNome').value = p.nome;
        document.getElementById('editProjDesc').value = p.descricao;
        document.getElementById('editProjVersao').value = p.versaoAlvo || 1; // Puxa a versão
        const colabsSemDono = p.colaboradores.filter(em => em !== auth.currentUser.email.toLowerCase());
        document.getElementById('editProjColabs').value = colabsSemDono.join(', ');
        document.getElementById('editProjRepo').value = p.githubRepo || '';
        window.openModal('modalEditarProjeto');
    }
};

window.salvarEdicaoProjeto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processando... ⏳";

    const nome = document.getElementById('editProjNome').value.trim();
    const desc = document.getElementById('editProjDesc').value.trim();
    const repo = document.getElementById('editProjRepo').value.trim();
    const versao = parseInt(document.getElementById('editProjVersao').value) || 1; // Puxa o número da versão
    const colabsInput = document.getElementById('editProjColabs').value;
    
    let colaboradores = [auth.currentUser.email.toLowerCase()];
    if (colabsInput) {
        const extras = colabsInput.split(',').map(em => em.trim().toLowerCase()).filter(em => em !== '');
        colaboradores = [...new Set([...colaboradores, ...extras])];
    }

    const avatarFile = document.getElementById('editProjAvatar').files[0];
    const capaFile = document.getElementById('editProjCapa').files[0];

    let updateData = { nome, descricao: desc, versaoAlvo: versao, colaboradores, githubRepo: repo, dataAtualizacao: new Date().toISOString() };

    try {
        if (avatarFile) { updateData.avatarBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(avatarFile); }); }
        if (capaFile) { updateData.capaBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(capaFile); }); }

        await updateDoc(doc(db, "projetos", window.projetoAtualId), updateData);
        
        document.getElementById('titulo-workspace').innerText = nome;
        window.projetoAtualRepo = repo;
        window.projetoAtualVersaoAlvo = versao; // Atualiza o cérebro
        
        if (updateData.capaBase64) {
            const bannerDiv = document.getElementById('project-banner');
            if (bannerDiv) bannerDiv.style.backgroundImage = `url('${updateData.capaBase64}')`;
        }
        
        closeModal('modalEditarProjeto');
        document.getElementById('formEditarProjeto').reset();
        window.renderizarKanban(); // Manda a barra atualizar a matemática

    } catch (err) { alert(err.message); }
    btn.disabled = false; btn.innerText = "Salvar Alterações";
};

window.deletarProjeto = async (id) => { if(confirm("Apagar projeto?")) { await deleteDoc(doc(db, "projetos", id)); window.carregarProjetos(); } };

// 4. ABRIR PROJETO
window.abrirProjeto = async (id, nome, repo, capaBase64, versaoAlvo) => {
    window.projetoAtualId = id;
    window.projetoAtualRepo = repo || "";
    window.projetoAtualVersaoAlvo = parseInt(versaoAlvo) || 1; 
    
    // 1. Atualiza o visual básico
    document.getElementById('titulo-workspace').innerText = nome;
    const bannerDiv = document.getElementById('project-banner');
    if (bannerDiv) {
        bannerDiv.style.backgroundImage = capaBase64 ? `url('${capaBase64}')` : `url('default-bg.jpg')`;
    }

    // 2. Troca a tela para o Workspace
    document.getElementById('projetos-home').style.display = 'none';
    document.getElementById('projeto-view').style.display = 'block';
    
    // 3. Carrega os dados silenciosamente
    window.carregarTarefasDoProjeto(id);
    window.carregarWikiDoProjeto(id);
    window.carregarAudiosDoProjeto(id);

    // 4. REDIRECIONAMENTO POR CARGO
    // Buscamos a especialidade salva no perfil do usuário
    const userDoc = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
    const esp = userDoc.exists() ? userDoc.data().especialidade : 'geral';

    // Selecionamos os botões e as abas
    const btnKanban = document.querySelector('button[onclick*="tab-kanban"]');
    const btnWiki = document.querySelector('button[onclick*="tab-wiki"]');
    const btnAudio = document.querySelector('button[onclick*="tab-audios"]');

    if (esp === 'dev' && btnKanban) {
        window.switchProjectTab('tab-kanban', btnKanban);
    } else if (esp === 'design' && btnWiki) {
        window.switchProjectTab('tab-wiki', btnWiki);
    } else if (esp === 'art' && btnAudio) {
        window.switchProjectTab('tab-audios', btnAudio);
    } else {
        // Se for 'geral' ou não tiver cargo, abre o Kanban por padrão
        if (btnKanban) window.switchProjectTab('tab-kanban', btnKanban);
    }
    if (esp !== 'geral') {
        window.notificarWorkflow(esp);
    }
};

window.voltarParaProjetos = () => { window.projetoAtualId = null; document.getElementById('projetos-home').style.display = 'block'; document.getElementById('projeto-view').style.display = 'none'; };
window.switchProjectTab = (id, btn) => { document.querySelectorAll('.project-tab-content').forEach(c => c.style.display = 'none'); document.querySelectorAll('.itab-btn').forEach(b => b.classList.remove('active')); const tab = document.getElementById(id); if (tab) tab.style.display = 'block'; btn.classList.add('active'); };

// 5. CACHE E FILTROS KANBAN
window.tarefasProjetoCache = [];
window.kanbanFiltroAtual = 'all';

window.aplicarFiltroKanban = () => { window.kanbanFiltroAtual = document.getElementById('kanban-filter').value; window.renderizarKanban(); };

window.carregarTarefasDoProjeto = (pid) => {
    if (window.unsubTarefas) window.unsubTarefas();
    window.unsubTarefas = onSnapshot(query(collection(db, "tarefas"), where("projetoId", "==", pid)), (snap) => {
        window.tarefasProjetoCache = [];
        snap.forEach(d => { window.tarefasProjetoCache.push({ id: d.id, ...d.data() }); });
        window.renderizarKanban(); 
    });
};

// 6. RENDERIZAR KANBAN & MATEMÁTICA DA BARRA DE EXP
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
        
        let badgeClass = `badge-${t.tag}`;
        const ghLink = t.githubIssue ? `<span style="color:var(--primary);" title="GitHub Issue">🔗 #${t.githubIssue}</span>` : '☁️';

        let assignedHtml = "";
        if (t.assignedTo) {
            const iniciais = t.assignedName ? t.assignedName.substring(0, 2).toUpperCase() : "??";
            assignedHtml = `<div class="task-owner" title="Assumido por ${t.assignedName}. Clique para largar." onclick="event.stopPropagation(); window.desassumirTarefa('${t.id}')" style="cursor: pointer; background: var(--primary); color: #000;">${iniciais}</div>`;
        } else {
            assignedHtml = `<button class="btn-assumir" onclick="event.stopPropagation(); window.assumirTarefa('${t.id}')">Assumir</button>`;
        }

        const btnApagar = (window.userRole === 'admin') ? `<button class="icon-btn" onclick="event.stopPropagation(); window.deletarTarefa('${t.id}')" style="color:#ff5252; padding: 5px;">🗑️</button>` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                <span class="badge ${badgeClass}">${t.tag.toUpperCase()}</span>
                ${btnApagar}
            </div>
            <h4 style="margin-bottom:15px; min-height:40px;">${t.titulo}</h4>
            <div class="card-footer">
                <div style="display:flex; align-items:center; gap:8px;">${assignedHtml} ${ghLink}</div>
                <span style="font-size:0.7rem; color:var(--text-muted);">v1.0</span>
            </div>`;
        const alvo = document.getElementById(t.status);
        if (alvo) { alvo.appendChild(card); counts[t.status]++; }
    });

    document.getElementById('count-todo').innerText = counts.todo;
    document.getElementById('count-doing').innerText = counts.doing;
    document.getElementById('count-done').innerText = counts.done;

    // --- MATEMÁTICA AVANÇADA DA VERSÃO ALVO ---
    const totalTarefasReais = window.tarefasProjetoCache.length;
    const concluidasReais = window.tarefasProjetoCache.filter(t => t.status === 'done').length;
    
    let porcentagem = 0;
    if (totalTarefasReais > 0) porcentagem = Math.round((concluidasReais / totalTarefasReais) * 100);
    
    const expFill = document.getElementById('project-exp-fill');
    const expText = document.getElementById('project-exp-text');
    const versionText = document.getElementById('project-version-text');
    
    if (expFill && expText && versionText) {
        expFill.style.width = `${porcentagem}%`;
        expText.innerText = `${porcentagem}% Concluído`;
        
        // A mágica acontece aqui: A base é a (Versão Alvo - 1). Ex: Alvo 2, Base = 1.
        let alvoAtual = window.projetoAtualVersaoAlvo || 1;
        let versaoBase = alvoAtual - 1;
        
        let versaoNumero = (versaoBase + 0.10 + (porcentagem / 100) * 0.90).toFixed(2);
        let sufixo = "Alpha";
        
        if (porcentagem === 0) { versaoNumero = (versaoBase + 0.10).toFixed(2); sufixo = "Concept"; }
        else if (porcentagem === 100) { versaoNumero = alvoAtual.toFixed(2); sufixo = "Gold Master 🏆"; }
        else if (porcentagem > 85) sufixo = "Release Candidate";
        else if (porcentagem > 60) sufixo = "Beta";
        else if (porcentagem > 30) sufixo = "Alpha";
        
        versionText.innerText = `v${versaoNumero} (${sufixo})`;
    }
};

// ==========================================
// 3. DETALHES DA TAREFA E CHECKLISTS INTERATIVOS
// ==========================================
window.taskAtualEditando = { id: null, rawBody: "", githubIssue: null };

// A) Converte texto do GitHub para HTML interativo (Agora super inteligente)
window.renderizarDescricaoTask = (texto) => {
    if (!texto) {
        document.getElementById('detalheTaskDesc').innerHTML = "Sem detalhes adicionais.";
        return;
    }

    const linhas = texto.split('\n');
    const html = linhas.map((linha, index) => {
        // Agora ele aceita coisas como "- [ ]", "- - [ ]", "   - - [ ]" etc.
        const uncheckMatch = linha.match(/^([\s\-*+]+)\[ \]\s+(.*)/);
        const checkMatch = linha.match(/^([\s\-*+]+)\[x\]\s+(.*)/i);
        
        // Reconhece a linha gigante de hífens (ex: ------------)
        const hrMatch = linha.match(/^[-_*]{3,}\s*$/);

        if (hrMatch) {
            return `<hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">`;
            
        } else if (uncheckMatch) {
            const espacos = uncheckMatch[1].replace(/[-*+]/g, '').length; 
            const recuo = espacos * 15; 

            return `<label class="task-check-label" style="margin-left: ${recuo}px">
                        <input type="checkbox" onchange="window.toggleTaskCheck(${index}, false)"> 
                        <span>${uncheckMatch[2]}</span>
                    </label>`;
                    
        } else if (checkMatch) {
            const espacos = checkMatch[1].replace(/[-*+]/g, '').length;
            const recuo = espacos * 15;

            return `<label class="task-check-label" style="margin-left: ${recuo}px">
                        <input type="checkbox" checked onchange="window.toggleTaskCheck(${index}, true)"> 
                        <span class="text-checked">${checkMatch[2]}</span>
                    </label>`;
                    
        } else {
            return `<div style="margin-bottom: 5px; min-height: 1.2em; white-space: pre-wrap;">${linha}</div>`;
        }
    }).join('');

    document.getElementById('detalheTaskDesc').innerHTML = html;
};

// C) Abre o Modal e puxa dados ao vivo do GitHub
window.abrirDetalhesTarefa = async (id, data) => {
    document.getElementById('detalheTaskTitulo').innerText = data.titulo;
    document.getElementById('detalheTaskTag').innerText = data.tag.toUpperCase();
    document.getElementById('detalheTaskTag').className = `badge badge-${data.tag}`;
    
    const textoGit = document.getElementById('detalheTaskGit');
    const btnGit = document.getElementById('btn-abrir-git');

    // Guarda globalmente a task que estamos lendo
    window.taskAtualEditando = { id: id, rawBody: data.descricao || "", githubIssue: data.githubIssue };

    // Renderiza a versão local primeiro
    window.renderizarDescricaoTask(window.taskAtualEditando.rawBody);

    // Configura o botão do GitHub e busca as atualizações
    if (data.githubIssue && data.githubUrl) {
        textoGit.innerText = `Issue #${data.githubIssue}`;
        btnGit.href = data.githubUrl;
        btnGit.style.display = 'block';

        const token = localStorage.getItem('github_token');
        if (window.projetoAtualRepo && token) {
            try {
                const res = await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${data.githubIssue}`, {
                    method: "GET",
                    headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}` }
                });

                if (res.ok) {
                    const issueAoVivo = await res.json();
                    const corpoAtualizado = issueAoVivo.body || "Nenhuma descrição detalhada.";
                    
                    window.taskAtualEditando.rawBody = corpoAtualizado;
                    window.renderizarDescricaoTask(corpoAtualizado);
                    
                    // Se o Git estiver mais novo, atualiza nosso banco
                    if (corpoAtualizado !== data.descricao) {
                        updateDoc(doc(db, "tarefas", id), { descricao: corpoAtualizado });
                    }
                }
            } catch (err) { console.error("Erro no Live Fetch:", err); }
        }
    } else {
        textoGit.innerText = "Tarefa apenas no Hub";
        btnGit.style.display = 'none';
    }

    window.openModal('modalDetalhesTarefa');
};


// B) Quando você clica em uma caixinha no Hub (Atualizado para o novo formato)
window.toggleTaskCheck = async (linhaIndex, isCheckedAtualmente) => {
    if (!window.taskAtualEditando.id) return;

    let linhas = window.taskAtualEditando.rawBody.split('\n');
    
    // Procura exatamente pelos colchetes na linha e inverte eles (funciona pra qualquer quantidade de hífens)
    if (isCheckedAtualmente) {
        linhas[linhaIndex] = linhas[linhaIndex].replace(/\[x\]/i, '[ ]');
    } else {
        linhas[linhaIndex] = linhas[linhaIndex].replace(/\[ \]/, '[x]');
    }

    const novoBody = linhas.join('\n');
    window.taskAtualEditando.rawBody = novoBody;
    
    window.renderizarDescricaoTask(novoBody); // Atualiza a tela

    // Salva no Firebase
    try { await updateDoc(doc(db, "tarefas", window.taskAtualEditando.id), { descricao: novoBody }); } 
    catch(e) { console.error("Erro Firebase:", e); }

    // Envia pro GitHub
    const token = localStorage.getItem('github_token');
    if (window.projetoAtualRepo && token && window.taskAtualEditando.githubIssue) {
        try {
            await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${window.taskAtualEditando.githubIssue}`, {
                method: "PATCH",
                headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ body: novoBody })
            });
        } catch(e) { console.error("Erro Git:", e); }
    }
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
    btn.innerText = "⏳";
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
// 7. WIKI OBSIDIAN (CRIAÇÃO INSTANTÂNEA E PASTAS SELECIONADAS)
// ==========================================
window.wikiAtualId = null;
window.wikiCache = {};
window.wikiFoldersCache = [];
window.wikiPagesCache = [];
window.wikiPastasFechadas = new Set();
window.ultimaPastaSelecionada = null;
window.wikiTimeout = null;

// --- PROCESSADOR DE LINKS OBSIDIAN E ESTILOS CUSTOMIZADOS ---
window.processarLinksObsidian = (texto) => {
    let processado = texto;

    // 1. MÁGICA DA FONTE
    processado = processado.replace(/\{font:(.*?)\}([\s\S]*?)\{\/font\}/g, '<span style="font-family: \'$1\';">$2</span>');

    // 2. MÁGICA DA COR
    processado = processado.replace(/\{cor:(.*?)\}([\s\S]*?)\{\/cor\}/g, '<span style="color: $1;">$2</span>');

    // 3. NOVO: MÁGICA DA CENTRALIZAÇÃO {center} ... {/center}
    // Usamos 'div' para garantir que ele quebre a linha e centralize o bloco todo
    // Substitua a linha antiga pela nova que usa a classe .wiki-center
    processado = processado.replace(/\{center\}([\s\S]*?)\{\/center\}/g, '<div class="wiki-center">$1</div>');

    // 4. Links Internos [[ ]]
    return processado.replace(/\[\[(.*?)\]\]/g, (match, conteudo) => {
        let partes = conteudo.split('#');
        let titulo = partes[0].trim();
        let ancora = partes[1] ? partes[1].trim() : '';
        let tituloSafe = titulo.replace(/'/g, "\\'");
        let ancoraSafe = ancora.replace(/'/g, "\\'");
        let textoLink = ancora ? `${titulo} > ${ancora}` : titulo;
        return `<a class="wiki-internal-link" onclick="abrirWikiPorTitulo(event, '${tituloSafe}', '${ancoraSafe}')">${textoLink}</a>`;
    });
};

// --- ABRIR DOCUMENTO PELO TÍTULO (E ROLAR A TELA) ---
window.abrirWikiPorTitulo = (e, titulo, ancora) => {
    e.preventDefault();
    
    // Procura na memória qual é o ID do arquivo que tem esse exato título
    const docEncontrado = window.wikiPagesCache.find(p => p.titulo.toLowerCase() === titulo.toLowerCase());
    
    if (docEncontrado) {
        // 1. Abre o documento
        window.abrirWiki(docEncontrado.id);
        
        // 2. Se a pessoa pediu uma sessão específica (ex: # Fases), rola a tela até lá
        if (ancora) {
            setTimeout(() => {
                // O marked.js transforma "Minha Sessão" em "minha-sessão" automaticamente
                const idAncora = ancora.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                const elemento = document.getElementById(idAncora);
                
                if (elemento) {
                    // Rola a tela macio até o subtítulo
                    elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Dá uma piscada na cor neon pra pessoa saber onde olhar
                    const corOriginal = elemento.style.color;
                    elemento.style.color = "var(--primary)";
                    setTimeout(() => elemento.style.color = corOriginal, 1500);
                }
            }, 100); // Espera 100ms pro documento terminar de carregar na tela
        }
    } else {
        alert(`Documento "${titulo}" não encontrado! Verifique se o nome está escrito exatamente igual.`);
    }
};

// --- ROLAR PARA ÂNCORA (Usado pelos links e pelo Índice) ---
window.rolarParaAncora = (e, idAncora) => {
    if(e) e.preventDefault();
    const elemento = document.getElementById(idAncora);
    if (elemento) {
        elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const cor = elemento.style.color;
        elemento.style.color = "var(--primary)";
        setTimeout(() => elemento.style.color = cor, 1500);
    }
};

window.setWikiMode = (mode) => {
    const edit = document.getElementById('wiki-conteudo');
    const prev = document.getElementById('wiki-preview-area');
    const toc = document.getElementById('wiki-toc');
    const metadata = document.getElementById('wiki-metadata');

    if (mode === 'preview') {
        if (edit && prev) {
            // 1. PRIMEIRO: O Markdown transforma o texto em HTML básico
            let htmlGerado = marked.parse(edit.value);

            // 2. DEPOIS: Aplicamos nossas cores, fontes, centro e links no HTML já pronto
            prev.innerHTML = window.processarTagsCustomizadas(htmlGerado);

            edit.style.setProperty('display', 'none', 'important');
            prev.style.setProperty('display', 'block', 'important');
        }
        
        document.getElementById('btn-wiki-preview')?.classList.add('active');
        document.getElementById('btn-wiki-edit')?.classList.remove('active');
        
        try { mermaid.run({ nodes: document.querySelectorAll('.language-mermaid') }); } catch(e){}
        
        // --- GERAÇÃO DO ÍNDICE (TOC) ---
        if (prev) {
            const headers = prev.querySelectorAll('h2, h3');
            if (headers.length > 0 && toc) {
                let tocHtml = '<div class="wiki-toc-title">Nesta Página</div>';
                headers.forEach(h => {
                    if(!h.id) h.id = h.innerText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                    const level = h.tagName.toLowerCase() === 'h2' ? 'toc-h2' : 'toc-h3';
                    tocHtml += `<a class="wiki-toc-item ${level}" onclick="rolarParaAncora(event, '${h.id}')">${h.innerText}</a>`;
                });
                toc.innerHTML = tocHtml;
                toc.classList.add('active'); 
            } else if (toc) {
                toc.classList.remove('active');
            }
        }
    } else {
        edit.style.setProperty('display', 'block', 'important');
        prev.style.setProperty('display', 'none', 'important');
        document.getElementById('btn-wiki-edit')?.classList.add('active');
        document.getElementById('btn-wiki-preview')?.classList.remove('active');
    }
};

window.processarTagsCustomizadas = (html) => {
    let processado = html;

    // 1. Cores: {cor:red}texto{/cor}
    processado = processado.replace(/\{cor:(.*?)\}([\s\S]*?)\{\/cor\}/g, '<span style="color: $1;">$2</span>');

    // 2. Fontes: {font:Arial}texto{/font}
    processado = processado.replace(/\{font:(.*?)\}([\s\S]*?)\{\/font\}/g, '<span style="font-family: \'$1\';">$2</span>');

    // 3. Centralização: {center}texto{/center}
    // Usamos uma classe para o CSS forçar o centro em tudo
    processado = processado.replace(/\{center\}([\s\S]*?)\{\/center\}/g, '<div class="wiki-center">$1</div>');

    // 4. Links Obsidian: [[Link]]
    processado = processado.replace(/\[\[(.*?)\]\]/g, (match, conteudo) => {
        let partes = conteudo.split('#');
        let titulo = partes[0].trim();
        let ancora = partes[1] ? partes[1].trim() : '';
        let tituloSafe = titulo.replace(/'/g, "\\'");
        let ancoraSafe = ancora.replace(/'/g, "\\'");
        let textoLink = ancora ? `${titulo} > ${ancora}` : titulo;
        
        return `<a class="wiki-internal-link" onclick="abrirWikiPorTitulo(event, '${tituloSafe}', '${ancoraSafe}')">${textoLink}</a>`;
    });

    return processado;
};

// --- MODO TELA CHEIA DA WIKI ---
window.toggleFullscreenWiki = () => {
    // AGORA ELE PEGA O LAYOUT INTEIRO (Arquivos + Editor)
    const layout = document.querySelector('.wiki-layout');
    const btn = document.getElementById('btn-wiki-fullscreen');
    
    if (layout) {
        layout.classList.toggle('fullscreen');
        
        if (layout.classList.contains('fullscreen')) {
            btn.innerText = "🗗"; 
            btn.setAttribute('data-tooltip', 'Sair da Tela Cheia');
        } else {
            btn.innerText = "⛶"; 
            btn.setAttribute('data-tooltip', 'Tela Cheia');
        }
    }
};

// --- CRIAÇÃO INSTANTÂNEA DE ARQUIVO ---
window.novaPaginaWiki = async () => {
    if (!window.projetoAtualId) return;
    
    try {
        // Cria o documento direto no banco na pasta que estiver selecionada!
        const docRef = await addDoc(collection(db, "wiki"), {
            titulo: "Novo Documento",
            conteudo: "",
            projetoId: window.projetoAtualId,
            pastaId: window.ultimaPastaSelecionada, 
            dataCriacao: new Date().toISOString()
        });
        
        // Abre o documento na tela na mesma hora
        window.wikiAtualId = docRef.id;
        document.getElementById('wiki-titulo').value = "Novo Documento";
        document.getElementById('wiki-conteudo').value = "";
        window.setWikiMode('edit');
        
        // UX Premium: Foca no título e seleciona o texto pra pessoa só começar a digitar!
        const tituloInput = document.getElementById('wiki-titulo');
        tituloInput.focus();
        tituloInput.select();
        
    } catch(e) { console.error("Erro ao criar documento:", e); }
};

// --- CRIAÇÃO DE PASTA NO LOCAL CERTO ---
window.novaPastaWiki = async () => {
    const nome = prompt("Nome da nova pasta:");
    if (!nome || !window.projetoAtualId) return;
    try {
        await addDoc(collection(db, "wiki_pastas"), {
            nome: nome,
            projetoId: window.projetoAtualId,
            parentId: window.ultimaPastaSelecionada, // Agora a pasta nasce onde você clicou!
            dataCriacao: new Date().toISOString()
        });
    } catch(e) { console.error(e); }
};

// Clica na área debaixo pra deselecionar todas as pastas (Voltar pra Raiz)
window.selecionarRaizWiki = () => {
    window.ultimaPastaSelecionada = null;
    window.renderizarWikiTree();
};

// Trava de segurança para impedir o auto-save de atropelar a si mesmo
window.isSavingWiki = false;

window.salvarPaginaWiki = async (isAutoSave = false) => {
    // Se já estiver salvando no banco neste exato milissegundo, ele ignora para não duplicar!
    if (window.isSavingWiki) return; 

    const t = document.getElementById('wiki-titulo').value;
    const c = document.getElementById('wiki-conteudo').value;
    if (!t) return; // Não salva documentos sem título

    window.isSavingWiki = true; // Tranca a porta do cofre

    // MÁGICA 1: Preservar a pasta corretamente
    let pastaAtual = window.ultimaPastaSelecionada || null;
    if (window.wikiAtualId && window.wikiCache[window.wikiAtualId]) {
        // Se o arquivo já existe e já estava numa pasta, mantém ele lá dentro!
        pastaAtual = window.wikiCache[window.wikiAtualId].pastaId || null;
    }

    const data = { 
        titulo: t, 
        conteudo: c, 
        projetoId: window.projetoAtualId, 
        pastaId: pastaAtual,
        autorUltimaModificacao: auth.currentUser.email,
        dataAtualizacao: new Date().toISOString()
    };
    
    try {
        if (window.wikiAtualId) {
            // Se já tem ID, apenas ATUALIZA o documento existente
            await updateDoc(doc(db, "wiki", window.wikiAtualId), data);
        } else {
            // MÁGICA 2: A CORREÇÃO DO BUG DOS CLONES!
            // Ele cria no banco e IMEDIATAMENTE salva a ID nova no Hub
            const docRef = await addDoc(collection(db, "wiki"), { ...data, dataCriacao: new Date().toISOString() });
            window.wikiAtualId = docRef.id; // TRANCANDO A ID! Nunca mais vai duplicar.
            
            // Adiciona no cache temporário pra tela não piscar e não perder a referência
            window.wikiCache[docRef.id] = { id: docRef.id, ...data, pastaId: pastaAtual };
        }
        
        // Feedback visual silencioso
        if (isAutoSave) {
            const indicador = document.getElementById('wiki-autosave-indicator');
            if (indicador) {
                indicador.style.opacity = '1';
                indicador.style.color = 'var(--primary)';
                indicador.innerText = '✓ Salvo';
                setTimeout(() => indicador.style.opacity = '0', 2000); 
            }
        } else {
            // Se foi clicado no botão manualmente
            const btn = document.querySelector('button[onclick="salvarPaginaWiki()"]');
            if(btn) { 
                const textoAntigo = btn.innerText;
                btn.innerText = "✓ Salvo"; 
                setTimeout(() => btn.innerText = textoAntigo, 2000); 
            }
        }
    } catch(e) { 
        console.error("Erro ao salvar:", e); 
    } finally {
        window.isSavingWiki = false; // Destranca a porta pro próximo save!
    }
};

window.carregarWikiDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "wiki_pastas"), where("projetoId", "==", pid)), (snap) => {
        window.wikiFoldersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderizarWikiTree();
    });

    onSnapshot(query(collection(db, "wiki"), where("projetoId", "==", pid)), (snap) => {
        window.wikiPagesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.wikiPagesCache.forEach(p => window.wikiCache[p.id] = p);
        window.renderizarWikiTree();
    });

    setTimeout(() => {
        const idSalva = localStorage.getItem('heartkey_ultima_wiki_id');
        if (!window.wikiAtualId && idSalva) {
            const existe = window.wikiPagesCache.find(p => p.id === idSalva);
            if (existe) window.abrirWiki(idSalva);
        }
    }, 500);
    window.renderizarWikiTree();
};

window.triggerAutoSave = () => {
    const indicador = document.getElementById('wiki-autosave-indicator');
    if (indicador) {
        indicador.style.opacity = '1';
        indicador.style.color = 'var(--text-muted)';
        indicador.innerText = '⏳ Salvando...';
    }
    
    // Zera o cronômetro se o usuário continuar digitando
    clearTimeout(window.wikiTimeout);
    
    // Se ele parar de digitar por 1,5 segundos, salva no banco!
    window.wikiTimeout = setTimeout(() => {
        window.salvarPaginaWiki(true); // O 'true' avisa a função que é um Auto-Save invisível
    }, 1500);
};

window.termoBuscaWiki = "";
window.filtrarWiki = () => {
    window.termoBuscaWiki = document.getElementById('wiki-search-input').value.toLowerCase();
    window.renderizarWikiTree();
};

// --- RENDERIZAÇÃO DA ÁRVORE E DA LIXEIRA ---
window.renderizarWikiTree = () => {
    const container = document.getElementById('wiki-tree-container');
    if (!container) return;

    // 1. Agrupa pastas e arquivos na memória
    const pastasPorPai = { 'root': [], 'trash': [] };
    window.wikiFoldersCache.forEach(f => {
        const pai = f.parentId || 'root';
        if (!pastasPorPai[pai]) pastasPorPai[pai] = [];
        pastasPorPai[pai].push(f);
    });

    const arquivosPorPasta = { 'root': [], 'trash': [] };
    window.wikiPagesCache.forEach(p => {
        const pasta = p.pastaId || 'root';
        if (!arquivosPorPasta[pasta]) arquivosPorPasta[pasta] = [];
        arquivosPorPasta[pasta].push(p);
    });

    // --- MODO DE BUSCA ---
    if (window.termoBuscaWiki && window.termoBuscaWiki.trim() !== "") {
        const termo = window.termoBuscaWiki.trim();
        let htmlBusca = `<div style="font-size: 0.75rem; color: var(--primary); margin-bottom: 10px; font-weight:bold;">Resultados da busca:</div>`;
        
        const matches = window.wikiPagesCache.filter(p => 
            p.titulo.toLowerCase().includes(termo) || 
            p.conteudo.toLowerCase().includes(termo)
        );
        
        if (matches.length === 0) {
            htmlBusca += `<div style="color: #888; font-size: 0.8rem; text-align: center; padding: 20px;">Nenhum documento encontrado.</div>`;
        } else {
            matches.forEach(p => {
                const nomePasta = p.pastaId && p.pastaId !== 'trash' 
                    ? (window.wikiFoldersCache.find(f => f.id === p.pastaId)?.nome || "Pasta Desconhecida")
                    : "Raiz";
                
                htmlBusca += `
                    <div class="wiki-file-item" style="flex-direction: column; align-items: flex-start; gap: 2px;" onclick="abrirWiki('${p.id}')">
                        <div style="font-size: 0.7rem; color: #888;">📁 ${nomePasta}</div>
                        <div><span class="wiki-search-highlight">📄 ${p.titulo}</span></div>
                    </div>`;
            });
        }
        container.innerHTML = htmlBusca;
        return; 
    }

    // 2. Função que desenha a árvore de verdade
    const construirArvore = (parentId, inTrash = false) => {
        let html = '';
        if (pastasPorPai[parentId]) {
            pastasPorPai[parentId].forEach(f => {
                const isFechada = window.wikiPastasFechadas.has(f.id);
                const seta = isFechada ? '▶' : '▼';
                const classeLixo = inTrash ? 'item-apagado' : '';
                
                const isSelecionada = (f.id === window.ultimaPastaSelecionada);
                const classeSelecionada = isSelecionada ? 'selected' : '';
                
                const displayBtn = isSelecionada ? 'block' : 'none';
                const btnRenomear = `<button class="icon-btn btn-renomear-pasta" onclick="renomearPastaWiki(event, '${f.id}', '${f.nome}')" style="font-size: 0.8rem; color: var(--primary); padding:0; display: ${displayBtn};" data-tooltip="Renomear">✏️</button>`;

                html += `
                    <div style="margin-top: 5px;" class="${classeLixo}">
                        <div class="wiki-folder-header ${classeSelecionada}" draggable="true" ondragstart="dragStartWiki(event, '${f.id}', 'folder')" onclick="selecionarPastaWiki(event, '${f.id}')" ondblclick="togglePastaWiki(event, '${f.id}')" ondragover="dragOverWiki(event)" ondragleave="dragLeaveWiki(event)" ondrop="dropWiki(event, '${f.id}')">
                            <span style="user-select: none;">${seta} 📁 ${f.nome}</span>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${btnRenomear}
                            </div>
                        </div>
                        <div class="wiki-folder-content wiki-dropzone" id="folder-${f.id}" style="display: ${isFechada ? 'none' : 'block'};" ondragover="dragOverWiki(event)" ondragleave="dragLeaveWiki(event)" ondrop="dropWiki(event, '${f.id}')">
                            ${construirArvore(f.id, inTrash)}
                        </div>
                    </div>
                `;
            });
        }
        
        // A MÁGICA ESTAVA AQUI!
        if (arquivosPorPasta[parentId]) {
            arquivosPorPasta[parentId].forEach(p => {
                const classeLixo = inTrash ? 'item-apagado' : '';
                const classeAtiva = (p.id === window.wikiAtualId) ? 'active' : '';
                
                // MÁGICA: Confere se este arquivo é o que está aberto no momento
                const temNotificacao = window.cacheNotificacoes.some(n => n.contextId === p.id);
                const pingoHtml = temNotificacao ? '<span class="item-dot"></span>' : '';

                // AQUI VOLTAMOS COM O ONCLICK, O DRAGGABLE E AS CLASSES CERTAS!
                html += `
                    <div class="wiki-file-item ${classeLixo} ${classeAtiva}" draggable="true" ondragstart="dragStartWiki(event, '${p.id}', 'file')" onclick="abrirWiki('${p.id}')">
                        <span>📄</span> ${p.titulo} ${pingoHtml}
                    </div>
                `;
            });
        }
        return html;
    };

    let arvoreCompleta = construirArvore('root');
    let arvoreLixeira = construirArvore('trash', true); 

    let btnEsvaziar = (arvoreLixeira && window.userRole === 'admin') 
        ? `<button class="btn-primary" onclick="esvaziarLixeira()" style="background: transparent; color: #ff5252; border: 1px solid #ff5252; width: 100%; margin-top: 15px; font-size: 0.8rem;">🔥 Esvaziar Definitivamente</button>` 
        : '';

    const estiloRaiz = (window.ultimaPastaSelecionada === null) 
        ? 'border-color: var(--primary); background: rgba(129, 254, 78, 0.05);' 
        : 'border-color: rgba(255,255,255,0.1); background: transparent;';

    container.innerHTML = `
        <div class="wiki-dropzone" id="folder-root" style="min-height: 100px;" ondragover="dragOverWiki(event)" ondragleave="dragLeaveWiki(event)" ondrop="dropWiki(event, 'root')">
            ${arvoreCompleta}
            <div id="btn-selecionar-raiz" style="text-align: center; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; padding: 20px 0; border: 1px dashed; border-radius: 8px; margin-top: 10px; transition: 0.2s; ${estiloRaiz}" onclick="selecionarRaizWiki(event)">
                ☁️ Raiz do Projeto (Clique para selecionar a raiz)
            </div>
        </div>

        <div class="wiki-trash-zone wiki-dropzone" id="folder-trash" ondragover="dragOverWiki(event)" ondragleave="dragLeaveWiki(event)" ondrop="dropWiki(event, 'trash')">
            <div class="wiki-trash-title">🗑️ Lixeira</div>
            <div style="font-size: 0.75rem; color: #888; margin-bottom: 10px;">Arraste pastas/arquivos para cá.</div>
            ${arvoreLixeira}
            ${btnEsvaziar}
        </div>
    `;
};

// --- MÁGICA DOS CLIQUES (AGORA SEM PISCAR A TELA) ---

// 1 CLIQUE: Muda só o CSS para o duplo clique não falhar!
window.selecionarPastaWiki = (e, folderId) => {
    e.stopPropagation();
    window.ultimaPastaSelecionada = folderId;
    
    // Tira a seleção e o lápis de todo mundo
    document.querySelectorAll('.wiki-folder-header').forEach(el => {
        el.classList.remove('selected');
        const btn = el.querySelector('.btn-renomear-pasta');
        if (btn) btn.style.display = 'none';
    });
    
    // Adiciona a seleção e mostra o lápis só na que foi clicada
    e.currentTarget.classList.add('selected');
    const meuBtn = e.currentTarget.querySelector('.btn-renomear-pasta');
    if (meuBtn) meuBtn.style.display = 'block';

    // Apaga a cor da Raiz
    const btnRaiz = document.getElementById('btn-selecionar-raiz');
    if (btnRaiz) {
        btnRaiz.style.borderColor = 'rgba(255,255,255,0.1)';
        btnRaiz.style.background = 'transparent';
    }
};

window.selecionarRaizWiki = (e) => {
    if (e) e.stopPropagation();
    window.ultimaPastaSelecionada = null;
    
    // Tira a seleção de todos
    document.querySelectorAll('.wiki-folder-header').forEach(el => {
        el.classList.remove('selected');
        const btn = el.querySelector('.btn-renomear-pasta');
        if (btn) btn.style.display = 'none';
    });

    // Acende a Raiz
    const btnRaiz = document.getElementById('btn-selecionar-raiz');
    if (btnRaiz) {
        btnRaiz.style.borderColor = 'var(--primary)';
        btnRaiz.style.background = 'rgba(129, 254, 78, 0.05)';
    }
};

// DUPLO CLIQUE: Abre/Fecha a pasta normalmente
window.togglePastaWiki = (e, folderId) => {
    e.stopPropagation(); 
    if (window.wikiPastasFechadas.has(folderId)) window.wikiPastasFechadas.delete(folderId);
    else window.wikiPastasFechadas.add(folderId);
    window.renderizarWikiTree();
};

window.dragStartWiki = (e, itemId, type) => { 
    e.stopPropagation();
    e.dataTransfer.setData("itemId", itemId); 
    e.dataTransfer.setData("itemType", type); 
};
window.dragOverWiki = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); };
window.dragLeaveWiki = (e) => { e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); };

window.dropWiki = async (e, folderId) => {
    e.preventDefault(); e.stopPropagation(); 
    e.currentTarget.classList.remove('drag-over');
    
    const itemId = e.dataTransfer.getData("itemId");
    const itemType = e.dataTransfer.getData("itemType");
    if (!itemId) return;

    let targetFolder = folderId;
    if (folderId === 'root') targetFolder = null;
    
    try {
        if (itemType === 'file') {
            await updateDoc(doc(db, "wiki", itemId), { pastaId: targetFolder });
        } else if (itemType === 'folder') {
            if (itemId === targetFolder) return alert("Erro: Você não pode colocar uma pasta nela mesma!");
            
            let checkId = targetFolder;
            let isDescendant = false;
            while (checkId != null && checkId !== 'trash') {
                if (checkId === itemId) { isDescendant = true; break; }
                const parent = window.wikiFoldersCache.find(f => f.id === checkId);
                checkId = parent ? parent.parentId : null;
            }
            if (isDescendant) return alert("Paradoxo: Pasta filha não engole pasta pai!");

            await updateDoc(doc(db, "wiki_pastas", itemId), { parentId: targetFolder });
        }
    } catch(err) { console.error(err); }
};

window.abrirWiki = (id) => {
    window.wikiAtualId = id;
    
    // --- PERSISTÊNCIA: Salva qual ID está aberta para não esquecer no F5 ---
    localStorage.setItem('heartkey_ultima_wiki_id', id);

    const d = window.wikiCache[id];
    if (!d) return;

    document.getElementById('wiki-titulo').value = d.titulo;
    document.getElementById('wiki-conteudo').value = d.conteudo;
    window.setWikiMode('preview');
    window.renderizarWikiTree();
    window.limparNotificacaoItem(id);
};

window.novaPaginaWiki = () => {
    window.wikiAtualId = null;
    localStorage.removeItem('heartkey_ultima_wiki_id'); // Limpa a memória
    
    document.getElementById('wiki-titulo').value = '';
    document.getElementById('wiki-conteudo').value = '';
    window.setWikiMode('edit');
    window.renderizarWikiTree();
};

window.esvaziarLixeira = async () => {
    if(window.userRole !== 'admin') return alert("Apenas administradores podem esvaziar a lixeira!");
    if(!confirm("🔥 ATENÇÃO: Isso vai apagar PARA SEMPRE todos os arquivos e pastas da lixeira. Tem certeza absoluta?")) return;

    const btn = document.querySelector('button[onclick="esvaziarLixeira()"]');
    if(btn) btn.innerText = "Queimando... ⏳";

    const pastasNaLixeira = window.wikiFoldersCache.filter(f => f.parentId === 'trash');
    const arquivosNaLixeira = window.wikiPagesCache.filter(p => p.pastaId === 'trash');

    const exterminarConteudo = async (folderId) => {
        const subPastas = window.wikiFoldersCache.filter(f => f.parentId === folderId);
        for (let f of subPastas) {
            await exterminarConteudo(f.id);
            await deleteDoc(doc(db, "wiki_pastas", f.id));
        }
        const arquivos = window.wikiPagesCache.filter(p => p.pastaId === folderId);
        for (let a of arquivos) await deleteDoc(doc(db, "wiki", a.id));
    };

    try {
        for (let f of pastasNaLixeira) {
            await exterminarConteudo(f.id); 
            await deleteDoc(doc(db, "wiki_pastas", f.id)); 
        }
        for (let a of arquivosNaLixeira) {
            await deleteDoc(doc(db, "wiki", a.id));
        }
    } catch(e) { console.error("Erro ao queimar a lixeira:", e); }
};

window.renomearPastaWiki = async (e, folderId, nomeAtual) => {
    e.stopPropagation(); // Impede de abrir/fechar a pasta ao clicar no botão
    
    const novoNome = prompt("Renomear pasta para:", nomeAtual);
    
    // Se a pessoa cancelar, deixar em branco ou colocar o mesmo nome, não faz nada
    if (!novoNome || novoNome.trim() === "" || novoNome === nomeAtual) return;
    
    try {
        await updateDoc(doc(db, "wiki_pastas", folderId), { 
            nome: novoNome.trim() 
        });
        // Como temos o onSnapshot rodando, a tela vai atualizar sozinha instantaneamente!
    } catch(err) { 
        console.error("Erro ao renomear pasta:", err); 
        alert("Erro ao renomear. Tente novamente.");
    }
};

window.deletarPaginaWiki = async () => {
    if(window.wikiAtualId && confirm("Apagar este documento para todos?")) {
        await deleteDoc(doc(db, "wiki", window.wikiAtualId));
        window.novaPaginaWiki();
    }
};

window.deletarPastaWiki = async (e, folderId) => {
    e.stopPropagation(); // Impede que o botão de deletar acabe clicando em "fechar a pasta" sem querer
    if(confirm("Apagar esta pasta? Os arquivos e sub-pastas dentro dela não serão perdidos, voltarão para a raiz.")) {
        const filesToMove = window.wikiPagesCache.filter(p => p.pastaId === folderId);
        for (let file of filesToMove) await updateDoc(doc(db, "wiki", file.id), { pastaId: null });
        
        const foldersToMove = window.wikiFoldersCache.filter(f => f.parentId === folderId);
        for (let folder of foldersToMove) await updateDoc(doc(db, "wiki_pastas", folder.id), { parentId: null });
        
        await deleteDoc(doc(db, "wiki_pastas", folderId));
    }
};

window.fecharSessaoWiki = () => {
    // 1. Zera a ID global
    window.wikiAtualId = null;
    
    // 2. Remove do "bolso" do navegador (localStorage)
    localStorage.removeItem('heartkey_ultima_wiki_id');
    
    // 3. Limpa os campos de texto e a área de PREVIEW
    const titulo = document.getElementById('wiki-titulo');
    const conteudo = document.getElementById('wiki-conteudo');
    const preview = document.getElementById('wiki-preview-area');
    const toc = document.getElementById('wiki-toc');
    const metadata = document.getElementById('wiki-metadata');
    
    if (titulo) titulo.value = '';
    if (conteudo) conteudo.value = '';
    if (preview) preview.innerHTML = ''; // LIMPA A FOLHA DE LEITURA
    
    // 4. Esconde o Sumário e os Metadados
    if (toc) toc.classList.remove('active');
    if (metadata) metadata.style.display = 'none';

    // 5. Garante que o modo volte para "edição" para não abrir a folha vazia
    window.setWikiMode('edit');

    // 6. Atualiza a árvore para remover o destaque neon
    window.renderizarWikiTree();
    
    console.log("🧹 Sessão da Wiki totalmente resetada.");
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

window.desassumirTarefa = async (taskId) => {
    if (!auth.currentUser) return;
    
    if(confirm("Deseja largar esta tarefa e devolvê-la para a equipe?")) {
        try {
            await updateDoc(doc(db, "tarefas", taskId), {
                assignedTo: null,
                assignedName: null
            });
            // Não precisa atualizar a tela manualmente, o onSnapshot faz isso na mesma hora!
        } catch (e) { 
            console.error("Erro ao desassumir tarefa:", e); 
        }
    }
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
    const meuEmail = auth.currentUser.email.toLowerCase();
    const titulo = document.getElementById('admConviteTitulo').value;
    const dataReuniao = document.getElementById('admConviteData').value;
    const horaReuniao = document.getElementById('admConviteHora').value;
    const btnSubmit = event.target.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit ? btnSubmit.innerText : "Enviar Convite";
    
    if (btnSubmit) {
        btnSubmit.innerText = "Enviando... ⏳";
        btnSubmit.disabled = true;
    }
    
    try {
        // Busca o UID do alvo para poder mandar a notificação
        const q = query(collection(db, "usuarios"), where("email", "==", emailAlvo));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            window.mostrarToastNotificacao('Aviso', 'Usuário não encontrado no estúdio.', 'geral');
            if (btnSubmit) { btnSubmit.innerText = textoOriginal; btnSubmit.disabled = false; }
            return; 
        }
        
        let targetId = ""; snap.forEach(d => targetId = d.data().uid);

        await addDoc(collection(db, "reunioes"), {
            titulo, 
            remetente: meuEmail,
            emailAlvo: emailAlvo,
            data: dataReuniao, 
            hora: horaReuniao, 
            status: 'pendente', 
            userId: targetId,
            envolvidos: [meuEmail, emailAlvo], 
            dataCriacao: new Date().toISOString()
        });

        // Notificação com a data no texto
        window.criarNotificacao(
            targetId, 
            'reuniao', 
            'Novo Convite', 
            `${meuEmail.split('@')[0]} te chamou para: ${titulo} dia ${dataReuniao.split('-').reverse().join('/')}`,
            { abaAlvo: 'reunioes' } 
        );

        // Feedback Silencioso: O botão avisa que deu certo e o formulário limpa
        if (btnSubmit) {
            btnSubmit.innerText = "✓ Enviado";
            setTimeout(() => {
                btnSubmit.innerText = textoOriginal;
                btnSubmit.disabled = false;
            }, 2000);
        }
        
        event.target.reset();
        
    } catch(e) { 
        console.error(e); 
        if (btnSubmit) { btnSubmit.innerText = textoOriginal; btnSubmit.disabled = false; }
    } // <--- A CHAVE QUE FALTAVA ERA ESTA AQUI!
};


window.carregarReunioes = function() {
    const elInvites = document.getElementById('invites-entries');
    const elConfirms = document.getElementById('confirmed-entries');
    if(!elInvites || !auth.currentUser) return;
    
    const meuEmail = auth.currentUser.email.toLowerCase();
    const isAdmin = window.userRole === 'admin'; // Variável mágica
    
    const q = query(collection(db, "reunioes"), where("envolvidos", "array-contains", meuEmail));
    
    onSnapshot(q, (snap) => {
        let htmlParaMim = ''; let htmlEnviados = ''; let htmlConfirmados = ''; let htmlRecusados = '';   

        snap.forEach(d => {
            const r = d.data();
            const souRemetente = r.remetente === meuEmail;
            const emailOutraPessoa = souRemetente ? r.emailAlvo : r.remetente;
            const nomeAlvo = emailOutraPessoa ? emailOutraPessoa.split('@')[0] : 'Desconhecido';
            
            const dataExibicao = r.data ? r.data.split('-').reverse().join('/') : 'Data a definir';
            const horaExibicao = r.hora ? r.hora : '--:--';
            
            // O botão de lixeira só é gerado se for Admin
            const btnLixeira = isAdmin ? `<button class="icon-btn" onclick="deletarReuniao('${d.id}')" style="color:#ff5252; opacity:0.5; margin-left:10px;" data-tooltip="Apagar Registro">🗑️</button>` : '';

            if (r.status === 'pendente') {
                if (!souRemetente) {
                    htmlParaMim += `
                    <div class="invite-card">
                        <div>
                            <h3>${r.titulo}</h3>
                            <p style="font-size:0.8rem; color:#aaa;">De: ${r.remetente.split('@')[0]}</p>
                            <p style="font-size:0.75rem; color:var(--primary); margin-top:5px;">📅 ${dataExibicao} às ${horaExibicao}</p>
                        </div>
                        <div class="invite-actions">
                            <button class="btn-primary" style="padding:6px 12px;" onclick="responderConvite('${d.id}', 'confirmado', '${emailOutraPessoa}')">Aceitar</button>
                            <button class="btn-secondary" style="padding:6px 12px; border-color:#ff5252; color:#ff5252;" onclick="responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')">Recusar</button>
                        </div>
                    </div>`;
                } else {
                    htmlEnviados += `
                    <div class="invite-card" style="opacity: 0.7; border-style: dashed; border-color: rgba(255,255,255,0.2);">
                        <div>
                            <h3 style="color:#aaa;">${r.titulo}</h3>
                            <p style="font-size:0.8rem; color:#666;">Para: ${nomeAlvo}</p>
                            <p style="font-size:0.75rem; color:#888; margin-top:5px;">📅 ${dataExibicao} às ${horaExibicao}</p>
                        </div>
                        <div class="invite-actions">
                            <span style="font-size:0.75rem; color:var(--text-muted);">⏳ Aguardando...</span>
                            <button class="icon-btn" onclick="responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')" style="color:#ff5252; margin-left:10px;" data-tooltip="Cancelar Convite">✖</button>
                            ${btnLixeira}
                        </div>
                    </div>`;
                }
            } 
            else if (r.status === 'confirmado') {
                htmlConfirmados += `
                <div class="confirmed-item">
                    <div class="c-date" style="background: var(--primary); color:#000;"><strong>OK</strong></div>
                    <div style="flex:1;">
                        <h4 style="color:#fff; margin-bottom:5px;">${r.titulo}</h4>
                        <p style="font-size:0.8rem; color:var(--text-muted);">📅 ${dataExibicao} às ${horaExibicao}</p>
                        <p style="font-size:0.8rem; color:var(--primary);"><span class="status-dot green"></span> Com ${nomeAlvo}</p>
                    </div>
                    <button class="icon-btn" onclick="responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')" style="color:#ffc107;" data-tooltip="Desmarcar Reunião">✖</button>
                    ${btnLixeira}
                </div>`;
            } 
            else if (r.status === 'recusado') {
                const motivoTxt = r.motivoRecusa ? `<br><span style="color:#ff8a80; font-style:italic;">Motivo: "${r.motivoRecusa}"</span>` : '';
                htmlRecusados += `
                <div class="confirmed-item" style="border-color: rgba(255, 82, 82, 0.3); background: rgba(255, 82, 82, 0.05);">
                    <div class="c-date" style="background: #ff5252; color:#fff;"><strong>X</strong></div>
                    <div style="flex:1;">
                        <h4 style="color:#ff5252; margin-bottom:5px; text-decoration: line-through;">${r.titulo}</h4>
                        <p style="font-size:0.8rem; color:#aaa;">Cancelado/Recusado ${motivoTxt}</p>
                    </div>
                    ${btnLixeira}
                </div>`;
            }
        });

        let finalInvites = '';
        if (htmlParaMim) finalInvites += `<h4 style="color:var(--primary); margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">PARA RESPONDER</h4>` + htmlParaMim;
        if (htmlEnviados) finalInvites += `<h4 style="color:#888; margin-top:20px; margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">ENVIADOS (AGUARDANDO)</h4>` + htmlEnviados;
        elInvites.innerHTML = finalInvites || '<p style="color:#666">Nenhum convite pendente.</p>';

        let finalConfirms = '';
        if (htmlConfirmados) finalConfirms += `<h4 style="color:var(--primary); margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">NA AGENDA</h4>` + htmlConfirmados;
        if (htmlRecusados) finalConfirms += `<h4 style="color:#ff5252; margin-top:20px; margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">NEGADAS / CANCELADAS</h4>` + htmlRecusados;
        if(elConfirms) elConfirms.innerHTML = finalConfirms || '<p style="color:#666">Nenhuma reunião na agenda.</p>';
    });
};

window.responderConvite = async function(id, novoStatus, emailOutraPessoa) {
    let motivo = "";
    
    // Se a pessoa estiver recusando ou cancelando, pedimos o motivo!
    if (novoStatus === 'recusado') {
        motivo = prompt("Qual o motivo do cancelamento / recusa?");
        if (motivo === null) return; // Se a pessoa clicar em 'Cancelar' no prompt, aborta a ação
        motivo = motivo.trim() || "Sem motivo especificado.";
    }

    const reuniaoRef = doc(db, "reunioes", id);
    const snap = await getDoc(reuniaoRef);
    const dados = snap.data();

    // 1. Atualiza o status na aba de reuniões (e salva o motivo, se houver)
    let updateData = { status: novoStatus };
    if (novoStatus === 'recusado') updateData.motivoRecusa = motivo;
    
    await updateDoc(reuniaoRef, updateData);

    // 2. Integração com o Cronograma (Eventos)
    if (novoStatus === 'confirmado') {
        try {
            const eventoData = {
                titulo: `🤝 Reunião: ${dados.titulo}`,
                data: dados.data, hora: dados.hora, tipo: 'meeting', link: '', 
                userId: auth.currentUser.uid, reuniaoId: id, dataCriacao: new Date().toISOString()
            };
            await addDoc(collection(db, "eventos"), eventoData);

            const qOutro = query(collection(db, "usuarios"), where("email", "==", emailOutraPessoa));
            const snapOutro = await getDocs(qOutro);
            if (!snapOutro.empty) {
                eventoData.userId = snapOutro.docs[0].data().uid;
                await addDoc(collection(db, "eventos"), eventoData);
            }
        } catch(e) { console.error("Erro ao criar evento:", e); }
        
    } else if (novoStatus === 'recusado') {
        // Se a pessoa cancelou uma reunião que JÁ ESTAVA no cronograma, nós apagamos ela de lá!
        const qEventos = query(collection(db, "eventos"), where("reuniaoId", "==", id));
        const snapEventos = await getDocs(qEventos);
        snapEventos.forEach(ev => deleteDoc(doc(db, "eventos", ev.id)));
    }
    
    // 3. Dispara a Notificação de volta com o Motivo
    try {
        const qUser = query(collection(db, "usuarios"), where("email", "==", emailOutraPessoa));
        const snapUser = await getDocs(qUser);
        if (!snapUser.empty) {
            const uidAlvo = snapUser.docs[0].data().uid;
            const acao = novoStatus === 'confirmado' ? 'aceitou' : 'recusou/cancelou';
            
            let mensagemNotif = `${auth.currentUser.email.split('@')[0]} ${acao} a reunião.`;
            if (novoStatus === 'recusado') mensagemNotif += `\nMotivo: ${motivo}`; // Adiciona o motivo na notificação
            
            window.criarNotificacao(
                uidAlvo, 'reuniao', 
                `Convite ${acao.charAt(0).toUpperCase() + acao.slice(1)}`, 
                mensagemNotif, { abaAlvo: 'reunioes' } 
            );
        }
    } catch(e) { console.error("Erro ao notificar resposta:", e); }
};

window.deletarReuniao = async (id) => {
    if (window.userRole !== 'admin') {
        return window.mostrarToastNotificacao('Acesso Negado', 'Apenas administradores podem apagar registros da história.', 'geral');
    }
    if(confirm("Apagar permanentemente este registro da agenda do estúdio?")) {
        await deleteDoc(doc(db, "reunioes", id));
    }
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
    const especialidade = document.getElementById('user-specialty').value;
    let bg64 = null;

    if (file && file.size <= 800*1024) {
        bg64 = await new Promise(r => {
            const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(file);
        });
    } else if (file) {
        alert("Imagem pesada! Máximo de 800kb."); btn.disabled = false; btn.innerText = "Salvar Meu Estilo"; return;
    }

    const upd = { corTema: cor, modoTema: modo, opacidadeTema: op, especialidade: especialidade };
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


// ==========================================
// 8. CENTRAL DE ÁUDIOS (PLAYER INTEGRADO)
// ==========================================
window.audioAtualExecucao = null; // Guarda qual áudio está tocando
window.audiosCache = [];

// 1. SALVAMENTO (Com Conversor Automático de Links)
window.salvarAudio = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Processando Link... ⏳"; btn.disabled = true;

    const titulo = document.getElementById('audioTitulo').value;
    const tag = document.getElementById('audioTag').value;
    let url = document.getElementById('audioUrl').value.trim();

    // ==========================================
    // 🧠 MÁGICA DO CONVERSOR AUTOMÁTICO
    // ==========================================
    
    // 1. Converte links do DROPBOX
    if (url.includes("dropbox.com")) {
        // Troca o domínio padrão pelo servidor de conteúdo bruto do Dropbox
        url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com");
        url = url.replace("https://www.dropbox.com", "dl.dropboxusercontent.com");
        url = url.replace("dropbox.com", "dl.dropboxusercontent.com"); // Caso a pessoa copie sem o www
        url = url.replace("https://dropbox.com", "dl.dropboxusercontent.com");

        // Remove aquele "?dl=0" inútil do final pra deixar o link limpo
        url = url.replace("?dl=0", ""); 
        url = url.replace("?dl=1", "");
    } 
    // 2. Converte links do GOOGLE DRIVE
    else if (url.includes("drive.google.com/file/d/")) {
        // Puxa só o ID do arquivo que fica perdido no meio do link gigante do Drive
        const fileId = url.match(/[-\w]{25,}/); 
        if (fileId) {
            // Reconstrói o link usando o formato de download direto oficial
            url = `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
        }
    }

    try {
        await addDoc(collection(db, "audios"), {
            titulo: titulo,
            tag: tag,
            arquivoUrl: url, // Salva no Firebase o link JÁ CONVERTIDO!
            projetoId: window.projetoAtualId,
            enviadoPor: auth.currentUser.email,
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('formNovoAudio').reset();
        closeModal('modalNovoAudio');
    } catch(err) { 
        alert(err.message); 
    }
    
    btn.innerText = "Adicionar Áudio"; btn.disabled = false;
};

// --- NAVEGAÇÃO DAS SUB-ABAS DE ÁUDIO ---
window.switchAudioSubTab = (viewId, btn) => {
    // Esconde todas as áreas internas de áudio
    document.querySelectorAll('.audio-view-content').forEach(el => {
        el.style.display = 'none';
    });
    // Tira a cor ativa de todos os botões do mini-menu
    document.querySelectorAll('.audio-subtab-btn').forEach(b => {
        b.classList.remove('active');
    });
    
    // Mostra apenas a área que foi clicada e acende o botão
    document.getElementById(viewId).style.display = 'block';
    btn.classList.add('active');
};

// 2. CARREGAR ÁUDIOS DO BANCO (Puxando do Link)
// --- SISTEMA DE FILTRO DE ÁUDIO ---
window.audioFiltroAtual = 'all';

window.aplicarFiltroAudio = () => {
    window.audioFiltroAtual = document.getElementById('audio-filter').value;
    window.renderizarAudios(); // Redesenha a tela instantaneamente com o filtro novo!
};

// 2. CARREGAR ÁUDIOS DO BANCO (Puxando do Link)
window.carregarAudiosDoProjeto = (pid) => {
    // Já puxa o moodboard junto de forma limpa
    if (window.carregarReferenciasAudio) window.carregarReferenciasAudio(pid);

    onSnapshot(query(collection(db, "audios"), where("projetoId", "==", pid)), (snap) => {
        window.audiosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderizarAudios();
    });
};

// --- DESENHAR ÁUDIOS NA TELA ---
window.renderizarAudios = () => {
    const grid = document.getElementById('audios-grid');
    if (!grid) return;

    // Aplica o filtro em cima dos arquivos que já estão salvos na memória
    let filtrados = window.audiosCache;
    if (window.audioFiltroAtual !== 'all') {
        filtrados = window.audiosCache.filter(a => a.tag === window.audioFiltroAtual);
    }

    if (filtrados.length === 0) {
        grid.innerHTML = `<div style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding: 40px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">Nenhum áudio encontrado para este filtro.</div>`;
        return;
    }

    grid.innerHTML = filtrados.map(a => {
        
        // VERIFICA SE TEM NOTIFICAÇÃO PRA ESSA MÚSICA!
        const temNotificacao = window.cacheNotificacoes.some(n => n.contextId === a.id);
        const pingoHtml = temNotificacao ? '<span class="item-dot" style="box-shadow: 0 0 10px var(--primary);"></span>' : '';

        return `
            <div class="audio-card" id="card-${a.id}">
                <div class="audio-header">
                    <div>
                        <h4 class="audio-title" style="display:flex; align-items:center; gap:8px;">
                            ${a.titulo} ${pingoHtml}
                        </h4>
                        <span class="audio-tag tag-${a.tag}">${a.tag}</span>
                        <div style="font-size: 0.65rem; color: #666; margin-top: 5px;">Adicionado por ${a.enviadoPor.split('@')[0]}</div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <a href="${a.arquivoUrl}" target="_blank" class="icon-btn" style="color: var(--primary); text-decoration: none; padding:0;" data-tooltip="Abrir Link Original">🔗</a>
                        <button class="icon-btn" onclick="abrirFeedbackAudio('${a.id}', '${a.titulo}', '${a.arquivoUrl}')" style="color: #ffc107; padding:0;" data-tooltip="Feedback / Timestamps">💬</button>
                        <button class="icon-btn" onclick="deletarAudio('${a.id}')" style="color:#ff5252; padding:0;" data-tooltip="Apagar">🗑️</button>
                    </div>
                </div>
                
                <div style="display: flex; gap: 15px; align-items: center; margin-top: 5px;">
                    <button class="btn-play-custom" id="btn-play-${a.id}" onclick="togglePlayAudio('${a.id}')">▶</button>
                    
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 5px;">
                        <div class="audio-progress-container" onclick="seekAudio(event, '${a.id}')">
                            <div class="audio-progress-fill" id="progress-${a.id}"></div>
                        </div>
                        <div class="audio-time" id="time-${a.id}">0:00 / 0:00</div>
                    </div>
                </div>
                
                <audio id="audio-elemento-${a.id}" src="${a.arquivoUrl}" ontimeupdate="atualizarProgresso('${a.id}')" onloadedmetadata="atualizarTempoTotal('${a.id}')" onended="audioTerminou('${a.id}')"></audio>
            </div>
        `;
    }).join('');
};


// 3. A MÁGICA DO PLAY/PAUSE E BARRA DE PROGRESSO
window.togglePlayAudio = async (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    const btn = document.getElementById(`btn-play-${id}`);

    // Trava de segurança 1: Vê se o link tem erro antes de tentar tocar
    if (audio.networkState === 3) {
        alert("Ops! O servidor deste link bloqueou a reprodução (Erro de CORS/Permissão). Tente usar links do Dropbox ou Catbox.moe!");
        return;
    }

    // Se tiver outro tocando, pausa ele primeiro!
    if (window.audioAtualExecucao && window.audioAtualExecucao !== id) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}`);
        const btnAntigo = document.getElementById(`btn-play-${window.audioAtualExecucao}`);
        if(audioAntigo) { audioAntigo.pause(); btnAntigo.innerText = "▶"; }
    }

    if (audio.paused) {
        try {
            await audio.play(); // Usamos o await aqui pra pegar bloqueios invisíveis
            btn.innerText = "⏸";
            window.audioAtualExecucao = id;
        } catch (erro) {
            alert("Bloqueio de segurança detectado! O link informado não permite reprodução direta no Hub.");
            console.error("Erro do player:", erro);
        }
    } else {
        audio.pause();
        btn.innerText = "▶";
        window.audioAtualExecucao = null;
    }
};

window.seekAudio = (e, id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    
    // Trava de segurança 2: Impede a matemática de quebrar se não tiver tempo total
    if (!audio.duration || isNaN(audio.duration)) return; 
    
    const container = e.currentTarget;
    const cliqueX = e.offsetX;
    const larguraTotal = container.offsetWidth;
    const novaPorcentagem = cliqueX / larguraTotal;
    audio.currentTime = novaPorcentagem * audio.duration;
};

window.atualizarProgresso = (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    const barra = document.getElementById(`progress-${id}`);
    const textoTempo = document.getElementById(`time-${id}`);
    
    if (audio.duration) {
        const porcentagem = (audio.currentTime / audio.duration) * 100;
        barra.style.width = `${porcentagem}%`;
        
        const minAtual = Math.floor(audio.currentTime / 60);
        const segAtual = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        const minTotal = Math.floor(audio.duration / 60);
        const segTotal = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        
        textoTempo.innerText = `${minAtual}:${segAtual} / ${minTotal}:${segTotal}`;
    }
};

window.atualizarTempoTotal = (id) => { window.atualizarProgresso(id); }; // Só pra mostrar o tempo antes de dar play
window.audioTerminou = (id) => { document.getElementById(`btn-play-${id}`).innerText = "▶"; };

// 4. DELETAR
window.deletarAudio = async (id) => {
    if(confirm("Apagar este áudio?")) {
        try { await deleteDoc(doc(db, "audios", id)); } 
        catch (err) { console.error(err); }
    }
};

// ==========================================
// 8.1 MOODBOARD DE REFERÊNCIAS
// ==========================================
window.salvarReferenciaAudio = async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('refTitulo').value;
    let url = document.getElementById('refUrl').value.trim();

    // Transforma links normais em IFRAMES (Embutidos)
    if (url.includes('youtube.com/watch?v=')) {
        url = url.replace('watch?v=', 'embed/');
        // Tira parâmetros inúteis do YouTube
        if (url.includes('&')) url = url.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        url = url.replace('youtu.be/', 'youtube.com/embed/');
    } else if (url.includes('spotify.com/track/')) {
        url = url.replace('/track/', '/embed/track/');
    }

    try {
        await addDoc(collection(db, "referencias_audio"), {
            titulo: titulo,
            urlEmbed: url,
            projetoId: window.projetoAtualId,
            enviadoPor: auth.currentUser.email.split('@')[0],
            dataCriacao: new Date().toISOString()
        });
        document.getElementById('refTitulo').value = '';
        document.getElementById('refUrl').value = '';
        closeModal('modalNovaReferencia');
    } catch(err) { console.error(err); }
};

// Renderiza os Iframes na tela
window.carregarReferenciasAudio = (pid) => {
    const grid = document.getElementById('moodboard-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "referencias_audio"), where("projetoId", "==", pid)), (snap) => {
        if (snap.empty) {
            grid.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); font-size:0.85rem;">Nenhuma referência adicionada.</div>`;
            return;
        }
        grid.innerHTML = snap.docs.map(d => {
            const r = d.data();
            // Detecta se é spotify pra deixar o iframe menor, ou youtube pra deixar formato video
            const isSpotify = r.urlEmbed.includes('spotify.com');
            const h = isSpotify ? '152px' : '200px';

            return `
                <div class="moodboard-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <strong style="color:#fff; font-size:0.9rem;">${r.titulo}</strong>
                        <button class="icon-btn" onclick="deletarReferencia('${d.id}')" style="color:#ff5252; padding:0; font-size:0.8rem;">🗑️</button>
                    </div>
                    <iframe src="${r.urlEmbed}" height="${h}" allow="encrypted-media; fullscreen" allowfullscreen></iframe>
                    <div style="font-size:0.65rem; color:#666; text-align:right;">Por ${r.enviadoPor}</div>
                </div>
            `;
        }).join('');
    });
};

window.deletarReferencia = async (id) => {
    if(confirm("Apagar referência?")) await deleteDoc(doc(db, "referencias_audio", id));
};


// ==========================================
// 8.2 FEEDBACK COM TIMESTAMPS
// ==========================================
window.audioFeedbackAtualId = null;

window.abrirFeedbackAudio = (id, titulo, url) => {
    window.audioFeedbackAtualId = id;
    
    // Pausa a música da tela principal se estiver tocando
    if (window.audioAtualExecucao) window.togglePlayAudio(window.audioAtualExecucao);

    document.getElementById('feedback-titulo').innerText = `Feedback: ${titulo}`;
    const player = document.getElementById('player-feedback');
    player.src = url; // Coloca a música no Modal
    
    window.carregarComentariosAudio(id);
    window.openModal('modalFeedbackAudio');
    window.limparNotificacaoItem(id);
};

window.fecharFeedbackAudio = () => {
    document.getElementById('player-feedback').pause(); // Desliga a música ao fechar
    window.closeModal('modalFeedbackAudio');
};

// ==========================================
// SALVAR FEEDBACK DE ÁUDIO COM NOTIFICAÇÃO 100% GUIADA
// ==========================================
window.salvarComentarioAudio = async (e) => {
    e.preventDefault();
    if (!window.audioFeedbackAtualId) return;

    const input = document.getElementById('feedback-texto');
    const player = document.getElementById('player-feedback');
    
    // Pega o tempo EXATO onde o player parou
    const tempo = parseFloat(player.currentTime.toFixed(2)); 

    try {
        // 1. Salva o comentário no banco
        await addDoc(collection(db, "comentarios_audio"), {
            audioId: window.audioFeedbackAtualId,
            texto: input.value,
            tempoPosicao: tempo, // Salva o segundo
            autor: auth.currentUser.email.split('@')[0],
            dataCriacao: new Date().toISOString()
        });

        // 2. Busca a música que está tocando para saber quem foi que postou ela
        const audioReferencia = window.audiosCache.find(a => a.id === window.audioFeedbackAtualId);

        // Se a música existe e quem está comentando NÃO é o próprio dono dela
        if (audioReferencia && audioReferencia.enviadoPor !== auth.currentUser.email) {
            
            // Procura a ID do dono pelo email
            const qUser = query(collection(db, "usuarios"), where("email", "==", audioReferencia.enviadoPor));
            const snapUser = await getDocs(qUser);
            
            if (!snapUser.empty) {
                const donoUid = snapUser.docs[0].data().uid;
                
                // 3. O DISPARO DA NOTIFICAÇÃO (AGORA COM O GPS DAS BOLINHAS!)
                window.criarNotificacao(
                    donoUid, 
                    'audio', 
                    'Feedback Recebido', 
                    `${auth.currentUser.email.split('@')[0]} comentou em "${audioReferencia.titulo}"`,
                    {
                        abaAlvo: 'projetos',            // Acende a bolinha no Menu Lateral
                        subAba: 'tab-audios',           // Acende o pingo na aba interna de Áudios
                        projetoId: window.projetoAtualId, // Garante que só acenda dentro do projeto certo
                        contextId: window.audioFeedbackAtualId // Acende o pingo no card EXATO da música!
                    }
                );
            }
        }

        input.value = ''; // Limpa o campo
    } catch(err) { console.error(err); }
};

window.carregarComentariosAudio = (audioId) => {
    const lista = document.getElementById('lista-comentarios');
    onSnapshot(query(collection(db, "comentarios_audio"), where("audioId", "==", audioId)), (snap) => {
        let comentarios = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Ordena cronologicamente pela música (do segundo 0 até o fim)
        comentarios.sort((a,b) => a.tempoPosicao - b.tempoPosicao);

        if (comentarios.length === 0) {
            lista.innerHTML = '<li style="color:#666; text-align:center; padding:15px;">Seja o primeiro a deixar um feedback! Aperte o pause e digite abaixo.</li>';
            return;
        }

        lista.innerHTML = comentarios.map(c => {
            // Converte segundos (ex: 65) pra formato Relógio (01:05)
            const min = Math.floor(c.tempoPosicao / 60).toString().padStart(2, '0');
            const seg = Math.floor(c.tempoPosicao % 60).toString().padStart(2, '0');
            const relogio = `${min}:${seg}`;

            const me = c.autor === auth.currentUser.email.split('@')[0];
            const btnApagar = me ? `<button class="icon-btn" onclick="deletarComentarioAudio('${c.id}')" style="color:#ff5252; font-size:0.8rem;">🗑️</button>` : '';

            return `
                <li class="comment-item">
                    <button class="timestamp-btn" onclick="pularTempoFeedback(${c.tempoPosicao})" data-tooltip="Pular para este momento">⏱️ ${relogio}</button>
                    <div style="flex:1;">
                        <strong style="color:#fff; font-size:0.85rem;">${c.autor}</strong>
                        <p style="color:#ccc; font-size:0.9rem; margin-top:2px;">${c.texto}</p>
                    </div>
                    ${btnApagar}
                </li>
            `;
        }).join('');
    });
};

window.pularTempoFeedback = (segundos) => {
    const player = document.getElementById('player-feedback');
    player.currentTime = segundos;
    player.play(); // Já dá o play automaticamente pra pessoa ouvir
};

window.deletarComentarioAudio = async (id) => {
    if(confirm("Apagar comentário?")) await deleteDoc(doc(db, "comentarios_audio", id));
};


// ==========================================
// SISTEMA GLOBAL DE NOTIFICAÇÕES (CORRIGIDO E COMPLETO)
// ==========================================

// 1. Cria a notificação aceitando a rota (a "trilha de migalhas")
window.criarNotificacao = async (userIdAlvo, tipo, titulo, mensagem, rota = {}) => {
    if (!userIdAlvo) return;
    try {
        await addDoc(collection(db, "notificacoes"), {
            userId: userIdAlvo,
            tipo: tipo,           
            titulo: titulo,
            mensagem: mensagem,
            lida: false,
            abaAlvo: rota.abaAlvo || null,
            subAba: rota.subAba || null,
            projetoId: rota.projetoId || null,
            contextId: rota.contextId || null,
            dataCriacao: new Date().toISOString()
        });
    } catch(e) { console.error("Erro ao notificar:", e); }
};

window.cacheNotificacoes = [];
window.notificacoesConhecidas = new Set(); // Evita que o F5 toque as notificações antigas de novo

window.iniciarSistemaNotificacoes = () => {
    if(!auth.currentUser) return;
    
    const q = query(
        collection(db, "notificacoes"), 
        where("userId", "==", auth.currentUser.uid), 
        where("lida", "==", false)
    );
    
    onSnapshot(q, (snap) => {
        window.cacheNotificacoes = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // 1. Dispara Popups (Toasts) apenas para notificações NOVAS
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const n = change.doc.data();
                const isRecente = (new Date().getTime() - new Date(n.dataCriacao).getTime()) < 10000;
                if (isRecente && !window.notificacoesConhecidas.has(change.doc.id)) {
                    window.mostrarToastNotificacao(n.titulo, n.mensagem, n.tipo);
                    window.notificacoesConhecidas.add(change.doc.id);
                }
            }
        });

        // 2. Atualiza a trilha de bolinhas e pingos
        window.atualizarTrilhaNotificacoes();
    });
};

window.atualizarTrilhaNotificacoes = () => {
    // Limpa tudo antes de redesenhar
    document.querySelectorAll('.nav-badge, .item-dot').forEach(el => el.remove());

    let contagemPorAba = {};

    window.cacheNotificacoes.forEach(n => {
        // 1. Bolinha no Menu Lateral
        if (n.abaAlvo) {
            contagemPorAba[n.abaAlvo] = (contagemPorAba[n.abaAlvo] || 0) + 1;
        }
        
        // 2. Pingo Brilhante no Card do Projeto (na grade inicial)
        if (n.projetoId) {
            const projCard = document.getElementById(`proj-card-${n.projetoId}`);
            if (projCard && !projCard.querySelector('.proj-dot')) {
                const dot = document.createElement('span');
                dot.className = 'item-dot proj-dot';
                dot.style.position = 'absolute';
                dot.style.top = '15px';
                dot.style.right = '15px';
                dot.style.width = '12px';
                dot.style.height = '12px';
                dot.style.boxShadow = '0 0 10px var(--primary), 0 0 20px var(--primary)';
                dot.style.zIndex = '10';
                projCard.appendChild(dot);
            }
        }

        // 3. Pingo na Sub-aba (ex: Botão "Áudios" dentro do projeto)
        if (window.projetoAtualId && n.projetoId === window.projetoAtualId && n.subAba) {
            window.desenharPingoNaSubAba(n.subAba);
        }
    });

    Object.keys(contagemPorAba).forEach(aba => {
        window.desenharBadgeNoMenu(aba, contagemPorAba[aba]);
    });

    if (window.renderizarWikiTree) window.renderizarWikiTree();
    if (window.renderizarAudios) window.renderizarAudios(); // Manda os pingos para as músicas!
};

window.desenharBadgeNoMenu = (target, quantidade) => {
    const btn = document.querySelector(`.nav-btn[data-target="${target}"]`);
    if (btn && !btn.querySelector('.nav-badge')) {
        btn.style.position = 'relative';
        const b = document.createElement('span');
        b.className = 'nav-badge';
        b.innerText = quantidade > 9 ? '9+' : quantidade;
        btn.appendChild(b);
    }
};

window.desenharPingoNaSubAba = (subAbaId) => {
    const btn = document.querySelector(`button[onclick*="${subAbaId}"]`);
    if (btn && !btn.querySelector('.item-dot')) {
        const dot = document.createElement('span');
        dot.className = 'item-dot';
        btn.appendChild(dot);
    }
};

// Limpa notificações específicas de um arquivo (ex: quando ouve a música)
window.limparNotificacaoItem = async (contextId) => {
    const notifs = window.cacheNotificacoes.filter(n => n.contextId === contextId);
    for (let n of notifs) {
        await updateDoc(doc(db, "notificacoes", n.id), { lida: true });
    }
};

// Substitua esta função na área de Notificações Globais
window.marcarNotificacoesComoLidas = async (abaAlvo) => {
    if(!auth.currentUser) return;
    const q = query(collection(db, "notificacoes"), 
                    where("userId", "==", auth.currentUser.uid), 
                    where("lida", "==", false),
                    where("abaAlvo", "==", abaAlvo));
    const snap = await getDocs(q);
    
    snap.forEach(d => {
        const data = d.data();
        // A MÁGICA: Só apaga a bolinha do menu se a notificação NÃO tiver um destino final (contextId)
        // Ex: Reuniões normais apagam. Mas comentários em áudio NÃO apagam até você abrir o áudio!
        if (!data.contextId) {
            updateDoc(doc(db, "notificacoes", d.id), { lida: true });
        }
    });
};

// Construtor do Popup no canto da tela
window.mostrarToastNotificacao = (titulo, msg, tipo) => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'system-toast';
    
    let icone = '🔔';
    if(tipo === 'reuniao') icone = '📅';
    if(tipo === 'audio') icone = '🎵';

    toast.innerHTML = `
        <div style="font-weight:900; font-size:0.9rem; margin-bottom:5px; color:var(--primary);">${icone} ${titulo}</div>
        <div style="font-size:0.8rem; color:#e0e0e0; line-height: 1.4;">${msg}</div>
    `;
    
    toast.onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove() }, 6000);
};

window.notificarWorkflow = (especialidade) => {
    const antigo = document.querySelector('.workflow-toast');
    if (antigo) antigo.remove();

    const labels = {
        'dev': { nome: 'Programação', icon: '💻' },
        'design': { nome: 'Game Design', icon: '📖' },
        'art': { nome: 'Arte & Som', icon: '🎨' },
        'geral': { nome: 'Dashboard', icon: '🎯' }
    };

    const config = labels[especialidade] || labels['geral'];

    const toast = document.createElement('div');
    toast.className = 'workflow-toast';
    toast.innerHTML = `
        <div class="icon">${config.icon}</div>
        <div class="text">Bem-vindo de volta! Redirecionado para <strong>${config.nome}</strong>.</div>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};


// --- MOTOR DE ALERTAS ATIVOS ---

// 1. Alerta de Boas-vindas (Primeiro acesso do dia)
window.verificarAgendaDoDia = async () => {
    if (!auth.currentUser) return;
    
    const hoje = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const meuEmail = auth.currentUser.email.toLowerCase();

    const q = query(
        collection(db, "reunioes"), 
        where("envolvidos", "array-contains", meuEmail),
        where("status", "==", "confirmado"),
        where("data", "==", hoje)
    );

    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const qtd = snap.size;
        const msg = qtd === 1 
            ? `Você tem 1 reunião marcada para hoje.` 
            : `Você tem ${qtd} reuniões marcadas para hoje.`;
        
        // Dispara o Toast de boas-vindas
        setTimeout(() => {
            window.mostrarToastNotificacao('Agenda de Hoje', msg, 'reuniao');
        }, 3000); // Espera 3 segundos após o login para não encavalar com o Welcome
    }
};

// 2. Alerta de "1 Hora Antes"
window.lembretesDisparados = new Set(); // Para não repetir o alerta várias vezes

window.verificarLembretesProximos = async () => {
    if (!auth.currentUser) return;

    const agora = new Date();
    const meuEmail = auth.currentUser.email.toLowerCase();
    const hoje = agora.toISOString().split('T')[0];

    const q = query(
        collection(db, "reunioes"), 
        where("envolvidos", "array-contains", meuEmail),
        where("status", "==", "confirmado"),
        where("data", "==", hoje)
    );

    const snap = await getDocs(q);

    snap.forEach(d => {
        const r = d.data();
        if (!r.hora) return;

        // Calcula a diferença de tempo
        const [horas, minutos] = r.hora.split(':');
        const dataReuniao = new Date();
        dataReuniao.setHours(parseInt(horas), parseInt(minutos), 0);

        const diferencaMilissegundos = dataReuniao - agora;
        const diferencaMinutos = Math.floor(diferencaMilissegundos / 1000 / 60);

        // Se faltar entre 55 e 60 minutos e ainda não avisamos...
        if (diferencaMinutos > 0 && diferencaMinutos <= 60 && !window.lembretesDisparados.has(d.id)) {
            window.mostrarToastNotificacao(
                'Reunião Próxima', 
                `Sua reunião "${r.titulo}" começa em 1 hora (${r.hora}).`, 
                'reuniao'
            );
            window.lembretesDisparados.add(d.id); // Marca como avisado
        }
    });
};