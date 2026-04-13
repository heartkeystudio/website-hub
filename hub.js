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
        
        const userDocRef = doc(db, "usuarios", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        let cargoAtual = 'membro';
        let dadosUsuario = {};

        if (userDoc.exists()) {
            dadosUsuario = userDoc.data();
            cargoAtual = dadosUsuario.role || 'membro';
            
            window.meuNome = dadosUsuario.nome || user.displayName || user.email.split('@')[0];
            window.meuApelido = dadosUsuario.apelido || "";
            window.meuBgTema = dadosUsuario.bgTema || null;
            window.meuAvatar = dadosUsuario.avatarBase64 || null;
            
            window.aplicarTema(dadosUsuario.corTema, dadosUsuario.bgTema, dadosUsuario.modoTema, dadosUsuario.opacidadeTema);
        }

        // --- ATUALIZA O AVATAR NO TOPO DO MENU FLUTUANTE ---
        const sidebarTopAvatar = document.getElementById('sidebar-user-avatar');
        if (sidebarTopAvatar) {
            sidebarTopAvatar.innerHTML = window.meuAvatar 
                ? `<img src="${window.meuAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` 
                : window.obterNomeExibicao().substring(0, 2).toUpperCase();
        }

        // --- ATUALIZA O NOME DO USUÁRIO AO LADO DA FOTO ---
        const sidebarTopName = document.getElementById('sidebar-user-name');
        if (sidebarTopName) {
            sidebarTopName.innerText = window.obterNomeExibicao();
        }

        // Trava de segurança para Admins
        if (SUPER_ADMINS.includes(user.email.toLowerCase())) cargoAtual = 'admin';
        window.userRole = cargoAtual;
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
        window.recuperarPomodoroPerdido();
        window.carregarIncubadora();
        window.iniciarEscutaRadioGlobal();
        window.carregarBarraIntegrantes();

        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
        window.intervaloLembrete = setInterval(() => {
            window.verificarLembretesProximos();
        }, 5 * 60 * 1000); // 5 minutos
    } else {
        loginScreen.classList.remove('hidden');
        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
    }

    setInterval(async () => {
        if (auth.currentUser) {
            await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
                ultimoVisto: new Date().toISOString()
            });
        }
    }, 120000);
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

        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar')?.classList.remove('active');
            document.getElementById('mobile-sidebar-backdrop')?.classList.remove('active');
        }
        document.querySelector('.content-area').scrollTop = 0;
    };
});

const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop');
const mobileContactsBtn = document.getElementById('mobile-contacts-btn');
const mobileContactsBackdrop = document.getElementById('mobile-contacts-backdrop');
if (mobileMenuBtn) mobileMenuBtn.onclick = () => {
    const sidebar = document.getElementById('main-sidebar');
    sidebar?.classList.toggle('active');
    mobileSidebarBackdrop?.classList.toggle('active');
    document.getElementById('sidebar-integrantes')?.classList.remove('active');
    mobileContactsBackdrop?.classList.remove('active');
};
if (mobileSidebarBackdrop) mobileSidebarBackdrop.onclick = () => {
    document.getElementById('main-sidebar')?.classList.remove('active');
    mobileSidebarBackdrop.classList.remove('active');
};

if (mobileContactsBtn) mobileContactsBtn.onclick = () => {
    const contacts = document.getElementById('sidebar-integrantes');
    contacts?.classList.toggle('active');
    mobileContactsBackdrop?.classList.toggle('active');
    document.getElementById('main-sidebar')?.classList.remove('active');
    mobileSidebarBackdrop?.classList.remove('active');
};
if (mobileContactsBackdrop) mobileContactsBackdrop.onclick = () => {
    document.getElementById('sidebar-integrantes')?.classList.remove('active');
    mobileContactsBackdrop.classList.remove('active');
};

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
// 5. DASHBOARD E POMODORO (COM MEMÓRIA GLOBAL)
// ==========================================
// Puxa o tempo salvo da última sessão (ou 25 min como padrão)
window.pomodoroMinutosOriginais = localStorage.getItem('hub_pomo_minutos') ? parseInt(localStorage.getItem('hub_pomo_minutos')) : 25;
window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
window.pomodoroIntervalo = null;
window.tarefaEmFocoAtual = null;

