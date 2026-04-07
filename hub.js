// ==========================================
// 1. IMPORTAÇÕES DO FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// Inicializa APENAS UMA VEZ
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// ==========================================
// 3. LÓGICA DE LOGIN E SESSÃO
// ==========================================
const loginBtn = document.getElementById('btn-login-google');
const logoutBtn = document.querySelector('.logout-btn');
const loginScreen = document.getElementById('login-screen');
const userEmailDisplay = document.querySelector('.user-email');

// Botão de Entrar
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch((error) => {
            console.error("Erro no login:", error);
            alert("Erro ao fazer login. Olhe o console (F12).");
        });
    });
}

// Botão de Sair
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch((error) => console.error("Erro ao deslogar:", error));
    });
}

// Monitora se está logado ou não
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.classList.add('hidden'); 
        if (userEmailDisplay) userEmailDisplay.textContent = user.email; 
        
        // Puxa as notas da nuvem quando logar!
        window.carregarNotas();
        window.carregarClientes();
        window.carregarLancamentos();
        window.carregarTarefas();
        window.carregarEventos();
        window.carregarReunioes();
        
    } else {
        loginScreen.classList.remove('hidden'); 
        if (userEmailDisplay) userEmailDisplay.textContent = "Deslogado";
    }
});

// ==========================================
// 4. NAVEGAÇÃO DA SPA (Trocar Abas)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-section');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));

            button.classList.add('active');
            const targetId = button.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
});

// ==========================================
// 5. FUNÇÕES GLOBAIS (Modais e Interações)
// ==========================================
window.openModal = function(modalId) {
    document.getElementById(modalId).classList.add('active');
};
window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
};
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Kanban Drag & Drop
window.allowDrop = function(ev) {
    ev.preventDefault();
    if (ev.target.classList.contains('kanban-dropzone')) ev.target.classList.add('drag-over');
};
window.drag = function(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
};
window.drop = async function(ev) {
    ev.preventDefault();
    const data = ev.dataTransfer.getData("text"); // O ID do HTML é o mesmo ID do Firestore
    const card = document.getElementById(data);
    const dropzone = ev.target.closest('.kanban-dropzone');

    if (dropzone) {
        dropzone.classList.remove('drag-over');
        dropzone.appendChild(card); // Move o card na tela visualmente

        // A MÁGICA: Salva o novo status na nuvem em tempo real!
        const novoStatus = dropzone.id; // Vai ser 'todo', 'doing' ou 'done'
        try {
            await updateDoc(doc(db, "tarefas", data), {
                status: novoStatus
            });
            window.carregarTarefas(); // Recarrega para atualizar os contadores de números
        } catch(e) {
            console.error("Erro ao mover tarefa no banco: ", e);
        }
    }
};
document.querySelectorAll('.kanban-dropzone').forEach(zone => {
    zone.addEventListener('dragleave', function(ev) { this.classList.remove('drag-over'); });
});

// Mock Reuniões
window.responderConvite = function(inviteId, isAccepted) {
    const card = document.getElementById(inviteId);
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
        card.style.display = 'none';
        if (isAccepted) {
            const title = card.querySelector('.invite-body h3').innerText;
            const confirmedList = document.getElementById('confirmed-list');
            const newItem = document.createElement('div');
            newItem.className = 'confirmed-item';
            newItem.innerHTML = `<div class="c-date"><strong>+</strong><span>NOVO</span></div><div class="c-details"><h4>${title}</h4><p>Agendado via Hub</p></div><div class="c-status"><span class="status-dot green"></span> Confirmado</div>`;
            newItem.style.opacity = '0';
            confirmedList.appendChild(newItem);
            setTimeout(() => { newItem.style.transition = '0.3s ease'; newItem.style.opacity = '1'; }, 10);
        }
    }, 300);
};

// ==========================================
// 6. INTEGRAÇÃO REAL: DIÁRIO + FIRESTORE
// ==========================================

