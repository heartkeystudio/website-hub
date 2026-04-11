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

// Função global para saber como chamar o usuário (Apelido > Nome > Email)
window.obterNomeExibicao = () => {
    if (window.meuApelido) return window.meuApelido;
    if (window.meuNome) return window.meuNome.split(' ')[0]; // Pega só o primeiro nome
    if (auth.currentUser) return auth.currentUser.email.split('@')[0];
    return "Desconhecido";
};

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
            cargoAtual = d.role || 'membro';
            
            // --- CARREGA A IDENTIDADE PRA MEMÓRIA ---
            window.meuNome = d.nome || user.displayName || user.email.split('@')[0];
            window.meuApelido = d.apelido || "";
            window.meuBgTema = d.bgTema || null; // <--- ADICIONE ESTA LINHA AQUI!
            
            window.aplicarTema(d.corTema, d.bgTema, d.modoTema, d.opacidadeTema);
            
            // Atualiza a barra lateral com o seu Apelido!
            document.querySelector('.user-email').innerHTML = `<strong>${window.obterNomeExibicao()}</strong><br><span style="font-size:0.65rem; opacity:0.7;">${user.email}</span>`;
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
        window.iniciarWarRoom();
        window.carregarRanking();
        window.verificarResetDiario();
        window.carregarMeuPerfil();
        window.iniciarSistemaNotificacoes();
        window.verificarAgendaDoDia();
        window.carregarIncubadora();
        window.iniciarEscutaRadioGlobal();

        
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

    const btnCfgRadio = document.getElementById('btn-config-radio');
    if (btnCfgRadio) {
        btnCfgRadio.style.display = (cargo === 'admin') ? "block" : "none";
    }
};

document.getElementById('btn-login-google').onclick = () => signInWithPopup(auth, provider).catch(e => console.error(e));
document.querySelector('.logout-btn').onclick = () => signOut(auth).catch(e => console.error(e));