window.atualizarDisplayPomodoro = () => {
    const m = Math.floor(window.pomodoroTempo / 60).toString().padStart(2, '0');
    const s = (window.pomodoroTempo % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    
    const miniDisplay = document.getElementById('pomodoro-display');
    const focusDisplay = document.getElementById('focus-time-display');
    if (miniDisplay) miniDisplay.innerText = timeStr;
    if (focusDisplay) focusDisplay.innerText = timeStr;
};

// O INÍCIO: Salva a hora exata que vai terminar no navegador!
window.iniciarPomodoro = () => {
    if (window.pomodoroIntervalo) return;
    
    // Se não tiver um término salvo, calcula a partir de agora
    if (!localStorage.getItem('hub_pomo_alvo')) {
        const horaAlvo = Date.now() + (window.pomodoroTempo * 1000);
        localStorage.setItem('hub_pomo_alvo', horaAlvo.toString());
    }

    window.pomodoroIntervalo = setInterval(() => {
        // Pega a hora alvo do navegador e vê quanto falta
        const horaAlvo = parseInt(localStorage.getItem('hub_pomo_alvo'));
        const faltaMilissegundos = horaAlvo - Date.now();
        
        if (faltaMilissegundos > 0) {
            window.pomodoroTempo = Math.round(faltaMilissegundos / 1000);
            window.atualizarDisplayPomodoro();
        } else {
            // ACABOU O TEMPO!
            clearInterval(window.pomodoroIntervalo);
            window.pomodoroIntervalo = null;
            localStorage.removeItem('hub_pomo_alvo'); // Limpa a memória
            
            window.pontuarGamificacao('pomodoro');
            window.mostrarToastNotificacao("Foco Concluído!", "🍅 Excelente trabalho! Faça uma pausa curta.", "geral");
            
            window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
            window.atualizarDisplayPomodoro();
        }
    }, 1000);
};

window.pausarPomodoro = () => { 
    clearInterval(window.pomodoroIntervalo); 
    window.pomodoroIntervalo = null; 
    // Quando pausa, apaga o alvo global, assim quando voltar ele recomeça com o `pomodoroTempo` restante
    localStorage.removeItem('hub_pomo_alvo'); 
};

window.resetarPomodoro = () => { 
    window.pausarPomodoro(); 
    window.pomodoroTempo = window.pomodoroMinutosOriginais * 60; 
    window.atualizarDisplayPomodoro(); 
};

window.editarTempoPomodoro = () => {
    window.pausarPomodoro(); 
    const novoTempo = prompt("Quantos minutos você quer focar?", window.pomodoroMinutosOriginais);
    if (novoTempo && !isNaN(novoTempo) && parseInt(novoTempo) > 0) {
        window.pomodoroMinutosOriginais = parseInt(novoTempo);
        // Salva a preferência pra sempre!
        localStorage.setItem('hub_pomo_minutos', window.pomodoroMinutosOriginais.toString()); 
        window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
        window.atualizarDisplayPomodoro();
    }
};

// MÁGICA: Função que roda sozinha ao entrar no site para ver se tinha um timer rolando!
window.recuperarPomodoroPerdido = () => {
    const horaAlvo = localStorage.getItem('hub_pomo_alvo');
    if (horaAlvo) {
        const faltaMilissegundos = parseInt(horaAlvo) - Date.now();
        if (faltaMilissegundos > 0) {
            // Tinha timer rodando e ainda não acabou! Retoma de onde parou:
            window.pomodoroTempo = Math.round(faltaMilissegundos / 1000);
            window.atualizarDisplayPomodoro();
            window.iniciarPomodoro(); // Dispara o motor de volta
        } else {
            // O tempo acabou enquanto o cara tava fora do site!
            localStorage.removeItem('hub_pomo_alvo');
            window.pontuarGamificacao('pomodoro');
            window.mostrarToastNotificacao("Timer Encerrado", "🍅 O seu pomodoro terminou enquanto você estava fora!", "geral");
            window.pomodoroTempo = window.pomodoroMinutosOriginais * 60;
            window.atualizarDisplayPomodoro();
        }
    }
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
            // MÁGICA DA GLÓRIA: Puxa os dados da ideia original para premiar o autor!
            const ideiaSnap = await getDoc(doc(db, "brainstorm_ideias", window.ideiaPromovendoId));
            
            if (confirm("Projeto criado! Deseja remover a ideia original da Incubadora?")) {
                if (ideiaSnap.exists()) {
                    const autorId = ideiaSnap.data().autorId;
                    // Dá 50 XP pro autor se a ideia for aprovada!
                    if (autorId) {
                        await updateDoc(doc(db, "usuarios", autorId), { xp: increment(50) });
                        window.criarNotificacao(
                            autorId, 'geral', '💡 Ideia Aprovada!', 
                            `+50 XP! A equipe transformou sua ideia "${ideiaSnap.data().titulo}" em um Projeto Oficial.`, 
                            { abaAlvo: 'projetos' }
                        );
                    }
                }
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
window.filtroProjetosAtual = 'todos';

window.aplicarFiltroProjetos = () => {
    const select = document.getElementById('filter-projetos');
    if (select) window.filtroProjetosAtual = select.value;
    window.carregarProjetos();
};

window.carregarProjetos = async () => {
    const grid = document.getElementById('projects-grid');
    if (!grid || !auth.currentUser) return;

    // INJEÇÃO AUTOMÁTICA DO FILTRO (Para você não precisar mexer no HTML)
    let filterContainer = document.getElementById('project-filter-container');
    if (!filterContainer) {
        filterContainer = document.createElement('div');
        filterContainer.id = 'project-filter-container';
        filterContainer.style.marginBottom = '20px';
        filterContainer.innerHTML = `
            <select id="filter-projetos" onchange="window.aplicarFiltroProjetos()" style="padding: 8px 15px; border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid var(--primary); outline: none; font-weight: bold; cursor: pointer;">
                <option value="todos">🌍 Mostrar Todos os Projetos</option>
                <option value="meus">👤 Apenas Meus Projetos Pessoais</option>
                <option value="outros">🏢 Apenas Projetos Oficiais do Estúdio</option>
            </select>
        `;
        grid.parentNode.insertBefore(filterContainer, grid);
    }

    const q = query(collection(db, "projetos"), where("colaboradores", "array-contains", auth.currentUser.email.toLowerCase()));
    
    onSnapshot(q, (snap) => {
        let projetos = snap.docs.map(d => ({id: d.id, ...d.data()}));

        // A MÁGICA DO FILTRO
        if (window.filtroProjetosAtual === 'meus') {
            projetos = projetos.filter(p => p.userId === auth.currentUser.uid);
        } else if (window.filtroProjetosAtual === 'outros') {
            projetos = projetos.filter(p => p.userId !== auth.currentUser.uid);
        }

        grid.innerHTML = projetos.map(p => {
            const iniciais = p.nome.substring(0,2).toUpperCase();
            const souDono = p.userId === auth.currentUser.uid;
            
            let botoesAcao = souDono 
                ? `<button class="icon-btn" onclick="event.stopPropagation(); deletarProjeto('${p.id}')" style="color:#ff5252; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;" title="Excluir Projeto">🗑️</button>`
                : `<button class="icon-btn" onclick="event.stopPropagation(); sairDoProjeto('${p.id}', '${p.nome}')" style="color:#ffc107; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 6px;" title="Sair do Projeto">🚪</button>`;

            const bgStyle = p.capaBase64 ? `background: linear-gradient(rgba(15,15,15,0.7), rgba(15,15,15,0.95)), url('${p.capaBase64}') center/cover; border-color: rgba(255,255,255,0.2);` : '';
            const avatarHtml = p.avatarBase64 ? `<img src="${p.avatarBase64}">` : iniciais;
            
            return `
                <div class="client-card" id="proj-card-${p.id}" onclick="window.abrirProjeto('${p.id}', '${p.nome.replace(/'/g, "\\'")}', '${p.githubRepo}', '${p.capaBase64 || ""}', ${p.versaoAlvo || 1})" style="cursor:pointer; position:relative; ${bgStyle}">
                    <div class="client-header" style="border-bottom-color: rgba(255,255,255,0.1);">
                        <div class="client-avatar" style="padding:0; overflow:hidden;">${avatarHtml}</div>
                        <div class="client-title" style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3 style="margin:0;">${p.nome}</h3>
                                ${botoesAcao} 
                            </div>
                            <p class="client-role" style="margin-top:5px;">Equipe: ${p.colaboradores.length} membro(s) ${souDono ? '(Criador)' : ''}</p>
                        </div>
                    </div>
                    <div class="client-body">
                        <p style="color: #e0e0e0;">${p.descricao || "Sem descrição."}</p>
                    </div>
                </div>`;
        }).join('');
    });
};

// 3. EDITAR PROJETO
// --- GESTOR DE TAGS CUSTOMIZADAS ---
window.projetoTagsCustomizadas = []; // Memória temporária do modal

window.renderizarTagsCustomizadas = () => {
    const list = document.getElementById('custom-tags-list');
    if (!list) return;
    
    list.innerHTML = window.projetoTagsCustomizadas.map((t, index) => `
        <div class="user-tag" style="background: ${t.cor}33; color: ${t.cor}; border-color: ${t.cor};">
            ${t.nome}
            <button type="button" onclick="window.removerTagCustomizada(${index})" style="color: ${t.cor}; opacity: 0.7;">×</button>
        </div>
    `).join('') || '<span style="font-size: 0.75rem; color: #666;">Nenhuma tag extra.</span>';
};

window.adicionarTagCustomizada = () => {
    const nome = document.getElementById('new-tag-name').value.trim().toLowerCase();
    const cor = document.getElementById('new-tag-color').value;
    
    if (!nome) return;
    if (window.projetoTagsCustomizadas.find(t => t.nome === nome)) return alert("Já existe uma tag com este nome!");
    
    window.projetoTagsCustomizadas.push({ nome, cor });
    document.getElementById('new-tag-name').value = '';
    window.renderizarTagsCustomizadas();
};

window.removerTagCustomizada = (index) => {
    window.projetoTagsCustomizadas.splice(index, 1);
    window.renderizarTagsCustomizadas();
};

// --- ABRIR MODAL (AGORA LENDO AS TAGS) ---
window.abrirModalEditarProjeto = async () => {
    if (!window.projetoAtualId) return;
    const docSnap = await getDoc(doc(db, "projetos", window.projetoAtualId));
    
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById('editProjNome').value = p.nome;
        document.getElementById('editProjDesc').value = p.descricao;
        document.getElementById('editProjVersao').value = p.versaoAlvo || 1;
        document.getElementById('editProjRepo').value = p.githubRepo || '';

        // Carrega as tags do projeto
        window.projetoTagsCustomizadas = p.customTags || [];
        window.renderizarTagsCustomizadas();

        // 1. Carrega os membros que já estão no projeto (tirando o próprio dono da lista)
        const colabsSemDono = p.colaboradores.filter(em => em !== auth.currentUser.email.toLowerCase());
        
        // Busca a equipe toda pra pegar os nomes e fotos bonitos
        if(!window.todosUsuariosCache) {
            const snapUsers = await getDocs(collection(db, "usuarios"));
            window.todosUsuariosCache = snapUsers.docs.map(d => d.data());
        }
        
        window.colaboradoresSelecionados = colabsSemDono.map(email => {
            const u = window.todosUsuariosCache.find(user => user.email === email);
            return { 
                email: email, 
                nome: u ? (u.apelido || u.nome.split(' ')[0]) : email.split('@')[0] 
            };
        });
        
        window.renderizarTagsColabs();
        document.getElementById('colabs-search-input').value = '';
        document.getElementById('colabs-suggestions').style.display = 'none';

        window.openModal('modalEditarProjeto');
    }
};

window.renderizarTagsColabs = () => {
    const area = document.getElementById('colabs-badges-area');
    if (!area) return;
    area.innerHTML = window.colaboradoresSelecionados.map(c => `
        <div class="user-tag">
            @${c.nome}
            <button type="button" onclick="window.removerTagColab('${c.email}')">&times;</button>
        </div>
    `).join('');
};

window.removerTagColab = (email) => {
    window.colaboradoresSelecionados = window.colaboradoresSelecionados.filter(c => c.email !== email);
    window.renderizarTagsColabs();
};

window.adicionarTagColab = (email, nome) => {
    if (!window.colaboradoresSelecionados.find(c => c.email === email)) {
        window.colaboradoresSelecionados.push({ email, nome });
        window.renderizarTagsColabs();
    } 
    document.getElementById('colabs-search-input').value = '';
    document.getElementById('colabs-suggestions').style.display = 'none';
    document.getElementById('colabs-search-input').focus();
};

// O Espião do Input (Auto-complete)
setTimeout(() => {
    const inputBusca = document.getElementById('colabs-search-input');
    if (!inputBusca) return;

    inputBusca.addEventListener('input', async (e) => {
        const termo = e.target.value.trim().toLowerCase();
        const box = document.getElementById('colabs-suggestions');
        
        if (termo.length < 1) { box.style.display = 'none'; return; }

        if (!window.todosUsuariosCache) {
            const snapUsers = await getDocs(collection(db, "usuarios"));
            window.todosUsuariosCache = snapUsers.docs.map(d => d.data());
        }

        const meuEmail = auth.currentUser.email.toLowerCase();
        const selecionadosEmails = window.colaboradoresSelecionados.map(c => c.email);

        // Filtra quem bate com o que você digitou (ignorando quem já tá no projeto e você mesmo)
        const matches = window.todosUsuariosCache.filter(u => {
            if (u.email === meuEmail || selecionadosEmails.includes(u.email)) return false;
            return u.nome.toLowerCase().includes(termo) || (u.apelido && u.apelido.toLowerCase().includes(termo));
        });

        if (matches.length > 0) {
            box.innerHTML = matches.map(u => {
                const nomeExibicao = u.apelido || u.nome.split(' ')[0];
                const ft = u.avatarBase64 ? `<img src="${u.avatarBase64}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">` : `👤`;
                return `
                <li onmousedown="window.adicionarTagColab('${u.email}', '${nomeExibicao}')" style="padding: 10px 15px; cursor: pointer; color: #fff; font-size: 0.85rem; transition: 0.2s; border-bottom: 1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='var(--primary)'; this.style.color='#000';" onmouseout="this.style.background='transparent'; this.style.color='#fff';">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${ft}
                        <div>
                            <strong style="font-size: 0.95rem;">${nomeExibicao}</strong> <br>
                            <span style="font-size: 0.65rem; opacity: 0.7;">${u.email}</span>
                        </div>
                    </div>
                </li>`;
            }).join('');
            box.style.display = 'block';
        } else {
            box.innerHTML = `<li style="padding: 10px 15px; color: #888; font-size: 0.8rem; text-align: center;">Nenhum colega encontrado.</li>`;
            box.style.display = 'block';
        }
    });
    
    // Esconde a lista se clicar fora
    inputBusca.addEventListener('blur', () => setTimeout(() => {
        const box = document.getElementById('colabs-suggestions');
        if (box) box.style.display = 'none';
    }, 200));
}, 1500);

// --- SALVAR PROJETO (AGORA SALVANDO AS TAGS) ---
window.salvarEdicaoProjeto = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processando... ⏳";

    const nome = document.getElementById('editProjNome').value.trim();
    const desc = document.getElementById('editProjDesc').value.trim();
    const repo = document.getElementById('editProjRepo').value.trim();
    const versao = parseInt(document.getElementById('editProjVersao').value) || 1; 
    
    let colaboradores = [auth.currentUser.email.toLowerCase(), ...window.colaboradoresSelecionados.map(c => c.email)];
    colaboradores = [...new Set(colaboradores)];

    const avatarFile = document.getElementById('editProjAvatar').files[0];
    const capaFile = document.getElementById('editProjCapa').files[0];

    // MÁGICA: Adiciona o customTags no pacote que vai pro Firebase!
    let updateData = { 
        nome, 
        descricao: desc, 
        versaoAlvo: versao, 
        colaboradores, 
        githubRepo: repo, 
        customTags: window.projetoTagsCustomizadas, 
        dataAtualizacao: new Date().toISOString() 
    };

    try {
        if (avatarFile) { updateData.avatarBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(avatarFile); }); }
        if (capaFile) { updateData.capaBase64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(capaFile); }); }

        await updateDoc(doc(db, "projetos", window.projetoAtualId), updateData);
        
        document.getElementById('titulo-workspace').innerText = nome;
        window.projetoAtualRepo = repo;
        window.projetoAtualVersaoAlvo = versao; 
        
        // Atualiza a variável global ativa para o Kanban saber que as tags mudaram
        window.tagsAtivasDoProjeto = window.projetoTagsCustomizadas; 
        
        if (updateData.capaBase64) {
            const bannerDiv = document.getElementById('project-banner');
            if (bannerDiv) bannerDiv.style.backgroundImage = `url('${updateData.capaBase64}')`;
        }
        
        closeModal('modalEditarProjeto');
        window.renderizarKanban(); // Redesenha os cards para aplicar novas cores!

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

    // No final da função window.abrirProjeto:
    window.tagsAtivasDoProjeto = [];
    getDoc(doc(db, "projetos", id)).then(snap => {
        if(snap.exists()) window.tagsAtivasDoProjeto = snap.data().customTags || [];
    });

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
        if (filtro === 'unassigned' && t.assignedTo) return;
        if (filtro !== 'all' && filtro !== 'unassigned' && t.tag !== filtro) return;

        const card = document.createElement('div');
        card.className = 'kanban-card'; card.id = t.id; card.draggable = true;
        card.ondragstart = (ev) => ev.dataTransfer.setData("text", t.id);
        card.onclick = (e) => { if(!e.target.closest('button')) window.abrirDetalhesTarefa(t.id, t); };
        
        // A MÁGICA DAS CORES DAS TAGS
        let badgeClass = `badge-${t.tag}`;
        let tagStyle = "";
        
        // Verifica se a tag da tarefa existe nas nossas tags personalizadas
        const tagCustomizada = (window.tagsAtivasDoProjeto || []).find(ct => ct.nome === t.tag);
        if (tagCustomizada) {
            badgeClass = "badge-custom";
            // 33 no final do Hex significa 20% de opacidade no fundo!
            tagStyle = `background: ${tagCustomizada.cor}33; color: ${tagCustomizada.cor}; border: 1px solid ${tagCustomizada.cor}80;`;
        }

        const ghLink = t.githubIssue ? `<span style="color:var(--primary);" title="GitHub Issue">🔗 #${t.githubIssue}</span>` : '';

        let assignedHtml = "";
        if (t.assignedTo) {
            const iniciais = t.assignedName ? t.assignedName.substring(0, 2).toUpperCase() : "??";
            const conteúdoAvatar = t.assignedAvatar ? `<img src="${t.assignedAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : iniciais;

            assignedHtml = `
                <div class="task-owner" title="Assumido por ${t.assignedName}. Clique para largar." onclick="event.stopPropagation(); window.desassumirTarefa('${t.id}')" style="cursor: pointer; background: var(--primary); color: #000; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    ${conteúdoAvatar}
                </div>`;
        } else {
            assignedHtml = `<button class="btn-assumir" onclick="event.stopPropagation(); window.assumirTarefa('${t.id}')">Assumir</button>`;
        }

        let btnApagar = '';
        let btnEditar = `<button class="icon-btn" onclick="event.stopPropagation(); window.abrirEdicaoTarefaRapida('${t.id}', '${t.titulo}', '${t.tag}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:#e0e0e0;">✏️ Editar Nome</button>`;

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
                <span class="badge ${badgeClass}" style="${tagStyle}">${t.tag.toUpperCase()}</span>
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

    window.desenharGraficosMermaid(container);
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

    if (mode === 'preview') {
        if (edit && prev) {
            let textoBruto = edit.value;
            const textoConvertido = textoBruto.replace(/https?:\/\/(www\.)?dropbox\.com\/[^\s)]+/g, (match) => {
                return window.converterLinkDireto(match);
            });
            
            let htmlGerado = marked.parse(textoConvertido);
            prev.innerHTML = window.processarTagsCustomizadas(htmlGerado);
            
            // MÁGICA 1: Salva o HTML original limpo na memória da folha
            prev.dataset.originalHtml = prev.innerHTML;

            edit.style.setProperty('display', 'none', 'important');
            prev.style.setProperty('display', 'block', 'important');
        }
        
        document.getElementById('btn-wiki-preview')?.classList.add('active');
        document.getElementById('btn-wiki-edit')?.classList.remove('active');
        
        window.desenharGraficosMermaid(prev);
        
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

        // MÁGICA 2: Avisa o banco para puxar os comentários e pintar a tela!
        if (window.wikiAtualId) window.carregarComentariosWiki(window.wikiAtualId);

    } else {
        edit.style.setProperty('display', 'block', 'important');
        prev.style.setProperty('display', 'none', 'important');
        document.getElementById('btn-wiki-edit')?.classList.add('active');
        document.getElementById('btn-wiki-preview')?.classList.remove('active');
        if (toc) toc.classList.remove('active');
    }
};

window.processarTagsCustomizadas = (html) => {
    let processado = html;

    // 1. Cores: {cor:red}texto{/cor}
    processado = processado.replace(/\{cor:(.*?)\}([\s\S]*?)\{\/cor\}/g, '<span style="color: $1;">$2</span>');

    // 2. Fontes: {font:Arial}texto{/font}
    processado = processado.replace(/\{font:(.*?)\}([\s\S]*?)\{\/font\}/g, '<span style="font-family: \'$1\';">$2</span>');

    // 3. Centralização: {center}texto{/center}
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

    // 5. MÁGICA DOS VÍDEOS: {video:LINK}
    processado = processado.replace(/\{video:(.*?)\}/g, (match, url) => {
        // A MÁGICA AQUI: Limpa qualquer tag HTML (<a>) que o marked.js tenha injetado sem querer
        let link = url.replace(/<[^>]+>/g, '').trim(); 
        
        // 5.1 YouTube
        if (link.includes('youtube.com/watch?v=')) {
            let id = link.split('v=')[1].split('&')[0];
            return `<iframe width="100%" height="450" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></iframe>`;
        } 
        else if (link.includes('youtu.be/')) {
            let id = link.split('youtu.be/')[1].split('?')[0];
            return `<iframe width="100%" height="450" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></iframe>`;
        } 
        // 5.2 Google Drive
        else if (link.includes('drive.google.com/file/d/')) {
            const fileId = link.match(/[-\w]{25,}/); 
            if (fileId) {
                return `<iframe width="100%" height="450" src="https://drive.google.com/file/d/${fileId[0]}/preview" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></iframe>`;
            }
        }
        // 5.3 Dropbox (O Truque do raw=1)
        else if (link.includes('dropbox.com')) {
            let dropLink = link.replace("dl=0", "raw=1").replace("dl=1", "raw=1");
            if (!dropLink.includes("raw=1")) {
                dropLink += dropLink.includes("?") ? "&raw=1" : "?raw=1";
            }
            return `
                <video width="100%" controls style="border-radius:12px; margin: 15px 0; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <source src="${dropLink}">
                    Seu navegador não suporta a tag de vídeo.
                </video>
            `;
        }
        // 5.4 Arquivos Genéricos
        else {
            return `
                <video width="100%" controls style="border-radius:12px; margin: 15px 0; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <source src="${link}">
                    Seu navegador não suporta a tag de vídeo.
                </video>
            `;
        }
    });

    // 6. MÁGICA DAS IMAGENS COM TAMANHO MANUAL: {img: LINK | TAMANHO}
    processado = processado.replace(/\{img:\s*([^|}]+)(?:\|\s*([^}]+))?\}/g, (match, url, tamanho) => {
        let link = url.trim();
        // Limpa lixo HTML caso o Markdown tente converter em link sozinho
        link = link.replace(/<[^>]+>/g, '').trim(); 
        
        // Se a pessoa passou o tamanho depois do | (ex: 300px, 50%), aplica!
        let sizeStyle = tamanho ? `width: ${tamanho.trim()} !important; max-height: none;` : '';

        return `<img src="${link}" class="wiki-custom-img" style="${sizeStyle}">`;
    });

    // 7. Esconder comandos de Layout para não sujarem o texto final
    processado = processado.replace(/\{width:\s*[^}]+\}/g, '');
    processado = processado.replace(/\{margin:\s*[^}]+\}/g, '');

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

// --- CRIAÇÃO INSTANTÂNEA DE ARQUIVO (AGORA PEDINDO O NOME) ---
window.novaPaginaWiki = async () => {
    if (!window.projetoAtualId) return;
    
    // 1. Pede o nome do documento logo de cara!
    const nomeDoc = prompt("Nome do novo documento:", "Novo Documento");
    
    // Se a pessoa cancelar ou deixar em branco, aborta a criação
    if (!nomeDoc || nomeDoc.trim() === "") return; 
    
    try {
        // 2. Cria o documento direto no banco com o nome escolhido
        const docRef = await addDoc(collection(db, "wiki"), {
            titulo: nomeDoc.trim(),
            conteudo: "",
            projetoId: window.projetoAtualId,
            pastaId: window.ultimaPastaSelecionada, 
            dataCriacao: new Date().toISOString()
        });
        
        // 3. Prepara a tela para a digitação
        window.wikiAtualId = docRef.id;
        
        const inputConteudo = document.getElementById('wiki-conteudo');
        if(inputConteudo) {
            inputConteudo.value = "";
            window.setWikiMode('edit');
            
            // Foca o cursor piscando direto na folha em branco
            setTimeout(() => inputConteudo.focus(), 100); 
        }
        
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
    // Só salva se houver um documento aberto
    if (window.isSavingWiki || !window.wikiAtualId) return; 

    const conteudoTexto = document.getElementById('wiki-conteudo').value;
    window.isSavingWiki = true;

    try {
        // Atualiza apenas o conteúdo e a data
        await updateDoc(doc(db, "wiki", window.wikiAtualId), {
            conteudo: conteudoTexto,
            autorUltimaModificacao: auth.currentUser.email,
            dataAtualizacao: new Date().toISOString()
        });
        
        // Feedback visual do "✓ Salvo"
        if (isAutoSave) {
            const indicador = document.getElementById('wiki-autosave-indicator');
            if (indicador) {
                indicador.style.opacity = '1';
                indicador.style.color = 'var(--primary)';
                indicador.innerText = '✓ Salvo';
                setTimeout(() => indicador.style.opacity = '0', 2000); 
            }
        }
    } catch(e) { 
        console.error("Erro ao salvar:", e); 
    } finally {
        window.isSavingWiki = false;
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

/* ==========================================================================
   WIKI - GERENCIADOR DINÂMICO DE LAYOUT DA FOLHA
   ========================================================================== */
window.atualizarLayoutFolha = () => {
    const edit = document.getElementById('wiki-conteudo');
    const prev = document.getElementById('wiki-preview-area');
    if (!edit || !prev) return;

    const texto = edit.value;

    // 1. Controle de Largura Máxima (width)
    const customWidth = texto.match(/\{width:\s*([^}]+)\}/);
    if (customWidth) {
        edit.style.setProperty('max-width', customWidth[1], 'important');
        prev.style.setProperty('max-width', customWidth[1], 'important');
    } else {
        edit.style.removeProperty('max-width');
        prev.style.removeProperty('max-width');
    }

    // 2. Controle de Margem Interna (margin / padding)
    const customMargin = texto.match(/\{margin:\s*([^}]+)\}/);
    if (customMargin) {
        edit.style.setProperty('padding', customMargin[1], 'important');
        prev.style.setProperty('padding', customMargin[1], 'important');
    } else {
        edit.style.removeProperty('padding');
        prev.style.removeProperty('padding');
    }
};

window.triggerAutoSave = () => {
    const indicador = document.getElementById('wiki-autosave-indicator');
    if (indicador) {
        indicador.style.opacity = '1';
        indicador.style.color = 'var(--text-muted)';
        indicador.innerText = '⏳ Salvando...';
    }
    
    // A MÁGICA: Estica a folha em tempo real enquanto você digita!
    window.atualizarLayoutFolha();
    
    clearTimeout(window.wikiTimeout);
    window.wikiTimeout = setTimeout(() => {
        window.salvarPaginaWiki(true);
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

    // 2. Função que desenha a árvore de verdade (Com Fantasma e Multi-Seleção)
    const construirArvore = (parentId, inTrash = false) => {
        let html = '';
        
        // --- DESENHANDO AS PASTAS ---
        if (pastasPorPai[parentId]) {
            pastasPorPai[parentId].forEach(f => {
                const isFechada = window.wikiPastasFechadas.has(f.id);
                const seta = isFechada ? '▶' : '▼';
                const classeLixo = inTrash ? 'item-apagado' : '';
                const isSelecionada = (f.id === window.ultimaPastaSelecionada);
                const classeSelecionada = isSelecionada ? 'selected' : '';

                const isMultiSelected = window.itensSelecionadosWiki.some(i => i.id === f.id);
                const classeMulti = isMultiSelected ? 'multi-selected' : '';

                // A ESTRELA AGORA VIVE NO MENU
                const isFav = window.meusFavoritosWiki.includes(f.id);
                const textoFav = isFav ? '🌟 Desfavoritar' : '⭐ Favoritar';
                const corFav = isFav ? 'color: #ffc107;' : '';

                const menuAcoes = inTrash ? '' : `
                    <div class="comment-menu-container wiki-item-actions">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            <button onclick="window.toggleFavoritoWiki(event, '${f.id}')" style="${corFav}">${textoFav}</button>
                            <button onclick="window.renomearPastaWiki(event, '${f.id}', '${f.nome.replace(/'/g, "\\'")}')">✏️ Renomear</button>
                            <button class="del" onclick="window.deletarPastaWiki(event, '${f.id}')">🗑️ Excluir Pasta</button>
                        </div>
                    </div>
                `;

                const temSubpastas = pastasPorPai[f.id] && pastasPorPai[f.id].length > 0;
                const temArquivos = arquivosPorPasta[f.id] && arquivosPorPasta[f.id].length > 0;
                let conteudoDaPasta = construirArvore(f.id, inTrash);
                
                if (!temSubpastas && !temArquivos && !inTrash) {
                    conteudoDaPasta = `<div style="padding: 10px 15px 10px 30px; color: #555; font-size: 0.75rem; font-style: italic; pointer-events: none;">📂 Pasta vazia... solte arquivos aqui.</div>`;
                }

                html += `
                    <div style="margin-top: 5px;" class="${classeLixo}">
                        <div class="wiki-folder-header ${classeSelecionada} ${classeMulti} wiki-node-item" 
                             data-node-id="${f.id}" data-node-type="folder"
                             draggable="true" 
                             ondragstart="window.dragStartWiki(event, '${f.id}', 'folder')" 
                             onclick="window.handleWikiItemClick(event, '${f.id}', 'folder', '${f.nome.replace(/'/g, "\\'")}')" 
                             ondblclick="window.togglePastaWiki(event, '${f.id}')" 
                             ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, '${f.id}')">
                            <div class="wiki-item-name" title="${f.nome}">
                                <span class="folder-toggle-icon" onclick="window.togglePastaWiki(event, '${f.id}')">${seta}</span>
                                <span>📁</span>
                                <span class="wiki-item-text">${f.nome}</span>
                            </div>
                            ${menuAcoes}
                        </div>
                        <div class="wiki-folder-content wiki-dropzone" id="folder-${f.id}" style="display: ${isFechada ? 'none' : 'block'};" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, '${f.id}')">
                            ${conteudoDaPasta}
                        </div>
                    </div>
                `;
            });
        }
        
        // --- DESENHANDO OS ARQUIVOS ---
        if (arquivosPorPasta[parentId]) {
            arquivosPorPasta[parentId].forEach(p => {
                const classeLixo = inTrash ? 'item-apagado' : '';
                const classeAtiva = (p.id === window.wikiAtualId) ? 'active' : '';
                const temNotificacao = window.cacheNotificacoes.some(n => n.contextId === p.id || n.contextId === p.id + '_note');
                const pingoHtml = temNotificacao ? '<span class="item-dot" style="flex-shrink:0;"></span>' : '';

                const isMultiSelected = window.itensSelecionadosWiki.some(i => i.id === p.id);
                const classeMulti = isMultiSelected ? 'multi-selected' : '';

                // A ESTRELA AGORA VIVE NO MENU
                const isFav = window.meusFavoritosWiki.includes(p.id);
                const textoFav = isFav ? '🌟 Desfavoritar' : '⭐ Favoritar';
                const corFav = isFav ? 'color: #ffc107;' : '';

                const menuAcoes = inTrash ? '' : `
                    <div class="comment-menu-container wiki-item-actions">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            <button onclick="window.toggleFavoritoWiki(event, '${p.id}')" style="${corFav}">${textoFav}</button>
                            <button onclick="window.renomearArquivoWikiDireto(event, '${p.id}', '${p.titulo.replace(/'/g, "\\'")}')">✏️ Renomear</button>
                            <button class="del" onclick="window.deletarArquivoWikiDireto(event, '${p.id}')">🗑️ Excluir Arquivo</button>
                        </div>
                    </div>
                `;

                html += `
                    <div class="wiki-file-item ${classeLixo} ${classeAtiva} ${classeMulti} wiki-node-item" 
                         data-node-id="${p.id}" data-node-type="file"
                         draggable="true" 
                         ondragstart="window.dragStartWiki(event, '${p.id}', 'file')" 
                         onclick="window.handleWikiItemClick(event, '${p.id}', 'file', '${p.titulo.replace(/'/g, "\\'")}')">
                        <div class="wiki-item-name" title="${p.titulo}">
                            <span>📄</span> 
                            <span class="wiki-item-text">${p.titulo}</span>
                            ${pingoHtml}
                        </div>
                        ${menuAcoes}
                    </div>
                `;
            });
        }
        return html;
    };

    let arvoreCompleta = construirArvore('root');
    let arvoreLixeira = construirArvore('trash', true); 

    let btnEsvaziar = (arvoreLixeira && window.userRole === 'admin') 
        ? `<button class="btn-primary" onclick="window.esvaziarLixeira()" style="background: transparent; color: #ff5252; border: 1px solid #ff5252; width: 100%; margin-top: 15px; font-size: 0.8rem;">🔥 Esvaziar Definitivamente</button>` 
        : '';

    // (Apague as variáveis estiloRaiz, etc. que estavam aqui)

    // MÁGICA: Controle de exibição da Lixeira
    const setaLixeira = window.lixeiraAberta ? '▼' : '▶';
    const displayLixeira = window.lixeiraAberta ? 'block' : 'none';
    const paddingLixeira = window.lixeiraAberta ? '15px' : '10px 15px';
    const margemTitulo = window.lixeiraAberta ? '10px' : '0';

    const isRootSelected = (window.ultimaPastaSelecionada === null);

    container.innerHTML = `
        <div class="wiki-root-node ${isRootSelected ? 'selected' : ''}" onclick="window.selecionarRaizWiki(event)" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'root')">
            <div class="wiki-item-name" title="Raiz do Workspace">
                <span style="width: 22px; display: inline-block; text-align: center; font-size: 0.9rem;">☁️</span>
                <span class="wiki-item-text" style="font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #888;">Workspace</span>
            </div>
        </div>

        <div class="wiki-root-children wiki-dropzone" id="folder-root" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'root')">
            ${arvoreCompleta}
        </div>

        <div class="wiki-trash-zone wiki-dropzone" id="folder-trash" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'trash')" style="padding: ${paddingLixeira};">
            <div class="wiki-trash-title" onclick="window.toggleLixeiraWiki(event)" style="cursor: pointer; display: flex; align-items: center; gap: 6px; margin-bottom: ${margemTitulo}; transition: 0.2s;">
                <span class="folder-toggle-icon" style="margin-left: 0; color: #ff5252;">${setaLixeira}</span> 
                <span>🗑️ Lixeira</span>
            </div>
            
            <div style="display: ${displayLixeira};">
                <div style="font-size: 0.75rem; color: #888; margin-bottom: 10px;">Arraste pastas e arquivos para cá.</div>
                ${arvoreLixeira}
                ${btnEsvaziar}
            </div>
        </div>
    `;
};

// --- MÁGICA DOS CLIQUES (AGORA SEM PISCAR A TELA) ---

// 1 CLIQUE: Seleciona a Pasta Comum
window.selecionarPastaWiki = (e, folderId) => {
    e.stopPropagation();
    window.ultimaPastaSelecionada = folderId;
    
    // Tira a seleção de pastas comuns E da raiz
    document.querySelectorAll('.wiki-folder-header, .wiki-root-node').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Adiciona a seleção apenas na que foi clicada
    e.currentTarget.classList.add('selected');
};

// 1 CLIQUE: Seleciona o Nó Raiz do Sistema
window.selecionarRaizWiki = (e) => {
    if (e) e.stopPropagation();
    window.ultimaPastaSelecionada = null;
    
    // Tira a seleção de todas as pastas comuns
    document.querySelectorAll('.wiki-folder-header').forEach(el => {
        el.classList.remove('selected');
    });

    // Acende a Raiz
    const rootNode = document.querySelector('.wiki-root-node');
    if (rootNode) {
        rootNode.classList.add('selected');
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
    
    // Se você tentar arrastar um item que NÃO está na sua seleção múltipla,
    // ele assume que você quer arrastar SÓ ele, e limpa o resto.
    if (!window.itensSelecionadosWiki.find(i => i.id === itemId)) {
        window.itensSelecionadosWiki = [{ id: itemId, type: type }];
        window.renderizarWikiTree();
    }
    
    // Transforma a nossa lista de itens num pacote de texto para o navegador carregar
    e.dataTransfer.setData("items", JSON.stringify(window.itensSelecionadosWiki)); 
};

window.dragOverWiki = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); };
window.dragLeaveWiki = (e) => { e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); };

window.dropWiki = async (e, folderId) => {
    e.preventDefault(); e.stopPropagation(); 
    e.currentTarget.classList.remove('drag-over');
    
    const pacote = e.dataTransfer.getData("items");
    if (!pacote) return;
    const itensArrastados = JSON.parse(pacote);

    let targetFolder = folderId;
    if (folderId === 'root') targetFolder = null;
    
    try {
        // Processa TODOS os arquivos do pacote de uma vez só!
        for (let item of itensArrastados) {
            if (item.type === 'file') {
                await updateDoc(doc(db, "wiki", item.id), { pastaId: targetFolder });
            } 
            else if (item.type === 'folder') {
                if (item.id === targetFolder) continue; // Ignora se tentar jogar a pasta nela mesma
                
                // Trava de Paradoxo (Impede de jogar a pasta pai dentro da pasta filha)
                let checkId = targetFolder;
                let isDescendant = false;
                while (checkId != null && checkId !== 'trash') {
                    if (checkId === item.id) { isDescendant = true; break; }
                    const parent = window.wikiFoldersCache.find(f => f.id === checkId);
                    checkId = parent ? parent.parentId : null;
                }
                if (isDescendant) {
                    alert("Aviso: Algumas pastas foram ignoradas para evitar o paradoxo de colocar uma pasta pai dentro da própria filha!");
                    continue;
                }

                await updateDoc(doc(db, "wiki_pastas", item.id), { parentId: targetFolder });
            }
        }
        
        // Limpa a seleção depois de soltar
        window.itensSelecionadosWiki = [];
        window.renderizarWikiTree();
        
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

// --- CRIAÇÃO DE ARQUIVO COM NOME IMEDIATO ---
window.novaPaginaWiki = async () => {
    if (!window.projetoAtualId) return;
    
    // 1. Pede o nome do documento igual à pasta faz
    const nomeDoc = prompt("Nome do novo documento:", "Novo Documento");
    
    // Se a pessoa cancelar ou deixar em branco, não cria nada
    if (!nomeDoc || nomeDoc.trim() === "") return; 
    
    try {
        // 2. Cria o documento no banco já dentro da pasta selecionada (ou na raiz)
        const docRef = await addDoc(collection(db, "wiki"), {
            titulo: nomeDoc.trim(),
            conteudo: "",
            projetoId: window.projetoAtualId,
            pastaId: window.ultimaPastaSelecionada, // Nasce onde você clicou!
            dataCriacao: new Date().toISOString(),
            autorUltimaModificacao: auth.currentUser.email
        });
        
        // 3. Define este novo arquivo como o ativo
        window.wikiAtualId = docRef.id;
        localStorage.setItem('heartkey_ultima_wiki_id', docRef.id);
        
        // 4. Prepara o editor
        const inputConteudo = document.getElementById('wiki-conteudo');
        if(inputConteudo) {
            inputConteudo.value = "";
            window.setWikiMode('edit');
            
            // UX Premium: Já coloca o cursor piscando na folha pra você
            setTimeout(() => inputConteudo.focus(), 100); 
        }
        
    } catch(e) { 
        console.error("Erro ao criar documento:", e); 
    }
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

/* ==========================================================================
   SISTEMA DE NOTAS/ALTERAÇÕES DA WIKI
   ========================================================================== */

window.abrirFeedbackWiki = () => {
    if (!window.wikiAtualId) {
        return window.mostrarToastNotificacao('Aviso', 'Abra ou crie um documento primeiro.', 'geral');
    }
    
    // A MÁGICA: Captura o texto que o usuário selecionou com o mouse na tela
    const selecao = window.getSelection().toString().trim();
    const inputBox = document.getElementById('wiki-comment-input');
    
    // Se tiver algo selecionado, ele injeta o texto formatado como citação no estilo Markdown ( > )
    if (selecao) {
        inputBox.value = `> "${selecao}"\n\n`;
    } else {
        inputBox.value = ""; // Limpa a caixa se não tiver nada
    }
    
    const docData = window.wikiCache[window.wikiAtualId];
    document.getElementById('wiki-feedback-titulo').innerText = docData ? docData.titulo : "Documento";
    
    window.carregarComentariosWiki(window.wikiAtualId);
    window.openModal('modalFeedbackWiki');
    
    // Foca na caixa de texto automaticamente
    setTimeout(() => inputBox.focus(), 100);
    
    // Apaga a bolinha de notificação do botão de comentários!
    window.limparNotificacaoItem(window.wikiAtualId + '_note');
    
    // Força a remoção visual da bolinha no botão imediatamente
    const btnComentarios = document.getElementById('btn-wiki-comments');
    if (btnComentarios) {
        const dot = btnComentarios.querySelector('.item-dot');
        if (dot) dot.remove();
    }
};

window.carregarComentariosWiki = (wikiId) => {
    const lista = document.getElementById('lista-comentarios-wiki');
    const q = query(collection(db, "comentarios_wiki"), where("wikiId", "==", wikiId), orderBy("dataCriacao", "asc"));
    
    onSnapshot(q, (snap) => {
        let abertosHtml = '';
        let resolvidosHtml = '';
        let countResolvidos = 0;

        snap.docs.forEach(d => {
            const c = d.data();
            const isMe = c.autorEmail === auth.currentUser.email;
            const isAdmin = window.userRole === 'admin';
            
            // Verifica se a nota já foi resolvida
            const isResolved = c.status === 'resolved';

            let menuHtml = '';
            // Se eu escrevi OU sou admin, posso gerenciar a nota
            if (isMe || isAdmin) {
                const btnResolve = !isResolved ? `<button onclick="window.resolverComentarioWiki('${d.id}')" style="color: #4caf50; font-weight: bold;">✅ Resolver Nota</button>` : '';
                const btnDelete = isAdmin ? `<button class="del" onclick="window.deletarComentarioWiki('${d.id}')" style="border-top: 1px solid rgba(255,255,255,0.1);">🗑️ Apagar Definitivo</button>` : '';

                menuHtml = `
                    <div class="comment-menu-container">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            ${btnResolve}
                            ${btnDelete}
                        </div>
                    </div>
                `;
            }
            
            const corBorda = isResolved ? '#4caf50' : (isMe ? 'var(--primary)' : '#ffc107');
            const opacidade = isResolved ? '0.6' : '1';
            const authorDecoration = isResolved ? 'text-decoration: line-through; opacity: 0.7;' : '';
            
            let conteudoVisual = "";

            // O Pulo do Gato: Verifica se é nota normal ou SUGESTÃO DE EDIÇÃO
            if (c.tipo === 'sugestao') {
                const textoMencoes = (c.textoNovo || "").replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>');
                const renderNovo = marked.parse(textoMencoes);
                
                conteudoVisual = `
                    <div style="background: rgba(0, 234, 255, 0.05); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; margin-top: 10px; margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; color: #ff5252; text-decoration: line-through; margin-bottom: 8px; border-bottom: 1px dashed rgba(255,82,82,0.3); padding-bottom: 8px;">
                            <strong>Remover:</strong><br> ${c.textoAntigo}
                        </div>
                        <div style="font-size: 0.85rem; color: #00eaff; margin-bottom: 0;">
                            <strong style="font-size: 0.75rem;">Adicionar:</strong><br> ${renderNovo}
                        </div>
                    </div>
                `;

                // O Botão Mágico (Só aparece se a sugestão estiver aberta)
                if (!isResolved) {
                    conteudoVisual += `<button onclick="window.aceitarSugestaoWiki('${d.id}')" class="btn-primary" style="width: 100%; padding: 8px; font-size: 0.85rem; background: #00eaff; color: #000; border: none; font-weight: bold; margin-bottom: 5px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">✨ Aceitar e Aplicar no Texto</button>`;
                }
            } else {
                const textoMencoes = (c.texto || "").replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>');
                conteudoVisual = marked.parse(textoMencoes);
            }

            const itemHtml = `
                <li class="art-comment-item ${isMe ? 'is-me' : ''}" style="border-left-color: ${corBorda}; margin-bottom: 5px; opacity: ${opacidade}; transition: 0.3s;">
                    ${menuHtml}
                    <div class="comment-top-row">
                        <span class="comment-author" style="${authorDecoration}">${c.autor} ${isResolved ? ' <span style="color:#4caf50;">✓ Resolvido</span>' : ''}</span>
                        <span class="comment-time">${new Date(c.dataCriacao).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="comment-text markdown-body" style="background:transparent!important; padding:0!important; border:none!important; box-shadow:none!important; min-height:auto; font-size:0.85rem; color: #eee;">
                        ${conteudoVisual}
                    </div>
                </li>
            `;

            // Separa os resolvidos dos abertos
            if (isResolved) {
                resolvidosHtml += itemHtml;
                countResolvidos++;
            } else {
                abertosHtml += itemHtml;
            }
        });
        
        let finalHtml = abertosHtml;

        // Se houver notas resolvidas, cria uma "gavetinha" sanfona no final
        if (countResolvidos > 0) {
            finalHtml += `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);">
                    <button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'" style="background: transparent; border: none; color: #888; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 5px; font-family: inherit; font-weight: bold; width: 100%; text-align: left;">
                        ▶ Mostrar ${countResolvidos} notas arquivadas no histórico
                    </button>
                    <ul style="display: none; list-style: none; padding: 0; flex-direction: column; gap: 5px; margin-top: 10px;">
                        ${resolvidosHtml}
                    </ul>
                </div>
            `;
        }

        lista.innerHTML = finalHtml || '<li style="color:#666; text-align:center; padding:15px;">Documento limpo! Nenhuma nota no momento.</li>';
        
        if (!window.preventWikiScroll) {
            setTimeout(() => lista.scrollTop = lista.scrollHeight, 100);
        }
        window.preventWikiScroll = false;

        // ===============================================================
        // MÁGICA DO MARCA-TEXTO (GRIFOS ANCORADOS NO DOCUMENTO)
        // ===============================================================
        const preview = document.getElementById('wiki-preview-area');
        
        // Só tenta pintar se o modo de leitura estiver ativo e tivermos o backup limpo
        if (preview && preview.dataset.originalHtml && preview.style.display !== 'none') {
            let htmlPintado = preview.dataset.originalHtml;
            
            snap.docs.forEach(d => {
                const c = d.data();
                
                // Nós SÓ grifamos notas e sugestões que AINDA ESTÃO ABERTAS!
                if (c.status !== 'resolved') {
                    
                    // Tenta achar qual foi o texto citado na nota
                    let alvo = c.textoAntigo; // Se for uma Sugestão
                    if (!alvo) {
                        // Se for uma Nota normal, garimpa a citação ( > "texto" )
                        const match = (c.texto || "").match(/^>\s*"([^"]+)"/);
                        if (match) alvo = match[1];
                    }
                    
                    // Se achou um texto válido (maior que 3 letras pra não grifar a letra "a" solta no texto todo)
                    if (alvo && alvo.length > 3) {
                        // Protege caracteres especiais da programação
                        const regexSafe = alvo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        // Cria um caçador de palavras
                        const regex = new RegExp(`(${regexSafe})`, 'g');
                        
                        // Substitui o texto puro pelo texto abraçado pela tag do Marca-Texto!
                        htmlPintado = htmlPintado.replace(regex, `<span class="wiki-highlight" onclick="window.abrirFeedbackWiki()" title="Comentário de ${c.autor}">$1</span>`);
                    }
                }
            });
            
            // Joga o HTML final pintado de amarelo na tela!
            preview.innerHTML = htmlPintado;
        }
    });
};

window.aceitarSugestaoWiki = async (id) => {
    // Essa travinha impede a barra de rolagem de pular loucamente
    window.preventWikiScroll = true; 
    
    try {
        const comSnap = await getDoc(doc(db, "comentarios_wiki", id));
        if (!comSnap.exists()) return;
        const c = comSnap.data();

        const wikiRef = doc(db, "wiki", c.wikiId);
        const wikiSnap = await getDoc(wikiRef);
        if (!wikiSnap.exists()) return;
        const w = wikiSnap.data();

        // Procura a frase exata no Markdown
        if (w.conteudo.includes(c.textoAntigo)) {
            // Substitui a primeira ocorrência do texto antigo pelo novo
            const novoConteudo = w.conteudo.replace(c.textoAntigo, c.textoNovo);
            
            // 1. Atualiza a Wiki no banco
            await updateDoc(wikiRef, { 
                conteudo: novoConteudo,
                dataAtualizacao: new Date().toISOString()
            });
            
            // 2. Resolve o comentário automaticamente
            await updateDoc(doc(db, "comentarios_wiki", id), {
                status: 'resolved',
                dataResolucao: new Date().toISOString(),
                resolvidoPor: window.obterNomeExibicao()
            });

            // 3. Atualiza a tela em tempo real!
            if (window.wikiAtualId === c.wikiId) {
                document.getElementById('wiki-conteudo').value = novoConteudo;
                window.setWikiMode('preview'); // Força a re-renderização visual e desenha o texto novo!
            }
            
            window.mostrarToastNotificacao('Mágica Feita!', 'O texto foi substituído e a nota foi resolvida.', 'geral');
        } else {
            alert("⚠️ Não foi possível encontrar o texto original no documento. Talvez alguém já tenha alterado essa parte manualmente!");
        }
    } catch (e) { console.error(e); }
};

window.salvarComentarioWiki = async (e, tipo = 'nota') => {
    if(e) e.preventDefault();
    if (!window.wikiAtualId || !auth.currentUser) return;

    const input = document.getElementById('wiki-comment-input');
    const textoRaw = input.value.trim();
    if (!textoRaw) return;

    let textoAntigo = "";
    let textoNovo = textoRaw;

    // A MÁGICA: Se for uma Sugestão, ele "fatia" o texto para descobrir o que sai e o que entra
    if (tipo === 'sugestao') {
        const match = textoRaw.match(/^>\s*"([^"]+)"/);
        if (match) {
            textoAntigo = match[1];
            textoNovo = textoRaw.replace(/^>\s*"[^"]+"\s*/, '').trim(); 
            if(!textoNovo) return alert("Digite o texto novo abaixo da citação para sugerir a troca!");
        } else {
            return alert("Para sugerir uma edição, você precisa selecionar (grifar) o texto errado no documento primeiro!");
        }
    }

    try {
        await addDoc(collection(db, "comentarios_wiki"), {
            wikiId: window.wikiAtualId,
            texto: textoRaw, // O texto cru (Markdown original)
            textoAntigo: textoAntigo, // A frase que vai sumir
            textoNovo: textoNovo, // A frase que vai entrar
            tipo: tipo, // 'nota' ou 'sugestao'
            autor: window.obterNomeExibicao(),
            autorEmail: auth.currentUser.email,
            status: 'open', 
            dataCriacao: new Date().toISOString()
        });

        // (MANTÉM O SISTEMA DE MENÇÕES @ INTÁCTO)
        const mencoes = textoRaw.match(/@([a-zA-Z0-9_À-ÿ]+)/g);
        let notificados = new Set(); 

        if (mencoes && mencoes.length > 0) {
            const snapUsers = await getDocs(collection(db, "usuarios"));
            const todosUsuarios = snapUsers.docs.map(d => ({ uid: d.data().uid, nome: d.data().nome || "", apelido: d.data().apelido || "", email: d.data().email }));

            mencoes.forEach(mencao => {
                const nomeMencao = mencao.replace('@', '').toLowerCase();
                const alvo = todosUsuarios.find(u => (u.apelido.toLowerCase() === nomeMencao) || (u.nome.split(' ')[0].toLowerCase() === nomeMencao));
                if (alvo && alvo.email !== auth.currentUser.email && !notificados.has(alvo.uid)) {
                    window.criarNotificacao(alvo.uid, 'geral', 'Você foi mencionado!', `${window.obterNomeExibicao()} te marcou em um documento.`, { abaAlvo: 'projetos', subAba: 'tab-wiki', projetoId: window.projetoAtualId, contextId: window.wikiAtualId + '_note' });
                    notificados.add(alvo.uid); 
                }
            });
        }

        const docData = window.wikiCache[window.wikiAtualId];
        if (docData && docData.autorUltimaModificacao && docData.autorUltimaModificacao !== auth.currentUser.email) {
            const qUser = query(collection(db, "usuarios"), where("email", "==", docData.autorUltimaModificacao));
            const userSnap = await getDocs(qUser);
            if (!userSnap.empty) {
                const donoUid = userSnap.docs[0].data().uid;
                if (!notificados.has(donoUid)) {
                    window.criarNotificacao(donoUid, 'geral', 'Nota no Documento', `${window.obterNomeExibicao()} deixou uma nota/sugestão no seu documento.`, { abaAlvo: 'projetos', subAba: 'tab-wiki', projetoId: window.projetoAtualId, contextId: window.wikiAtualId + '_note' });
                }
            }
        }

        input.value = "";
        document.getElementById('mention-suggestions').style.display = 'none';
    } catch(err) { console.error(err); }
};

window.deletarComentarioWiki = async (id) => {
    if (confirm("Apagar esta nota?")) await deleteDoc(doc(db, "comentarios_wiki", id));
};

/* ==========================================================================
   WIKI - AUTOCOMPLETAR MENÇÕES (@)
   ========================================================================== */
window.listaUsuariosEquipe = []; // Guarda a equipe na memória para não gastar o banco

// Espião do Teclado
setTimeout(() => { // Timeout rápido só pra garantir que o HTML já carregou
    const textarea = document.getElementById('wiki-comment-input');
    if (!textarea) return;

    textarea.addEventListener('input', async (e) => {
        const sugestoesBox = document.getElementById('mention-suggestions');
        if (!sugestoesBox) return;

        const cursor = textarea.selectionStart;
        const textToCursor = textarea.value.substring(0, cursor);
        
        // Descobre qual foi a última palavra digitada antes do cursor
        const palavras = textToCursor.split(/[\s\n]/);
        const ultimaPalavra = palavras[palavras.length - 1];

        // Se a palavra começar com @, ATIVA O RADAR!
        if (ultimaPalavra.startsWith('@')) {
            
            // Carrega a equipe do banco só na primeira vez que tentar usar o @
            if (window.listaUsuariosEquipe.length === 0) {
                const snap = await getDocs(collection(db, "usuarios"));
                window.listaUsuariosEquipe = snap.docs.map(d => ({
                    apelido: d.data().apelido || d.data().nome.split(' ')[0], // Prioriza apelido
                    nomeFull: d.data().nome
                }));
            }

            const termo = ultimaPalavra.substring(1).toLowerCase(); // Tira o @ para pesquisar
            
            // Filtra quem bate com as letras que você digitou
            const matches = window.listaUsuariosEquipe.filter(u => 
                u.apelido.toLowerCase().includes(termo) || 
                u.nomeFull.toLowerCase().includes(termo)
            );

            // Desenha a caixinha flutuante com os resultados
            if (matches.length > 0) {
                sugestoesBox.innerHTML = matches.map(u => 
                    `<li onmousedown="window.inserirMencao('${u.apelido}', ${cursor}, '${ultimaPalavra}')" style="padding: 10px 15px; cursor: pointer; color: #fff; font-size: 0.85rem; transition: 0.2s; border-bottom: 1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='var(--primary)'; this.style.color='#000';" onmouseout="this.style.background='transparent'; this.style.color='#fff';">
                        <strong style="font-size: 0.95rem;">@${u.apelido}</strong> <br>
                        <span style="font-size: 0.65rem; opacity: 0.7;">${u.nomeFull}</span>
                    </li>`
                ).join('');
                sugestoesBox.style.display = 'block';
            } else {
                sugestoesBox.style.display = 'none'; // Não achou ninguém
            }
        } else {
            sugestoesBox.style.display = 'none'; // Esconde se apagou o @ ou deu espaço
        }
    });
}, 1000);

// Ação de clicar no nome da lista
window.inserirMencao = (apelido, cursorPosition, palavraDigitada) => {
    const textarea = document.getElementById('wiki-comment-input');
    const textoInteiro = textarea.value;
    
    // Descobre onde a palavra defeituosa (ex: @leor) começou
    const inicioPalavra = cursorPosition - palavraDigitada.length;
    
    // Pica o texto no meio, arranca o termo que você digitou, e cola o @Apelido perfeito!
    const textoAntes = textoInteiro.substring(0, inicioPalavra);
    const textoDepois = textoInteiro.substring(cursorPosition);
    
    textarea.value = textoAntes + '@' + apelido + ' ' + textoDepois;
    
    // Esconde a caixinha e joga você de volta pro texto
    document.getElementById('mention-suggestions').style.display = 'none';
    textarea.focus();
    
    // Joga o cursor do mouse logo depois do espaço do nome inserido pra você continuar digitando
    const novaPosicao = inicioPalavra + apelido.length + 2; 
    textarea.setSelectionRange(novaPosicao, novaPosicao);
};


/* ==========================================================================
   SISTEMA DE TAREFAS - ASSUMIR E DESASSUMIR
   ================================================================== */

window.assumirTarefa = async (taskId) => {
    if (!auth.currentUser) return;
    
    const nomeUser = window.obterNomeExibicao();

    try {
        await updateDoc(doc(db, "tarefas", taskId), {
            assignedTo: auth.currentUser.uid,
            assignedName: nomeUser,
            assignedAvatar: window.meuAvatar || null, // <--- AGORA SALVA A FOTO NA TAREFA
            status: 'doing'
        });
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
    if (!auth.currentUser) return;
    const titulo = prompt("Título do Link:");
    if (!titulo) return;
    const url = prompt("URL (http://...):");
    
    if (titulo && url) {
        await addDoc(collection(db, "war_room_links"), { 
            titulo, 
            url,
            autorEmail: auth.currentUser.email // MÁGICA 1: Salvando o dono!
        });
    }
};

window.editarLinkWarRoom = async (id, tituloAtual, urlAtual) => {
    const novoTitulo = prompt("Editar Título:", tituloAtual);
    if (!novoTitulo || novoTitulo.trim() === "") return;
    const novaUrl = prompt("Editar URL (http://...):", urlAtual);
    if (!novaUrl || novaUrl.trim() === "") return;

    try {
        await updateDoc(doc(db, "war_room_links", id), {
            titulo: novoTitulo.trim(),
            url: novaUrl.trim()
        });
    } catch(e) { console.error("Erro ao editar link:", e); }
};

window.deletarLinkWarRoom = async (id) => {
    if (confirm("Remover este link do arsenal?")) {
        try { await deleteDoc(doc(db, "war_room_links", id)); } 
        catch (e) { console.error(e); }
    }
};

window.iniciarArsenalWarRoom = () => {
    const container = document.getElementById('war-links-container');
    onSnapshot(collection(db, "war_room_links"), (snap) => {
        if(!container || !auth.currentUser) return;
        container.innerHTML = "";
        
        snap.forEach(docSnap => {
            const l = docSnap.data();
            const id = docSnap.id;
            
            // MÁGICA 2: Verifica se sou o dono ou o Admin para liberar os botões
            const isDono = l.autorEmail === auth.currentUser.email;
            const isAdmin = window.userRole === 'admin' || window.userRole === 'gerente';
            
            let controlesHtml = '';
            if (isDono || isAdmin) {
                controlesHtml = `
                    <div style="display:flex; gap: 4px;">
                        <button onclick="event.preventDefault(); editarLinkWarRoom('${id}', '${l.titulo.replace(/'/g, "\\'")}', '${l.url}')" style="background:none; border:none; color:var(--primary); cursor:pointer; padding:5px; font-size:0.9rem; opacity:0.6; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Editar">✏️</button>
                        <button onclick="event.preventDefault(); deletarLinkWarRoom('${id}')" style="background:none; border:none; color:#ff5252; cursor:pointer; padding:5px; font-size:1rem; opacity:0.6; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Excluir">×</button>
                    </div>
                `;
            }

            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:5px; width:100%;">
                    <a href="${l.url}" target="_blank" class="war-link-item" style="flex:1;">
                        <span style="font-size: 1.2rem;">🔗</span> 
                        <div><strong>${l.titulo}</strong><br><span style="font-size:0.7rem; color:#888;">Recurso Externo</span></div>
                    </a>
                    ${controlesHtml}
                </div>
            `;
        });
    });
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
            window.desenharGraficosMermaid(prev);
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
            
            // Preenche os campos do formulário
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
            const bannerEstilo = u.bgTema ? `background-image: url('${u.bgTema}')` : 'background: #2a2a2d';
            
            // CORREÇÃO AQUI: Definindo a variável avatarHtml
            const avatarHtml = u.avatarBase64 
                ? `<img src="${u.avatarBase64}" alt="Avatar">` 
                : window.obterNomeExibicao().substring(0, 2).toUpperCase();

            const textoNomeFicha = u.apelido ? `${u.nome.split(' ')[0]} <span style="color:var(--primary);">"${u.apelido}"</span>` : u.nome.split(' ')[0];

            // Badges logic...
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

            const menu3PontosPerfil = `
                <div style="position:absolute; top: 15px; right: 15px; z-index: 10;">
                    <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.5rem; color:#fff; background: rgba(0,0,0,0.5); width: 35px; height: 35px; border-radius: 8px; display:flex; align-items:center; justify-content:center; padding-bottom: 5px; border: 1px solid rgba(255,255,255,0.2);">⋮</button>
                    <div class="dropdown-content" style="right: 0; top: 45px; min-width: 180px;">
                        <button type="button" class="icon-btn" onclick="openModal('modalConfigPerfil'); document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));" style="font-size:0.85rem; text-align:left; width:100%; padding:12px; color:#fff;">⚙️ Configurar Perfil</button>
                    </div>
                </div>
            `;

            card.innerHTML = `
                <div class="profile-card-container">
                    <div class="profile-banner" style="${bannerEstilo}">
                        ${menu3PontosPerfil}
                        <div class="profile-avatar-wrapper">
                            <div class="profile-avatar">${avatarHtml}</div>
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
                        <div class="xp-bar-container"><div class="xp-bar-fill" style="width: ${porcentagem}%;"></div></div>
                        <div class="xp-text">${progressoXP} / ${metaXP} XP pro Nível ${level + 1}</div>
                        <div class="profile-stats-grid">
                            <div class="stat-box"><div class="value">${tasksFeitas}</div><div class="label">Tarefas Feitas</div></div>
                            <div class="stat-box"><div class="value">${pomodoros}</div><div class="label">Pomodoros</div></div>
                            <div class="stat-box" style="border-color: ${classeInfo.cor}; background: rgba(0,0,0,0.2);"><div class="value" style="color: ${classeInfo.cor};">${xp}</div><div class="label">XP Total</div></div>
                        </div>
                        <div class="badges-container">
                            <div class="badges-title">Estante de Conquistas</div>
                            <div class="badges-grid">${badgesHtml}</div>
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

// --- REDIMENSIONAR E COMPRIMIR IMAGEM ---
window.comprimirImagem = (file, maxWidth, quality) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                if (scale < 1) {
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Transforma em JPEG comprimido (0.7 = 70% de qualidade)
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
};

window.salvarPreferencias = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processando Imagens...";

    const nome = document.getElementById('user-nome').value.trim();
    const apelido = document.getElementById('user-apelido').value.trim();
    const especialidade = document.getElementById('user-specialty').value;
    const corTema = document.getElementById('theme-color').value;
    const modoTema = document.getElementById('theme-mode').value;
    const opacidadeTema = document.getElementById('theme-opacity').value;

    // Arquivos
    const avatarFile = document.getElementById('user-avatar-file').files[0];
    const bgFile = document.getElementById('theme-bg-file').files[0];

    try {
        const upd = { 
            nome, apelido, especialidade, 
            corTema, modoTema, opacidadeTema: parseFloat(opacidadeTema) 
        };

        // Comprime o Avatar (Pequeno: 200px)
        if (avatarFile) {
            upd.avatarBase64 = await window.comprimirImagem(avatarFile, 200, 0.8);
        }

        // Comprime o Wallpaper (Grande: 1280px)
        if (bgFile) {
            upd.bgTema = await window.comprimirImagem(bgFile, 1280, 0.7);
        }

        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), upd);
        
        // Aplica o tema na hora
        window.aplicarTema(upd.corTema, upd.bgTema, upd.modoTema, upd.opacidadeTema);
        window.closeModal('modalConfigPerfil');
        window.mostrarToastNotificacao("Perfil", "Alterações salvas com sucesso!", "geral");
        
    } catch (err) { 
        console.error(err);
        alert("Erro ao salvar: O arquivo ainda está muito grande. Tente uma imagem menor."); 
    }

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

// --- LÓGICA DO MASTER PLAYER (UNIFICADO: RÁDIO + PROJETOS) ---
window.audioIdAtualMestre = null;
window.fonteMidiaAtual = null; // Sabe se está tocando 'radio' ou 'projeto'

// Atualiza o player flutuante com os dados de qualquer áudio
window.sincronizarComMaster = (id, titulo, subtitulo, tipo = 'projeto') => {
    window.fonteMidiaAtual = tipo;
    window.audioIdAtualMestre = id;
    
    const player = document.getElementById('master-player-float');
    document.getElementById('master-player-title').innerText = titulo;
    document.getElementById('master-player-subtitle').innerText = subtitulo;
    
    player.classList.add('active'); // Pula na tela
};

// Botão Central de Play/Pause da barra flutuante
window.togglePlayMaster = () => {
    if (window.fonteMidiaAtual === 'radio') {
        const masterBtn = document.getElementById('master-play-icon');
        if (window.playerRadio.paused) {
            window.playerRadio.play();
            masterBtn.innerText = "⏸";
        } else {
            window.playerRadio.pause();
            masterBtn.innerText = "▶";
        }
    } else if (window.fonteMidiaAtual === 'projeto' && window.audioIdAtualMestre) {
        window.togglePlayAudio(window.audioIdAtualMestre);
    }
};

// Controla o volume de TUDO (Rádio e Projetos)
window.ajustarVolumeMaster = (valor) => {
    // Abaixa das músicas dos projetos
    document.querySelectorAll('audio').forEach(a => a.volume = valor);
    // Abaixa da rádio global
    if (window.playerRadio) window.playerRadio.volume = valor;
    // Salva preferência
    localStorage.setItem('hub_master_volume', valor); 
};

// Fechar no "X"
window.fecharPlayerMestre = () => {
    if (window.fonteMidiaAtual === 'radio') {
        window.playerRadio.pause();
        const status = document.getElementById('radio-status');
        if(status) status.innerText = 'Offline';
    } 
    else if (window.fonteMidiaAtual === 'projeto' && window.audioIdAtualMestre) {
        const audio = document.getElementById(`audio-elemento-${window.audioIdAtualMestre}`);
        if(audio) audio.pause();
        const btn = document.getElementById(`btn-play-${window.audioIdAtualMestre}`);
        if(btn) btn.innerText = "▶";
    }
    
    document.getElementById('master-player-float').classList.remove('active');
    document.getElementById('master-play-icon').innerText = "▶";
    window.fonteMidiaAtual = null;
    window.audioIdAtualMestre = null;
};


// 3. A MÁGICA DO PLAY/PAUSE DOS PROJETOS (Respeitando a Rádio)
window.togglePlayAudio = async (id) => {
    const audio = document.getElementById(`audio-elemento-${id}`);
    const btn = document.getElementById(`btn-play-${id}`); 
    const masterBtn = document.getElementById('master-play-icon');
    const card = window.audiosCache.find(a => a.id === id);
    
    if (!audio || !card) return;

    // Se a rádio estiver tocando, dá um "Cala a boca" nela para você poder ouvir o efeito sonoro!
    if (window.fonteMidiaAtual === 'radio' && !window.playerRadio.paused) {
        window.playerRadio.pause();
        const status = document.getElementById('radio-status');
        if(status) status.innerText = 'Pausado pelo Projeto';
    }

    // Avisa o Master Player que agora quem manda é a música do projeto
    window.sincronizarComMaster(id, card.titulo, `${card.tag} | ${card.bpm} BPM`, 'projeto');

    if (audio.networkState === 3) {
        return alert("Ops! O servidor deste link bloqueou a reprodução (Erro de CORS/Permissão).");
    }

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
            console.error("Erro real do player:", erro);
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

// --- CARD COM BOTÃO DE LER MAIS ---
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

// --- POPUP GIGANTE DE LEITURA (Reaproveitando o Modal de Tarefa) ---
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

// --- XP AO CRIAR IDEIA (+15 XP) ---
window.salvarIdeiaBrainstorm = async (e) => {
    e.preventDefault();
    if (!window.projetoAtualId) return;

    const titulo = document.getElementById('brainTitulo')?.value;
    const desc = document.getElementById('brainDesc')?.value;
    const tag = document.getElementById('brainTag')?.value;

    if (!titulo || !desc) return alert("Preencha título e descrição.");

    const dados = {
        titulo, descricao: desc, tag,
        projetoId: window.projetoAtualId, autor: window.obterNomeExibicao(), autorId: auth.currentUser.uid, dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.ideiaEditandoId) {
            await updateDoc(doc(db, "brainstorm_ideias", window.ideiaEditandoId), dados);
            window.ideiaEditandoId = null;
        } else {
            dados.votos = []; dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "brainstorm_ideias"), dados);
            
            // MÁGICA DA GAMIFICAÇÃO: Dar XP por colaborar!
            await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { xp: increment(15) });
            window.mostrarToastNotificacao("Gênio da Lâmpada", "+15 XP por adicionar uma ideia nova!", "geral");
        }
        
        window.closeModal('modalNovaIdeia');
        if (window.projetoAtualId === "global" && window.projetoAtualIdBackup) {
            window.projetoAtualId = window.projetoAtualIdBackup; window.projetoAtualIdBackup = null;
        }
    } catch(err) { console.error(err); }
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

// --- XP AO RECEBER VOTO (+2 XP) ---
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

// 3. O PLAYER DA RÁDIO (Agora integrado ao Master Player)
window.iniciarRadioFrequencia = async () => {
    const config = window.radioConfigGlobal;
    
    if (!config.playlist || config.playlist.trim() === "") {
        return alert("O Admin ainda não configurou a playlist global.");
    }

    // Se tiver um áudio de projeto tocando, a rádio chega e desliga ele educadamente
    if (window.audioAtualExecucao) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}`);
        if(audioAntigo) audioAntigo.pause();
        const btnAntigo = document.getElementById(`btn-play-${window.audioAtualExecucao}`);
        if(btnAntigo) btnAntigo.innerText = "▶";
        window.audioAtualExecucao = null;
    }

    const links = config.playlist.split('\n').filter(l => l.trim() !== "");
    const linkSorteado = links[Math.floor(Math.random() * links.length)];

    const urlFinal = window.converterLinkDireto(linkSorteado);
    window.playerRadio.src = urlFinal;
    
    try {
        await window.playerRadio.play();
        
        const status = document.getElementById('radio-status');
        if(status) {
            status.innerText = `📻 Sintonizado na HeartKey`;
            status.style.color = "var(--primary)";
        }

        // Manda os dados para a barra flutuante no rodapé!
        window.sincronizarComMaster('radio', '📻 Rádio HeartKey', 'Transmissão Global do Estúdio', 'radio');
        document.getElementById('master-play-icon').innerText = "⏸";

    } catch (e) { console.error("Erro ao tocar rádio:", e); }

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

    if (link.includes("dropbox.com")) {
        // 1. Troca o domínio para o de conteúdo direto
        link = link.replace("www.dropbox.com", "dl.dropboxusercontent.com");
        
        // 2. MÁGICA: Remove parâmetros inúteis (dl=0, st=...) mas MANTÉM o rlkey
        // Se não fizermos isso, o Dropbox recusa a conexão
        const urlObj = new URL(link);
        const rlkey = urlObj.searchParams.get("rlkey");
        
        // Limpa todos os parâmetros e reconstrói apenas com o necessário
        link = link.split('?')[0];
        if (rlkey) {
            link += `?rlkey=${rlkey}`;
        }
        return link;
    }
    
    if (link.includes("drive.google.com/file/d/")) {
        const fileId = link.match(/[-\w]{25,}/);
        if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
    }

    return link;
};


