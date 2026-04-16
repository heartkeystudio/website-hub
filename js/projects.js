// ==========================================
// PROJECTS.JS - GESTÃO DE PROJETOS E KANBAN
// ==========================================
import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot, getDoc, increment } from './firebase.js';

// ==========================================
// 1. INICIALIZAÇÃO & VARIÁVEIS GLOBAIS
// ==========================================
window.projetoAtualId = null;
window.projetoAtualRepo = null;
window.projetoAtualVersaoAlvo = 1;

window.filtroProjetosAtual = 'todos';
window.projetoTagsCustomizadas = [];
window.colaboradoresSelecionados = [];

window.tarefasProjetoCache = [];
window.kanbanFiltroAtual = 'all';
window.tagsAtivasDoProjeto = [];
window.tarefaEditandoId = null;

// ==========================================
// 2. CRIAÇÃO E EXCLUSÃO DE PROJETOS
// ==========================================
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
            versaoAlvo: 1,
            colaboradores: [auth.currentUser.email.toLowerCase()],
            userId: auth.currentUser.uid, 
            dataCriacao: new Date().toISOString()
        });

        if (window.ideiaPromovendoId) {
            const ideiaSnap = await getDoc(doc(db, "brainstorm_ideias", window.ideiaPromovendoId));
            
            if (confirm("Projeto criado! Deseja remover a ideia original da Incubadora?")) {
                if (ideiaSnap.exists()) {
                    const autorId = ideiaSnap.data().autorId;
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
            window.ideiaPromovendoId = null;
        }
        
        const form = document.getElementById('formNovoProjeto');
        if (form) form.reset();
        window.closeModal('modalNovoProjeto');
    } catch(err) { console.error(err); alert(err.message); }

    btn.innerText = textoOriginal;
    btn.disabled = false;
};

window.deletarProjeto = async (id) => { 
    if(confirm("Apagar projeto?")) { 
        await deleteDoc(doc(db, "projetos", id)); 
        window.carregarProjetos(); 
    } 
};

// ==========================================
// 3. CARREGAMENTO E FILTRO DE PROJETOS
// ==========================================
window.aplicarFiltroProjetos = () => {
    const select = document.getElementById('filter-projetos');
    if (select) window.filtroProjetosAtual = select.value;
    window.carregarProjetos();
};

window.carregarProjetos = () => {
    const grid = document.getElementById('projects-grid');
    if (!grid || !auth.currentUser) return;

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
    
    // MÁGICA: onSnapshot mantem a tela atualizada sempre
    onSnapshot(q, (snap) => {
        let projetos = snap.docs.map(d => ({id: d.id, ...d.data()}));

        if (window.filtroProjetosAtual === 'meus') {
            projetos = projetos.filter(p => p.userId === auth.currentUser.uid);
        } else if (window.filtroProjetosAtual === 'outros') {
            projetos = projetos.filter(p => p.userId !== auth.currentUser.uid);
        }

        grid.innerHTML = projetos.map(p => {
            const capa = p.capaBase64 || ''; 
            const isDono = p.userId === auth.currentUser.uid;
            
            const btnApagar = (isDono || window.userRole === 'admin') 
                ? `<button class="icon-btn" style="color: #ff5252; position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); padding: 5px; border-radius: 5px; z-index: 10;" onclick="event.stopPropagation(); window.deletarProjeto('${p.id}')" title="Apagar Projeto">🗑️</button>` 
                : '';

            return `
            <div class="client-card project-card" style="position: relative; cursor: pointer; padding: 0; overflow: hidden;" 
                 onclick="window.abrirProjeto('${p.id}', '${p.nome.replace(/'/g, "\\'")}', '${p.githubRepo || ''}', '${capa}', '${p.versaoAlvo || 1}')">
                
                <div style="width: 100%; height: 140px; background-image: url('${capa}'); background-size: cover; background-position: center; background-color: #222; border-bottom: 2px solid var(--primary);"></div>
                ${btnApagar}
                
                <div style="padding: 15px;">
                    <h3 style="margin-bottom: 5px; font-size: 1.2rem; color: #fff;">${p.nome}</h3>
                    <p style="font-size: 0.85rem; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.descricao}</p>
                </div>
            </div>`;
        }).join('') || '<p style="color:#666; text-align:center; grid-column:1/-1; padding: 30px;">Nenhum projeto encontrado. Que tal criar o primeiro?</p>';
    });
};