// ==========================================
// 4. NAVEGAÇÃO SPA E MODAIS (ATUALIZADO)
// ==========================================
// Remova o bloco antigo e use este:
document.querySelectorAll('.nav-btn').forEach(btn => {
    // Remove qualquer listener antigo antes de adicionar o novo (Prevenção de Duplicidade)
    btn.onclick = (e) => {
        const target = btn.getAttribute('data-target');
        
        // Só reseta a wiki se não estivermos indo PARA a wiki
        if (target !== 'wiki' && typeof window.fecharSessaoWiki === 'function') {
            window.fecharSessaoWiki();
        }

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
    };
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
// LOGGER GLOBAL (RADAR DO ESTÚDIO)
// ==========================================
window.registrarAtividade = async (mensagem, tipo, icone) => {
    if (!auth.currentUser) return;
    
    // MÁGICA AQUI:
    const nomeUser = window.obterNomeExibicao();
    
    try {
        await addDoc(collection(db, "registro_atividades"), {
            autor: nomeUser,
            mensagem: mensagem,
            tipo: tipo,
            icone: icone,
            dataCriacao: new Date().toISOString()
        });
    } catch (e) { console.error("Erro ao registrar atividade:", e); }
};


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

// ==========================================
// 5. DASHBOARD INTELIGENTE (VISÃO CEO)
// ==========================================
window.custoMensalEstimado = 3000; // Padrão R$ 3.000/mês, o usuário pode mudar

window.configurarBurnRate = () => {
    const novoValor = prompt("Qual o custo fixo mensal estimado do estúdio? (Apenas números, ex: 3500)", window.custoMensalEstimado);
    if (novoValor && !isNaN(novoValor)) {
        window.custoMensalEstimado = parseFloat(novoValor);
        window.carregarDashboard(); // Recalcula na hora!
    }
};

window.carregarDashboard = async () => {
    if (!auth.currentUser) return;
    const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    
    try {
        // 1. BUSCA DE DADOS (Agora com filtros para não travar nas regras de segurança)
        // Buscamos o que é MEU e o que é da EMPRESA separadamente para garantir o acesso
        const qPessoal = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
        const qEmpresa = query(collection(db, "lancamentos"), where("escopo", "==", "empresa"));
        
        const [snapPessoal, snapEmpresa] = await Promise.all([getDocs(qPessoal), getDocs(qEmpresa)]);
        
        let rec = 0, cus = 0;
        const processarDoc = (d) => {
            const ld = d.data();
            if (ld.tipo === 'receita') rec += ld.valor; else cus += ld.valor;
        };

        snapPessoal.forEach(processarDoc);
        snapEmpresa.forEach(d => {
            // Evita duplicar se o meu lançamento também for marcado como empresa
            if (d.data().userId !== auth.currentUser.uid) processarDoc(d);
        });

        const saldoFinal = rec - cus;
        const dashSaldo = document.getElementById('dash-saldo-runway');
        const dashMeses = document.getElementById('dash-meses-vida');
        const barFill = document.getElementById('runway-bar-fill');

        if (dashSaldo) {
            dashSaldo.innerText = formatador.format(saldoFinal);
            
            // Lógica de Runway (Gasto Mensal)
            const gastoMensal = window.custoMensalEstimado || 3000;
            if (saldoFinal <= 0) {
                dashSaldo.style.color = '#ff5252';
                if(dashMeses) dashMeses.innerText = "Cofre Zerado";
                if(barFill) { barFill.style.width = '0%'; barFill.style.background = '#ff5252'; }
            } else {
                dashSaldo.style.color = 'var(--primary)';
                const mesesDeVida = (saldoFinal / gastoMensal).toFixed(1);
                if(dashMeses) dashMeses.innerText = `Sobrevivência: ~${mesesDeVida} meses`;
                
                const porcentagem = Math.min(100, (mesesDeVida / 12) * 100);
                if(barFill) {
                    barFill.style.width = `${porcentagem}%`;
                    barFill.style.background = mesesDeVida < 3 ? '#ffc107' : 'var(--primary)';
                }
            }
        }

        // 2. PRÓXIMO MARCO
        const qEvP = query(collection(db, "eventos"), where("userId", "==", auth.currentUser.uid));
        const qEvE = query(collection(db, "eventos"), where("escopo", "==", "empresa"));
        const [snapEvP, snapEvE] = await Promise.all([getDocs(qEvP), getDocs(qEvE)]);

        let eventos = [];
        const hojeDate = new Date();
        hojeDate.setHours(0,0,0,0);

        const filtrarEventos = (docSnap) => {
            const e = docSnap.data();
            const dataEv = new Date(e.data + "T00:00:00");
            if (dataEv >= hojeDate) eventos.push({id: docSnap.id, ...e});
        };

        snapEvP.forEach(filtrarEventos);
        snapEvE.forEach(d => { if(d.data().userId !== auth.currentUser.uid) filtrarEventos(d); });
        
        eventos.sort((a,b) => new Date(a.data) - new Date(b.data));
        
        const dashEvento = document.getElementById('dash-evento-destaque');
        const dashDias = document.getElementById('dash-dias-restantes');
        
        if (dashEvento && dashDias) {
            if (eventos.length > 0) {
                const prox = eventos[0]; 
                const dataEv = new Date(prox.data + "T00:00:00");
                const diasRestantes = Math.ceil((dataEv - hojeDate) / (1000 * 3600 * 24));
                
                dashEvento.innerHTML = prox.escopo === 'empresa' 
                    ? `<span style="color:var(--primary)">🏢 ${prox.titulo}</span>` 
                    : prox.titulo;

                dashDias.innerText = diasRestantes === 0 ? "É HOJE!" : `Faltam ${diasRestantes} dias`;
            } else {
                dashEvento.innerText = "Sem eventos próximos";
                dashDias.innerText = "--";
            }
        }

        // 3. TAREFAS EM FOCO (Sem alterações, já estava correto)
        const qTsk = query(collection(db, "tarefas"), where("userId", "==", auth.currentUser.uid));
        const snapTsk = await getDocs(qTsk);
        let pendentes = [];
        snapTsk.forEach(d => {
            if (d.data().status !== 'done') pendentes.push({id: d.id, ...d.data()});
        });
        
        const priorities = document.getElementById('dash-priorities');
        if (priorities) {
            priorities.innerHTML = pendentes.slice(0,3).map(t => `
                <div class="priority-item" style="padding: 10px 15px; border-radius: 8px;">
                    <input type="checkbox" onclick="concluirTarefaDash('${t.id}')" style="accent-color: var(--primary); width:18px; height:18px; cursor:pointer;">
                    <label style="color: #fff; font-size: 0.9rem;"><strong>${t.titulo}</strong> <span class="badge badge-${t.tag}" style="font-size:0.6rem; margin-left:8px;">${t.tag}</span></label>
                </div>
            `).join('') || '<p style="color:#666; font-style:italic;">Você não tem tarefas pendentes.</p>';
        }

        // 4. RADAR DO ESTÚDIO (Simplificado para evitar loops de snapshot)
        const radarFeed = document.getElementById('activity-feed');
        if (radarFeed && !window.radarAtivo) {
            window.radarAtivo = true; // Impede criar múltiplos listeners
            const qRadar = query(collection(db, "registro_atividades"), orderBy("dataCriacao", "desc"), limit(8));
            onSnapshot(qRadar, (snapRadar) => {
                radarFeed.innerHTML = snapRadar.docs.map(d => {
                    const a = d.data();
                    const hora = new Date(a.dataCriacao).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    return `
                        <li class="activity-item">
                            <span class="activity-time">${hora}</span>
                            <span>${a.icone}</span>
                            <span style="color: #ddd;"><strong>${a.autor}</strong> ${a.mensagem}</span>
                        </li>`;
                }).join('') || '<li>Silêncio no estúdio...</li>';
            });
        }

    } catch(e) { 
        console.error("Erro no Dashboard:", e);
        // Se der erro, desliga os esqueletos de carregamento
        document.getElementById('dash-saldo-runway').innerText = "Erro ao carregar";
    }
};

window.concluirTarefaDash = async (id) => {
    // Busca o nome da tarefa rapidinho para avisar no Radar
    const tSnap = await getDoc(doc(db, "tarefas", id));
    if(tSnap.exists()) {
        window.registrarAtividade(`concluiu a tarefa rápida "${tSnap.data().titulo}"`, 'tarefa', '⚡');
    }
    
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

        if (window.ideiaPromovendoId) {
            if (confirm("Projeto criado! Deseja remover a ideia original da Incubadora?")) {
                await deleteDoc(doc(db, "brainstorm_ideias", window.ideiaPromovendoId));
            }
            window.ideiaPromovendoId = null; // Reseta o controle
        }
        
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
            
            // --- LÓGICA DE BOTÕES CORRIGIDA ---
            const souDono = p.userId === auth.currentUser.uid;
            let botoesAcao = '';

            if (souDono) {
                // Se eu sou o dono, vejo a lixeira para deletar tudo
                botoesAcao = `<button class="icon-btn" onclick="event.stopPropagation(); deletarProjeto('${d.id}')" style="color:#ff5252; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;" data-tooltip="Excluir Projeto">🗑️</button>`;
            } else {
                // Se sou convidado, vejo o botão de "porta" para sair da equipe
                botoesAcao = `<button class="icon-btn" onclick="event.stopPropagation(); sairDoProjeto('${d.id}', '${p.nome}')" style="color:#ffc107; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;" data-tooltip="Sair do Projeto">🚪</button>`;
            }
            // ---------------------------------

            const bgStyle = p.capaBase64 ? `background: linear-gradient(rgba(15,15,15,0.7), rgba(15,15,15,0.95)), url('${p.capaBase64}') center/cover; border-color: rgba(255,255,255,0.2);` : '';
            const avatarHtml = p.avatarBase64 ? `<img src="${p.avatarBase64}" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">` : iniciais;

            return `
                <div class="client-card" id="proj-card-${d.id}" onclick="window.abrirProjeto('${d.id}', '${p.nome}', '${p.githubRepo}', '${p.capaBase64 || ""}', ${p.versaoAlvo || 1})" style="cursor:pointer; position:relative; ${bgStyle}">
                    <div class="client-header" style="border-bottom-color: rgba(255,255,255,0.1);">
                        <div class="client-avatar" style="padding:0; overflow:hidden;">${avatarHtml}</div>
                        <div class="client-title" style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3 style="margin:0;">${p.nome}</h3>
                                ${botoesAcao} </div>
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

    window.carregarArtesDoProjeto(id);
    window.carregarCoresProjeto(id);
    window.carregarReferenciasArt(id);

    window.carregarBrainstorm(id);

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

window.sairDoProjeto = async (id, nome) => {
    if (confirm(`Deseja se retirar da equipe do projeto "${nome}"?`)) {
        try {
            const docRef = doc(db, "projetos", id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const colaboradoresAtuais = docSnap.data().colaboradores || [];
                const meuEmail = auth.currentUser.email.toLowerCase();
                
                // Remove meu e-mail da lista
                const novaLista = colaboradoresAtuais.filter(email => email !== meuEmail);
                
                await updateDoc(docRef, { colaboradores: novaLista });
                window.mostrarToastNotificacao('Projeto', `Você saiu de ${nome}`, 'geral');
                // O onSnapshot carregará a lista atualizada automaticamente
            }
        } catch (e) { console.error(e); }
    }
};

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
        // Lógica do Novo Filtro: "Sem Responsável"
        if (filtro === 'unassigned' && t.assignedTo) return;
        if (filtro !== 'all' && filtro !== 'unassigned' && t.tag !== filtro) return;

        const card = document.createElement('div');
        card.className = 'kanban-card'; card.id = t.id; card.draggable = true;
        card.ondragstart = (ev) => ev.dataTransfer.setData("text", t.id);
        
        // Agora só abre detalhes se clicar na área livre (evita conflito com botões internos)
        card.onclick = (e) => { if(!e.target.closest('button')) window.abrirDetalhesTarefa(t.id, t); };
        
        let badgeClass = `badge-${t.tag}`;
        const ghLink = t.githubIssue ? `<span style="color:var(--primary);" title="GitHub Issue">🔗 #${t.githubIssue}</span>` : '';

        let assignedHtml = "";
        if (t.assignedTo) {
            const iniciais = t.assignedName ? t.assignedName.substring(0, 2).toUpperCase() : "??";
            assignedHtml = `<div class="task-owner" title="Assumido por ${t.assignedName}. Clique para largar." onclick="event.stopPropagation(); window.desassumirTarefa('${t.id}')" style="cursor: pointer; background: var(--primary); color: #000;">${iniciais}</div>`;
        } else {
            assignedHtml = `<button class="btn-assumir" onclick="event.stopPropagation(); window.assumirTarefa('${t.id}')">Assumir</button>`;
        }

        // --- MENU DE 3 PONTINHOS (Edição e Exclusão) ---
        let btnApagar = '';
        // Quem assumiu a tarefa ou o Admin podem editar
        let btnEditar = `<button class="icon-btn" onclick="event.stopPropagation(); window.abrirEdicaoTarefaRapida('${t.id}', '${t.titulo}', '${t.tag}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:#e0e0e0;">✏️ Editar Nome/Tag</button>`;

        if (window.userRole === 'admin') {
            btnApagar = `<button class="icon-btn" onclick="event.stopPropagation(); window.deletarTarefa('${t.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; margin-top:5px; border-top:1px solid rgba(255,255,255,0.1);">🗑️ Excluir</button>`;
        }

        const menu3Pontos = `
            <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="padding:0; font-size:1.2rem; line-height:0.5; color:var(--text-muted);">⋮</button>
                <div class="dropdown-content">
                    ${btnEditar}
                    ${btnApagar}
                </div>
            </div>
        `;

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                <span class="badge ${badgeClass}">${t.tag.toUpperCase()}</span>
                ${menu3Pontos}
            </div>
            <h4>${t.titulo}</h4>
            <div class="card-footer" style="margin-top: 5px; padding-top: 8px;">
                <div style="display:flex; align-items:center; gap:8px;">${assignedHtml} ${ghLink}</div>
            </div>`;
            
        const alvo = document.getElementById(t.status);
        if (alvo) { alvo.appendChild(card); counts[t.status]++; }
    });

    document.getElementById('count-todo').innerText = counts.todo;
    document.getElementById('count-doing').innerText = counts.doing;
    document.getElementById('count-done').innerText = counts.done;
    
    // Calcula a EXP da versão (Manteve igual)
    const concluidasReais = window.tarefasProjetoCache.filter(t => t.status === 'done').length;
    let porcentagem = window.tarefasProjetoCache.length > 0 ? Math.round((concluidasReais / window.tarefasProjetoCache.length) * 100) : 0;
    
    if (document.getElementById('project-exp-fill')) {
        document.getElementById('project-exp-fill').style.width = `${porcentagem}%`;
        document.getElementById('project-exp-text').innerText = `${porcentagem}% Concluído`;
    }
};

// Fechar os dropdowns ao clicar fora
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
});

window.abrirEdicaoTarefaRapida = async (id, tituloAtual, tagAtual) => {
    // Fecha o menu de pontinhos
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
    
    const novoTitulo = prompt("Novo título da tarefa:", tituloAtual);
    if (!novoTitulo || novoTitulo.trim() === "" || novoTitulo === tituloAtual) return;

    try {
        await updateDoc(doc(db, "tarefas", id), { titulo: novoTitulo.trim() });
    } catch(e) { console.error(e); alert("Erro ao editar."); }
};

// ==========================================
// 3. DETALHES DA TAREFA E CHECKLISTS INTERATIVOS
// ==========================================
window.taskAtualEditando = { id: null, rawBody: "", githubIssue: null };

// A) Converte texto do GitHub para HTML interativo (Agora super inteligente)
window.renderizarDescricaoTask = (texto) => {
    const container = document.getElementById('detalheTaskDesc');
    
    if (!texto) {
        container.innerHTML = "Sem detalhes adicionais.";
        return;
    }

    // 1. Pré-processa os checkboxes para manter a nossa interatividade ANTES do Markdown
    const linhas = texto.split('\n');
    const linhasProcessadas = linhas.map((linha, index) => {
        const uncheckMatch = linha.match(/^([\s\-*+]+)\[ \]\s+(.*)/);
        const checkMatch = linha.match(/^([\s\-*+]+)\[x\]\s+(.*)/i);
        
        if (uncheckMatch) {
            const espacos = uncheckMatch[1].replace(/[-*+]/g, '').length; 
            const recuo = espacos * 15; 
            return `<div class="task-check-label" style="margin-left: ${recuo}px; margin-top: 5px;"><input type="checkbox" onchange="window.toggleTaskCheck(${index}, false)"> <span>${uncheckMatch[2]}</span></div>`;
        } else if (checkMatch) {
            const espacos = checkMatch[1].replace(/[-*+]/g, '').length;
            const recuo = espacos * 15;
            return `<div class="task-check-label" style="margin-left: ${recuo}px; margin-top: 5px;"><input type="checkbox" checked onchange="window.toggleTaskCheck(${index}, true)"> <span class="text-checked">${checkMatch[2]}</span></div>`;
        }
        return linha;
    });

    // 2. Passa o texto pelo interpretador do Markdown
    let htmlGerado = marked.parse(linhasProcessadas.join('\n'));

    // 3. Aplica as MESMAS tags customizadas da Wiki (Ex: {cor:red} ou {center})
    if (typeof window.processarTagsCustomizadas === 'function') {
        htmlGerado = window.processarTagsCustomizadas(htmlGerado);
    }

    // 4. Injeta na tela usando as classes do Obsidian/Wiki
    container.className = 'markdown-body checklist-container';
    
    // Ajustes finos de CSS via JS para não quebrar o visual do Modal
    container.style.background = 'transparent'; 
    container.style.padding = '0'; 
    container.style.boxShadow = 'none';
    container.style.border = 'none';
    container.style.minHeight = 'auto';
    
    container.innerHTML = htmlGerado;

    // 5. Acorda o Mermaid para desenhar os gráficos (Fluxogramas, Diagramas, etc)
    try {
        const graficos = container.querySelectorAll('.language-mermaid');
        if (graficos.length > 0) {
            mermaid.run({ nodes: graficos });
        }
    } catch(e) {
        console.log("Erro ao desenhar diagrama do Mermaid na tarefa:", e);
    }
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
            const statusAntigo = t.status;

            if (statusAntigo === novoStatus) return;

            // 🛑 TRAVA DE SEGURANÇA: Só quem assumiu ou um Admin pode arrastar o card!
            if (t.assignedTo && t.assignedTo !== auth.currentUser.uid && window.userRole !== 'admin') {
                window.mostrarToastNotificacao('Acesso Negado', '🔒 Apenas o responsável pela tarefa ou um Administrador pode movê-la!', 'geral');
                return;
            }

            await updateDoc(taskRef, { status: novoStatus });

            if (statusAntigo !== 'done' && novoStatus === 'done' && t.assignedTo) {
                window.pontuarGamificacao('tarefa', t.assignedTo, t.tag, false);
                window.registrarAtividade(`concluiu a tarefa "${t.titulo}"`, 'tarefa', '✅');
            } 
            else if (statusAntigo === 'done' && novoStatus !== 'done' && t.assignedTo) {
                window.pontuarGamificacao('tarefa', t.assignedTo, t.tag, true);
            }

            const token = localStorage.getItem('github_token');
            if (window.projetoAtualRepo && token && t.githubIssue) {
                const state = novoStatus === 'done' ? 'closed' : 'open';
                fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${t.githubIssue}`, {
                    method: "PATCH",
                    headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
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
    const nomeUser = window.obterNomeExibicao();

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
    
    try {
        const taskRef = doc(db, "tarefas", taskId);
        const docSnap = await getDoc(taskRef);
        
        if (docSnap.exists()) {
            const t = docSnap.data();

            // 🛑 TRAVA DE SEGURANÇA: Gerente não pode tirar a tarefa do amiguinho!
            if (t.assignedTo !== auth.currentUser.uid && window.userRole !== 'admin') {
                return window.mostrarToastNotificacao('Acesso Negado', '🔒 Apenas quem assumiu ou um Admin pode desassumir esta tarefa.', 'geral');
            }

            if(confirm("Deseja largar esta tarefa e devolvê-la para a equipe?")) {
                if (t.status === 'done' && t.assignedTo) {
                    window.pontuarGamificacao('tarefa', t.assignedTo, t.tag, true);
                }

                const novoStatus = t.status === 'done' ? 'todo' : t.status;
                await updateDoc(taskRef, { assignedTo: null, assignedName: null, status: novoStatus });
            }
        }
    } catch (e) { console.error("Erro ao desassumir tarefa:", e); }
};

// --- MISSÕES DIÁRIAS ---
window.verificarResetDiario = async () => {
    if (!auth.currentUser) return;
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    const docSnap = await getDoc(userRef);
    const hoje = new Date().toISOString().split('T')[0]; // Ex: 2024-05-20
    
    if (docSnap.exists()) {
        const u = docSnap.data();
        // Se o último dia salvo for diferente de hoje, ZERA as missões!
        if (u.ultimoResetDiario !== hoje) {
            await updateDoc(userRef, {
                ultimoResetDiario: hoje,
                'daily.tarefa': 0,
                'daily.pomodoro': 0,
                'daily.resgatado': false
            });
        }
    }
};

window.resgatarBonusDiario = async () => {
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    try {
        await updateDoc(userRef, {
            'daily.resgatado': true,
            xp: increment(50) // Dá 50 de XP de brinde!
        });
        window.mostrarToastNotificacao('Combo Diário!', '+50 XP! Volte amanhã para mais missões.', 'geral');
    } catch(e) { console.error(e); }
};

// ==========================================
// 8. WAR ROOM & GESTÃO DE SPRINTS
// ==========================================
window.timerSprintInterval = null;

// --- 1. CONFIGURAR OPERAÇÃO (MODAL INTELIGENTE) ---
window.abrirConfigSprint = async () => {
    // Trava de segurança: Só chefes iniciam operações globais
    if (window.userRole !== 'admin' && window.userRole !== 'gerente') {
        return window.mostrarToastNotificacao('Acesso Negado', 'Apenas Administradores ou Gerentes podem configurar a War Room.', 'geral');
    }
    
    // Busca os projetos para preencher o Dropdown
    const selectProj = document.getElementById('warConfigProjeto');
    selectProj.innerHTML = '<option value="">Buscando projetos...</option>';
    
    const q = query(collection(db, "projetos"), where("colaboradores", "array-contains", auth.currentUser.email.toLowerCase()));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        selectProj.innerHTML = '<option value="">Nenhum projeto encontrado</option>';
    } else {
        selectProj.innerHTML = '';
        snap.forEach(d => {
            selectProj.innerHTML += `<option value="${d.id}">${d.data().nome}</option>`;
        });
    }

    openModal('modalConfigWarRoom');
};

window.salvarConfigWarRoom = async (e) => {
    e.preventDefault();
    const nome = document.getElementById('warConfigNome').value;
    const tipo = document.getElementById('warConfigTipo').value;
    const projetoId = document.getElementById('warConfigProjeto').value;
    const dataFim = document.getElementById('warConfigDataFim').value;
    const horaFim = document.getElementById('warConfigHoraFim').value;

    if (!projetoId) return alert("Selecione um projeto alvo válido!");

    // Monta a data no formato ISO perfeito para não dar erro de fuso horário
    const fimIso = new Date(`${dataFim}T${horaFim}:00`).toISOString();

    try {
        await setDoc(doc(db, "configuracoes", "sprint_atual"), {
            nome: nome, 
            tipo: tipo, 
            projetoId: projetoId, 
            fim: fimIso, 
            ativa: true
        });
        
        window.registrarAtividade(`iniciou a operação: ${nome}`, 'war-room', tipo === 'jam' ? '🎮' : '🏃');
        closeModal('modalConfigWarRoom');
        document.getElementById('formConfigWarRoom')?.reset();
    } catch(err) { 
        console.error(err); 
        alert("Erro ao salvar configuração da War Room."); 
    }
};

// --- 2. O RELÓGIO DO APOCALIPSE ---
window.atualizarTimerWarRoom = (dataFinal) => {
    if (window.timerSprintInterval) clearInterval(window.timerSprintInterval);

    const elTimer = document.getElementById('war-countdown');
    const fim = new Date(dataFinal).getTime();

    window.timerSprintInterval = setInterval(() => {
        const agora = new Date().getTime();
        const dist = fim - agora;

        if (dist < 0) {
            clearInterval(window.timerSprintInterval);
            elTimer.innerText = "MISSÃO ENCERRADA";
            elTimer.style.color = "#666";
            return;
        }

        const dias = Math.floor(dist / (1000 * 60 * 60 * 24));
        const horas = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((dist % (1000 * 60)) / 1000);

        elTimer.innerText = `${String(dias).padStart(2,'0')}:${String(horas).padStart(2,'0')}:${String(minutos).padStart(2,'0')}:${String(segundos).padStart(2,'0')}`;
        if (dist < 3600000) elTimer.style.animation = "pulseRed 1s infinite";
    }, 1000);
};

// --- 3. MINI-KANBAN TÁTICO ---
window.renderizarMiniKanbanWar = (tarefas) => {
    const cols = { todo: 'war-col-todo', doing: 'war-col-doing', done: 'war-col-done' };
    Object.values(cols).forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = ''; });

    const tarefasSprint = tarefas.filter(t => t.tag === 'bug' || t.tag === 'feature' || t.tag === 'sprint');

    tarefasSprint.forEach(t => {
        const card = document.createElement('div');
        card.className = `war-task-card ${t.tag}`;
        card.draggable = true;
        card.ondragstart = (ev) => ev.dataTransfer.setData("text", t.id);
        
        const iniciais = t.assignedName ? t.assignedName.substring(0, 2).toUpperCase() : "??";
        const ownerHtml = t.assignedTo ? `<span style="float:right; font-size:0.65rem; background:var(--primary); color:#000; padding:2px 5px; border-radius:4px;">${iniciais}</span>` : "";

        card.innerHTML = `${ownerHtml}<strong>${t.titulo}</strong>`;
        
        const colId = cols[t.status] || 'war-col-todo';
        const colunaAlvo = document.getElementById(colId);
        if (colunaAlvo) colunaAlvo.appendChild(card);
    });
};