// 1. Carrega os integrantes em tempo real
window.carregarBarraIntegrantes = () => {
    const container = document.getElementById('sidebar-integrantes');
    if (!container) return;

    onSnapshot(collection(db, "usuarios"), (snap) => {
        const agora = new Date();
        container.innerHTML = snap.docs.map(docSnap => {
            const u = docSnap.data();
            const iniciais = u.nome ? u.nome.substring(0,2).toUpperCase() : "??";
            
            // Lógica de Online: Se foi visto nos últimos 5 minutos
            const ultimoVisto = u.ultimoVisto ? new Date(u.ultimoVisto) : new Date(0);
            const isOnline = (agora - ultimoVisto) < (5 * 60 * 1000);
            
            const avatarHtml = u.avatarBase64 
                ? `<img src="${u.avatarBase64}">` 
                : iniciais;

            return `
                <div class="member-item" onclick="window.verDetalhesIntegrante('${docSnap.id}')">
                    <div class="member-avatar-mini">
                        ${avatarHtml}
                        <div class="status-indicator ${isOnline ? 'online' : ''}"></div>
                    </div>
                    <span class="member-name-tag">${u.apelido || u.nome.split(' ')[0]}</span>
                </div>
            `;
        }).join('');
    });
};

// 2. Mostra o mini-perfil flutuante
window.verDetalhesIntegrante = async (uid) => {
    const userSnap = await getDoc(doc(db, "usuarios", uid));
    if (!userSnap.exists()) return;

    const u = userSnap.data();
    const painel = document.getElementById('card-perfil-flutuante');
    const conteudo = document.getElementById('conteudo-perfil-flutuante');

    // 1. Cálculos de RPG (Nível e Classe)
    const xp = u.xp || 0;
    const tasksFeitas = u.tasksFeitas || 0;
    const pomodoros = u.pomodoros || 0;
    const stats = u.stats || {};
    const level = Math.floor(Math.sqrt(xp / 10)) + 1;
    const classeInfo = window.calcularClasseRPG(stats);

    // 2. Lógica de Insígnias (Igual ao Perfil Principal)
    const badges = [
        { nome: 'Primeiro Sangue', desc: 'Ganhou seu primeiro XP no Hub.', icone: '🩸', unlocked: xp > 0 },
        { nome: 'Senhor do Tempo', desc: 'Completou 10 ciclos de Pomodoro.', icone: '⏳', unlocked: pomodoros >= 10 },
        { nome: 'O Ferreiro', desc: 'Moveu 20 tarefas para Feito.', icone: '🔨', unlocked: tasksFeitas >= 20 },
        { nome: 'Exterminador', desc: 'Esmagou 5 Bugs no Kanban.', icone: '🐛', unlocked: (stats.bug || 0) >= 5 },
        { nome: 'Alma Criativa', desc: 'Entregou 5 tarefas de Arte ou Áudio.', icone: '🎨', unlocked: ((stats.art || 0) + (stats.audio || 0)) >= 5 },
        { nome: 'Veterano', desc: 'Alcançou o Nível 10.', icone: '👑', unlocked: level >= 10 }
    ];

    const badgesHtml = badges.map(b => {
        const classe = b.unlocked ? 'unlocked' : 'locked';
        const tooltip = b.unlocked ? `${b.nome} (Conquistada)` : `Bloqueada: ${b.desc}`;
        // Reduzi um pouco o tamanho das medalhas para caber no card flutuante (40px)
        return `<div class="badge-medal ${classe}" data-tooltip="${tooltip}" style="width:40px; height:40px; font-size:1.2rem;">${b.icone}</div>`;
    }).join('');

    // 3. Montagem do HTML do Card
    conteudo.innerHTML = `
        <div style="width:100%; height:80px; background-image: url('${u.bgTema || ''}'); background-size:cover; background-color:#222; border-bottom: 1px solid var(--border-color);"></div>
        <div style="padding: 20px; margin-top: -40px;">
            <div class="profile-avatar" style="width:70px; height:70px; font-size:1.5rem; border-width:3px; position:relative;">
                ${u.avatarBase64 ? `<img src="${u.avatarBase64}">` : u.nome.substring(0,2).toUpperCase()}
            </div>
            <h3 style="margin-top:10px; color:#fff; font-size: 1.1rem;">${u.nome}</h3>
            <p style="color:${classeInfo.cor}; font-size:0.8rem; font-weight:bold;">Lv.${level} ${classeInfo.nome}</p>
            
            <div style="margin-top:15px; font-size:0.85rem; color:#aaa; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div class="stat-box" style="padding:8px; background:rgba(255,255,255,0.02);">
                    <div style="font-size:1rem; color:#fff; font-weight:bold;">${tasksFeitas}</div>
                    <div style="font-size:0.6rem; text-transform:uppercase; color:#666;">Tarefas</div>
                </div>
                <div class="stat-box" style="padding:8px; background:rgba(255,255,255,0.02);">
                    <div style="font-size:1rem; color:#fff; font-weight:bold;">${pomodoros}</div>
                    <div style="font-size:0.6rem; text-transform:uppercase; color:#666;">Pomodoros</div>
                </div>
            </div>

            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size:0.65rem; color:#666; text-transform:uppercase; font-weight:bold; margin-bottom:10px; text-align:center;">Insígnias Conquistadas</div>
                <div class="badges-grid" style="grid-template-columns: repeat(auto-fit, minmax(40px, 1fr)); gap: 8px;">
                    ${badgesHtml}
                </div>
            </div>

            <div style="text-align:center; margin-top:15px;">
                <span style="color:#444; font-size:0.65rem;">Visto por último: ${new Date(u.ultimoVisto).toLocaleTimeString()}</span>
            </div>
        </div>
    `;

    painel.classList.add('active');
};