// ==========================================
// 4. EDIÇÃO DE PROJETOS & TAGS CUSTOMIZADAS
// ==========================================
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

// Espião do Input (Auto-complete)
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
    
    inputBusca.addEventListener('blur', () => setTimeout(() => {
        const box = document.getElementById('colabs-suggestions');
        if (box) box.style.display = 'none';
    }, 200));
}, 1500);

// ==========================================
// 6. MODAL DE EDIÇÃO DE PROJETO
// ==========================================
window.abrirModalEditarProjeto = async () => {
    if (!window.projetoAtualId) return;
    const docSnap = await getDoc(doc(db, "projetos", window.projetoAtualId));
    
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById('editProjNome').value = p.nome;
        document.getElementById('editProjDesc').value = p.descricao;
        document.getElementById('editProjVersao').value = p.versaoAlvo || 1;
        document.getElementById('editProjRepo').value = p.githubRepo || '';

        window.projetoTagsCustomizadas = p.customTags || [];
        window.renderizarTagsCustomizadas();

        const colabsSemDono = p.colaboradores.filter(em => em !== auth.currentUser.email.toLowerCase());
        
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
        
        const snapUsers = await getDocs(collection(db, "usuarios"));
        const todosUsuarios = snapUsers.docs.map(d => ({ uid: d.data().uid, email: d.data().email }));
        
        colaboradores.forEach(email => {
            if (email !== auth.currentUser.email.toLowerCase()) {
                const u = todosUsuarios.find(user => user.email === email);
                if (u) {
                    window.criarNotificacao(u.uid, 'geral', 'Novo Projeto', `Você foi adicionado à equipe do projeto: ${nome}`, { abaAlvo: 'projetos', projetoId: window.projetoAtualId });
                }
            }
        });

        document.getElementById('titulo-workspace').innerText = nome;
        window.projetoAtualRepo = repo;
        window.projetoAtualVersaoAlvo = versao; 
        
        window.tagsAtivasDoProjeto = window.projetoTagsCustomizadas; 
        
        if (updateData.capaBase64) {
            const bannerDiv = document.getElementById('project-banner');
            if (bannerDiv) bannerDiv.style.backgroundImage = `url('${updateData.capaBase64}')`;
        }
        
        window.closeModal('modalEditarProjeto');
        window.renderizarKanban();

    } catch (err) { alert(err.message); }
    btn.disabled = false; btn.innerText = "Salvar Alterações";
};

// ==========================================
// 7. NAVEGAÇÃO E ABERTURA DE PROJETOS
// ==========================================
window.abrirProjeto = async (id, nome, repo, capaBase64, versaoAlvo) => {
    window.projetoAtualId = id;
    window.projetoAtualRepo = repo || "";
    window.projetoAtualVersaoAlvo = parseInt(versaoAlvo) || 1; 
    
    document.getElementById('titulo-workspace').innerText = nome;
    const bannerDiv = document.getElementById('project-banner');
    if (bannerDiv) bannerDiv.style.backgroundImage = capaBase64 ? `url('${capaBase64}')` : `url('default-bg.jpg')`;

    document.getElementById('projetos-home').style.display = 'none';
    document.getElementById('projeto-view').style.display = 'block';
    
    // MÁGICA: Carrega todos os painéis em segundo plano!
    window.carregarTarefasDoProjeto(id);
    if (typeof window.carregarWikiDoProjeto === 'function') window.carregarWikiDoProjeto(id);
    if (typeof window.carregarAudiosDoProjeto === 'function') window.carregarAudiosDoProjeto(id);
    if (typeof window.carregarArtesDoProjeto === 'function') window.carregarArtesDoProjeto(id);
    if (typeof window.carregarCoresProjeto === 'function') window.carregarCoresProjeto(id);
    if (typeof window.carregarReferenciasArt === 'function') window.carregarReferenciasArt(id);
    if (typeof window.carregarBrainstorm === 'function') window.carregarBrainstorm(id);
    
    // 1. Descobrimos a especialidade para saber qual aba abrir
    const userDoc = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
    const esp = userDoc.exists() ? userDoc.data().especialidade : 'geral';

    // 2. Acende a aba certa visualmente
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
        if (btnKanban) window.switchProjectTab('tab-kanban', btnKanban);
    }

    const snap = await getDoc(doc(db, "projetos", id));
    window.tagsAtivasDoProjeto = snap.exists() ? (snap.data().customTags || []) : [];

    if (esp !== 'geral') window.notificarWorkflow(esp);
};

