// ==========================================
// AUTH.JS - Autenticação, Gamificação e Perfil
// ==========================================
import { auth, provider, db, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, query, onSnapshot } from './firebase.js';

// ==========================================
// 1. CONSTANTES E CONFIGURAÇÕES GLOBAIS
// ==========================================
window.userRole = 'membro'; // Padrão para todo mundo que entra
const SUPER_ADMINS = ["devao.developer@gmail.com", "seu_socio@gmail.com"];

// ==========================================
// 2. AUTENTICAÇÃO E LOGIN/LOGOUT
// ==========================================
// 2.1 LISTENER PRINCIPAL DE AUTENTICAÇÃO
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

        // Atualiza a UI do Topo
        const sidebarTopAvatar = document.getElementById('sidebar-user-avatar');
        if (sidebarTopAvatar) {
            sidebarTopAvatar.innerHTML = window.meuAvatar
                ? `<img src="${window.meuAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                : window.obterNomeExibicao().substring(0, 2).toUpperCase();
        }
        const sidebarTopName = document.getElementById('sidebar-user-name');
        if (sidebarTopName) sidebarTopName.innerText = window.obterNomeExibicao();

        if (SUPER_ADMINS.includes(user.email.toLowerCase())) cargoAtual = 'admin';
        window.userRole = cargoAtual;

        await setDoc(userDocRef, {
            email: user.email.toLowerCase(),
            uid: user.uid,
            nome: user.displayName || 'Membro',
            ultimoAcesso: new Date().toISOString(),
            role: cargoAtual
        }, { merge: true });

        // Aplica permissões e inicia carregamentos com segurança
        window.aplicarPermissoes(cargoAtual);

        // Aplica permissões e inicia carregamentos com segurança
        window.aplicarPermissoes(cargoAtual);

        // ==========================================
        // 🚀 SEQUÊNCIA DE INICIALIZAÇÃO (O MOTOR DE PARTIDA)
        // ==========================================
        // Verificamos se as funções existem antes de chamar para evitar o erro no console
        if (typeof window.carregarDashboard === 'function') window.carregarDashboard();
        if (typeof window.carregarProjetos === 'function') window.carregarProjetos();
        if (typeof window.carregarNotas === 'function') window.carregarNotas();
        if (typeof window.carregarClientes === 'function') window.carregarClientes();
        if (typeof window.carregarLancamentos === 'function') window.carregarLancamentos();
        if (typeof window.carregarEventos === 'function') window.carregarEventos();
        if (typeof window.carregarReunioes === 'function') window.carregarReunioes();
        if (typeof window.iniciarWarRoom === 'function') window.iniciarWarRoom();
        if (typeof window.carregarRanking === 'function') window.carregarRanking();
        if (typeof window.verificarResetDiario === 'function') window.verificarResetDiario();
        if (typeof window.carregarMeuPerfil === 'function') window.carregarMeuPerfil();
        if (typeof window.iniciarSistemaNotificacoes === 'function') window.iniciarSistemaNotificacoes();
        if (typeof window.recuperarPomodoroPerdido === 'function') window.recuperarPomodoroPerdido();
        if (typeof window.carregarIncubadora === 'function') window.carregarIncubadora();
        if (typeof window.iniciarEscutaRadioGlobal === 'function') window.iniciarEscutaRadioGlobal();
        if (typeof window.carregarBarraIntegrantes === 'function') window.carregarBarraIntegrantes();
        if (typeof window.carregarMural === 'function') window.carregarMural();
        if (typeof window.renderizarFavoritosDashboard === 'function') window.renderizarFavoritosDashboard();
        window.carregarRanking();
        window.verificarResetDiario();
        window.carregarMeuPerfil();

        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
        window.intervaloLembrete = setInterval(() => {
            if (window.processarAlertasAgenda) window.processarAlertasAgenda();
        }, 5 * 60 * 1000);

    } else {
        loginScreen.classList.remove('hidden');
        if (window.intervaloLembrete) clearInterval(window.intervaloLembrete);
    }

    // ATUALIZAÇÃO INTELIGENTE DO STATUS ONLINE
    setInterval(async () => {
        if (auth.currentUser && document.visibilityState === 'visible') {
            try {
                await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
                    ultimoVisto: new Date().toISOString()
                });
            } catch(e) {}
        }
    }, 180000);
});

// 2.2 EVENTOS DE LOGIN/LOGOUT
document.getElementById('btn-login-google').onclick = () => signInWithPopup(auth, provider).catch(e => console.error(e));
document.querySelector('.logout-btn').onclick = () => signOut(auth).catch(e => console.error(e));

// ==========================================
// 3. PERMISSÕES E CONTROLE DE ACESSO
// ==========================================
window.aplicarPermissoes = (cargo) => {
    const painelAdm = document.getElementById('admin-panel');
    const btnNovoProj = document.getElementById('btn-novo-projeto');
    const btnNovaTask = document.getElementById('btn-nova-tarefa');
    const painelBackup = document.getElementById('admin-backup-panel');
    const btnCfgRadio = document.getElementById('btn-config-radio');

    if (painelAdm) painelAdm.style.display = (cargo === 'admin') ? "block" : "none";
    const podeCriar = (cargo === 'admin' || cargo === 'gerente');
    if (btnNovoProj) btnNovoProj.style.display = podeCriar ? "block" : "none";
    if (btnNovaTask) btnNovaTask.style.display = podeCriar ? "block" : "none";
    if (painelBackup) painelBackup.style.display = (cargo === 'admin') ? "block" : "none";
    if (btnCfgRadio) btnCfgRadio.style.display = (cargo === 'admin') ? "block" : "none";
};

// ==========================================
// 4. SISTEMA DE GAMIFICAÇÃO E RPG
// ==========================================
// 4.1 PONTUAÇÃO E STATS
window.pontuarGamificacao = async (tipo, userIdAlvo, tag, reverter = false, dificuldade = 1) => {
    const uid = userIdAlvo || auth.currentUser.uid;
    const userRef = doc(db, "usuarios", uid);

    let pontosBase = 0;
    
    // TABELA DE PONTOS
    if (tipo === 'tarefa') pontosBase = 10;
    if (tipo === 'checklist') pontosBase = 2; 
    if (tipo === 'pomodoro') pontosBase = 5;
    if (tipo === 'ideia') pontosBase = 15;

    const multiplicador = reverter ? -1 : 1;
    const pontosFinais = Math.round((pontosBase * dificuldade) * multiplicador);

    // 1. Dados base que todo mundo ganha
    let updateData = {
        xp: increment(pontosFinais),
        [`stats.${tag || 'geral'}`]: increment(1 * multiplicador)
    };

    // 2. Separação inteligente: Cada ação incrementa apenas a sua própria gaveta!
    if (tipo === 'tarefa') {
        updateData.tasksFeitas = increment(1 * multiplicador);
        updateData['daily.tarefa'] = increment(1 * multiplicador);
    } 
    else if (tipo === 'pomodoro') {
        updateData.pomodoros = increment(1 * multiplicador);
        updateData['daily.pomodoro'] = increment(1 * multiplicador);
    } 
    else if (tipo === 'ideia') {
        updateData['daily.ideia'] = increment(1 * multiplicador);
    } 
    else if (tipo === 'checklist') {
        // A checklist DÁ o XP base configurado lá em cima, 
        // MAS não soma como "Tarefa Inteira" nas missões diárias!
        // (Deixamos vazio de propósito para não hackearem o sistema)
    }

    // 3. Envia para o banco de dados
    await updateDoc(userRef, updateData);

    if (!reverter) {
        window.mostrarToastNotificacao("Gamificação", `+${pontosFinais} XP por ${tipo}!`, "geral");
    }
};

// 4.2 CÁLCULO DE CLASSES RPG
window.calcularClasseRPG = (stats) => {
    if (!stats) return { nome: "Aventureiro Iniciante", cor: "#aaa", icone: "🛡️" };

    const s = {
        dev: (stats.feature || 0) + (stats.dev || 0),
        bug: stats.bug || 0,
        art: (stats.art || 0) + (stats.ui || 0),
        audio: (stats.audio || 0) + (stats.bgm || 0) + (stats.sfx || 0),
        docs: (stats.docs || 0) + (stats.gdd || 0)
    };

    let maxVal = 0; let classeAlvo = "geral";
    for (let [key, val] of Object.entries(s)) { if (val > maxVal) { maxVal = val; classeAlvo = key; } }
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

// ==========================================
// 5. PERFIL DO USUÁRIO
// ==========================================
// 5.1 CARREGAMENTO DO PERFIL
window.carregarMeuPerfil = () => {
    const card = document.getElementById('user-profile-card');
    if (!card || !auth.currentUser) return;

    onSnapshot(doc(db, "usuarios", auth.currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const u = docSnap.data();

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
            const avatarHtml = u.avatarBase64 ? `<img src="${u.avatarBase64}" alt="Avatar">` : window.obterNomeExibicao().substring(0, 2).toUpperCase();
            const textoNomeFicha = u.apelido ? `${u.nome.split(' ')[0]} <span style="color:var(--primary);">"${u.apelido}"</span>` : u.nome.split(' ')[0];

            const badges = [
                { nome: 'Primeiro Sangue', desc: 'Ganhou seu primeiro XP no Hub.', icone: '🩸', unlocked: xp > 0 },
                { nome: 'Senhor do Tempo', desc: 'Completou 10 ciclos de Pomodoro.', icone: '⏳', unlocked: pomodoros >= 10 },
                { nome: 'O Ferreiro', desc: 'Moveu 20 tarefas para Feito.', icone: '🔨', unlocked: tasksFeitas >= 20 },
                { nome: 'Exterminador', desc: 'Esmagou 5 Bugs no Kanban.', icone: '🐛', unlocked: (stats.bug || 0) >= 5 },
                { nome: 'Alma Criativa', desc: 'Entregou 5 tarefas de Arte ou Áudio.', icone: '🎨', unlocked: ((stats.art || 0) + (stats.audio || 0)) >= 5 },
                { nome: 'Veterano', desc: 'Alcançou o Nível 10.', icone: '👑', unlocked: level >= 10 }
            ];

            let badgesHtml = badges.map(b => `<div class="badge-medal ${b.unlocked ? 'unlocked' : 'locked'}" data-tooltip="${b.unlocked ? `${b.nome} (Desbloqueado)` : `Bloqueado: ${b.desc}`}">${b.icone}</div>`).join('');

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
                    <div class="profile-banner" style="${bannerEstilo}">${menu3PontosPerfil}<div class="profile-avatar-wrapper"><div class="profile-avatar">${avatarHtml}</div></div></div>
                    <div class="profile-info">
                        <div class="profile-name">${textoNomeFicha} <span class="profile-level">Lv. ${level}</span></div>
                        <div class="profile-class" style="color: ${classeInfo.cor};">${classeInfo.icone} ${classeInfo.nome}</div>
                        <div class="xp-bar-container"><div class="xp-bar-fill" style="width: ${porcentagem}%;"></div></div>
                        <div class="xp-text">${progressoXP} / ${metaXP} XP pro Nível ${level + 1}</div>
                        <div class="profile-stats-grid">
                            <div class="stat-box"><div class="value">${tasksFeitas}</div><div class="label">Tarefas Feitas</div></div>
                            <div class="stat-box"><div class="value">${pomodoros}</div><div class="label">Pomodoros</div></div>
                            <div class="stat-box" style="border-color: ${classeInfo.cor}; background: rgba(0,0,0,0.2);"><div class="value" style="color: ${classeInfo.cor};">${xp}</div><div class="label">XP Total</div></div>
                        </div>
                        <div class="badges-container"><div class="badges-title">Estante de Conquistas</div><div class="badges-grid">${badgesHtml}</div></div>
                    </div>
                </div>
            `;

            const questsContainer = document.getElementById('quests-container');
            if (questsContainer) {
                const dailyTasks = u.daily?.tarefa || 0; const dailyPoms = u.daily?.pomodoro || 0;
                const percTasks = Math.min(100, (dailyTasks / 1) * 100); const percPoms = Math.min(100, (dailyPoms / 2) * 100);
                const resgatado = u.daily?.resgatado || false;

                let btnHtml = resgatado ? `<button class="btn-claim-bonus" disabled>✓ Bônus Resgatado</button>`
                            : (percTasks===100 && percPoms===100 ? `<button class="btn-claim-bonus" onclick="resgatarBonusDiario()">🎁 Resgatar +50 XP</button>`
                            : `<button class="btn-claim-bonus" disabled style="opacity:0.5;">Complete as missões</button>`);

                questsContainer.innerHTML = `
                    <div class="quest-item"><div class="quest-header"><span style="color: ${percPoms===100 ? 'var(--primary)' : '#fff'}">🍅 Foco (Pomodoros)</span><span style="color: var(--text-muted);">${dailyPoms}/2</span></div><div class="quest-bar-bg"><div class="quest-bar-fill ${percPoms===100 ? 'done' : ''}" style="width: ${percPoms}%;"></div></div></div>
                    <div class="quest-item"><div class="quest-header"><span style="color: ${percTasks===100 ? 'var(--primary)' : '#fff'}">⚔️ Mão na Massa (Tarefas)</span><span style="color: var(--text-muted);">${dailyTasks}/1</span></div><div class="quest-bar-bg"><div class="quest-bar-fill ${percTasks===100 ? 'done' : ''}" style="width: ${percTasks}%;"></div></div></div>
                    ${btnHtml}
                `;
            }
        }
    });
};