window.irParaAba = (targetId) => {
    // 1. Procura o botão correspondente no menu (se existir) para dar o visual de 'ativo'
    const btn = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    
    // 2. Remove a classe 'active' de todos os botões e seções
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));

    // 3. Ativa a aba alvo
    const section = document.getElementById(targetId);
    if (section) {
        section.classList.add('active');
    }

    // 4. Se encontrou um botão visível, acende ele. Se não (como no caso do perfil), tudo bem.
    if (btn) btn.classList.add('active');

    // 5. Rola a tela para o topo
    document.querySelector('.content-area').scrollTop = 0;
};

/* ==========================================================================
   WIKI - BOTÃO FANTASMA FLUTUANTE (NOTION STYLE)
   ========================================================================== */

// 1. O Olheiro: Fica vigiando o mouse quando você solta o clique
document.addEventListener('mouseup', () => {
    const previewArea = document.getElementById('wiki-preview-area');
    const floatingBtn = document.getElementById('floating-comment-btn');
    
    // Se a Wiki não estiver aberta ou o botão não existir, ignora
    if (!previewArea || !floatingBtn || previewArea.style.display === 'none') {
        if(floatingBtn) floatingBtn.style.display = 'none';
        return;
    }

    const selecao = window.getSelection();
    const texto = selecao.toString().trim();

    // Se a pessoa selecionou algo válido E a seleção está DENTRO da folha da Wiki
    if (texto.length > 0 && previewArea.contains(selecao.anchorNode)) {
        const range = selecao.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Faz a matemática para colocar o botão exatamente em cima do texto grifado!
        floatingBtn.style.display = 'flex';
        floatingBtn.style.top = `${rect.top - 45}px`; 
        floatingBtn.style.left = `${rect.left + (rect.width / 2) - 25}px`;
        
        // Uma animaçãozinha de pulo pra ficar charmoso
        floatingBtn.style.transform = 'scale(0.8)';
        setTimeout(() => floatingBtn.style.transform = 'scale(1)', 50);
        
        // Salva o texto no botão para usarmos depois
        window.textoFantasma = texto;
    } else {
        // Se clicou no vazio, esconde o botão
        floatingBtn.style.display = 'none';
        window.textoFantasma = "";
    }
});