window.voltarParaProjetos = () => { window.projetoAtualId = null; document.getElementById('projetos-home').style.display = 'block'; document.getElementById('projeto-view').style.display = 'none'; };

window.switchProjectTab = (tabId, btn) => {
    // 1. Esconde todos os conteúdos de abas internas
    document.querySelectorAll('.project-tab-content').forEach(el => el.style.display = 'none');
    
    // 2. Remove a classe active de todos os botões da tab
    const container = btn.closest('.internal-tabs');
    if (container) container.querySelectorAll('.itab-btn').forEach(b => b.classList.remove('active'));

    // 3. Mostra a aba clicada e ativa o botão
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.style.display = 'block';
    if (btn) btn.classList.add('active');
};

window.sairDoProjeto = async (id, nome) => {
    if (confirm(`Deseja se retirar da equipe do projeto "${nome}"?`)) {
        try {
            const docRef = doc(db, "projetos", id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const colaboradoresAtuais = docSnap.data().colaboradores || [];
                const meuEmail = auth.currentUser.email.toLowerCase();
                const novaLista = colaboradoresAtuais.filter(email => email !== meuEmail);
                
                await updateDoc(docRef, { colaboradores: novaLista });
                window.mostrarToastNotificacao('Projeto', `Você saiu de ${nome}`, 'geral');
            }
        } catch (e) { console.error(e); }
    }
};

// ==========================================
// 8. RENDERIZAÇÃO DO KANBAN E TAREFAS
// ==========================================
window.aplicarFiltroKanban = () => { window.kanbanFiltroAtual = document.getElementById('kanban-filter').value; window.renderizarKanban(); };

window.carregarTarefasDoProjeto = (pid) => {
    if (window.unsubTarefas) window.unsubTarefas();
    window.unsubTarefas = onSnapshot(query(collection(db, "tarefas"), where("projetoId", "==", pid)), (snap) => {
        window.tarefasProjetoCache = [];
        snap.forEach(d => { window.tarefasProjetoCache.push({ id: d.id, ...d.data() }); });
        window.renderizarKanban(); 
    });
};

