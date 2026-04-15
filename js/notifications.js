import { auth, db, collection, addDoc, getDocs, query, where, doc, updateDoc, onSnapshot, orderBy, limit } from './firebase.js';

window.cacheNotificacoes = [];
window.notificacoesConhecidas = new Set();

window.pedirPermissaoNotificacoes = () => {
    if (!("Notification" in window)) return alert("Seu navegador não suporta notificações.");
    Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
            window.mostrarToastNotificacao("Sucesso!", "Notificações nativas ativadas.", "geral");
            document.getElementById('btn-permissao-push').style.display = 'none';
        }
    });
};

window.criarNotificacao = async (userIdAlvo, tipo, titulo, mensagem, rota = {}) => {
    if (!userIdAlvo) return;
    await addDoc(collection(db, "notificacoes"), {
        userId: userIdAlvo, tipo, titulo, mensagem, lida: false,
        abaAlvo: rota.abaAlvo || null, subAba: rota.subAba || null, projetoId: rota.projetoId || null, contextId: rota.contextId || null,
        dataCriacao: new Date().toISOString()
    });
};

window.iniciarSistemaNotificacoes = () => {
    if(!auth.currentUser) return;
    const q = query(collection(db, "notificacoes"), where("userId", "==", auth.currentUser.uid), where("lida", "==", false));
    onSnapshot(q, (snap) => {
        window.cacheNotificacoes = snap.docs.map(d => ({id: d.id, ...d.data()}));
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const n = change.doc.data();
                const isRecente = (new Date().getTime() - new Date(n.dataCriacao).getTime()) < 10000;
                if (isRecente && !window.notificacoesConhecidas.has(change.doc.id)) {
                    window.mostrarToastNotificacao(n.titulo, n.mensagem, n.tipo);
                    if ("Notification" in window && Notification.permission === "granted") {
                        const pushNativo = new Notification(n.titulo, { body: n.mensagem, icon: "https://cdn-icons-png.flaticon.com/512/732/732221.png" });
                        pushNativo.onclick = function(e) { e.preventDefault(); window.focus(); if (n.abaAlvo) window.irParaAba(n.abaAlvo); this.close(); };
                    }
                    window.notificacoesConhecidas.add(change.doc.id);
                }
            }
        });
        window.atualizarTrilhaNotificacoes();
    });
};

window.atualizarTrilhaNotificacoes = () => {
    document.querySelectorAll('.nav-badge:not(#notification-center-badge), .item-dot:not(.proj-dot)').forEach(el => el.remove());
    let contagemPorAba = {};
    window.cacheNotificacoes.forEach(n => {
        if (n.abaAlvo) contagemPorAba[n.abaAlvo] = (contagemPorAba[n.abaAlvo] || 0) + 1;
        if (n.projetoId) {
            const projCard = document.getElementById(`proj-card-${n.projetoId}`);
            if (projCard && !projCard.querySelector('.proj-dot')) {
                const dot = document.createElement('span'); dot.className = 'item-dot proj-dot';
                dot.style.cssText = 'position:absolute; top:15px; right:15px; width:12px; height:12px; box-shadow:0 0 10px var(--primary); z-index:10;';
                projCard.appendChild(dot);
            }
        }
        if (window.projetoAtualId && n.projetoId === window.projetoAtualId && n.subAba) window.desenharPingoNaSubAba(n.subAba);
    });
    Object.keys(contagemPorAba).forEach(aba => window.desenharBadgeNoMenu(aba, contagemPorAba[aba]));
    
    const unreadCount = window.cacheNotificacoes.length;
    const badgeSininho = document.getElementById('notification-center-badge');
    if (badgeSininho) {
        badgeSininho.innerText = unreadCount > 9 ? '9+' : unreadCount;
        badgeSininho.style.display = 'inline-flex';
        unreadCount === 0 ? badgeSininho.classList.add('empty-badge') : badgeSininho.classList.remove('empty-badge');
    }
    if(window.renderizarCentralNotificacoes) window.renderizarCentralNotificacoes();
};

window.desenharBadgeNoMenu = (target, qtde) => {
    const btn = document.querySelector(`.nav-btn[data-target="${target}"]`);
    if (btn && !btn.querySelector('.nav-badge')) {
        btn.style.position = 'relative';
        const b = document.createElement('span'); b.className = 'nav-badge'; b.innerText = qtde > 9 ? '9+' : qtde;
        btn.appendChild(b);
    }
};

window.desenharPingoNaSubAba = (subAbaId) => {
    const btn = document.querySelector(`button[onclick*="${subAbaId}"]`);
    if (btn && !btn.querySelector('.item-dot')) {
        const dot = document.createElement('span'); dot.className = 'item-dot'; btn.appendChild(dot);
    }
};

window.limparNotificacaoItem = async (contextId) => {
    const notifs = window.cacheNotificacoes.filter(n => n.contextId === contextId);
    for (let n of notifs) await updateDoc(doc(db, "notificacoes", n.id), { lida: true });
};