// 2. A Ação: O que acontece quando você clica no botão flutuante
window.acionarComentarioFantasma = () => {
    const floatingBtn = document.getElementById('floating-comment-btn');
    const inputBox = document.getElementById('wiki-comment-input');
    
    if (!window.wikiAtualId) return;

    // Injeta a citação direto na caixa de texto
    if (window.textoFantasma) {
        inputBox.value = `> "${window.textoFantasma}"\n\n`;
    }

    const docData = window.wikiCache[window.wikiAtualId];
    document.getElementById('wiki-feedback-titulo').innerText = docData ? docData.titulo : "Documento";
    
    // Abre o modal de notas
    window.carregarComentariosWiki(window.wikiAtualId);
    window.openModal('modalFeedbackWiki');
    
    // Limpa a seleção e esconde o botão fantasma
    window.getSelection().removeAllRanges();
    floatingBtn.style.display = 'none';
    
    // Foca na caixa de texto para a pessoa só começar a digitar
    setTimeout(() => inputBox.focus(), 100);
};

/* ==========================================================================
   WIKI - GESTÃO DIRETA DA ÁRVORE (RENOMEAR / EXCLUIR)
   ========================================================================== */

window.renomearArquivoWikiDireto = async (e, id, nomeAtual) => {
    e.stopPropagation(); // Impede de abrir o arquivo ao clicar no botão
    
    const novoNome = prompt("Renomear documento para:", nomeAtual);
    
    if (novoNome && novoNome.trim() !== "" && novoNome !== nomeAtual) {
        try {
            await updateDoc(doc(db, "wiki", id), { 
                titulo: novoNome.trim(),
                dataAtualizacao: new Date().toISOString()
            });
            
            // Se o arquivo renomeado for o que está aberto na tela, atualiza o título grande lá no topo também!
            if (window.wikiAtualId === id) {
                const tituloInput = document.getElementById('wiki-titulo');
                if(tituloInput) tituloInput.value = novoNome.trim();
            }
            
        } catch(err) { 
            console.error("Erro ao renomear arquivo:", err); 
            alert("Erro ao renomear. Tente novamente.");
        }
    }
};