window.renderizarKanban = () => {
    const dropzones = ['todo', 'doing', 'done'];
    dropzones.forEach(s => { const el = document.getElementById(s); if(el) el.innerHTML = ''; });
    let counts = { todo: 0, doing: 0, done: 0 };
    const filtro = window.kanbanFiltroAtual;

    window.tarefasProjetoCache.sort((a, b) => (a.prioridade || 3) - (b.prioridade || 3));

    window.tarefasProjetoCache.forEach(t => {
        if (filtro === 'unassigned' && t.assignedTo) return;
        if (filtro !== 'all' && filtro !== 'unassigned' && t.tag !== filtro) return;

        const card = document.createElement('div');
        card.className = 'kanban-card'; card.id = t.id; card.draggable = true;
        
        if (t.prioridade === 1) card.style.borderLeft = "4px solid #ff5252";

        card.ondragstart = (ev) => ev.dataTransfer.setData("text", t.id);
        card.onclick = (e) => { if(!e.target.closest('button')) window.abrirDetalhesTarefa(t.id, t); };
        
        let badgeClass = `badge-${t.tag}`;
        let tagStyle = "";
        
        const tagCustomizada = (window.tagsAtivasDoProjeto || []).find(ct => ct.nome === t.tag);
        if (tagCustomizada) {
            badgeClass = "badge-custom";
            tagStyle = `background: ${tagCustomizada.cor}33; color: ${tagCustomizada.cor}; border: 1px solid ${tagCustomizada.cor}80;`;
        }

        let prioBadge = "";
        if (t.prioridade === 1) prioBadge = `<span class="badge priority-tag prio-1">🚩 ALTA</span>`;
        else if (t.prioridade === 2) prioBadge = `<span class="badge priority-tag prio-2">🟡 MÉD</span>`;

        const iconDesc = t.descricao ? `<span title="Contém descrição detalhada" style="font-size: 0.8rem; margin-left: 5px; opacity: 0.7;">📄</span>` : '';
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
        let btnEditar = `<button class="icon-btn" onclick="event.stopPropagation(); window.abrirEdicaoTarefaCompleta('${t.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:#e0e0e0;">✏️ Editar Tarefa</button>`;
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
                <div>${prioBadge}<span class="badge ${badgeClass}" style="${tagStyle}">${t.tag.toUpperCase()}</span></div>
                ${menu3Pontos}
            </div>
            <h4>${t.titulo} ${iconDesc}</h4>
            <div class="card-footer" style="margin-top: 5px; padding-top: 8px;">
                <div style="display:flex; align-items:center; gap:8px;">${assignedHtml} ${ghLink}</div>
            </div>`;
            
        const alvo = document.getElementById(t.status);
        if (alvo) { alvo.appendChild(card); counts[t.status]++; }
    });

    document.getElementById('count-todo').innerText = counts.todo;
    document.getElementById('count-doing').innerText = counts.doing;
    document.getElementById('count-done').innerText = counts.done;
    
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

// ==========================================
// 9. DETALHES, CRIAÇÃO E MODO EDIÇÃO DA TAREFA
// ==========================================
window.abrirModalNovaTarefa = () => {
    const select = document.getElementById('taskTag');
    if(select) {
        select.innerHTML = `
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="art">Arte</option>
            <option value="docs">Docs</option>
        `;
        (window.tagsAtivasDoProjeto || []).forEach(ct => {
            select.innerHTML += `<option value="${ct.nome}">📌 ${ct.nome.toUpperCase()}</option>`;
        });
    }
    window.tarefaEditandoId = null; 
    document.getElementById('formTarefa')?.reset();
    
    const modal = document.getElementById('modalTarefa');
    if (modal) {
        modal.querySelector('h2').innerText = "📝 Nova Tarefa";
        const btn = modal.querySelector('button[type="submit"]');
        if (btn) btn.innerText = "Criar Tarefa";
    }

    window.openModal('modalTarefa');
};

window.abrirEdicaoTarefaCompleta = async (id) => {
    // 1. Fecha o menu de 3 pontinhos se estiver aberto
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));

    // 2. Busca a tarefa no cache
    const tarefa = window.tarefasProjetoCache.find(t => t.id === id);
    if (!tarefa) return;

    // 3. Prepara o Modal de Tarefa para "Modo Edição"
    window.tarefaEditandoId = id;
    const modal = document.getElementById('modalTarefa');
    
    // Muda os textos do modal para o usuário saber que está editando
    modal.querySelector('h2').innerText = "✏️ Editar Tarefa";
    modal.querySelector('button[type="submit"]').innerText = "Salvar Alterações";

    // 4. Preenche os campos com os dados atuais
    document.getElementById('taskTitle').value = tarefa.titulo || "";
    document.getElementById('taskTag').value = tarefa.tag || "feature";
    document.getElementById('taskDesc').value = tarefa.descricao || "";
    
    // O PULO DO GATO: Carrega o estado do checkbox de aprovação
    const checkAdmin = document.getElementById('taskAdminReq');
    if (checkAdmin) {
        checkAdmin.checked = tarefa.exigeAprovacao || false;
    }

    // 5. Abre o modal
    window.openModal('modalTarefa');
};

window.setTaskMode = (modo) => {
    // Caso você implemente uma troca de abas dentro do modal futuramente
};

window.taskAtualEditando = { id: null, rawBody: "", githubIssue: null };

window.taskAbertaAtual = null;

// 1. ABRIR OS DETALHES (Sempre começa no modo visualização)
window.abrirDetalhesTarefa = async (id, data) => {
    window.taskAbertaAtual = { id: id, ...data };

    // Preenche o Modo Visualização
    document.getElementById('detalheTaskTitulo').innerText = data.titulo;
    document.getElementById('detalheTaskTag').innerText = data.tag.toUpperCase();
    document.getElementById('detalheTaskTag').className = `badge badge-${data.tag}`;
    
    // Badge de Admin
    const badgeReq = document.getElementById('detalheTaskAdminReqBadge');
    if (badgeReq) badgeReq.style.display = data.exigeAprovacao ? 'inline-block' : 'none';

    // Botão de Aprovação (Só para Admin)
    const btnApprove = document.getElementById('btn-admin-approve-task');
    if (btnApprove) {
        btnApprove.style.display = (data.exigeAprovacao && window.userRole === 'admin' && data.status !== 'done') ? 'inline-block' : 'none';
    }

    // Configura Badge de Prioridade
    const prioBadge = document.getElementById('detalheTaskPrioBadge');
    if (prioBadge) {
        if (data.prioridade === 1) { prioBadge.innerText = '🚩 ALTA'; prioBadge.style.background = 'rgba(255,82,82,0.2)'; prioBadge.style.color = '#ff5252'; prioBadge.style.display = 'inline-block'; }
        else if (data.prioridade === 2) { prioBadge.innerText = '🟡 MÉDIA'; prioBadge.style.background = 'rgba(255,193,7,0.2)'; prioBadge.style.color = '#ffc107'; prioBadge.style.display = 'inline-block'; }
        else { prioBadge.style.display = 'none'; } // Baixa não precisa de badge
    }

    // Configura Badge de Dificuldade
    const diffBadge = document.getElementById('detalheTaskDiffBadge');
    if (diffBadge) diffBadge.innerText = `XP: ${data.dificuldade || 1}x`;

    // GitHub
    const btnGit = document.getElementById('btn-abrir-git');
    if (data.githubIssue && btnGit) {
        btnGit.href = data.githubUrl; btnGit.style.display = 'block';
    } else if (btnGit) { btnGit.style.display = 'none'; }

    // Renderiza o Markdown
    window.renderizarDescricaoTask(data.descricao || "");

    // Reseta para Modo Visualização (Garante que os inputs fiquem escondidos)
    window.cancelarEdicaoFull();

    window.openModal('modalDetalhesTarefa');
};

// 2. ATIVAR MODO EDIÇÃO (Transforma a tela no Editor)
window.ativarModoEdicaoFull = () => {
    const t = window.taskAbertaAtual;
    if (!t) return;

    // Esconde Visualização / Mostra Edição
    document.getElementById('task-view-header').style.display = 'none';
    document.getElementById('task-edit-header').style.display = 'flex';
    document.getElementById('detalheTaskDesc').style.display = 'none';
    document.getElementById('editTaskInputDesc').style.display = 'block';
    document.getElementById('edit-actions-footer').style.display = 'flex';
    document.getElementById('btn-entrar-edicao').style.display = 'none';
    document.getElementById('btn-fechar-detalhes').style.display = 'none';

    // Preenche os Inputs com os dados atuais
    document.getElementById('editTaskInputTitulo').value = t.titulo;
    document.getElementById('editTaskInputTag').value = t.tag;
    document.getElementById('editTaskInputPriority').value = t.prioridade || 3;
    document.getElementById('editTaskInputDifficulty').value = t.dificuldade || 1;
    document.getElementById('editTaskInputDesc').value = t.descricao || "";
    document.getElementById('editTaskInputAdminReq').checked = t.exigeAprovacao || false;

    document.getElementById('editTaskInputDesc').focus();
};

// 3. CANCELAR EDIÇÃO (Volta para Visualização)
window.cancelarEdicaoFull = () => {
    document.getElementById('task-view-header').style.display = 'block';
    document.getElementById('task-edit-header').style.display = 'none';
    document.getElementById('detalheTaskDesc').style.display = 'block';
    document.getElementById('editTaskInputDesc').style.display = 'none';
    document.getElementById('edit-actions-footer').style.display = 'none';
    document.getElementById('btn-entrar-edicao').style.display = 'block';
    document.getElementById('btn-fechar-detalhes').style.display = 'block';
};

// 4. SALVAR TUDO
window.salvarEdicaoFull = async () => {
    if (!window.taskAbertaAtual) return;
    
    const id = window.taskAbertaAtual.id;
    const novoTitulo = document.getElementById('editTaskInputTitulo').value;
    const novaTag = document.getElementById('editTaskInputTag').value;
    const novaDesc = document.getElementById('editTaskInputDesc').value;
    const novoAdminReq = document.getElementById('editTaskInputAdminReq').checked;
    const novaPrio = parseInt(document.getElementById('editTaskInputPriority').value) || 3;
    const novaDiff = parseFloat(document.getElementById('editTaskInputDifficulty').value) || 1;


    try {
        await updateDoc(doc(db, "tarefas", id), {
            titulo: novoTitulo,
            tag: novaTag,
            prioridade: novaPrio,
            dificuldade: novaDiff,
            descricao: novaDesc,
            exigeAprovacao: novoAdminReq
        });

        // Atualiza o cache pra mudar de tela sem recarregar a página
        window.taskAbertaAtual.prioridade = novaPrio;
        window.taskAbertaAtual.dificuldade = novaDiff;
        window.taskAbertaAtual.titulo = novoTitulo;
        window.taskAbertaAtual.tag = novaTag;
        window.taskAbertaAtual.descricao = novaDesc;
        window.taskAbertaAtual.exigeAprovacao = novoAdminReq;

        // Atualiza os textos da visualização
        document.getElementById('detalheTaskTitulo').innerText = novoTitulo;
        document.getElementById('detalheTaskTag').innerText = novaTag.toUpperCase();
        document.getElementById('detalheTaskTag').className = `badge badge-${novaTag}`;
        document.getElementById('detalheTaskAdminReqBadge').style.display = novoAdminReq ? 'inline-block' : 'none';
        
        window.renderizarDescricaoTask(novaDesc);
        window.cancelarEdicaoFull();
        window.mostrarToastNotificacao("Kanban", "Missão atualizada!", "geral");
        
    } catch(err) { console.error(err); }
};

// --- NOVAS FUNÇÕES PARA EDITAR A DESCRIÇÃO E APROVAR ---
window.editarDescricaoTarefa = () => {
    document.getElementById('detalheTaskDesc').style.display = 'none';
    document.getElementById('detalheTaskEditArea').style.display = 'flex';
};

window.salvarEdicaoTarefa = async () => {
    if (!window.taskAtualEditando.id) return;
    const novaDescricao = document.getElementById('detalheTaskInput').value;
    try {
        await updateDoc(doc(db, "tarefas", window.taskAtualEditando.id), { descricao: novaDescricao });
        window.taskAtualEditando.rawBody = novaDescricao;
        window.renderizarDescricaoTask(novaDescricao);
        
        document.getElementById('detalheTaskEditArea').style.display = 'none';
        document.getElementById('detalheTaskDesc').style.display = 'block';
    } catch(err) { console.error(err); }
};

window.aprovarTarefaAdmin = async () => {
    if (!window.taskAtualEditando.id || window.userRole !== 'admin') return;
    try {
        await updateDoc(doc(db, "tarefas", window.taskAtualEditando.id), { status: 'done' });
        window.closeModal('modalDetalhesTarefa');
        window.renderizarKanban(); // Atualiza a tela
    } catch(err) { console.error(err); }
};

window.salvarTarefa = async (e) => {
    e.preventDefault();
    if (!auth.currentUser || !window.projetoAtualId) return;
    
    const btnSubmit = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
    if (btnSubmit) { btnSubmit.innerText = "Processando... ⏳"; btnSubmit.disabled = true; }
    
    try {
        const titulo = document.getElementById('taskTitle')?.value || "Tarefa sem título";
        const tag = document.getElementById('taskTag')?.value || "feature";
        const desc = document.getElementById('taskDesc')?.value || ""; 
        const prioridade = document.getElementById('taskPriority')?.value || "3";
        const adminReq = document.getElementById('taskAdminReq')?.checked || false;
        
        if (window.tarefaEditandoId) {
            const adminReq = document.getElementById('taskAdminReq')?.checked || false; // Pega o novo valor

            await updateDoc(doc(db, "tarefas", window.tarefaEditandoId), {
                titulo: titulo, 
                tag: tag, 
                descricao: desc, 
                prioridade: parseInt(prioridade),
                exigeAprovacao: adminReq
            });

            window.mostrarToastNotificacao("Kanban", "Tarefa atualizada!", "geral");
        } 
        else {
            let issueNumber = null; let issueUrl = null;
            const token = localStorage.getItem('github_token');

            if (window.projetoAtualRepo && token) {
                try {
                    const res = await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues`, {
                        method: "POST",
                        headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ title: titulo, body: desc || `Tarefa gerada via HeartKey Hub.`, labels: [tag] })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        issueNumber = data.number;
                        issueUrl = data.html_url;
                    }
                } catch (err) { console.error("Falha Git:", err); } 
            }

            const dificuldade = parseFloat(document.getElementById('taskDifficulty')?.value) || 1;

            await addDoc(collection(db, "tarefas"), {
                titulo: titulo, tag: tag, descricao: desc, prioridade: parseInt(prioridade), exigeAprovacao: adminReq, // AQUI!
                dificuldade: dificuldade, projetoId: window.projetoAtualId, status: 'todo', 
                githubIssue: issueNumber, githubUrl: issueUrl, userId: auth.currentUser.uid, 
                dataCriacao: new Date().toISOString()
            });
        }
        
        e.target.reset();
        if (typeof closeModal === 'function') closeModal('modalTarefa');
        
    } catch(erroFatal) { 
        console.error("Erro fatal ao salvar tarefa:", erroFatal); alert("Ops! Erro ao salvar a tarefa.");
    } finally {
        if (btnSubmit) { btnSubmit.innerText = "Criar Tarefa"; btnSubmit.disabled = false; }
    }
};

