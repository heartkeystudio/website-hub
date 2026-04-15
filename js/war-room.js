import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, onSnapshot, orderBy, limit } from './firebase.js';

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

        window.enviarNotificacaoDiscord(
            "⚡ OPERAÇÃO INICIADA!",
            `A equipe entrou em modo **${tipo.toUpperCase()}** para o projeto **${nome}**!`,
            10494194, // Roxo
            [{ name: "Término da Missão", value: `${dataFim} às ${horaFim}` }]
        );

        window.registrarAtividade(`iniciou a operação: ${nome}`, 'war-room', tipo === 'jam' ? '🎮' : '🏃');
        closeModal('modalConfigWarRoom');
        document.getElementById('formConfigWarRoom')?.reset();
    } catch(err) {
        console.error(err);
        alert("Erro ao salvar configuração da War Room.");
    }
};

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


window.iniciarChatWarRoom = () => {
    const chatBox = document.getElementById('war-chat-feed');
    const q = query(collection(db, "war_room_chat"), orderBy("data", "asc"), limit(40)); 

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
    if(confirm("Apagar esta mensagem do terminal?")) {
        try {
            await deleteDoc(doc(db, "war_room_chat", id));
        } catch (e) {
            window.mostrarToastNotificacao("Erro", "Você não tem permissão para apagar esta mensagem.", "geral");
        }
    }
};

window.iniciarArsenalWarRoom = async () => {
    const container = document.getElementById('war-links-container');
    if(!container || !auth.currentUser) return;

    try {
        // MÁGICA: getDocs em vez de onSnapshot
        const snap = await getDocs(collection(db, "war_room_links"));
        container.innerHTML = "";

        snap.forEach(docSnap => {
            const l = docSnap.data();
            const id = docSnap.id;
            const isDono = l.autorEmail === auth.currentUser.email;
            const isAdmin = window.userRole === 'admin' || window.userRole === 'gerente';

            let controlesHtml = (isDono || isAdmin) ? `
                <div style="display:flex; gap: 4px;">
                    <button onclick="event.preventDefault(); editarLinkWarRoom('${id}', '${l.titulo.replace(/'/g, "\\'")}', '${l.url}')" class="icon-btn">✏️</button>
                    <button onclick="event.preventDefault(); deletarLinkWarRoom('${id}')" class="icon-btn" style="color:#ff5252;">×</button>
                </div>` : '';

            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:5px; width:100%;">
                    <a href="${l.url}" target="_blank" class="war-link-item" style="flex:1;">
                        <span>🔗</span>
                        <div><strong>${l.titulo}</strong></div>
                    </a>
                    ${controlesHtml}
                </div>`;
        });
    } catch(e) { console.error(e); }
};

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
    window.iniciarArsenalWarRoom();
};

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