window.deletarArquivoWikiDireto = async (e, id) => {
    e.stopPropagation(); // Impede de abrir o arquivo
    
    if (confirm("Mover este arquivo para a lixeira?")) {
        try {
            await updateDoc(doc(db, "wiki", id), { 
                pastaId: 'trash', // Joga para a lixeira ao invés de apagar de vez
                dataAtualizacao: new Date().toISOString()
            });
            
            // Se eu apaguei o arquivo que estava lendo, limpa a tela para eu não editar um fantasma
            if (window.wikiAtualId === id) {
                window.fecharSessaoWiki();
            }
            
        } catch(err) { 
            console.error("Erro ao excluir arquivo:", err); 
        }
    }
};

/* ==========================================================================
   WIKI - GESTOR DE CLIQUES (SHIFT RANGE, CTRL E TRIPLO CLIQUE)
   ========================================================================== */
window.itensSelecionadosWiki = []; 
window.ultimoClicadoId = null; // A "Âncora" para calcular o meio do caminho

window.handleWikiItemClick = (e, id, tipo, nomeAtual) => {
    
    // 1. SELEÇÃO MÚLTIPLA (Shift ou Ctrl)
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation(); 

        // LÓGICA DO SHIFT: O Pulo do Gato (Seleção em Fileira)
        if (e.shiftKey && window.ultimoClicadoId) {
            // Busca literalmente TODOS os arquivos e pastas que estão pintados na tela do painel
            const nodes = Array.from(document.querySelectorAll('.wiki-node-item'));
            
            const startIndex = nodes.findIndex(n => n.getAttribute('data-node-id') === window.ultimoClicadoId);
            const endIndex = nodes.findIndex(n => n.getAttribute('data-node-id') === id);

            if (startIndex !== -1 && endIndex !== -1) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);

                // Passa o rodo: Adiciona todo mundo que estiver entre o Arquivo A e o Arquivo B
                for (let i = start; i <= end; i++) {
                    const nId = nodes[i].getAttribute('data-node-id');
                    const nType = nodes[i].getAttribute('data-node-type');
                    if (!window.itensSelecionadosWiki.find(item => item.id === nId)) {
                        window.itensSelecionadosWiki.push({ id: nId, type: nType });
                    }
                }
                window.renderizarWikiTree();
                return;
            }
        }

        // LÓGICA DO CTRL: Liga e desliga a seleção individual (como já era)
        const index = window.itensSelecionadosWiki.findIndex(i => i.id === id);
        if (index > -1) window.itensSelecionadosWiki.splice(index, 1);
        else window.itensSelecionadosWiki.push({ id: id, type: tipo });

        window.ultimoClicadoId = id; // Define este como a nova âncora pro próximo Shift
        window.renderizarWikiTree();
        return;
    }

    // 2. CLIQUE SIMPLES NORMAL
    if (e.detail === 1) {
        window.itensSelecionadosWiki = [{ id: id, type: tipo }];
        window.ultimoClicadoId = id; // Define a âncora principal!
        
        if (tipo === 'folder') window.selecionarPastaWiki(e, id);
        else window.abrirWiki(id);
        
        window.renderizarWikiTree();
    } 
    // 3. TRIPLO CLIQUE (Renomear)
    else if (e.detail === 3) {
        e.stopPropagation();
        if (tipo === 'folder') window.renomearPastaWiki(e, id, nomeAtual);
        else window.renomearArquivoWikiDireto(e, id, nomeAtual);
    }
};