// 5.2 SALVAMENTO DE PREFERÊNCIAS
window.salvarPreferencias = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processando Imagens...";

    const upd = {
        nome: document.getElementById('user-nome').value.trim(),
        apelido: document.getElementById('user-apelido').value.trim(),
        especialidade: document.getElementById('user-specialty').value,
        corTema: document.getElementById('theme-color').value,
        modoTema: document.getElementById('theme-mode').value,
        opacidadeTema: parseFloat(document.getElementById('theme-opacity').value)
    };

    const avatarFile = document.getElementById('user-avatar-file').files[0];
    const bgFile = document.getElementById('theme-bg-file').files[0];

    try {
        if (avatarFile) upd.avatarBase64 = await window.comprimirImagem(avatarFile, 200, 0.8);
        if (bgFile) upd.bgTema = await window.comprimirImagem(bgFile, 1280, 0.7);

        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), upd);
        window.aplicarTema(upd.corTema, upd.bgTema, upd.modoTema, upd.opacidadeTema);
        window.closeModal('modalConfigPerfil');
        window.mostrarToastNotificacao("Perfil", "Alterações salvas com sucesso!", "geral");
    } catch (err) { alert("Erro ao salvar. Imagem muito grande?"); }
    btn.disabled = false; btn.innerText = "Salvar Alterações";
};