// Salvar na Nuvem
window.salvarNota = async function() {
    if (!auth.currentUser) return alert("Sessão expirada. Faça login novamente.");

    const titleInput = document.getElementById('noteTitle');
    const contentInput = document.getElementById('noteContent');
    const title = titleInput.value.trim() || 'Anotação sem título';
    const content = contentInput.value.trim();

    if (content === '') return alert("Escreva algo antes de salvar!");

    try {
        await addDoc(collection(db, "diario"), {
            title: title,
            content: content,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        titleInput.value = '';
        contentInput.value = '';
        window.carregarNotas(); 
    } catch (e) {
        console.error("Erro ao salvar nota: ", e);
        alert("Falha ao salvar no banco de dados.");
    }
};

// Carregar da Nuvem
window.carregarNotas = async function() {
    if (!auth.currentUser) return;
    const diaryGrid = document.getElementById('diary-entries');
    diaryGrid.innerHTML = '<p style="color: #666; padding: 20px;">Buscando suas anotações na nuvem...</p>';

    try {
        const q = query(collection(db, "diario"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        let notas = [];
        querySnapshot.forEach((docFirebase) => notas.push({ id: docFirebase.id, ...docFirebase.data() }));
        notas.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

        diaryGrid.innerHTML = ''; 

        if (notas.length === 0) {
            diaryGrid.innerHTML = '<p style="color: #666;">Nenhuma anotação encontrada. Escreva algo acima!</p>';
            return;
        }

        notas.forEach((nota) => {
            const dataObjeto = new Date(nota.dataCriacao);
            const dia = String(dataObjeto.getDate()).padStart(2, '0');
            const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
            const dataFormatada = `${dia} ${meses[dataObjeto.getMonth()]}`;

            const card = document.createElement('div');
            card.className = 'diary-card';
            card.innerHTML = `
                <div class="diary-card-header"><h4>${nota.title}</h4><span class="diary-card-date">${dataFormatada}</span></div>
                <p class="diary-card-body">${nota.content.replace(/\n/g, '<br>')}</p>
                <div class="diary-card-footer">
                    <span class="badge" style="background: rgba(129, 254, 78, 0.1); color: var(--primary);">Nuvem</span>
                    <button class="icon-btn delete-note" onclick="deletarNota('${nota.id}')">🗑️</button>
                </div>
            `;
            diaryGrid.appendChild(card);
        });
    } catch (e) { console.error("Erro ao carregar notas: ", e); }
};

// Deletar da Nuvem
window.deletarNota = async function(id) {
    if(confirm("Tem certeza que deseja excluir esta anotação para sempre?")) {
        try {
            await deleteDoc(doc(db, "diario", id));
            window.carregarNotas(); 
        } catch (e) { console.error("Erro ao deletar: ", e); }
    }
};

// ==========================================
// 7. INTEGRAÇÃO REAL: CLIENTES + FIRESTORE
// ==========================================

// Salvar Cliente na Nuvem
window.salvarCliente = async function(event) {
    event.preventDefault(); // Evita que a página recarregue ao enviar o form
    if (!auth.currentUser) return alert("Sessão expirada.");

    const nome = document.getElementById('clienteNome').value;
    const tipo = document.getElementById('clienteTipo').value;
    const email = document.getElementById('clienteEmail').value;
    const discord = document.getElementById('clienteDiscord').value || 'Não informado';
    const notas = document.getElementById('clienteNotas').value || 'Sem anotações';

    try {
        await addDoc(collection(db, "clientes"), {
            nome: nome,
            tipo: tipo,
            email: email,
            discord: discord,
            notas: notas,
            userId: auth.currentUser.uid,
            status: 'ativo', // Padrão
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('formCliente').reset(); // Limpa o form
        closeModal('modalCliente'); // Fecha a janelinha
        window.carregarClientes(); // Atualiza a tela
    } catch (e) {
        console.error("Erro ao salvar cliente: ", e);
    }
};

// Carregar Clientes da Nuvem
window.carregarClientes = async function() {
    if (!auth.currentUser) return;
    const clientGrid = document.getElementById('client-entries');
    if (!clientGrid) return;

    clientGrid.innerHTML = '<p style="color: #666;">Carregando clientes...</p>';

    try {
        const q = query(collection(db, "clientes"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        let clientes = [];
        querySnapshot.forEach((doc) => clientes.push({ id: doc.id, ...doc.data() }));

        clientGrid.innerHTML = ''; 
        if (clientes.length === 0) {
            clientGrid.innerHTML = '<p style="color: #666;">Nenhum cliente cadastrado.</p>';
            return;
        }

        clientes.forEach((cliente) => {
            // Pega as iniciais do nome para o Avatar
            const iniciais = cliente.nome.substring(0, 2).toUpperCase();

            const card = document.createElement('div');
            card.className = 'client-card';
            card.innerHTML = `
                <div class="client-header">
                    <div class="client-avatar">${iniciais}</div>
                    <div class="client-title">
                        <h3>${cliente.nome}</h3>
                        <p class="client-role">${cliente.tipo.toUpperCase()}</p>
                    </div>
                </div>
                <div class="client-body">
                    <p><strong>Email:</strong> ${cliente.email}</p>
                    <p><strong>Discord:</strong> ${cliente.discord}</p>
                    <p><strong>Notas:</strong> ${cliente.notas}</p>
                    <p><strong>Status:</strong> <span class="status-dot green"></span> ${cliente.status.toUpperCase()}</p>
                </div>
                <div class="client-footer">
                    <button class="btn-secondary btn-small" onclick="deletarCliente('${cliente.id}')">Excluir</button>
                </div>
            `;
            clientGrid.appendChild(card);
        });
    } catch (e) { console.error("Erro ao carregar clientes: ", e); }
};

// Deletar Cliente da Nuvem
window.deletarCliente = async function(id) {
    if(confirm("Deseja mesmo remover este cliente?")) {
        await deleteDoc(doc(db, "clientes", id));
        window.carregarClientes(); 
    }
};

// ==========================================
// 8. INTEGRAÇÃO REAL: FINANCEIRO + FIRESTORE
// ==========================================

// Função auxiliar para formatar em Reais (R$)
const formatadorBR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

window.salvarLancamento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return alert("Sessão expirada.");

    const tipo = document.getElementById('financeTipo').value;
    const origem = document.getElementById('financeOrigem').value;
    const descricao = document.getElementById('financeDescricao').value;
    const valor = parseFloat(document.getElementById('financeValor').value);
    const dataVencimento = document.getElementById('financeData').value;

    try {
        await addDoc(collection(db, "lancamentos"), {
            tipo: tipo,
            origem: origem,
            descricao: descricao,
            valor: valor,
            dataVencimento: dataVencimento,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('formFinanceiro').reset();
        closeModal('modalLancamento');
        window.carregarLancamentos(); 
    } catch (e) {
        console.error("Erro ao salvar lançamento: ", e);
    }
};

window.carregarLancamentos = async function() {
    if (!auth.currentUser) return;
    const financeTbody = document.getElementById('finance-entries');
    if (!financeTbody) return;

    financeTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">Calculando finanças...</td></tr>';

    try {
        const q = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        let lancamentos = [];
        let totalReceita = 0;
        let totalCusto = 0;

        querySnapshot.forEach((doc) => {
            const dados = doc.data();
            lancamentos.push({ id: doc.id, ...dados });
            if (dados.tipo === 'receita') totalReceita += dados.valor;
            else if (dados.tipo === 'custo') totalCusto += dados.valor;
        });

        lancamentos.sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento));

        // Atualiza a aba Financeiro
        const saldo = totalReceita - totalCusto;
        document.getElementById('resumoReceita').innerText = formatadorBR.format(totalReceita);
        document.getElementById('resumoCusto').innerText = formatadorBR.format(totalCusto);
        document.getElementById('resumoSaldo').innerText = formatadorBR.format(saldo);
        
        const saldoElement = document.getElementById('resumoSaldo');
        if (saldo < 0) saldoElement.classList.replace('text-neon', 'text-red');
        else saldoElement.classList.replace('text-red', 'text-neon');

        // =====================================
        // NOVO: ALIMENTA A DASHBOARD (Gráfico Sobe/Desce)
        // =====================================
        const dashSaldo = document.getElementById('dash-saldo');
        const dashTrend = document.getElementById('dash-trend');
        
        if (dashSaldo && dashTrend) {
            dashSaldo.innerText = formatadorBR.format(saldo);
            if (saldo > 0) {
                dashSaldo.className = "text-green";
                dashTrend.innerHTML = `<span style="color:#4caf50">📈 Superávit (Bom)</span>`;
            } else if (saldo < 0) {
                dashSaldo.className = "text-red";
                dashTrend.innerHTML = `<span style="color:#ff5252">📉 Déficit (Atenção)</span>`;
            } else {
                dashSaldo.className = "text-muted";
                dashTrend.innerHTML = `⚖️ Neutro`;
            }
        }

        financeTbody.innerHTML = ''; 
        if (lancamentos.length === 0) {
            financeTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">Nenhum lançamento encontrado.</td></tr>';
            return;
        }

        lancamentos.forEach((item) => {
            const partesData = item.dataVencimento.split('-');
            const dataFormatada = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;
            const eReceita = item.tipo === 'receita';
            const badgeClass = eReceita ? 'badge-receita' : 'badge-custo';
            const textClass = eReceita ? 'text-green' : 'text-red';
            const sinal = eReceita ? '+ ' : '- ';

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${dataFormatada}</td><td><strong>${item.origem}</strong></td><td>${item.descricao}</td><td><span class="badge ${badgeClass}">${item.tipo.toUpperCase()}</span></td><td class="${textClass}">${sinal}${formatadorBR.format(item.valor)}</td><td><button class="icon-btn" style="color: #ff5252" onclick="deletarLancamento('${item.id}')">Excluir</button></td>`;
            financeTbody.appendChild(tr);
        });
    } catch (e) { console.error("Erro ao carregar finanças: ", e); }
};

window.deletarLancamento = async function(id) {
    if(confirm("Excluir este lançamento alterará o seu saldo. Continuar?")) {
        await deleteDoc(doc(db, "lancamentos", id));
        window.carregarLancamentos(); 
    }
};

// ==========================================
// 9. INTEGRAÇÃO REAL: KANBAN + FIRESTORE
// ==========================================

// Criar Tarefa
window.salvarTarefa = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return alert("Sessão expirada.");

    const titulo = document.getElementById('taskTitle').value;
    const projeto = document.getElementById('taskProject').value;
    const tag = document.getElementById('taskTag').value;

    try {
        await addDoc(collection(db, "tarefas"), {
            titulo: titulo,
            projeto: projeto,
            tag: tag,
            status: 'todo', // Toda tarefa nova nasce na coluna "A Fazer"
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('formTarefa').reset();
        closeModal('modalTarefa');
        window.carregarTarefas();
    } catch (e) { console.error("Erro ao salvar tarefa: ", e); }
};

// Carregar Tarefas
window.carregarTarefas = async function() {
    if (!auth.currentUser) return;

    // Limpa as colunas atuais
    document.getElementById('todo').innerHTML = '';
    document.getElementById('doing').innerHTML = '';
    document.getElementById('done').innerHTML = '';

    let contadores = { todo: 0, doing: 0, done: 0 };

    try {
        const q = query(collection(db, "tarefas"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {
            const tarefa = docSnap.data();
            const id = docSnap.id;

            // Define a cor da badge visual
            let badgeClass = 'badge-feature';
            if (tarefa.tag === 'bug') badgeClass = 'badge-bug';
            if (tarefa.tag === 'art') badgeClass = 'badge-art';
            if (tarefa.tag === 'docs') badgeClass = 'badge-docs';

            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.setAttribute('draggable', 'true');
            card.setAttribute('ondragstart', 'drag(event)');
            card.id = id; // O ID único gerado pelo Google permite saber quem é quem no Drag & Drop

            card.innerHTML = `
                <div class="card-tags">
                    <span class="badge ${badgeClass}">${tarefa.tag.toUpperCase()}</span>
                    <button class="icon-btn delete-note" style="float: right; font-size: 0.8rem;" onclick="deletarTarefa('${id}')">🗑️</button>
                </div>
                <h4>${tarefa.titulo}</h4>
                <p class="card-project">${tarefa.projeto}</p>
                <div class="card-footer">
                    <span class="github-issue">Salvo na Nuvem</span>
                </div>
            `;

            // Encaixa o cartão na coluna correta que veio do banco e soma +1 no contador
            const colunaAlvo = document.getElementById(tarefa.status);
            if (colunaAlvo) {
                colunaAlvo.appendChild(card);
                contadores[tarefa.status]++;
            }
        });

        // Atualiza os númerozinhos nos títulos das colunas
        document.getElementById('count-todo').innerText = contadores.todo;
        document.getElementById('count-doing').innerText = contadores.doing;
        document.getElementById('count-done').innerText = contadores.done;

    } catch (e) { console.error("Erro ao carregar tarefas: ", e); }
};

// Deletar Tarefa
window.deletarTarefa = async function(id) {
    if(confirm("Excluir esta tarefa permanentemente?")) {
        await deleteDoc(doc(db, "tarefas", id));
        window.carregarTarefas();
    }
};

// ==========================================
// 10. INTEGRAÇÃO REAL: CRONOGRAMA + FIRESTORE
// ==========================================

// Salvar Evento
window.salvarEvento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return alert("Sessão expirada.");

    const titulo = document.getElementById('eventoTitulo').value;
    const data = document.getElementById('eventoData').value;
    const hora = document.getElementById('eventoHora').value || '';
    const tipo = document.getElementById('eventoTipo').value;
    const link = document.getElementById('eventoLink').value || '';

    try {
        await addDoc(collection(db, "eventos"), {
            titulo: titulo,
            data: data,
            hora: hora,
            tipo: tipo,
            link: link,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('formEvento').reset();
        closeModal('modalEvento');
        window.carregarEventos();
    } catch (e) { console.error("Erro ao salvar evento: ", e); }
};

// Carregar Eventos
window.carregarEventos = async function() {
    if (!auth.currentUser) return;
    const eventList = document.getElementById('event-entries');
    if (!eventList) return;

    eventList.innerHTML = '<p style="color: #666;">Sincronizando agenda...</p>';

    try {
        const q = query(collection(db, "eventos"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        let eventos = [];
        querySnapshot.forEach((doc) => eventos.push({ id: doc.id, ...doc.data() }));
        eventos.sort((a, b) => new Date(a.data) - new Date(b.data)); // Ordena por data

        // =====================================
        // NOVO: ALIMENTA A DASHBOARD (Agenda)
        // =====================================
        const dashEvent = document.getElementById('dash-event');
        if (dashEvent) {
            if (eventos.length > 0) {
                const prox = eventos[0]; // Pega o evento mais próximo
                const partes = prox.data.split('-');
                dashEvent.innerText = `${partes[2]}/${partes[1]} - ${prox.titulo}`;
                dashEvent.style.color = "var(--primary)";
            } else {
                dashEvent.innerText = "Agenda Livre";
                dashEvent.style.color = "#666";
            }
        }

        eventList.innerHTML = '';
        if (eventos.length === 0) {
            eventList.innerHTML = '<p style="color: #666;">Nenhum evento próximo.</p>';
            return;
        }

        eventos.forEach((evento) => {
            const dataObj = new Date(evento.data + "T00:00:00");
            const dia = String(dataObj.getDate()).padStart(2, '0');
            const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
            const mesStr = meses[dataObj.getMonth()];

            let badgeClass = 'badge-meeting';
            let colorClass = ''; let labelTipo = 'Reunião';

            if (evento.tipo === 'deadline') { badgeClass = 'badge-deadline'; colorClass = 'text-red'; labelTipo = 'Deadline'; }
            if (evento.tipo === 'release') { badgeClass = 'badge-release'; colorClass = 'text-neon'; labelTipo = 'Lançamento'; }
            if (evento.tipo === 'geral') { badgeClass = 'badge-docs'; colorClass = ''; labelTipo = 'Aviso'; }

            const card = document.createElement('div');
            card.className = 'event-item';
            card.innerHTML = `<div class="event-date"><span class="e-day ${colorClass}">${dia}</span><span class="e-month ${colorClass}">${mesStr}</span></div><div class="event-details" style="flex: 1;"><h4>${evento.titulo}</h4><p>${evento.hora ? evento.hora + ' - ' : ''} ${evento.link ? `<a href="${evento.link}" target="_blank" style="color:var(--primary)">Link</a>` : 'Sem local'}</p><span class="badge ${badgeClass}">${labelTipo}</span></div><button class="icon-btn delete-note" onclick="deletarEvento('${evento.id}')" style="align-self: center; margin-left: 10px;">🗑️</button>`;
            eventList.appendChild(card);
        });
    } catch (e) { console.error("Erro ao carregar eventos: ", e); }
};

// Deletar Evento
window.deletarEvento = async function(id) {
    if(confirm("Deseja cancelar/remover este evento da agenda?")) {
        await deleteDoc(doc(db, "eventos", id));
        window.carregarEventos();
    }
};

// Função para concluir tarefa direto pela Dashboard
window.concluirTarefaDash = async function(id) {
    try {
        await updateDoc(doc(db, "tarefas", id), {
            status: 'done'
        });
        // Dá um tempinho para a animação do CSS acontecer antes de recarregar
        setTimeout(() => {
            window.carregarTarefas();
        }, 500);
    } catch(e) {
        console.error("Erro ao concluir tarefa pela Dashboard: ", e);
    }
};

// ==========================================
// 11. INTEGRAÇÃO REAL: REUNIÕES + FIRESTORE
// ==========================================

// Função para simular o ADM enviando um convite para você
window.criarConviteTeste = async function() {
    if (!auth.currentUser) return alert("Sessão expirada.");
    try {
        await addDoc(collection(db, "reunioes"), {
            titulo: "Sync de Alinhamento - " + Math.floor(Math.random() * 100),
            dataHora: "Sexta-feira, 15:00",
            mensagem: "Precisamos alinhar os novos assets. Pode confirmar?",
            remetente: "HeartKey Admin",
            status: "pendente", // Começa como pendente para aparecer nos convites
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });
        window.carregarReunioes();
    } catch (e) { console.error("Erro ao simular convite: ", e); }
};

// Carregar Reuniões (Separa Pendentes de Confirmados)
window.carregarReunioes = async function() {
    if (!auth.currentUser) return;
    const invitesGrid = document.getElementById('invites-entries');
    const confirmedList = document.getElementById('confirmed-entries');
    if (!invitesGrid || !confirmedList) return;

    invitesGrid.innerHTML = '<p style="color: #666;">Buscando convites...</p>';
    confirmedList.innerHTML = '';

    try {
        const q = query(collection(db, "reunioes"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        let reunioes = [];
        querySnapshot.forEach((doc) => reunioes.push({ id: doc.id, ...doc.data() }));
        reunioes.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

        invitesGrid.innerHTML = '';
        
        let pendentesCount = 0;
        let confirmadosCount = 0;

        reunioes.forEach((reuniao) => {
            if (reuniao.status === 'pendente') {
                pendentesCount++;
                const card = document.createElement('div');
                card.className = 'invite-card';
                card.innerHTML = `
                    <div class="invite-header">
                        <div class="invite-sender">
                            <div class="avatar admin-avatar">HK</div>
                            <div><h4>${reuniao.remetente}</h4><span>Novo Convite</span></div>
                        </div>
                    </div>
                    <div class="invite-body">
                        <h3>${reuniao.titulo}</h3>
                        <div class="invite-datetime"><span class="icon">📅</span> ${reuniao.dataHora}</div>
                        <p class="invite-msg">"${reuniao.mensagem}"</p>
                    </div>
                    <div class="invite-actions">
                        <button class="btn-decline" onclick="responderConviteReal('${reuniao.id}', 'recusado')">Recusar</button>
                        <button class="btn-accept" onclick="responderConviteReal('${reuniao.id}', 'confirmado')">Aceitar Convite</button>
                    </div>
                `;
                invitesGrid.appendChild(card);
            } else if (reuniao.status === 'confirmado') {
                confirmadosCount++;
                const item = document.createElement('div');
                item.className = 'confirmed-item';
                item.innerHTML = `
                    <div class="c-date"><strong>HK</strong><span>SYNC</span></div>
                    <div class="c-details"><h4>${reuniao.titulo}</h4><p>${reuniao.dataHora}</p></div>
                    <div class="c-status"><span class="status-dot green"></span> Confirmado</div>
                `;
                confirmedList.appendChild(item);
            }
        });

        if (pendentesCount === 0) invitesGrid.innerHTML = '<p style="color: #666;">Caixa de entrada vazia. Nenhum convite novo.</p>';
        if (confirmadosCount === 0) confirmedList.innerHTML = '<p style="color: #666;">Nenhuma reunião confirmada no momento.</p>';

    } catch (e) { console.error("Erro ao carregar reuniões: ", e); }
};

// Responder Convite (Atualiza no Banco)
window.responderConviteReal = async function(id, novoStatus) {
    try {
        if (novoStatus === 'recusado') {
            // Se recusar, simplesmente deleta o convite
            await deleteDoc(doc(db, "reunioes", id));
        } else {
            // Se aceitar, atualiza o status para confirmado
            await updateDoc(doc(db, "reunioes", id), { status: novoStatus });
        }
        window.carregarReunioes(); // Recarrega a tela instantaneamente
    } catch (e) { console.error("Erro ao responder: ", e); }
};