/* ==========================================================================
   WIKI - GESTÃO DA LIXEIRA COLAPSÁVEL
   ========================================================================== */
// A lixeira nasce fechada por padrão
window.lixeiraAberta = false;

window.toggleLixeiraWiki = (e) => {
    if (e) e.stopPropagation();
    window.lixeiraAberta = !window.lixeiraAberta;
    window.renderizarWikiTree(); // Redesenha a tela instantaneamente
};

/* ==========================================================================
   WIKI - ATALHOS DE TECLADO (PRO FLOW)
   ========================================================================== */
document.addEventListener('keydown', (e) => {
    // 1. Ignora se a pessoa estiver digitando dentro de um input ou na folha da Wiki
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    // 2. ATALHO: F2 para Renomear
    if (e.key === 'F2') {
        e.preventDefault(); // Impede o navegador de tentar fazer outra coisa
        
        // Se tem uma pasta selecionada (acesa em verde neon)
        if (window.ultimaPastaSelecionada && window.ultimaPastaSelecionada !== 'root') {
            const pasta = window.wikiFoldersCache.find(p => p.id === window.ultimaPastaSelecionada);
            if (pasta) window.renomearPastaWiki(e, pasta.id, pasta.nome);
        } 
        // Se não tem pasta, mas tem um arquivo aberto lendo no momento
        else if (window.wikiAtualId) {
            const arquivo = window.wikiPagesCache.find(p => p.id === window.wikiAtualId);
            if (arquivo) window.renomearArquivoWikiDireto(e, arquivo.id, arquivo.titulo);
        }
    }
});