// --- 4. TERMINAL DE COMUNICAÇÃO (AVANÇADO) ---
window.enviarMensagemWar = async () => {
    const input = document.getElementById('war-chat-input');
    const texto = input.value.trim();
    if (!texto || !auth.currentUser) return;

    const nome = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];
    
    await addDoc(collection(db, "war_room_chat"), {
        autor: nome,
        autorId: auth.currentUser.uid, 
        texto: texto,
        data: new Date().toISOString(),
        editada: false
    });
    input.value = "";
};

window.iniciarChatWarRoom = () => {
    const chatBox = document.getElementById('war-chat-feed');
    const q = query(collection(db, "war_room_chat"), orderBy("data", "asc"), limit(100));

    onSnapshot(q, (snap) => {
        if(!chatBox) return;
        chatBox.innerHTML = "";
        
        if (snap.empty) {
            chatBox.innerHTML = `<div class="chat-msg bot"><span class="chat-author">SISTEMA</span>O Terminal foi limpo. Aguardando transmissões...</div>`;
            return;
        }

        snap.forEach(docSnap => {
            const m = docSnap.data();
            const id = docSnap.id;
            const msgEl = document.createElement('div');
            msgEl.className = "chat-msg user";
            
            let textoFormatado = m.texto.replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>');
            const marcaEdicao = m.editada ? '<span style="font-size: 0.65rem; color: #666; margin-left: 5px;">(editado)</span>' : '';

            const minhaMensagem = m.autorId === auth.currentUser.uid;
            const isAdmin = window.userRole === 'admin';
            
            let acoesHtml = '';
            if (minhaMensagem || isAdmin) {
                const btnEdit = minhaMensagem ? `<button class="chat-action-btn" onclick="editarMensagemWar('${id}')" title="Editar">✏️</button>` : '';
                acoesHtml = `
                    <div class="chat-actions">
                        ${btnEdit}
                        <button class="chat-action-btn del" onclick="apagarMensagemWar('${id}')" title="Apagar">🗑️</button>
                    </div>
                `;
            }

            msgEl.innerHTML = `
                <span class="chat-author">${m.autor.toUpperCase()}</span>
                <span style="word-break: break-word;">${textoFormatado}</span> ${marcaEdicao}
                ${acoesHtml}
            `;
            chatBox.appendChild(msgEl);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
};

window.editarMensagemWar = async (id) => {
    const docRef = doc(db, "war_room_chat", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const textoAntigo = snap.data().texto;
        const novoTexto = prompt("Editar transmissão:", textoAntigo);
        if (novoTexto && novoTexto.trim() !== "" && novoTexto !== textoAntigo) {
            await updateDoc(docRef, { texto: novoTexto.trim(), editada: true });
        }
    }
};

window.apagarMensagemWar = async (id) => {
    if(confirm("Apagar esta mensagem do terminal?")) await deleteDoc(doc(db, "war_room_chat", id));
};

// --- 5. O ARSENAL (LINKS) ---
window.adicionarLinkWarRoom = async () => {
    const titulo = prompt("Título do Link:");
    const url = prompt("URL (http://...):");
    if (titulo && url) {
        await addDoc(collection(db, "war_room_links"), { titulo, url });
    }
};

window.iniciarArsenalWarRoom = () => {
    const container = document.getElementById('war-links-container');
    onSnapshot(collection(db, "war_room_links"), (snap) => {
        if(!container) return;
        container.innerHTML = "";
        snap.forEach(docSnap => {
            const l = docSnap.data();
            const id = docSnap.id;
            
            // Só Admin ou Gerente podem ver o X de deletar
            const btnDelete = (window.userRole === 'admin' || window.userRole === 'gerente') 
                ? `<button onclick="event.preventDefault(); deletarLinkWarRoom('${id}')" style="background:none; border:none; color:#ff5252; cursor:pointer; padding:5px; font-size:1rem; opacity:0.6; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button>` 
                : '';

            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:5px; width:100%;">
                    <a href="${l.url}" target="_blank" class="war-link-item" style="flex:1;">
                        <span style="font-size: 1.2rem;">🔗</span> 
                        <div><strong>${l.titulo}</strong><br><span style="font-size:0.7rem; color:#888;">Recurso Externo</span></div>
                    </a>
                    ${btnDelete}
                </div>
            `;
        });
    });
};

window.deletarLinkWarRoom = async (id) => {
    if (confirm("Remover este link do arsenal?")) {
        try {
            await deleteDoc(doc(db, "war_room_links", id));
        } catch (e) { console.error(e); }
    }
};

// --- 6. PROTOCOLO DO ADMINISTRADOR (RESET) ---
window.limparTerminalWarRoom = async () => {
    if (window.userRole !== 'admin') return alert("Acesso Negado: Apenas Administradores podem resetar o terminal.");
    if (confirm("ATENÇÃO ADMIN: Deseja apagar TODAS as mensagens do terminal? Esta ação não tem volta.")) {
        const snap = await getDocs(query(collection(db, "war_room_chat")));
        snap.forEach(async (docSnap) => await deleteDoc(docSnap.ref));
        window.registrarAtividade("executou a limpeza total do Terminal", "war-room", "🧹");
    }
};

window.resetarWarRoomCompleta = async () => {
    if (window.userRole !== 'admin') return alert("Acesso Negado: Apenas Administradores podem limpar a mesa.");
    if (confirm("ATENÇÃO: Deseja encerrar a Sprint atual, zerar o relógio e limpar os links da War Room?")) {
        try {
            await setDoc(doc(db, "configuracoes", "sprint_atual"), { nome: "Nenhuma Operação Ativa", fim: new Date().toISOString(), ativa: false });
            const snapLinks = await getDocs(query(collection(db, "war_room_links")));
            snapLinks.forEach(async (docSnap) => await deleteDoc(docSnap.ref));
            window.registrarAtividade("encerrou a Sprint e limpou a War Room", "war-room", "🛑");
            alert("Mesa Limpa! A War Room está pronta para a próxima Jam/Sprint.");
        } catch (e) { console.error("Erro ao resetar War Room:", e); }
    }
};

// --- INICIALIZADOR DA WAR ROOM (AGORA COM FOCO EM PROJETO) ---
window.unsubWarTasks = null; // Guarda a antena do radar de tarefas

window.iniciarWarRoom = async () => {
    if (!auth.currentUser) return;

    onSnapshot(doc(db, "configuracoes", "sprint_atual"), (docSnap) => {
        if (docSnap.exists()) {
            const config = docSnap.data();
            
            // 1. Se a mesa foi limpa (operação inativa)
            if (!config.ativa) {
                const sprintName = document.getElementById('war-sprint-name');
                if(sprintName) sprintName.innerText = "Nenhuma Operação Ativa";
                document.getElementById('war-countdown').innerText = "00:00:00:00";
                
                // Desliga o radar de tarefas e limpa o quadro
                if(window.unsubWarTasks) window.unsubWarTasks();
                window.renderizarMiniKanbanWar([]); 
                return;
            }

            // 2. Atualiza Nomes e Cores (Jam vs Sprint)
            const sprintName = document.getElementById('war-sprint-name');
            if(sprintName) sprintName.innerText = `Operação: ${config.nome}`;
            
            const badge = document.getElementById('war-badge-tipo');
            if (badge) {
                if (config.tipo === 'jam') {
                    badge.innerText = "GAME JAM";
                    badge.style.background = "rgba(156, 39, 176, 0.2)"; // Roxo Neon
                    badge.style.color = "#e040fb";
                    badge.style.borderColor = "#e040fb";
                } else {
                    badge.innerText = "SPRINT";
                    badge.style.background = "rgba(255, 82, 82, 0.2)"; // Vermelho Alerta
                    badge.style.color = "#ff5252";
                    badge.style.borderColor = "#ff5252";
                }
            }

            window.atualizarTimerWarRoom(config.fim);

            // 3. A MÁGICA: Liga o Radar SÓ NO PROJETO ESCOLHIDO
            if (config.projetoId) {
                // Desliga o radar anterior, se houver
                if (window.unsubWarTasks) window.unsubWarTasks();
                
                // Liga a escuta direta no Firebase buscando só as tarefas daquele projeto
                window.unsubWarTasks = onSnapshot(
                    query(collection(db, "tarefas"), where("projetoId", "==", config.projetoId)),
                    (snapTasks) => {
                        const tarefasDaOperacao = snapTasks.docs.map(d => ({id: d.id, ...d.data()}));
                        window.renderizarMiniKanbanWar(tarefasDaOperacao);
                    }
                );
            }
        }
    });

    window.iniciarChatWarRoom();
    window.iniciarArsenalWarRoom();
};

// ==========================================
// 9. CLIENTES, FINANCEIRO, AGENDA, DIÁRIO
// ==========================================

/* ==========================================
   --- CRM (CLIENTES) ---
   ========================================== */
window.clienteEditandoId = null;

window.salvarCliente = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;
    
    const dados = {
        nome: document.getElementById('clienteNome').value,
        status: document.getElementById('clienteStatus').value,
        email: document.getElementById('clienteEmail').value || '',
        discord: document.getElementById('clienteDiscord').value || '',
        notas: document.getElementById('clienteNotas').value || '',
        userId: auth.currentUser.uid,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.clienteEditandoId) {
            await updateDoc(doc(db, "clientes", window.clienteEditandoId), dados);
        } else {
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "clientes"), dados);
        }
        document.getElementById('formCliente').reset();
        window.clienteEditandoId = null;
        closeModal('modalCliente');
        window.carregarClientes();
    } catch(e) { console.error(e); }
};

window.abrirEdicaoCliente = async (id) => {
    const snap = await getDoc(doc(db, "clientes", id));
    if (snap.exists()) {
        const c = snap.data();
        document.getElementById('clienteNome').value = c.nome;
        document.getElementById('clienteStatus').value = c.status || 'ativo';
        document.getElementById('clienteEmail').value = c.email;
        document.getElementById('clienteDiscord').value = c.discord;
        document.getElementById('clienteNotas').value = c.notas;
        window.clienteEditandoId = id;
        openModal('modalCliente');
    }
};

window.carregarClientes = async function() {
    const grid = document.getElementById('client-entries');
    if (!grid || !auth.currentUser) return;
    
    // Traz os dados ordenados por nome para ficar elegante
    const q = query(collection(db, "clientes"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    let clientes = snap.docs.map(d => ({id: d.id, ...d.data()}));
    clientes.sort((a,b) => a.nome.localeCompare(b.nome));

    grid.innerHTML = clientes.map(c => {
        const iniciais = c.nome.substring(0,2).toUpperCase();
        
        let corStatus = '#4caf50'; let txtStatus = 'Ativo';
        if(c.status === 'lead') { corStatus = '#ffc107'; txtStatus = 'Lead'; }
        if(c.status === 'inativo') { corStatus = '#666'; txtStatus = 'Inativo'; }

        return `
        <div class="client-card" style="border-top: 3px solid ${corStatus};">
            <div class="client-header" style="border-bottom:none; margin-bottom:0; padding-bottom:10px;">
                <div class="client-avatar">${iniciais}</div>
                <div class="client-title" style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h3 style="margin:0;">${c.nome}</h3>
                        <span class="badge" style="background:transparent; border:1px solid ${corStatus}; color:${corStatus}; font-size:0.65rem;">${txtStatus}</span>
                    </div>
                </div>
            </div>
            <div class="client-body" style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom:15px;">
                <p style="margin-bottom:5px;">📧 ${c.email || 'Sem email'}</p>
                <p>💬 ${c.discord || 'Sem contato'}</p>
            </div>
            <div style="font-size:0.8rem; color:#aaa; max-height: 60px; overflow-y:auto; line-height:1.4; margin-bottom:15px;">
                ${c.notas ? c.notas.replace(/\n/g, '<br>') : 'Sem anotações.'}
            </div>
            <div style="border-top: 1px solid var(--border-color); padding-top: 15px; display:flex; justify-content:flex-end; gap:10px;">
                <button class="icon-btn" onclick="abrirEdicaoCliente('${c.id}')" data-tooltip="Editar">✏️</button>
                <button class="icon-btn" style="color: #ff5252;" onclick="deletarCliente('${c.id}')" data-tooltip="Excluir">🗑️</button>
            </div>
        </div>`;
    }).join('') || '<p style="color:#666">Nenhum cliente cadastrado.</p>';
};
window.deletarCliente = async function(id) { if(confirm("Apagar cliente? O histórico será perdido.")) { await deleteDoc(doc(db, "clientes", id)); window.carregarClientes(); } };


/* ==========================================
   --- FINANCEIRO 3.0 (PESSOAL VS EMPRESA & METAS) ---
   ========================================== */
window.lancamentoEditandoId = null;
window.meuGraficoFinanceiro = null;
window.escopoFinanceiro = 'pessoal'; // Começa sempre no Pessoal

// 1. NAVEGAÇÃO DAS ABAS
window.switchFinanceTab = (escopo, btn) => {
    window.escopoFinanceiro = escopo;
    document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.carregarLancamentos(); // Recarrega os dados pro cofre certo
};

// 2. ABRIR MODAL COM SEGURANÇA
window.abrirModalLancamento = () => {
    document.getElementById('formFinanceiro').reset();
    window.lancamentoEditandoId = null;
    
    const selEscopo = document.getElementById('financeEscopo');
    const labelEscopo = document.getElementById('labelFinanceEscopo');
    
    // Se não for Admin, ele NÃO PODE lançar no caixa da empresa
    if (window.userRole !== 'admin') {
        selEscopo.style.display = 'none';
        labelEscopo.style.display = 'none';
        selEscopo.value = 'pessoal';
    } else {
        selEscopo.style.display = 'block';
        labelEscopo.style.display = 'block';
        selEscopo.value = window.escopoFinanceiro; // Já abre no cofre que ele estava olhando
    }
    
    openModal('modalLancamento');
};

// 3. SALVAR LANÇAMENTO
window.salvarLancamento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;

    const dados = {
        escopo: document.getElementById('financeEscopo').value, // 'pessoal' ou 'empresa'
        tipo: document.getElementById('financeTipo').value,
        status: document.getElementById('financeStatus').value,
        origem: document.getElementById('financeOrigem').value,
        categoria: document.getElementById('financeCategoria').value,
        descricao: document.getElementById('financeDescricao').value,
        valor: parseFloat(document.getElementById('financeValor').value),
        dataVencimento: document.getElementById('financeData').value,
        userId: auth.currentUser.uid,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.lancamentoEditandoId) {
            await updateDoc(doc(db, "lancamentos", window.lancamentoEditandoId), dados);
            if (dados.escopo === 'empresa') window.registrarAtividade(`editou um lançamento do Estúdio`, 'financeiro', '🏢');
        } else {
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "lancamentos"), dados);
            if (dados.escopo === 'empresa') window.registrarAtividade(`registrou um valor no cofre do Estúdio`, 'financeiro', '🏢');
        }
        
        document.getElementById('formFinanceiro').reset();
        window.lancamentoEditandoId = null;
        closeModal('modalLancamento');
        window.carregarLancamentos();
        if (dados.escopo === 'empresa') window.carregarDashboard();
    } catch(e) { console.error(e); }
};

window.abrirEdicaoLancamento = async (id) => {
    const snap = await getDoc(doc(db, "lancamentos", id));
    if (snap.exists()) {
        const d = snap.data();
        document.getElementById('financeEscopo').value = d.escopo || 'pessoal';
        document.getElementById('financeTipo').value = d.tipo;
        document.getElementById('financeStatus').value = d.status;
        document.getElementById('financeOrigem').value = d.origem;
        document.getElementById('financeCategoria').value = d.categoria;
        document.getElementById('financeDescricao').value = d.descricao;
        document.getElementById('financeValor').value = d.valor;
        document.getElementById('financeData').value = d.dataVencimento;
        
        window.lancamentoEditandoId = id;
        openModal('modalLancamento');
    }
};

window.alternarStatusLancamento = async (id, novoStatus) => {
    await updateDoc(doc(db, "lancamentos", id), { status: novoStatus });
    window.carregarLancamentos();
    window.carregarDashboard();
};

// 4. CRIAR / EDITAR META DA EMPRESA (SÓ ADMIN)
window.configurarMetaEstudio = async () => {
    if (window.userRole !== 'admin') return;
    
    const titulo = prompt("Título da Meta (Ex: Comprar Devkits):");
    if (!titulo) return;
    
    const valorStr = prompt("Valor Alvo da Meta em R$ (Ex: 10000):");
    const valor = parseFloat(valorStr);
    
    if (valor && !isNaN(valor)) {
        await setDoc(doc(db, "configuracoes", "meta_estudio"), {
            titulo: titulo,
            valorAlvo: valor,
            ativa: true
        });
        window.carregarLancamentos();
    }
};

window.encerrarMetaEstudio = async () => {
    if (confirm("Encerrar e esconder a meta atual?")) {
        await updateDoc(doc(db, "configuracoes", "meta_estudio"), { ativa: false });
        window.carregarLancamentos();
    }
};

// 5. CARREGAR TUDO (A MÁGICA DA BLINDAGEM)
window.carregarLancamentos = async function() {
    const tbody = document.getElementById('finance-entries');
    const areaDados = document.getElementById('fin-area-dados');
    const areaMeta = document.getElementById('fin-area-meta');
    if (!tbody || !auth.currentUser) return;

    const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    // Pega o mês selecionado
    const elFiltro = document.getElementById('filtroMesFinanceiro');
    let filtroMes = elFiltro ? elFiltro.value : "";
    if (!filtroMes) {
        const hoje = new Date();
        filtroMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        if(elFiltro) elFiltro.value = filtroMes;
    }

    // --- LÓGICA DE BLINDAGEM VISUAL ---
    if (window.escopoFinanceiro === 'empresa') {
        areaMeta.style.display = 'block';
        // Membro não vê a tabela e o gráfico da empresa! Só a meta.
        areaDados.style.display = window.userRole === 'admin' ? 'block' : 'none';
        document.getElementById('card-saldo-real').style.borderColor = "#ffc107";
    } else {
        // Aba Pessoal
        areaMeta.style.display = 'none';
        areaDados.style.display = 'block'; // Dono sempre vê suas próprias contas
        document.getElementById('card-saldo-real').style.borderColor = "var(--primary)";
    }

    // --- BUSCA OS DADOS ---
    let q;
    if (window.escopoFinanceiro === 'empresa') {
        q = query(collection(db, "lancamentos"), where("escopo", "==", "empresa"));
    } else {
        // Traz tudo do usuário (e no JS a gente ignora o que ele marcou como 'empresa')
        q = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
    }
    
    const snap = await getDocs(q);
    
    let recPrev = 0, cusPrev = 0;
    let recReal = 0, cusReal = 0;
    let lancamentosMes = [];
    
    // Variável global para a Meta da Empresa (Soma TODO o histórico real do estúdio)
    let saldoTotalHistoricoEmpresa = 0;

    snap.forEach(docSnap => {
        const d = docSnap.data();
        
        // Se estiver na aba pessoal, ignora os de empresa que ele criou
        if (window.escopoFinanceiro === 'pessoal' && d.escopo === 'empresa') return;
        // Tratamento para lançamentos velhos sem escopo
        if (window.escopoFinanceiro === 'empresa' && (!d.escopo || d.escopo !== 'empresa')) return;

        // Calcula o Saldo Total Histórico para a barra de Meta (Independente do Mês)
        if (window.escopoFinanceiro === 'empresa' && d.status === 'pago') {
            if (d.tipo === 'receita') saldoTotalHistoricoEmpresa += d.valor;
            else saldoTotalHistoricoEmpresa -= d.valor;
        }

        // Filtra para a Tabela e Gráfico (Somente o mês selecionado)
        if ((d.dataVencimento || "").startsWith(filtroMes)) {
            lancamentosMes.push({id: docSnap.id, ...d});
        }
    });

    // --- RENDERIZA A META DA EMPRESA ---
    if (window.escopoFinanceiro === 'empresa') {
        const metaSnap = await getDoc(doc(db, "configuracoes", "meta_estudio"));
        let metaHtml = "";
        
        if (metaSnap.exists() && metaSnap.data().ativa) {
            const meta = metaSnap.data();
            const porcentagem = Math.min(100, Math.max(0, (saldoTotalHistoricoEmpresa / meta.valorAlvo) * 100));
            const corBarra = porcentagem >= 100 ? 'var(--primary)' : '#ffc107';
            
            metaHtml = `
                <h3 style="font-size: 1.5rem; color: #fff; margin-bottom: 5px;">🎯 Meta do Estúdio: <span style="color: ${corBarra};">${meta.titulo}</span></h3>
                <p style="color: var(--text-muted); margin-bottom: 20px;">Todo o caixa excedente do estúdio é focado neste objetivo.</p>
                
                <div class="exp-bar-bg" style="height: 18px; border-radius: 9px; max-width: 600px; margin: 0 auto;">
                    <div class="exp-bar-fill" style="width: ${porcentagem}%; background: ${corBarra}; box-shadow: 0 0 20px ${corBarra};"></div>
                </div>
                
                <div style="margin-top: 15px; font-size: 1.2rem; font-weight: bold;">
                    ${formatadorMoeda.format(Math.max(0, saldoTotalHistoricoEmpresa))} / <span style="color: #888;">${formatadorMoeda.format(meta.valorAlvo)}</span> 
                    <span style="color: ${corBarra};">(${porcentagem.toFixed(1)}%)</span>
                </div>
            `;
            if (window.userRole === 'admin') {
                metaHtml += `<button class="btn-secondary" onclick="encerrarMetaEstudio()" style="margin-top: 20px; font-size: 0.8rem;">🏁 Encerrar Meta</button>`;
            }
        } else {
            metaHtml = `<h3 style="color: #666;">O estúdio não possui metas financeiras ativas no momento.</h3>`;
            if (window.userRole === 'admin') {
                metaHtml += `<button class="btn-primary" onclick="configurarMetaEstudio()" style="margin-top: 15px;">🎯 Criar Nova Meta</button>`;
            }
        }
        areaMeta.innerHTML = metaHtml;
    }

    // Se for membro olhando a aba da empresa, o código para por aqui, ele não processa a tabela!
    if (window.escopoFinanceiro === 'empresa' && window.userRole !== 'admin') return;

    // --- CONTINUA PARA RENDERIZAR TABELA E GRÁFICO (Dono ou Admin) ---
    lancamentosMes.sort((a,b) => new Date(a.dataVencimento) - new Date(b.dataVencimento));

    let html = '';
    lancamentosMes.forEach(d => {
        if (d.tipo === 'receita') {
            recPrev += d.valor;
            if (d.status === 'pago') recReal += d.valor;
        } else {
            cusPrev += d.valor;
            if (d.status === 'pago') cusReal += d.valor;
        }

        const isPago = d.status === 'pago';
        const badgeTipo = d.tipo === 'receita' ? 'badge-receita' : 'badge-custo';
        const badgeStatus = isPago 
            ? '<span class="badge" style="background:rgba(76,175,80,0.1); color:#4caf50;">PAGO</span>' 
            : '<span class="badge" style="background:rgba(255,193,7,0.1); color:#ffc107;">PENDENTE</span>';

        const menuAcoes = `
            <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.2rem;">⋮</button>
                <div class="dropdown-content">
                    <button class="icon-btn" onclick="abrirEdicaoLancamento('${d.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:#fff;">✏️ Editar</button>
                    <button class="icon-btn" onclick="alternarStatusLancamento('${d.id}', '${isPago ? 'pendente' : 'pago'}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:var(--primary);">${isPago ? '↩️ Pendente' : '✔️ Dar Baixa'}</button>
                    <button class="icon-btn" onclick="deletarLancamento('${d.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; border-top:1px solid rgba(255,255,255,0.1);">🗑️ Excluir</button>
                </div>
            </div>
        `;

        const dataF = d.dataVencimento.split('-').reverse().slice(0,2).join('/');
        html += `<tr style="${isPago ? 'opacity: 0.6;' : ''}">
            <td>${dataF}</td>
            <td><strong>${d.origem}</strong><br><small style="color:#888;">${d.categoria}</small></td>
            <td><span class="badge ${badgeTipo}">${d.tipo.toUpperCase()}</span></td>
            <td>${badgeStatus}</td>
            <td style="color: ${d.tipo === 'receita' ? '#4caf50' : '#ff5252'}; font-weight:bold;">${formatadorMoeda.format(d.valor)}</td>
            <td>${menuAcoes}</td>
        </tr>`;
    });

    tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:20px;">Sem dados para este mês.</td></tr>';
    
    // Atualiza Cards
    document.getElementById('resumoReceita').innerText = formatadorMoeda.format(recReal);
    document.getElementById('previstoReceita').innerText = `A receber: ${formatadorMoeda.format(recPrev - recReal)}`;
    document.getElementById('resumoCusto').innerText = formatadorMoeda.format(cusReal);
    document.getElementById('previstoCusto').innerText = `A pagar: ${formatadorMoeda.format(cusPrev - cusReal)}`;
    
    const saldoReal = recReal - cusReal;
    document.getElementById('resumoSaldo').innerText = formatadorMoeda.format(saldoReal);
    document.getElementById('resumoSaldo').className = saldoReal >= 0 ? 'valor text-neon' : 'valor text-red';

    // Renderiza o Gráfico
    if (window.renderizarGraficoFinanceiro) window.renderizarGraficoFinanceiro(lancamentosMes);
};

window.deletarLancamento = async function(id) { 
    if(confirm("Apagar este lançamento do livro caixa?")) { 
        await deleteDoc(doc(db, "lancamentos", id)); 
        window.carregarLancamentos(); 
        window.carregarDashboard(); 
    } 
};

// --- MOTOR DO GRÁFICO FINANCEIRO (SOBE E DESCE) ---
window.renderizarGraficoFinanceiro = (lancamentos) => {
    const ctx = document.getElementById('graficoFinanceiro');
    if (!ctx) return;

    // 1. Prepara os dados (Agrupa por dia e calcula o saldo acumulado)
    const saldosPorDia = {};
    lancamentos.forEach(l => {
        if (l.status !== 'pago') return; // Só mostra no gráfico o que é REAL
        const dia = l.dataVencimento.split('-')[2]; // Pega apenas o dia (DD)
        const valor = l.tipo === 'receita' ? l.valor : -l.valor;
        saldosPorDia[dia] = (saldosPorDia[dia] || 0) + valor;
    });

    const diasLabels = Object.keys(saldosPorDia).sort((a, b) => a - b);
    let acumulado = 0;
    const dadosGrafico = diasLabels.map(dia => {
        acumulado += saldosPorDia[dia];
        return acumulado;
    });

    // 2. Destrói gráfico antigo para não dar erro de "Canvas em uso"
    const chartExistente = Chart.getChart("graficoFinanceiro");
    if (chartExistente) chartExistente.destroy();

    // 3. Cria o novo gráfico
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: diasLabels.map(d => `Dia ${d}`),
            datasets: [{
                label: 'Saldo em Caixa',
                data: dadosGrafico,
                borderColor: acumulado >= 0 ? '#81fe4e' : '#ff5252', // Verde se positivo, vermelho se negativo
                borderWidth: 3,
                fill: true,
                backgroundColor: acumulado >= 0 ? 'rgba(129, 254, 78, 0.1)' : 'rgba(255, 82, 82, 0.1)',
                tension: 0.4, // Curva suave na linha
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false }, // Esconde o eixo X pra ficar limpo
                y: { 
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666', font: { size: 10 } }
                }
            }
        }
    });
};

/* ==========================================
   --- AGENDA EVOLUÍDA (PESSOAL VS EMPRESA) ---
   ========================================== */

window.salvarEvento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;

    const escopo = document.getElementById('eventoEscopo').value;
    
    // Trava de segurança: Só Admin salva como 'empresa'
    if (escopo === 'empresa' && window.userRole !== 'admin') {
        return alert("Apenas Administradores podem criar eventos globais da empresa.");
    }

    try {
        const dados = {
            titulo: document.getElementById('eventoTitulo').value,
            data: document.getElementById('eventoData').value,
            hora: document.getElementById('eventoHora').value || '',
            tipo: document.getElementById('eventoTipo').value,
            link: document.getElementById('eventoLink').value || '',
            escopo: escopo,
            userId: auth.currentUser.uid, // Dono do registro
            dataCriacao: new Date().toISOString()
        };

        await addDoc(collection(db, "eventos"), dados);
        
        if (escopo === 'empresa') {
            window.registrarAtividade(`agendou um evento de empresa: ${dados.titulo}`, 'cronograma', '📅');
        }

        document.getElementById('formEvento').reset();
        closeModal('modalEvento');
        window.carregarEventos();
        window.carregarDashboard();
    } catch(e) { console.error(e); }
};

window.carregarEventos = async function() {
    const lista = document.getElementById('event-entries');
    if (!lista || !auth.currentUser) return;

    // Busca eventos pessoais OU de empresa
    const q = query(collection(db, "eventos"));
    const snap = await getDocs(q);
    
    let eventos = [];
    snap.forEach(docSnap => {
        const e = docSnap.data();
        // Lógica de Filtro: Pega se for meu OU se for da empresa
        if (e.userId === auth.currentUser.uid || e.escopo === 'empresa') {
            eventos.push({id: docSnap.id, ...e});
        }
    });

    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    lista.innerHTML = eventos.map(e => {
        const dataObj = new Date(e.data + "T00:00:00");
        const dia = String(dataObj.getDate()).padStart(2, '0');
        const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        
        const isEmpresa = e.escopo === 'empresa';
        const podeDeletar = !isEmpresa || window.userRole === 'admin';

        let badge = 'badge-meeting'; let label = isEmpresa ? '🏢 EMPRESA' : '👤 PESSOAL';
        if (e.tipo === 'deadline') badge = 'badge-deadline';
        if (e.tipo === 'release') badge = 'badge-release';

        return `
        <div class="event-item" style="${isEmpresa ? 'border-left: 4px solid var(--primary); background: rgba(129, 254, 78, 0.03);' : ''}">
            <div class="event-date">
                <span class="e-day">${dia}</span>
                <span class="e-month">${meses[dataObj.getMonth()]}</span>
            </div>
            <div class="event-details">
                <h4 style="display:flex; align-items:center; gap:8px;">${e.titulo} ${isEmpresa ? '⭐' : ''}</h4>
                <p>${e.hora} ${e.link ? `<a href="${e.link}" target="_blank" style="color:var(--primary); margin-left:5px;">Link</a>` : ''}</p>
                <span class="badge ${badge}" style="font-size:0.6rem;">${label}</span>
            </div>
            ${podeDeletar ? `<button class="icon-btn" style="color:#ff5252" onclick="deletarEvento('${e.id}', '${e.escopo}')">🗑️</button>` : ''}
        </div>`;
    }).join('') || '<p style="color:#666">Nenhum evento agendado.</p>';
};

window.deletarEvento = async function(id, escopo) {
    if (escopo === 'empresa' && window.userRole !== 'admin') {
        return alert("Ação Negada: Apenas ADMs podem apagar eventos da empresa.");
    }
    if(confirm("Cancelar evento?")) { 
        await deleteDoc(doc(db, "eventos", id)); 
        window.carregarEventos(); 
        window.carregarDashboard();
    } 
};

/* ==========================================
   --- DIÁRIO PESSOAL (DEVLOG PRIVADO) ---
   ========================================== */

// MODO ESCRITA VS MODO LEITURA (MARKDOWN)
window.setDiaryMode = (mode) => {
    const edit = document.getElementById('noteContent');
    const prev = document.getElementById('notePreview');
    if (mode === 'preview') {
        if (edit && prev) {
            prev.innerHTML = marked.parse(edit.value || '*Nada escrito ainda.*');
            edit.style.display = 'none';
            prev.style.display = 'block';
            try { mermaid.run({ nodes: prev.querySelectorAll('.language-mermaid') }); } catch(e){}
        }
        document.getElementById('btn-diary-preview').classList.add('active');
        document.getElementById('btn-diary-edit').classList.remove('active');
    } else {
        edit.style.display = 'block';
        prev.style.display = 'none';
        document.getElementById('btn-diary-edit').classList.add('active');
        document.getElementById('btn-diary-preview').classList.remove('active');
    }
};

// --- CRIPTOGRAFIA DO COFRE ---
window.chaveDoCofre = null;

window.desbloquearCofre = () => {
    const senha = prompt("🔑 Digite sua Senha do Cofre.\n\n⚠️ ATENÇÃO: Nós NÃO salvamos essa senha no banco. Se você a esquecer, SEUS DADOS SERÃO PERDIDOS PARA SEMPRE, pois nem nós conseguimos descriptografar!");
    
    if (senha) {
        window.chaveDoCofre = senha;
        const btn = document.getElementById('btn-unlock-diary');
        btn.innerText = "🔓 Cofre Aberto";
        btn.style.borderColor = "#4caf50";
        btn.style.color = "#4caf50";
        window.carregarNotas(); // Tenta ler os arquivos agora com a chave nova
    }
};

window.salvarNota = async () => {
    const tit = document.getElementById('noteTitle').value.trim();
    const cont = document.getElementById('noteContent').value.trim();
    const mood = document.getElementById('noteMood').value;
    const tag = document.getElementById('noteTag').value;
    const querCriptografar = document.getElementById('noteEncrypt').checked;
    
    if (!cont || !auth.currentUser) return;

    // Se ele quer criptografar, mas não abriu o cofre ainda
    if (querCriptografar && !window.chaveDoCofre) {
        alert("🔒 Para criar uma nota criptografada, primeiro clique em '🔑 Destrancar Cofre' e defina sua senha.");
        return;
    }
    
    const btn = document.querySelector('button[onclick="salvarNota()"]');
    btn.disabled = true;

    try {
        let conteudoFinal = cont;
        
        // Só criptografa se o checkbox estiver marcado
        if (querCriptografar) {
            conteudoFinal = CryptoJS.AES.encrypt(cont, window.chaveDoCofre).toString();
        }

        await addDoc(collection(db, "diario"), { 
            title: tit || "Registro sem título", 
            content: conteudoFinal, 
            mood: mood,
            tag: tag,
            encrypted: querCriptografar, // Salva uma flag no banco
            userId: auth.currentUser.uid, 
            dataCriacao: new Date().toISOString() 
        });
        
        document.getElementById('noteTitle').value = ''; 
        document.getElementById('noteContent').value = '';
        document.getElementById('noteEncrypt').checked = false; // Reseta o cadeado
        window.setDiaryMode('edit');
        window.carregarNotas();
    } catch (e) { console.error(e); }
    
    btn.disabled = false;
};

window.carregarNotas = async () => {
    const grid = document.getElementById('diary-entries');
    if(!grid || !auth.currentUser) return;
    
    const q = query(collection(db, "diario"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    
    let notas = snap.docs.map(d => ({id: d.id, ...d.data()}));
    notas.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

    const moodConfig = {
        'produtivo': { icone: '🔥', cor: '#ff9800', label: 'Produtivo' },
        'criativo': { icone: '🧠', cor: '#e040fb', label: 'Criativo' },
        'neutro': { icone: '🧘', cor: '#4caf50', label: 'Focado' },
        'exausto': { icone: '💀', cor: '#ff5252', label: 'Exausto' }
    };

    grid.innerHTML = notas.map(d => {
        const dataObj = new Date(d.dataCriacao);
        const dataF = `${String(dataObj.getDate()).padStart(2,'0')}/${String(dataObj.getMonth()+1).padStart(2,'0')}`;
        const m = moodConfig[d.mood || 'neutro'];
        
        let textoFinal = d.content;
        let badgeLock = "";

        // Se a nota for criptografada...
        if (d.encrypted) {
            badgeLock = `<span style="color: #00eaff; margin-right: 5px;">🔒</span>`;
            if (!window.chaveDoCofre) {
                textoFinal = "*(Nota Criptografada. Destranque o cofre para ler)*";
            } else {
                try {
                    const bytes = CryptoJS.AES.decrypt(d.content, window.chaveDoCofre);
                    const originalText = bytes.toString(CryptoJS.enc.Utf8);
                    textoFinal = originalText || "❌ *(Senha incorreta para esta nota)*";
                } catch(e) { textoFinal = "❌ *(Erro de decodificação)*"; }
            }
        }

        return `
        <div class="diary-card" style="border-top-color: ${m.cor}; position: relative;">
            <div class="diary-card-header">
                <h4 style="font-size: 1.2rem; color: #fff;">${badgeLock}${d.title}</h4>
            </div>
            <div style="display: flex; gap: 8px; margin: 10px 0 15px 0; flex-wrap: wrap; align-items: center;">
                <span class="badge" style="background: rgba(255,255,255,0.05); color: ${m.cor}; border: 1px solid ${m.cor}; font-size: 0.65rem;">${m.icone} ${m.label}</span>
                <span class="diary-card-date" style="margin-left: auto;">${dataF}</span>
            </div>
            <div class="diary-card-body markdown-body" style="background: transparent !important; padding: 0 !important; border: none !important; box-shadow: none !important; min-height: auto; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; font-size: 0.85rem; color: #bbb;">
                ${marked.parse(textoFinal)}
            </div>
            <div class="diary-card-footer" style="margin-top: 15px;">
                <button class="icon-btn" style="color:var(--primary); font-size: 0.8rem;" onclick="abrirLeituraNota('${d.id}')">📖 Ler Tudo</button>
                <button class="icon-btn" style="color:#ff5252; font-size: 0.8rem;" onclick="deletarNota('${d.id}')">🗑️ Apagar</button>
            </div>
        </div>`;
    }).join('') || '<p style="color:#666; grid-column: 1/-1; text-align: center; padding: 40px;">Vazio.</p>';
};

// Precisamos atualizar o Modal Gigante de Leitura para ele também descriptografar!
window.abrirLeituraNota = async (id) => {
    const docSnap = await getDoc(doc(db, "diario", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        let textoFinal = d.content;
        
        if (d.encrypted) {
            if (!window.chaveDoCofre) {
                alert("🔒 Esta nota é protegida. Use o botão 'Destrancar Cofre' primeiro.");
                return;
            }
            try {
                const bytes = CryptoJS.AES.decrypt(d.content, window.chaveDoCofre);
                textoFinal = bytes.toString(CryptoJS.enc.Utf8) || "❌ Senha incorreta!";
            } catch(e) { textoFinal = "❌ Erro ao descriptografar."; }
        }

        document.getElementById('detalheTaskTitulo').innerText = d.title;
        const container = document.getElementById('detalheTaskDesc');
        container.innerHTML = marked.parse(textoFinal);
        
        // Esconde campos do Kanban que não pertencem ao Diário
        document.getElementById('detalheTaskTag').style.display = 'none';
        document.getElementById('detalheTaskGit').style.display = 'none';
        document.getElementById('btn-abrir-git').style.display = 'none';
        
        window.openModal('modalDetalhesTarefa');
    }
};

window.deletarNota = async (id) => { if(confirm("Deseja queimar este registro? Esta ação é irreversível.")) { await deleteDoc(doc(db, "diario", id)); window.carregarNotas(); } };


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
// 10. PERFIL E CUSTOMIZAÇÃO (RPG MODE)
// ==========================================
window.pontuarGamificacao = async (tipo, userIdAlvo, tag, reverter = false) => {
    const uid = userIdAlvo || auth.currentUser.uid;
    const userRef = doc(db, "usuarios", uid);
    
    let pontos = 0;
    if (tipo === 'tarefa') pontos = 10;
    if (tipo === 'pomodoro') pontos = 5;

    const multiplicador = reverter ? -1 : 1;

    // Atualiza tudo: XP Geral, Status de Classe, Total, e a Missão DIÁRIA!
    await updateDoc(userRef, {
        xp: increment(pontos * multiplicador),
        [`stats.${tag || 'geral'}`]: increment(1 * multiplicador),
        [tipo === 'tarefa' ? 'tasksFeitas' : 'pomodoros']: increment(1 * multiplicador),
        [`daily.${tipo}`]: increment(1 * multiplicador) // <--- ESSA É A LINHA NOVA!
    });
};

// --- O CHAPÉU SELETOR DE CLASSES ---
window.calcularClasseRPG = (stats) => {
    if (!stats) return { nome: "Aventureiro Iniciante", cor: "#aaa", icone: "🛡️" };
    
    // Agrupa as tags caso você crie tags parecidas
    const s = {
        dev: (stats.feature || 0) + (stats.dev || 0),
        bug: stats.bug || 0,
        art: (stats.art || 0) + (stats.ui || 0),
        audio: (stats.audio || 0) + (stats.bgm || 0) + (stats.sfx || 0),
        docs: (stats.docs || 0) + (stats.gdd || 0)
    };
    
    let maxVal = 0;
    let classeAlvo = "geral";
    
    for (let [key, val] of Object.entries(s)) {
        if (val > maxVal) { maxVal = val; classeAlvo = key; }
    }
    
    if (maxVal === 0) return { nome: "Aventureiro Iniciante", cor: "#aaa", icone: "🛡️" };
    
    switch(classeAlvo) {
        case 'dev': return { nome: "Mago do Código", cor: "#00eaff", icone: "💻" };
        case 'bug': return { nome: "Paladino Implacável", cor: "#ff5252", icone: "🗡️" };
        case 'art': return { nome: "Ilusionista Visual", cor: "#ffc107", icone: "🎨" };
        case 'audio': return { nome: "Bardo Sonoro", cor: "#e040fb", icone: "🎵" };
        case 'docs': return { nome: "Lore Master", cor: "#9e9e9e", icone: "📜" };
        default: return { nome: "Aventureiro Polivalente", cor: "var(--primary)", icone: "⚔️" };
    }
};

// --- DESENHAR A FICHA DE PERSONAGEM ---
window.carregarMeuPerfil = () => {
    const card = document.getElementById('user-profile-card');
    if (!card || !auth.currentUser) return;

    onSnapshot(doc(db, "usuarios", auth.currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const u = docSnap.data();
            
            // Preenche os campos do formulário para não virem em branco
            document.getElementById('user-nome').value = u.nome || "";
            document.getElementById('user-apelido').value = u.apelido || "";
            if(u.especialidade) document.getElementById('user-specialty').value = u.especialidade;

            const xp = u.xp || 0;
            const tasksFeitas = u.tasksFeitas || 0;
            const pomodoros = u.pomodoros || 0;
            const stats = u.stats || {};
            
            const level = Math.floor(Math.sqrt(xp / 10)) + 1; 
            const xpNivelAtual = 10 * Math.pow(level - 1, 2);
            const xpProximoNivel = 10 * Math.pow(level, 2);
            const progressoXP = xp - xpNivelAtual;
            const metaXP = xpProximoNivel - xpNivelAtual;
            const porcentagem = Math.min(100, Math.max(0, (progressoXP / metaXP) * 100));

            const classeInfo = window.calcularClasseRPG(stats);
            const avatarTexto = window.obterNomeExibicao().substring(0, 2).toUpperCase();
            const bannerEstilo = u.bgTema ? `background-image: url('${u.bgTema}')` : 'background: #2a2a2d';
            
            // Texto formatado: Ex: João "MagoDasTrevas"
            const textoNomeFicha = u.apelido ? `${u.nome.split(' ')[0]} <span style="color:var(--primary);">"${u.apelido}"</span>` : u.nome.split(' ')[0];


            // ==========================================
            // 🏆 MATRIZ DE CONQUISTAS (BADGES)
            // ==========================================
            const badges = [
                { nome: 'Primeiro Sangue', desc: 'Ganhou seu primeiro XP no Hub.', icone: '🩸', unlocked: xp > 0 },
                { nome: 'Senhor do Tempo', desc: 'Completou 10 ciclos de Pomodoro.', icone: '⏳', unlocked: pomodoros >= 10 },
                { nome: 'O Ferreiro', desc: 'Moveu 20 tarefas para Feito.', icone: '🔨', unlocked: tasksFeitas >= 20 },
                { nome: 'Exterminador', desc: 'Esmagou 5 Bugs no Kanban.', icone: '🐛', unlocked: (stats.bug || 0) >= 5 },
                { nome: 'Alma Criativa', desc: 'Entregou 5 tarefas de Arte ou Áudio.', icone: '🎨', unlocked: ((stats.art || 0) + (stats.audio || 0)) >= 5 },
                { nome: 'Veterano', desc: 'Alcançou o Nível 10.', icone: '👑', unlocked: level >= 10 }
            ];

            let badgesHtml = badges.map(b => {
                const classe = b.unlocked ? 'unlocked' : 'locked';
                const tooltip = b.unlocked ? `${b.nome} (Desbloqueado)` : `Bloqueado: ${b.desc}`;
                return `<div class="badge-medal ${classe}" data-tooltip="${tooltip}">${b.icone}</div>`;
            }).join('');

            // Desenha a Ficha inteira!
            const menu3PontosPerfil = `
                <div style="position:absolute; top: 15px; right: 15px; z-index: 10;">
                    <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.5rem; color:#fff; background: rgba(0,0,0,0.5); width: 35px; height: 35px; border-radius: 8px; display:flex; align-items:center; justify-content:center; padding-bottom: 5px; border: 1px solid rgba(255,255,255,0.2);">⋮</button>
                    <div class="dropdown-content" style="right: 0; top: 45px; min-width: 180px;">
                        <button type="button" class="icon-btn" onclick="openModal('modalConfigPerfil'); document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));" style="font-size:0.85rem; text-align:left; width:100%; padding:12px; color:#fff;">⚙️ Configurar Perfil</button>
                    </div>
                </div>
            `;

            // Desenha a Ficha inteira (agora com o menu injetado no banner)
            card.innerHTML = `
                <div class="profile-card-container">
                    <div class="profile-banner" style="${bannerEstilo}">
                        ${menu3PontosPerfil}
                        <div class="profile-avatar-wrapper">
                            <div class="profile-avatar">${avatarTexto}</div>
                        </div>
                    </div>
                    <div class="profile-info">
                        <div class="profile-name">
                            ${textoNomeFicha} 
                            <span class="profile-level">Lv. ${level}</span>
                        </div>
                        <div class="profile-class" style="color: ${classeInfo.cor};">
                            ${classeInfo.icone} ${classeInfo.nome}
                        </div>
                        
                        <div class="xp-bar-container">
                            <div class="xp-bar-fill" style="width: ${porcentagem}%;"></div>
                        </div>
                        <div class="xp-text">${progressoXP} / ${metaXP} XP pro Nível ${level + 1}</div>

                        <div class="profile-stats-grid">
                            <div class="stat-box">
                                <div class="value">${tasksFeitas}</div>
                                <div class="label">Tarefas Feitas</div>
                            </div>
                            <div class="stat-box">
                                <div class="value">${pomodoros}</div>
                                <div class="label">Pomodoros</div>
                            </div>
                            <div class="stat-box" style="border-color: ${classeInfo.cor}; background: rgba(0,0,0,0.2);">
                                <div class="value" style="color: ${classeInfo.cor};">${xp}</div>
                                <div class="label">XP Total</div>
                            </div>
                        </div>

                        <div class="badges-container">
                            <div class="badges-title">Estante de Conquistas</div>
                            <div class="badges-grid">
                                ${badgesHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // (Mantemos o código que desenha as missões diárias logo aqui embaixo)
            const questsContainer = document.getElementById('quests-container');
            if (questsContainer) {
                const dailyTasks = u.daily?.tarefa || 0;
                const dailyPoms = u.daily?.pomodoro || 0;
                const resgatado = u.daily?.resgatado || false;

                const metaTasks = 1;
                const metaPoms = 2;

                const percTasks = Math.min(100, (dailyTasks / metaTasks) * 100);
                const percPoms = Math.min(100, (dailyPoms / metaPoms) * 100);
                const tudoPronto = (dailyTasks >= metaTasks && dailyPoms >= metaPoms);

                let btnHtml = '';
                if (resgatado) {
                    btnHtml = `<button class="btn-claim-bonus" disabled>✓ Bônus Resgatado</button>`;
                } else if (tudoPronto) {
                    btnHtml = `<button class="btn-claim-bonus" onclick="resgatarBonusDiario()">🎁 Resgatar +50 XP</button>`;
                } else {
                    btnHtml = `<button class="btn-claim-bonus" disabled style="opacity:0.5;">Complete as missões</button>`;
                }

                questsContainer.innerHTML = `
                    <div class="quest-item">
                        <div class="quest-header">
                            <span style="color: ${percPoms===100 ? 'var(--primary)' : '#fff'}">🍅 Foco (Pomodoros)</span>
                            <span style="color: var(--text-muted);">${dailyPoms}/${metaPoms}</span>
                        </div>
                        <div class="quest-bar-bg">
                            <div class="quest-bar-fill ${percPoms===100 ? 'done' : ''}" style="width: ${percPoms}%;"></div>
                        </div>
                    </div>
                    <div class="quest-item">
                        <div class="quest-header">
                            <span style="color: ${percTasks===100 ? 'var(--primary)' : '#fff'}">⚔️ Mão na Massa (Tarefas)</span>
                            <span style="color: var(--text-muted);">${dailyTasks}/${metaTasks}</span>
                        </div>
                        <div class="quest-bar-bg">
                            <div class="quest-bar-fill ${percTasks===100 ? 'done' : ''}" style="width: ${percTasks}%;"></div>
                        </div>
                    </div>
                    ${btnHtml}
                `;
            }
        }
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
    e.preventDefault(); // Impede a página de recarregar
    
    const btn = e.target.querySelector('button[type="submit"]'); 
    btn.disabled = true; btn.innerText = "Salvando...";
    
    // Puxa os dados novos
    const nome = document.getElementById('user-nome').value.trim();
    const apelido = document.getElementById('user-apelido').value.trim();
    const cor = document.getElementById('theme-color').value;
    const modo = document.getElementById('theme-mode').value;
    const op = document.getElementById('theme-opacity').value;
    const file = document.getElementById('theme-bg-file').files[0];
    const especialidade = document.getElementById('user-specialty').value;
    
    let bg64 = null;

    if (file && file.size <= 800*1024) {
        bg64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(file); });
    } else if (file) {
        alert("Imagem pesada! Máximo de 800kb."); btn.disabled = false; btn.innerText = "Salvar Alterações"; return;
    }

    const upd = { nome: nome, apelido: apelido, corTema: cor, modoTema: modo, opacidadeTema: op, especialidade: especialidade };
    if (bg64) { upd.bgTema = bg64; window.meuBgTema = bg64; }
    
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), upd);
    
    window.meuNome = nome;
    window.meuApelido = apelido;
    document.querySelector('.user-email').innerHTML = `<strong>${window.obterNomeExibicao()}</strong><br><span style="font-size:0.65rem; opacity:0.7;">${auth.currentUser.email}</span>`;
    
    window.aplicarTema(cor, window.meuBgTema, modo, op);
    
    // Fecha o modal e reseta o botão
    closeModal('modalConfigPerfil');
    btn.disabled = false; btn.innerText = "Salvar Alterações";
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
    btn.innerText = "Sincronizando... ⏳"; btn.disabled = true;

    const titulo = document.getElementById('audioTitulo').value;
    const tag = document.getElementById('audioTag').value;
    const bpm = document.getElementById('audioBpm').value || "--";
    const key = document.getElementById('audioKey').value || "--";
    let url = document.getElementById('audioUrl').value.trim();

    // Conversores de link (Mantemos a sua lógica de Dropbox/Drive já existente)
    if (url.includes("dropbox.com")) {
        url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace("?dl=0", "").replace("?dl=1", "");
    } else if (url.includes("drive.google.com/file/d/")) {
        const fileId = url.match(/[-\w]{25,}/); 
        if (fileId) url = `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
    }

    try {
        await addDoc(collection(db, "audios"), {
            titulo, tag, bpm, key, arquivoUrl: url,
            projetoId: window.projetoAtualId,
            enviadoPor: auth.currentUser.email,
            dataCriacao: new Date().toISOString()
        });
        window.registrarAtividade(`lançou a trilha "${titulo}" (${bpm} BPM)`, 'audio', '🎶');
        document.getElementById('formNovoAudio').reset();
        closeModal('modalNovoAudio');
    } catch(err) { console.error(err); }
    
    btn.innerText = "Lançar na Central de Áudio"; btn.disabled = false;
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

// --- 2. RENDERIZAÇÃO COM CONTROLES TÉCNICOS ---
window.renderizarAudios = () => {
    const grid = document.getElementById('audios-grid');
    if (!grid) return;

    let filtrados = window.audiosCache;
    if (window.audioFiltroAtual !== 'all') {
        filtrados = window.audiosCache.filter(a => a.tag === window.audioFiltroAtual);
    }

    grid.innerHTML = filtrados.map(a => {
        const temNotificacao = window.cacheNotificacoes.some(n => n.contextId === a.id);
        
        // NOVO MENU DE 3 PONTINHOS
        const menuAcoes = `
            <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.5rem; padding: 0 5px;">⋮</button>
                <div class="dropdown-content" style="right: 0; top: 30px; min-width: 160px;">
                    <a href="${a.arquivoUrl}" download="${a.titulo}" class="icon-btn" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:8px;">
                        <span>💾</span> Baixar Arquivo
                    </a>
                    <button class="icon-btn" onclick="abrirFeedbackAudio('${a.id}', '${a.titulo}', '${a.arquivoUrl}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ffc107; display:flex; align-items:center; gap:8px;">
                        <span>💬</span> Comentários
                    </button>
                    <button class="icon-btn" onclick="deletarAudio('${a.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:10px; border-top:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:8px;">
                        <span>🗑️</span> Excluir
                    </button>
                </div>
            </div>
        `;

        return `
            <div class="audio-card" id="card-${a.id}">
                <div class="audio-header">
                    <div style="flex: 1; overflow: hidden;">
                        <h4 class="audio-title">
                            ${temNotificacao ? '🔴 ' : ''}${a.titulo}
                        </h4>
                        <div style="display: flex; gap: 5px; align-items: center; margin-top: 5px; flex-wrap: wrap;">
                            <span class="audio-tag tag-${a.tag}">${a.tag}</span>
                            <span class="badge" style="background: rgba(255,255,255,0.03); color: #888; border: 1px solid rgba(255,255,255,0.1); font-size: 0.6rem;">🥁 ${a.bpm} BPM</span>
                            <span class="badge" style="background: rgba(255,255,255,0.03); color: #888; border: 1px solid rgba(255,255,255,0.1); font-size: 0.6rem;">🎹 ${a.key}</span>
                        </div>
                    </div>
                    ${menuAcoes}
                </div>
                
                <div class="audio-player-zone" style="margin-top: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 10px;">
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button class="btn-play-custom" id="btn-play-${a.id}" onclick="togglePlayAudio('${a.id}')">▶</button>
                        <div style="flex: 1;">
                            <div class="audio-progress-container" onclick="seekAudio(event, '${a.id}')" style="height: 8px;">
                                <div class="audio-progress-fill" id="progress-${a.id}"></div>
                            </div>
                            <div style="display:flex; justify-content: space-between; margin-top: 5px;">
                                <span class="audio-time" id="time-${a.id}" style="font-size: 0.65rem;">0:00 / 0:00</span>
                                <button id="btn-loop-${a.id}" onclick="toggleLoop('${a.id}')" style="background:none; border:none; color:#555; cursor:pointer; font-size:0.7rem; font-weight:bold;">🔁 LOOP: OFF</button>
                            </div>
                        </div>
                    </div>
                </div>
                <audio id="audio-elemento-${a.id}" src="${a.arquivoUrl}" ontimeupdate="atualizarProgresso('${a.id}')" onloadedmetadata="atualizarTempoTotal('${a.id}')" onended="audioTerminou('${a.id}')"></audio>
            </div>
        `;
    }).join('');
};

// --- 3. CONTROLE DE LOOP ---
window.toggleLoop = (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    const btn = document.getElementById(`btn-loop-${id}`);
    audio.loop = !audio.loop;
    
    if (audio.loop) {
        btn.style.color = "var(--primary)";
        btn.innerText = "🔁 LOOP: ON";
    } else {
        btn.style.color = "#555";
        btn.innerText = "🔁 LOOP: OFF";
    }
};

// --- LÓGICA DO MASTER PLAYER ---
window.audioIdAtualMestre = null;

// Esta função atualiza o player flutuante com os dados do áudio clicado
window.sincronizarComMaster = (id, titulo, subtitulo) => {
    window.audioIdAtualMestre = id;
    const player = document.getElementById('master-player-float');
    document.getElementById('master-player-title').innerText = titulo;
    document.getElementById('master-player-subtitle').innerText = subtitulo;
    
    player.classList.add('active'); // Mostra o player flutuante
};

// Sincroniza o Play/Pause do botão flutuante com o áudio da galeria
window.togglePlayMaster = () => {
    if (!window.audioIdAtualMestre) return;
    window.togglePlayAudio(window.audioIdAtualMestre);
};

// Controla o volume de TODOS os áudios do sistema
window.ajustarVolumeMaster = (valor) => {
    const todosAudios = document.querySelectorAll('audio');
    todosAudios.forEach(a => a.volume = valor);
    localStorage.setItem('hub_master_volume', valor); // Salva sua preferência
};

window.fecharPlayerMestre = () => {
    if (window.audioIdAtualMestre) {
        const audio = document.getElementById(`audio-elemento-${window.audioIdAtualMestre}`);
        if(audio) audio.pause();
    }
    document.getElementById('master-player-float').classList.remove('active');
};


// 3. A MÁGICA DO PLAY/PAUSE E BARRA DE PROGRESSO (CORRIGIDO)
window.togglePlayAudio = async (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    const btn = document.getElementById(`btn-play-${id}`); // <--- A LINHA QUE FALTAVA!
    const masterBtn = document.getElementById('master-play-icon');
    const card = window.audiosCache.find(a => a.id === id);
    
    if (!audio || !card) return;

    // Antes de rodar a lógica normal, avisa o Master Player
    window.sincronizarComMaster(id, card.titulo, `${card.tag} | ${card.bpm} BPM`);

    // Trava de segurança 1: Vê se o link tem erro crítico
    if (audio.networkState === 3) {
        alert("Ops! O servidor deste link bloqueou a reprodução (Erro de CORS/Permissão).");
        return;
    }

    // Se tiver outro tocando, pausa ele primeiro!
    if (window.audioAtualExecucao && window.audioAtualExecucao !== id) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}`);
        const btnAntigo = document.getElementById(`btn-play-${window.audioAtualExecucao}`);
        if(audioAntigo) audioAntigo.pause();
        if(btnAntigo) btnAntigo.innerText = "▶";
    }

    if (audio.paused) {
        try {
            await audio.play();
            if(btn) btn.innerText = "⏸";
            if(masterBtn) masterBtn.innerText = "⏸";
            window.audioAtualExecucao = id;
        } catch (erro) {
            // Se cair aqui, é porque o navegador bloqueou de VERDADE (ex: autoplay block)
            console.error("Erro real do player:", erro);
            alert("O navegador bloqueou a reprodução. Clique novamente para tentar.");
        }
    } else {
        audio.pause();
        if(btn) btn.innerText = "▶";
        if(masterBtn) masterBtn.innerText = "▶";
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

const originalAtualizarProgresso = window.atualizarProgresso;
// --- ATUALIZADOR DE PROGRESSO (UNIFICADO) ---
window.atualizarProgresso = (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    if (!audio) return;

    // 1. ATUALIZA O CARD INDIVIDUAL (O player pequeno na aba projeto)
    const bar = document.getElementById(`progress-${id}`);
    const timeTxt = document.getElementById(`time-${id}`);

    if (audio.duration && !isNaN(audio.duration)) {
        const perc = (audio.currentTime / audio.duration) * 100;
        if (bar) bar.style.width = `${perc}%`;

        const curMin = Math.floor(audio.currentTime / 60);
        const curSeg = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        const durMin = Math.floor(audio.duration / 60);
        const durSeg = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        
        if (timeTxt) timeTxt.innerText = `${curMin}:${curSeg} / ${durMin}:${durSeg}`;
    }

    // 2. SINCRONIZA COM O MASTER PLAYER (Barra flutuante)
    if (id === window.audioIdAtualMestre) {
        const masterBar = document.getElementById('master-progress-fill');
        const masterTime = document.getElementById('master-time');
        
        if (audio.duration) {
            if (masterBar) masterBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
            if (masterTime) {
                const min = Math.floor(audio.currentTime / 60);
                const seg = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
                masterTime.innerText = `${min}:${seg}`;
            }
        }
    }
};



window.seekMaster = (e) => {
    if (!window.audioIdAtualMestre) return;
    window.seekAudio(e, window.audioIdAtualMestre);
};

window.atualizarTempoTotal = (id) => { window.atualizarProgresso(id); }; // Só pra mostrar o tempo antes de dar play
window.audioTerminou = (id) => { document.getElementById(`btn-play-${id}`).innerText = "▶"; };

// 4. DELETAR
window.deletarAudio = async (id) => {
    if(confirm("Apagar este áudio?")) {
        try {
            // 1. Apaga o documento do áudio (Ação original)
            await deleteDoc(doc(db, "audios", id));

            // 2. A FAXINA: Busca notificações "zumbis" vinculadas a este ID
            // Procuramos qualquer notificação onde o contextId seja o ID da música deletada
            const qNotifs = query(collection(db, "notificacoes"), where("contextId", "==", id));
            const snapNotifs = await getDocs(qNotifs);

            if (!snapNotifs.empty) {
                // Marca todas como lidas para que sumam das bolinhas e do sistema
                const promessasLimpeza = snapNotifs.docs.map(d => 
                    updateDoc(doc(db, "notificacoes", d.id), { lida: true })
                );
                await Promise.all(promessasLimpeza);
                console.log(`🧹 Faxina concluída: ${snapNotifs.size} notificações removidas.`);
            }

            // O onSnapshot da galeria e das notificações cuidará de atualizar a tela sozinho!
        } catch (err) { 
            console.error("Erro ao deletar áudio e limpar rastros:", err); 
        }
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
    
    const audioOriginal = document.getElementById(`audio-elemento-${id}`);
    const playerModal = document.getElementById('player-feedback');
    
    // MÁGICA: Captura o tempo atual do card antes de pausar
    const tempoDeOndeParou = audioOriginal ? audioOriginal.currentTime : 0;

    // Pausa a música da tela principal e reseta os ícones
    if (window.audioAtualExecucao) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}`);
        const btnAntigo = document.getElementById(`btn-play-${window.audioAtualExecucao}`);
        const masterBtn = document.getElementById('master-play-icon');
        
        if(audioAntigo) audioAntigo.pause();
        if(btnAntigo) btnAntigo.innerText = "▶";
        if(masterBtn) masterBtn.innerText = "▶";
        
        window.audioAtualExecucao = null;
    }

    document.getElementById('feedback-titulo').innerText = `Feedback: ${titulo}`;
    
    // Configura o player do modal
    playerModal.src = url;
    
    // Aplica o tempo capturado (espera o metadata carregar para garantir que o player aceite o tempo)
    playerModal.onloadedmetadata = () => {
        playerModal.currentTime = tempoDeOndeParou;
    };
    
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


// --- LÓGICA DA SUBSEÇÃO DE ARTES ---

// --- NAVEGAÇÃO INTERNA DA ABA DE ARTES (CORRIGIDA) ---
window.switchArtSubTab = (viewId, btn) => {
    // 1. Esconde todas as sub-views de conteúdo
    document.querySelectorAll('.art-view-content').forEach(el => el.style.display = 'none');
    
    // 2. Tira a cor ativa de todos os botões do menu
    const container = btn.closest('.audio-subtabs');
    container.querySelectorAll('.audio-subtab-btn').forEach(b => b.classList.remove('active'));
    
    // 3. Mostra a sub-view selecionada e acende o botão
    document.getElementById(viewId).style.display = 'block';
    btn.classList.add('active');

    // 4. MÁGICA: Troca os botões de ação lá no topo
    const btnGaleria = document.getElementById('btn-group-galeria');
    const btnRef = document.getElementById('btn-group-referencias');

    if (viewId === 'view-galeria') {
        btnGaleria.style.display = 'block';
        btnRef.style.display = 'none';
    } else {
        btnGaleria.style.display = 'none';
        btnRef.style.display = 'block';
    }
};

// --- GESTÃO DE REFERÊNCIAS VISUAIS (MOODBOARD) ---

window.salvarReferenciaArt = async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('artRefTitulo').value;
    const url = document.getElementById('artRefUrl').value.trim();

    try {
        await addDoc(collection(db, "referencias_arte"), {
            titulo: titulo,
            url: url,
            projetoId: window.projetoAtualId,
            enviadoPor: window.obterNomeExibicao(),
            dataCriacao: new Date().toISOString()
        });
        closeModal('modalNovaReferenciaArt');
        document.getElementById('formNovaReferenciaArt').reset();
    } catch(err) { console.error(err); }
};

window.carregarReferenciasArt = (pid) => {
    const grid = document.getElementById('art-ref-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "referencias_arte"), where("projetoId", "==", pid)), (snap) => {
        grid.innerHTML = snap.docs.map(d => {
            const r = d.data();
            return `
                <div class="art-card" style="border-color: #ffc107;">
                    <img src="${r.url}" class="art-thumb" onclick="window.open('${r.url}', '_blank')">
                    <div class="art-info">
                        <h4 style="font-size:0.8rem;">${r.titulo}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                            <span style="font-size:0.6rem; color:#666;">Por ${r.enviadoPor}</span>
                            <button class="icon-btn" style="color:#ff5252; font-size:0.7rem;" onclick="deletarReferenciaArt('${d.id}')">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<p style="color:#666; grid-column:1/-1; text-align:center;">Nenhuma referência visual salva.</p>';
    });
};

window.deletarReferenciaArt = async (id) => {
    if(confirm("Remover esta referência?")) await deleteDoc(doc(db, "referencias_arte", id));
};

window.deletarArte = async (id) => {
    if(confirm("Apagar este asset da galeria?")) await deleteDoc(doc(db, "artes", id));
};

window.salvarArte = async (e) => {
    e.preventDefault();
    if (!window.projetoAtualId) return;

    let url = document.getElementById('artUrl').value.trim();

    // ADICIONADO: Conversor automático para Artes (Dropbox e Drive)
    if (url.includes("dropbox.com")) {
        url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace("?dl=0", "").replace("?dl=1", "");
    } else if (url.includes("drive.google.com/file/d/")) {
        const fileId = url.match(/[-\w]{25,}/); 
        if (fileId) url = `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
    }

    const dados = {
        titulo: document.getElementById('artTitulo').value,
        tag: document.getElementById('artTag').value,
        status: document.getElementById('artStatus').value,
        url: url, // Agora usa a URL já convertida
        projetoId: window.projetoAtualId,
        autor: window.obterNomeExibicao(),
        dataCriacao: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "artes"), dados);
        window.registrarAtividade(`postou um novo asset: ${dados.titulo}`, 'art', '🎨');
        closeModal('modalNovaArte');
        document.getElementById('formNovaArte').reset();
    } catch(err) { console.error(err); }
};

// Funções de Paleta de Cores
window.adicionarCorPaleta = async () => {
    const cor = prompt("Cole o código HEX da cor (ex: #ff0000):");
    if (cor && cor.startsWith('#')) {
        await addDoc(collection(db, "projeto_cores"), {
            hex: cor,
            projetoId: window.projetoAtualId
        });
    }
};

window.carregarCoresProjeto = (pid) => {
    const container = document.getElementById('palette-container');
    if (!container) return;

    onSnapshot(query(collection(db, "projeto_cores"), where("projetoId", "==", pid)), (snap) => {
        container.innerHTML = snap.docs.map(d => `
            <div class="color-swatch" 
                 style="background: ${d.data().hex}" 
                 onclick="navigator.clipboard.writeText('${d.data().hex}'); window.mostrarToastNotificacao('Wiki Cores', 'HEX Copiado!', 'geral')"
                 data-tooltip="${d.data().hex}">
                 
                 <button class="icon-btn delete-color-btn" onclick="event.stopPropagation(); window.deletarCorPaleta('${d.id}', '${d.data().hex}')">×</button>
            </div>
        `).join('');
    });
};

window.deletarCorPaleta = async (id, hex) => {
    if (confirm(`Deseja remover a cor ${hex} do Style Guide?`)) {
        try {
            await deleteDoc(doc(db, "projeto_cores", id));
            window.registrarAtividade(`removeu a cor ${hex} do Style Guide`, 'art', '🎨');
        } catch (e) { console.error(e); }
    }
};

/* ==========================================
   --- FEEDBACK VISUAL (ARTES) ---
   ========================================== */
window.arteVisualizandoId = null;

window.abrirVisualizadorArte = (id, titulo, url, autor) => {
    window.arteVisualizandoId = id;
    
    // Atualiza o Modal
    document.getElementById('view-art-img').src = url;
    document.getElementById('view-art-titulo').innerText = titulo;
    document.getElementById('view-art-meta').innerText = `Enviado por ${autor}`;
    
    window.carregarComentariosArte(id);
    window.openModal('modalVisualizarArte');
    
    // Limpa a bolinha de notificação deste item
    window.limparNotificacaoItem(id);
};

window.salvarComentarioArte = async (e) => {
    e.preventDefault();
    if (!window.arteVisualizandoId || !auth.currentUser) return;

    const input = document.getElementById('art-comment-input');
    const texto = input.value.trim();
    
    try {
        // 1. Salva o comentário
        await addDoc(collection(db, "comentarios_arte"), {
            arteId: window.arteVisualizandoId,
            texto: texto,
            autor: window.obterNomeExibicao(),
            autorEmail: auth.currentUser.email,
            dataCriacao: new Date().toISOString()
        });

        // 2. Busca quem é o dono da arte para notificar
        const arteRef = doc(db, "artes", window.arteVisualizandoId);
        const artSnap = await getDoc(arteRef);
        
        if (artSnap.exists()) {
            const artData = artSnap.data();
            // Se eu não for o dono da arte, notifico ele
            if (artData.autor !== window.obterNomeExibicao()) {
                // Aqui precisaríamos do UID do autor. 
                // Como salvamos o Nome no 'artes', o ideal é buscar o UID dele na coleção 'usuarios'
                const qUser = query(collection(db, "usuarios"), where("nome", "==", artData.autor));
                const userSnap = await getDocs(qUser);
                
                if (!userSnap.empty) {
                    window.criarNotificacao(
                        userSnap.docs[0].id, 
                        'art', 
                        'Novo Feedback', 
                        `${window.obterNomeExibicao()} comentou na sua arte: "${artData.titulo}"`,
                        {
                            abaAlvo: 'projetos',
                            subAba: 'tab-artes',
                            projetoId: window.projetoAtualId,
                            contextId: window.arteVisualizandoId
                        }
                    );
                }
            }
        }

        input.value = "";
    } catch(err) { console.error(err); }
};

/* ==========================================
   --- GESTÃO AVANÇADA DE ARTES ---
   ========================================== */

window.artFiltroAtual = 'all';

window.aplicarFiltroArtes = () => {
    window.artFiltroAtual = document.getElementById('art-filter').value;
    // Forçamos o recarregamento da galeria para aplicar o filtro na memória
    window.carregarArtesDoProjeto(window.projetoAtualId);
};

// --- EDITAR TÍTULO DA IMAGEM ---
window.editarTituloArte = async () => {
    if (!window.arteVisualizandoId) return;
    
    const tituloAtual = document.getElementById('view-art-titulo').innerText;
    const novoTitulo = prompt("Novo título para este asset:", tituloAtual);
    
    if (novoTitulo && novoTitulo.trim() !== "" && novoTitulo !== tituloAtual) {
        try {
            await updateDoc(doc(db, "artes", window.arteVisualizandoId), { 
                titulo: novoTitulo.trim() 
            });
            document.getElementById('view-art-titulo').innerText = novoTitulo.trim();
            window.mostrarToastNotificacao('Sucesso', 'Título atualizado!', 'geral');
        } catch (e) { console.error(e); }
    }
};

// --- GESTÃO DE COMENTÁRIOS (EDITAR/APAGAR) ---
window.carregarComentariosArte = (id) => {
    const lista = document.getElementById('art-comments-list');
    const q = query(collection(db, "comentarios_arte"), where("arteId", "==", id), orderBy("dataCriacao", "asc"));
    
    onSnapshot(q, (snap) => {
        lista.innerHTML = snap.docs.map(d => {
            const c = d.data();
            const isMe = c.autorEmail === auth.currentUser.email;
            const isAdmin = window.userRole === 'admin';
            
            // Menu de 3 pontinhos compacto
            let menuHtml = '';
            if (isMe || isAdmin) {
                menuHtml = `
                    <div class="comment-menu-container">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            ${isMe ? `<button onclick="window.editarComentarioArte('${d.id}', '${c.texto.replace(/'/g, "\\'")}')">✏️ Editar</button>` : ''}
                            <button class="del" onclick="window.deletarComentarioArte('${d.id}')">🗑️ Apagar</button>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="art-comment-item ${isMe ? 'is-me' : ''}">
                    ${menuHtml} 
                    
                    <div class="comment-top-row">
                        <span class="comment-author">${c.autor}</span>
                        <span class="comment-time">${new Date(c.dataCriacao).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p class="comment-text">${c.texto}</p>
                </div>
            `;
        }).join('') || '<p style="color:#666; text-align:center; font-size: 0.8rem; margin-top: 20px;">Nenhum feedback ainda.</p>';
        
        setTimeout(() => {
            lista.scrollTop = lista.scrollHeight;
        }, 100);
    });
};

window.editarComentarioArte = async (id, textoAntigo) => {
    const novoTexto = prompt("Editar seu feedback:", textoAntigo);
    if (novoTexto && novoTexto.trim() !== "" && novoTexto !== textoAntigo) {
        await updateDoc(doc(db, "comentarios_arte", id), { texto: novoTexto.trim() });
    }
};

window.deletarComentarioArte = async (id) => {
    if (confirm("Apagar este comentário?")) {
        await deleteDoc(doc(db, "comentarios_arte", id));
    }
};

// --- ATUALIZAÇÃO DA RENDERIZAÇÃO DA GALERIA (COM FILTRO) ---
window.carregarArtesDoProjeto = (pid) => {
    const grid = document.getElementById('art-gallery-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "artes"), where("projetoId", "==", pid)), (snap) => {
        const artes = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Aplica o filtro da memória
        const filtradas = window.artFiltroAtual === 'all' 
            ? artes 
            : artes.filter(a => a.tag === window.artFiltroAtual);

        grid.innerHTML = filtradas.map(a => {
            const statusColor = a.status === 'done' ? 'var(--primary)' : (a.status === 'review' ? '#ffc107' : '#888');
            
            return `
                <div class="art-card">
                    <img src="${a.url}" class="art-thumb" onclick="window.abrirVisualizadorArte('${a.id}', '${a.titulo}', '${a.url}', '${a.autor}')" style="cursor: pointer;">
                    <div class="art-info">
                        <h4>${a.titulo}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="badge" style="font-size:0.55rem; padding:2px 6px;">${a.tag}</span>
                            <span style="font-size:0.6rem; color:${statusColor}; font-weight:bold;">● ${a.status.toUpperCase()}</span>
                        </div>
                        <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:8px;">
                             <button class="icon-btn" style="font-size:0.8rem;" onclick="window.deletarArte('${a.id}')">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<p style="color:#666; grid-column:1/-1; text-align:center;">Nenhum asset encontrado com este filtro.</p>';
    });
};


/* ==========================================
   --- MÓDULO BRAINSTORM & INCUBADORA (FINAL) ---
   ========================================== */

window.ideiaEditandoId = null;
window.projetoAtualIdBackup = null;
window.ideiaPromovendoId = null;

// Abrir para projeto específico
window.abrirModalNovaIdeiaProjeto = () => {
    window.ideiaEditandoId = null;
    window.projetoAtualIdBackup = null;
    document.getElementById('formBrainstorm')?.reset();
    document.getElementById('modalBrainTitle').innerText = "💡 Nova Sacada";
    window.openModal('modalNovaIdeia');
};

// Abrir para Incubadora (Global)
window.abrirModalNovaIdeiaGlobal = () => {
    window.ideiaEditandoId = null; 
    window.projetoAtualIdBackup = window.projetoAtualId;
    window.projetoAtualId = "global";
    document.getElementById('formBrainstorm')?.reset();
    document.getElementById('modalBrainTitle').innerText = "💡 Nova Ideia Global";
    window.openModal('modalNovaIdeia');
};

// Salvar Ideia (Global ou Projeto)
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

// Carregar Mural de Projeto
window.carregarBrainstorm = (pid) => {
    const grid = document.getElementById('brainstorm-grid');
    if (!grid) return;
    onSnapshot(query(collection(db, "brainstorm_ideias"), where("projetoId", "==", pid)), (snap) => {
        let ideias = snap.docs.map(d => ({id: d.id, ...d.data()}));
        ideias.sort((a,b) => (b.votos?.length || 0) - (a.votos?.length || 0));
        grid.innerHTML = ideias.map(i => renderizarCardIdeia(i)).join('') || '<p style="text-align:center; color:#666;">Vazio.</p>';
    });
};

// Carregar Incubadora (Global)
window.carregarIncubadora = () => {
    const grid = document.getElementById('incubadora-grid');
    if (!grid) return;
    onSnapshot(query(collection(db, "brainstorm_ideias"), where("projetoId", "==", "global")), (snap) => {
        let ideias = snap.docs.map(d => ({id: d.id, ...d.data()}));
        ideias.sort((a,b) => (b.votos?.length || 0) - (a.votos?.length || 0));
        grid.innerHTML = ideias.map(i => renderizarCardIdeia(i)).join('') || '<p style="text-align:center; color:#666;">Sem ideias na incubadora.</p>';
    });
};

// Função auxiliar para evitar repetição de código HTML
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
        <div class="idea-card ${i.tag}">
            ${menuHtml}
            <h4>${i.titulo}</h4>
            <div class="markdown-body idea-desc">${marked.parse(i.descricao || "")}</div>
            <div class="idea-footer">
                <span style="font-size:0.65rem; color:#666;">Por ${i.autor}</span>
                <button class="vote-btn ${jaVotou ? 'voted' : ''}" onclick="window.votarIdeia('${i.id}', ${jaVotou})">
                    ${jaVotou ? '✅' : '🚀'} ${i.votos?.length || 0}
                </button>
            </div>
        </div>`;
}

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
    let votos = snap.data().votos || [];
    votos = jaVotou ? votos.filter(u => u !== meuUid) : [...votos, meuUid];
    await updateDoc(docRef, { votos });
};


/* ==========================================
   --- HEARTKEY RADIO GLOBAL ENGINE ---
   ========================================== */
window.playerRadio = new Audio();
window.radioConfigGlobal = {}; // Cache da programação vinda do banco

// 1. ESCUTA GLOBAL (Roda para todos os usuários)
window.iniciarEscutaRadioGlobal = () => {
    onSnapshot(doc(db, "configuracoes", "radio_global"), (docSnap) => {
        if (docSnap.exists()) {
            window.radioConfigGlobal = docSnap.data();
            console.log("📻 Programação da rádio atualizada pelo Admin.");
        }
    });
};

// 2. SALVAR CONFIGURAÇÃO (SÓ ADMIN)
window.salvarConfigRadioGlobal = async () => {
    if (window.userRole !== 'admin') return alert("Acesso Negado.");

    const dados = {
        playlist: document.getElementById('cfg-radio-playlist').value,
        vinheta: document.getElementById('cfg-radio-vinheta').value,
        noticia: document.getElementById('cfg-radio-noticia').value,
        horario: document.getElementById('cfg-radio-horario').value,
        atualizadoPor: auth.currentUser.email,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, "configuracoes", "radio_global"), dados);
        window.closeModal('modalConfigRadio');
        window.mostrarToastNotificacao("Rádio Global", "Transmissão atualizada para todos!", "geral");
        window.registrarAtividade("atualizou a programação da Rádio Global", "radio", "🎙️");
    } catch (e) { console.error(e); }
};

// 3. O PLAYER (Lê do objeto global)
window.iniciarRadioFrequencia = () => {
    const config = window.radioConfigGlobal;
    
    if (!config.playlist || config.playlist.trim() === "") {
        return alert("O Admin ainda não configurou a playlist global.");
    }

    const links = config.playlist.split('\n').filter(l => l.trim() !== "");
    const linkSorteado = links[Math.floor(Math.random() * links.length)];

    const urlFinal = window.converterLinkDireto(linkSorteado);
    window.playerRadio.src = urlFinal;
    window.playerRadio.play();
    
    document.getElementById('radio-status').innerText = `📻 Sintonizado na HeartKey`;
    document.getElementById('radio-status').style.color = "var(--primary)";

    window.playerRadio.onended = () => {
        if (!window.radioStatus?.estaTocandoNoticia) window.iniciarRadioFrequencia();
    };
};

// 4. AGENDADOR DE PLANTÃO (Continua igual, mas lê da window.radioConfigGlobal)
setInterval(() => {
    const config = window.radioConfigGlobal;
    if (!config.horario) return;

    const agora = new Date();
    const horaAtual = agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (horaAtual === config.horario && !window.radioStatus?.estaTocandoNoticia) {
        window.dispararPlantaoGlobal();
    }
}, 60000);

/* ==========================================
   --- MOTOR DE RÁDIO COM FADE OUT ---
   ========================================== */

// Função auxiliar para diminuir o volume suavemente
window.fadeAudio = (audio, duration = 2000) => {
    return new Promise((resolve) => {
        const volumeOriginal = audio.volume;
        const intervalo = 50; //ms
        const passos = duration / intervalo;
        const reducaoPorPasso = volumeOriginal / passos;

        const timerFade = setInterval(() => {
            if (audio.volume > reducaoPorPasso) {
                audio.volume -= reducaoPorPasso;
            } else {
                audio.volume = 0;
                clearInterval(timerFade);
                audio.pause();
                audio.volume = volumeOriginal; // Reseta volume para a próxima música
                resolve();
            }
        }, intervalo);
    });
};

window.dispararPlantaoGlobal = async () => {
    const config = window.radioConfigGlobal;
    const vinhetaUrl = window.converterLinkDireto(config.vinheta);
    const noticiaUrl = window.converterLinkDireto(config.noticia);

    if (!vinhetaUrl || !noticiaUrl || window.radioStatus?.estaTocandoNoticia) return;

    window.radioStatus = { estaTocandoNoticia: true };
    
    // 1. EFEITO FADE OUT: A música vai sumindo em 2 segundos
    await window.fadeAudio(window.playerRadio, 2000);
    
    window.mostrarToastNotificacao("📻 RÁDIO", "Iniciando Boletim Informativo...", "geral");

    // 2. TOCA A VINHETA
    window.playerRadio.src = vinhetaUrl;
    window.playerRadio.play();
    
    window.playerRadio.onended = async () => {
        // 3. TOCA A NOTÍCIA (SUA VOZ)
        window.playerRadio.src = noticiaUrl;
        window.playerRadio.play();
        
        window.playerRadio.onended = () => {
            // 4. FINALIZA E VOLTA PRA PLAYLIST
            window.radioStatus.estaTocandoNoticia = false;
            window.iniciarRadioFrequencia();
        };
    };
};

window.salvarConfigRadio = () => {
    localStorage.setItem('radio_vinheta', document.getElementById('cfg-radio-vinheta').value);
    localStorage.setItem('radio_noticia', document.getElementById('cfg-radio-noticia').value);
    localStorage.setItem('radio_horario', document.getElementById('cfg-radio-horario').value);
    
    window.closeModal('modalConfigRadio');
    window.mostrarToastNotificacao("Rádio", "Programação atualizada!", "geral");
};

// Função para abrir o modal já preenchido
window.abrirConfigRadio = () => {
    document.getElementById('cfg-radio-vinheta').value = localStorage.getItem('radio_vinheta') || "";
    document.getElementById('cfg-radio-noticia').value = localStorage.getItem('radio_noticia') || "";
    document.getElementById('cfg-radio-horario').value = localStorage.getItem('radio_horario') || "09:00";
    window.openModal('modalConfigRadio');
};

// --- CONVERSOR UNIVERSAL DE LINKS (DROPBOX / DRIVE) ---
window.converterLinkDireto = (url) => {
    if (!url) return "";
    let link = url.trim();

    // Lógica Dropbox
    if (link.includes("dropbox.com")) {
        return link.replace("www.dropbox.com", "dl.dropboxusercontent.com")
                   .replace("?dl=0", "")
                   .replace("?dl=1", "");
    }
    
    // Lógica Google Drive
    if (link.includes("drive.google.com/file/d/")) {
        const fileId = link.match(/[-\w]{25,}/);
        if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
    }

    return link; // Se não for nenhum dos dois, retorna o original
};