window.marcarNotificacoesComoLidas = async (abaAlvo) => {
    if(!auth.currentUser) return;
    const q = query(collection(db, "notificacoes"), where("userId", "==", auth.currentUser.uid), where("lida", "==", false), where("abaAlvo", "==", abaAlvo));
    const snap = await getDocs(q);
    snap.forEach(d => { if (!d.data().contextId) updateDoc(doc(db, "notificacoes", d.id), { lida: true }); });
};

window.mostrarToastNotificacao = (titulo, msg, tipo) => {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = 'system-toast';
    let icone = tipo === 'reuniao' ? '📅' : (tipo === 'audio' ? '🎵' : '🔔');
    toast.innerHTML = `<div style="font-weight:900; font-size:0.9rem; margin-bottom:5px; color:var(--primary);">${icone} ${titulo}</div><div style="font-size:0.8rem; color:#e0e0e0;">${msg}</div>`;
    try { const som = new Audio('sounds/notify.wav'); som.volume = 0.4; som.play().catch(()=>{}); } catch(e){}
    toast.onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove() }, 6000);
};

window.notificarWorkflow = (especialidade) => {
    const antigo = document.querySelector('.workflow-toast'); if (antigo) antigo.remove();
    const config = { 'dev': { nome: 'Programação', icon: '💻' }, 'design': { nome: 'Game Design', icon: '📖' }, 'art': { nome: 'Arte & Som', icon: '🎨' }, 'geral': { nome: 'Dashboard', icon: '🎯' } }[especialidade] || { nome: 'Dashboard', icon: '🎯' };
    const toast = document.createElement('div'); toast.className = 'workflow-toast';
    toast.innerHTML = `<div class="icon">${config.icon}</div><div class="text">Bem-vindo de volta! Redirecionado para <strong>${config.nome}</strong>.</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 4000);
};

window.verificarAgendaDoDia = async () => {
    if (!auth.currentUser) return;
    const hoje = new Date().toISOString().split('T')[0];
    const q = query(collection(db, "reunioes"), where("envolvidos", "array-contains", auth.currentUser.email.toLowerCase()), where("status", "==", "confirmado"), where("data", "==", hoje));
    const snap = await getDocs(q);
    if (!snap.empty) setTimeout(() => window.mostrarToastNotificacao('Agenda de Hoje', `Você tem ${snap.size} reuniões marcadas para hoje.`, 'reuniao'), 3000);
};

window.lembretesDisparados = new Set();
window.verificarLembretesProximos = async () => {
    if (!auth.currentUser) return;
    const agora = new Date();
    const q = query(collection(db, "reunioes"), where("envolvidos", "array-contains", auth.currentUser.email.toLowerCase()), where("status", "==", "confirmado"), where("data", "==", agora.toISOString().split('T')[0]));
    const snap = await getDocs(q);
    snap.forEach(d => {
        const r = d.data(); if (!r.hora) return;
        const [horas, minutos] = r.hora.split(':');
        const dataR = new Date(); dataR.setHours(parseInt(horas), parseInt(minutos), 0);
        const difMin = Math.floor((dataR - agora) / 1000 / 60);
        if (difMin > 0 && difMin <= 60 && !window.lembretesDisparados.has(d.id)) {
            window.mostrarToastNotificacao('Reunião Próxima', `"${r.titulo}" começa em 1 hora (${r.hora}).`, 'reuniao');
            window.lembretesDisparados.add(d.id);
        }
    });
};

window.toggleNotificationCenter = () => document.getElementById('notification-center-panel').classList.toggle('active');
window.renderizarCentralNotificacoes = () => {
    const list = document.getElementById('notification-center-list'); if (!list) return;
    if (window.cacheNotificacoes.length === 0) { list.innerHTML = '<div style="padding:30px; color:#666; text-align:center;">Tudo limpo!</div>'; return; }
    const ord = [...window.cacheNotificacoes].sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    list.innerHTML = ord.map(n => `<li class="notif-item" onclick="window.clicarNotificacaoPainel('${n.id}', '${n.abaAlvo}', '${n.projetoId}', '${n.subAba}', '${n.contextId}')"><div class="notif-title">${n.titulo}</div><div class="notif-msg">${n.mensagem}</div></li>`).join('');
};
window.marcarTodasComoLidas = async () => { if(!confirm("Limpar todas?")) return; await Promise.all(window.cacheNotificacoes.map(n => updateDoc(doc(db, "notificacoes", n.id), { lida: true }))); };
window.clicarNotificacaoPainel = async (id, abaAlvo, pId, subAba) => {
    await updateDoc(doc(db, "notificacoes", id), { lida: true });
    if (abaAlvo && abaAlvo !== 'null') window.irParaAba(abaAlvo);
    if (pId && pId !== 'null') {
        const pSnap = await getDoc(doc(db, "projetos", pId));
        if (pSnap.exists()) {
            await window.abrirProjeto(pSnap.id, pSnap.data().nome, pSnap.data().githubRepo, pSnap.data().capaBase64, pSnap.data().versaoAlvo);
            if (subAba && subAba !== 'null') setTimeout(() => window.switchProjectTab(subAba, document.querySelector(`button[onclick*="${subAba}"]`)), 100);
        }
    }
    window.toggleNotificationCenter();
};