// ==========================================
// 6. SISTEMA DE RANKING E MISSÕES DIÁRIAS
// ==========================================
// 6.1 RANKING GLOBAL
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

// 6.2 MISSÕES DIÁRIAS
window.verificarResetDiario = async () => {
    if (!auth.currentUser) return;
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    const docSnap = await getDoc(userRef);
    const hoje = new Date().toISOString().split('T')[0];

    if (docSnap.exists() && docSnap.data().ultimoResetDiario !== hoje) {
        await updateDoc(userRef, { ultimoResetDiario: hoje, 'daily.tarefa': 0, 'daily.pomodoro': 0, 'daily.resgatado': false });
    }
};

window.resgatarBonusDiario = async () => {
    try {
        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { 'daily.resgatado': true, xp: increment(50) });
        window.mostrarToastNotificacao('Combo Diário!', '+50 XP! Volte amanhã para mais missões.', 'geral');
    } catch(e) { console.error(e); }
};

// ==========================================
// 7. APLICADOR DE TEMAS
// ==========================================
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
// 8. SISTEMA DE MEMBROS E BARRA LATERAL
// ==========================================
// 8.1 CARREGAMENTO DA BARRA DE INTEGRANTES
window.carregarBarraIntegrantes = () => {
    const container = document.getElementById('sidebar-integrantes');
    if (!container) return;

    onSnapshot(collection(db, "usuarios"), (snap) => {
        const agora = new Date();
        container.innerHTML = snap.docs.map(docSnap => {
            const u = docSnap.data();
            const iniciais = u.nome ? u.nome.substring(0,2).toUpperCase() : "??";
            const ultimoVisto = u.ultimoVisto ? new Date(u.ultimoVisto) : new Date(0);
            const isOnline = (agora - ultimoVisto) < (4 * 60 * 1000);

            return `
                <div class="member-item" onclick="window.verDetalhesIntegrante('${docSnap.id}')">
                    <div class="member-avatar-mini">
                        ${u.avatarBase64 ? `<img src="${u.avatarBase64}">` : iniciais}
                        <div class="status-indicator ${isOnline ? 'online' : ''}"></div>
                    </div>
                    <span class="member-name-tag">${u.apelido || u.nome.split(' ')[0]}</span>
                </div>
            `;
        }).join('');
    });
};