window.deletarTarefa = async (id) => {
    if(confirm("Apagar esta tarefa permanentemente?")) {
        try {
            const docRef = doc(db, "tarefas", id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const tarefa = docSnap.data();
                const token = localStorage.getItem('github_token');
                
                if (window.projetoAtualRepo && token && tarefa.githubIssue) {
                    await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues/${tarefa.githubIssue}`, {
                        method: "PATCH",
                        headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) 
                    });
                }
            }
            await deleteDoc(docRef);
        } catch(err) { console.error(err); alert("Erro ao excluir."); }
    }
};

window.renderizarDescricaoTask = (texto) => {
    const container = document.getElementById('detalheTaskDesc');
    if (!texto) { container.innerHTML = "Sem detalhes adicionais."; return; }

    // 1. Processa Checkboxes Interativos (Mantido do Kanban)
    const linhas = texto.split('\n');
    const linhasProcessadas = linhas.map((linha, index) => {
        const uncheckMatch = linha.match(/^([\s\-*+]+)\[ \]\s+(.*)/);
        const checkMatch = linha.match(/^([\s\-*+]+)\[x\]\s+(.*)/i);
        
        if (uncheckMatch) {
            const recuo = uncheckMatch[1].replace(/[-*+]/g, '').length * 15; 
            return `<div class="task-check-label" style="margin-left: ${recuo}px; margin-top: 5px;"><input type="checkbox" onchange="window.toggleTaskCheck(${index}, false)"> <span>${uncheckMatch[2]}</span></div>`;
        } else if (checkMatch) {
            const recuo = checkMatch[1].replace(/[-*+]/g, '').length * 15;
            return `<div class="task-check-label" style="margin-left: ${recuo}px; margin-top: 5px;"><input type="checkbox" checked onchange="window.toggleTaskCheck(${index}, true)"> <span class="text-checked">${checkMatch[2]}</span></div>`;
        }
        return linha;
    });

    let textoPreparado = linhasProcessadas.join('\n');

    // 2. MÁGICA DA WIKI (Pré-processamento Inline)
    textoPreparado = textoPreparado.replace(/\{cor:([^}]+)\}/gi, '<span style="color: $1;">');
    textoPreparado = textoPreparado.replace(/\{\/cor\}/gi, '</span>');
    
    textoPreparado = textoPreparado.replace(/\{font:([^}]+)\}/gi, '<span style="font-family: \'$1\';">');
    textoPreparado = textoPreparado.replace(/\{\/font\}/gi, '</span>');

    // 3. MOTOR DE CALLOUTS (Padrão Obsidian)
    textoPreparado = textoPreparado.replace(/^> \[!([a-zA-Z]+)\](.*?)\n((?:>.*\n?)*)/gim, (match, tipo, titulo, conteudo) => {
        const limpo = conteudo.replace(/^>\s?/gm, ''); 
        const icones = { 
            info: 'ℹ️', note: '📓', abstract: '📋', summary: '📋', tldr: '📋',
            warning: '⚠️', caution: '⚠️', attention: '⚠️',
            danger: '🚨', error: '🚨', bug: '🐛',
            success: '✅', check: '✅', done: '✅',
            tip: '💡', hint: '💡', 
            question: '❓', help: '❓', faq: '❓',
            quote: '💬', cite: '💬', example: '📝'
        };
        const t = tipo.toLowerCase();
        const iconeRender = icones[t] || '📌'; 
        const tituloRender = titulo.trim() || (t.charAt(0).toUpperCase() + t.slice(1)); 
        
        return `<div class="wiki-callout callout-${t}">
                    <div class="wiki-callout-title">${iconeRender} ${tituloRender}</div>
                    <div class="wiki-callout-content">\n\n${limpo}\n\n</div>
                </div>`;
    });

    // 4. Conversor Inteligente de Links (Dropbox, Drive, etc)
    textoPreparado = textoPreparado.replace(/https?:\/\/(www\.)?dropbox\.com\/[^\s)]+/g, (match) => {
        if (window.converterLinkDireto) return window.converterLinkDireto(match);
        return match;
    });

    // 5. Parse Oficial do Markdown
    let htmlGerado = marked.parse(textoPreparado);
    
    // 6. Pós-Processamento da Wiki ({center}, vídeos, imagens em tamanhos customizados)
    if (typeof window.processarTagsCustomizadas === 'function') {
        htmlGerado = window.processarTagsCustomizadas(htmlGerado);
    }

    // Injeta na tela
    container.className = 'markdown-body checklist-container';
    container.style.cssText = 'background: transparent; padding: 0; box-shadow: none; border: none; min-height: auto;';
    container.innerHTML = htmlGerado;

    // 7. Dispara os Diagramas Mermaid (com um micro-atraso de segurança pro DOM atualizar)
    setTimeout(() => {
        if (typeof window.desenharGraficosMermaid === 'function') {
            window.desenharGraficosMermaid(container);
        }
    }, 100);
};

window.toggleTaskCheck = async (linhaIndex, isCheckedAtualmente) => {
    if (!window.taskAtualEditando.id) return;

    let linhas = window.taskAtualEditando.rawBody.split('\n');
    if (isCheckedAtualmente) linhas[linhaIndex] = linhas[linhaIndex].replace(/\[x\]/i, '[ ]');
    else linhas[linhaIndex] = linhas[linhaIndex].replace(/\[ \]/, '[x]');

    const novoBody = linhas.join('\n');
    window.taskAtualEditando.rawBody = novoBody;
    
    const tarefaNoCache = window.tarefasProjetoCache.find(t => t.id === window.taskAtualEditando.id);
    if (tarefaNoCache) tarefaNoCache.descricao = novoBody;
    
    window.renderizarDescricaoTask(novoBody); 
    window.renderizarKanban(); 

    try { 
        await updateDoc(doc(db, "tarefas", window.taskAtualEditando.id), { descricao: novoBody }); 
        const diff = tarefaNoCache ? (tarefaNoCache.dificuldade || 1) : 1;
        const tag = tarefaNoCache ? tarefaNoCache.tag : 'geral';
        window.pontuarGamificacao('checklist', auth.currentUser.uid, tag, isCheckedAtualmente, diff);
    } catch(e) { console.error("Erro Firebase:", e); }

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

            // 🛡️ O ESCUDO DO ADMIN NO DRAG & DROP
            if (novoStatus === 'done' && t.exigeAprovacao && window.userRole !== 'admin') {
                window.mostrarToastNotificacao('Acesso Restrito', '🔒 Esta tarefa exige revisão! Deixe-a em "Fazendo" para um Diretor verificar.', 'geral');
                return; // Morre aqui! A tarefa volta pra coluna antiga.
            }

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

window.assumirTarefa = async (taskId) => {
    if (!auth.currentUser) return;
    const nomeUser = window.obterNomeExibicao();
    try {
        await updateDoc(doc(db, "tarefas", taskId), {
            assignedTo: auth.currentUser.uid,
            assignedName: nomeUser,
            assignedAvatar: window.meuAvatar || null,
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
            if (t.assignedTo !== auth.currentUser.uid && window.userRole !== 'admin') {
                return window.mostrarToastNotificacao('Acesso Negado', '🔒 Apenas quem assumiu ou um Admin pode desassumir esta tarefa.', 'geral');
            }
            if(confirm("Deseja largar esta tarefa e devolvê-la para a equipe?")) {
                if (t.status === 'done' && t.assignedTo) window.pontuarGamificacao('tarefa', t.assignedTo, t.tag, true);
                const novoStatus = t.status === 'done' ? 'todo' : t.status;
                await updateDoc(taskRef, { assignedTo: null, assignedName: null, status: novoStatus });
            }
        }
    } catch (e) { console.error("Erro ao desassumir tarefa:", e); }
};

// ==========================================
// 10. GITHUB INTEGRATION
// ==========================================
window.configurarGitHub = function() {
    const token = prompt("Cole seu Personal Access Token do GitHub:");
    if(token) { localStorage.setItem('github_token', token.trim()); alert("Token salvo no navegador!"); }
};

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
        const res = await fetch(`https://api.github.com/repos/${window.projetoAtualRepo}/issues?state=all&per_page=100`, {
            method: "GET",
            headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Não foi possível ler o repositório.");
        const issuesGit = await res.json();

        const q = query(collection(db, "tarefas"), where("projetoId", "==", window.projetoAtualId));
        const snap = await getDocs(q);
        const issuesNativas = new Set();
        snap.forEach(doc => { if (doc.data().githubIssue) issuesNativas.add(doc.data().githubIssue); });

        let importadas = 0;
        for (const issue of issuesGit) {
            if (issue.pull_request) continue;
            if (issue.state_reason === 'not_planned') continue; 

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
                    descricao: issue.body || "", 
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