/* ==========================================================================
   SISTEMA DE FAVORITOS E ATALHOS NO DASHBOARD
   ========================================================================== */
window.meusFavoritosWiki = [];

// 1. Escuta silenciosa: Puxa seus favoritos do banco assim que você loga
setTimeout(() => {
    if(auth.currentUser) {
        onSnapshot(doc(db, "usuarios", auth.currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                window.meusFavoritosWiki = docSnap.data().favoritosWiki || [];
                if (window.renderizarWikiTree) window.renderizarWikiTree(); // Pinta a árvore
                window.renderizarFavoritosDashboard(); // Desenha no Dashboard
            }
        });
    }
}, 2000);

// 2. Ação de Clicar na Estrela (Agora via Menu)
window.toggleFavoritoWiki = async (e, id) => {
    e.stopPropagation(); 
    
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    let favs = [...window.meusFavoritosWiki]; 
    
    if (favs.includes(id)) favs = favs.filter(f => f !== id); // Remove
    else favs.push(id); // Adiciona

    // Atualiza a memória e redesenha a tela na mesma hora
    window.meusFavoritosWiki = favs;
    window.renderizarWikiTree(); 
    window.renderizarFavoritosDashboard(); 
    
    // Salva no banco de verdade em segundo plano
    await updateDoc(userRef, { favoritosWiki: favs });
};

// 3. Injeção Cirúrgica no Dashboard (Agora puxando direto do Banco)
window.renderizarFavoritosDashboard = async () => {
    const pContainer = document.getElementById('dash-priorities'); 
    if (!pContainer) return;

    let block = document.getElementById('bloco-favoritos-dash');
    if (!block) {
        block = document.createElement('div');
        block.id = 'bloco-favoritos-dash';
        block.style.marginTop = '25px';
        pContainer.parentNode.appendChild(block); 
    }

    if (!window.meusFavoritosWiki || window.meusFavoritosWiki.length === 0) {
        block.innerHTML = '';
        return;
    }

    // A MÁGICA: Busca as informações direto do banco de dados, ignorando a amnésia do F5!
    let arquivosFavs = [];
    try {
        const promessas = window.meusFavoritosWiki.map(id => getDoc(doc(db, "wiki", id)));
        const snaps = await Promise.all(promessas);
        snaps.forEach(snap => {
            if(snap.exists()) arquivosFavs.push({ id: snap.id, ...snap.data() });
        });
    } catch(e) { console.error("Erro ao buscar favoritos", e); }

    if(arquivosFavs.length > 0) {
        block.innerHTML = `
            <h3 style="font-size: 1rem; color: #fff; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">⭐ Documentos Favoritos</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                ${arquivosFavs.map(f => `
                    <div onclick="window.abrirWikiPeloAtalho('${f.id}', '${f.projetoId}')"
                         style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; border: 1px solid rgba(255,255,255,0.02);"
                         onmouseover="this.style.background='rgba(255, 235, 59, 0.1)'; this.style.borderColor='rgba(255, 235, 59, 0.3)'" 
                         onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.02)'">
                        <span style="font-size: 1.2rem;">📄</span> 
                        <strong style="font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${f.titulo}">${f.titulo}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        block.innerHTML = '';
    }
};

// 4. O "Motorista": Faz a navegação completa para abrir um documento de fora do projeto
window.abrirWikiPeloAtalho = async (wikiId, projetoId) => {
    // 1. Vai visualmente para a tela de Projetos
    window.irParaAba('projetos');
    
    // 2. Planta a semente na memória para a Wiki abrir esse arquivo automaticamente quando carregar
    localStorage.setItem('heartkey_ultima_wiki_id', wikiId);
    window.wikiAtualId = null; // Limpa a ID atual para forçar a leitura do localStorage
    
    try {
        // 3. Descobre qual projeto é esse lá no banco
        const projSnap = await getDoc(doc(db, "projetos", projetoId));
        if (projSnap.exists()) {
            const p = projSnap.data();
            
            // 4. Abre o projeto (isso vai carregar a árvore da Wiki e ler o localStorage acima!)
            await window.abrirProjeto(projSnap.id, p.nome, p.githubRepo, p.capaBase64, p.versaoAlvo);
            
            // 5. Força o Menu do Projeto a pular direto para a aba de Documentação
            const btnWiki = document.querySelector('button[onclick*="tab-wiki"]');
            if (btnWiki) {
                window.switchProjectTab('tab-wiki', btnWiki);
            }
        }
    } catch(e) {
        console.error("Erro ao fazer roteamento do atalho:", e);
    }
};

/* ==========================================================================
   WIKI - RENDERIZADOR BLINDADO DO MERMAID (ANTI-ERRO SVG E ANTI-INVISIBILIDADE)
   ========================================================================== */
window.desenharGraficosMermaid = (container) => {
    if (!container) return;

    // 1. O Markdown embrulha o código em <pre><code class="language-mermaid">.
    // Vamos caçar esses embrulhos na tela.
    const blocosDeCodigo = container.querySelectorAll('.language-mermaid');
    
    blocosDeCodigo.forEach(bloco => {
        const pre = bloco.parentElement;
        
        // Se estiver dentro de um <pre>, o Mermaid vai bugar. Vamos tirar ele de lá!
        if (pre && pre.tagName === 'PRE') {
            const divLimpa = document.createElement('div');
            divLimpa.className = 'mermaid-area-pronta';
            divLimpa.style.textAlign = 'center';
            divLimpa.style.margin = '25px 0'; // Dá um respiro pro gráfico não grudar no texto
            
            // Pega só o texto puro que você digitou
            divLimpa.textContent = bloco.textContent;
            
            // Troca a caixa defeituosa pela nossa caixa limpa!
            pre.parentNode.replaceChild(divLimpa, pre);
        }
    });

    // 2. Agora procuramos as caixas limpas que preparamos
    const graficosParaDesenhar = container.querySelectorAll('.mermaid-area-pronta');
    if (graficosParaDesenhar.length === 0) return;

    // 3. Espera o CSS da tela abrir e manda a ordem de desenho
    setTimeout(() => {
        if (container.offsetWidth > 50) {
            mermaid.run({ nodes: graficosParaDesenhar }).catch(() => {});
        } else {
            setTimeout(() => {
                if (container.offsetWidth > 50) mermaid.run({ nodes: graficosParaDesenhar }).catch(() => {});
            }, 500);
        }
    }, 400);
};

window.abrirModalNovaTarefa = () => {
    const select = document.getElementById('taskTag');
    if(select) {
        // Zera o select com as opções originais
        select.innerHTML = `
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="art">Arte</option>
            <option value="docs">Docs</option>
        `;
        // Injeta as tags criadas por você no projeto!
        (window.tagsAtivasDoProjeto || []).forEach(ct => {
            select.innerHTML += `<option value="${ct.nome}">📌 ${ct.nome.toUpperCase()}</option>`;
        });
    }
    window.openModal('modalTarefa');
};