// 8.2 DETALHES DO INTEGRANTE
window.verDetalhesIntegrante = async (uid) => {
    const userSnap = await getDoc(doc(db, "usuarios", uid));
    if (!userSnap.exists()) return;

    const u = userSnap.data();
    const xp = u.xp || 0; const tasksFeitas = u.tasksFeitas || 0; const pomodoros = u.pomodoros || 0;
    const level = Math.floor(Math.sqrt(xp / 10)) + 1;
    const classeInfo = window.calcularClasseRPG(u.stats || {});

    const badges = [
        { nome: 'Primeiro Sangue', desc: 'Ganhou XP.', icone: '🩸', unlocked: xp > 0 },
        { nome: 'Senhor do Tempo', desc: '10 Pomodoros.', icone: '⏳', unlocked: pomodoros >= 10 },
        { nome: 'Ferreiro', desc: '20 Tarefas.', icone: '🔨', unlocked: tasksFeitas >= 20 },
        { nome: 'Exterminador', desc: '5 Bugs.', icone: '🐛', unlocked: (u.stats?.bug || 0) >= 5 },
        { nome: 'Criativo', desc: 'Arte/Audio.', icone: '🎨', unlocked: ((u.stats?.art || 0) + (u.stats?.audio || 0)) >= 5 },
        { nome: 'Veterano', desc: 'Nível 10.', icone: '👑', unlocked: level >= 10 }
    ];

    const badgesHtml = badges.map(b => `<div class="badge-medal ${b.unlocked ? 'unlocked' : 'locked'}" data-tooltip="${b.nome}" style="width:40px; height:40px; font-size:1.2rem;">${b.icone}</div>`).join('');

    document.getElementById('conteudo-perfil-flutuante').innerHTML = `
        <div style="width:100%; height:80px; background-image: url('${u.bgTema || ''}'); background-size:cover; background-color:#222; border-bottom: 1px solid var(--border-color);"></div>
        <div style="padding: 20px; margin-top: -40px;">
            <div class="profile-avatar" style="width:70px; height:70px; font-size:1.5rem; border-width:3px; position:relative;">
                ${u.avatarBase64 ? `<img src="${u.avatarBase64}">` : u.nome.substring(0,2).toUpperCase()}
            </div>
            <h3 style="margin-top:10px; color:#fff; font-size: 1.1rem;">${u.nome}</h3>
            <p style="color:${classeInfo.cor}; font-size:0.8rem; font-weight:bold;">Lv.${level} ${classeInfo.nome}</p>

            <div style="margin-top:15px; font-size:0.85rem; color:#aaa; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div class="stat-box" style="padding:8px; background:rgba(255,255,255,0.02);"><div style="font-size:1rem; color:#fff; font-weight:bold;">${tasksFeitas}</div><div style="font-size:0.6rem; text-transform:uppercase; color:#666;">Tarefas</div></div>
                <div class="stat-box" style="padding:8px; background:rgba(255,255,255,0.02);"><div style="font-size:1rem; color:#fff; font-weight:bold;">${pomodoros}</div><div style="font-size:0.6rem; text-transform:uppercase; color:#666;">Pomodoros</div></div>
            </div>

            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size:0.65rem; color:#666; text-transform:uppercase; font-weight:bold; margin-bottom:10px; text-align:center;">Insígnias</div>
                <div class="badges-grid" style="grid-template-columns: repeat(auto-fit, minmax(40px, 1fr)); gap: 8px;">${badgesHtml}</div>
            </div>
            <div style="text-align:center; margin-top:15px;"><span style="color:#444; font-size:0.65rem;">Visto por último: ${new Date(u.ultimoVisto).toLocaleTimeString()}</span></div>
        </div>
    `;

    document.getElementById('card-perfil-flutuante').classList.add('active');
};