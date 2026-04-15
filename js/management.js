import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, onSnapshot, getDoc } from './firebase.js';

// Clientes (CRM)
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

// Financeiro
window.switchFinanceTab = (escopo, btn) => {
    window.escopoFinanceiro = escopo;
    document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.carregarLancamentos();
};

window.salvarLancamento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;

    const dados = {
        escopo: document.getElementById('financeEscopo').value,
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

window.carregarLancamentos = async function() {
    const tbody = document.getElementById('finance-entries');
    const areaMeta = document.getElementById('fin-area-meta');
    if (!tbody || !auth.currentUser) return;

    const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const elFiltro = document.getElementById('filtroMesFinanceiro');
    let filtroMes = elFiltro ? elFiltro.value : new Date().toISOString().slice(0, 7);

    // Busca Segura: Filtramos apenas quem é o dono.
    let q = query(collection(db, "lancamentos"), 
            where(window.escopoFinanceiro === 'empresa' ? "escopo" : "userId", "==", 
                  window.escopoFinanceiro === 'empresa' ? "empresa" : auth.currentUser.uid));

    const snap = await getDocs(q);

    let recPrev = 0, cusPrev = 0, recReal = 0, cusReal = 0;
    let lancamentosMes = [];
    let saldoTotalHistoricoEmpresa = window.saldoTotalEstudioCache || 0;

    snap.forEach(docSnap => {
        const d = docSnap.data();

        // Conta o saldo total se for da empresa
        if (window.escopoFinanceiro === 'empresa' && d.status === 'pago') {
            if (d.tipo === 'receita') saldoTotalHistoricoEmpresa += d.valor;
            else saldoTotalHistoricoEmpresa -= d.valor;
        }

        // Filtro Manual do Mês
        if ((d.dataVencimento || "").startsWith(filtroMes)) {
            lancamentosMes.push({id: docSnap.id, ...d});
        }
    });

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

    if (window.escopoFinanceiro === 'empresa' && window.userRole !== 'admin') return;

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

    document.getElementById('resumoReceita').innerText = formatadorMoeda.format(recReal);
    document.getElementById('previstoReceita').innerText = `A receber: ${formatadorMoeda.format(recPrev - recReal)}`;
    document.getElementById('resumoCusto').innerText = formatadorMoeda.format(cusReal);
    document.getElementById('previstoCusto').innerText = `A pagar: ${formatadorMoeda.format(cusPrev - cusReal)}`;

    const saldoReal = recReal - cusReal;
    document.getElementById('resumoSaldo').innerText = formatadorMoeda.format(saldoReal);
    document.getElementById('resumoSaldo').className = saldoReal >= 0 ? 'valor text-neon' : 'valor text-red';

    if (window.renderizarGraficoFinanceiro) window.renderizarGraficoFinanceiro(lancamentosMes);
};

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

// Agenda e Reuniões
window.salvarEvento = async function(event) {
    event.preventDefault();
    if (!auth.currentUser) return;

    const escopo = document.getElementById('eventoEscopo').value;

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
            userId: auth.currentUser.uid,
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

    const hojeIso = new Date().toISOString().split('T')[0];
    const q = query(collection(db, "eventos"), where("data", ">=", hojeIso));
    const snap = await getDocs(q);

    let eventos = [];
    snap.forEach(docSnap => {
        const e = docSnap.data();
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

        window.criarNotificacao(
            targetId,
            'reuniao',
            'Novo Convite',
            `${meuEmail.split('@')[0]} te chamou para: ${titulo} dia ${dataReuniao.split('-').reverse().join('/')}`,
            { abaAlvo: 'reunioes' }
        );

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
    }
};

window.carregarReunioes = async function() {
    const elInvites = document.getElementById('invites-entries');
    const elConfirms = document.getElementById('confirmed-entries');
    
    // 1. Verificação de segurança e contexto
    if(!elInvites || !auth.currentUser) return;

    const meuEmail = auth.currentUser.email.toLowerCase();
    const isAdmin = window.userRole === 'admin';

    try {
        // 2. MÁGICA DA ECONOMIA: Busca única (getDocs) em vez de monitoramento contínuo
        const q = query(collection(db, "reunioes"), where("envolvidos", "array-contains", meuEmail));
        const snap = await getDocs(q);

        let htmlParaMim = ''; 
        let htmlEnviados = ''; 
        let htmlConfirmados = ''; 
        let htmlRecusados = '';

        // 3. Processamento dos dados
        snap.forEach(d => {
            const r = d.data();
            const souRemetente = r.remetente === meuEmail;
            const emailOutraPessoa = souRemetente ? r.emailAlvo : r.remetente;
            const nomeAlvo = emailOutraPessoa ? emailOutraPessoa.split('@')[0] : 'Desconhecido';

            const dataExibicao = r.data ? r.data.split('-').reverse().join('/') : 'Data a definir';
            const horaExibicao = r.hora ? r.hora : '--:--';

            // Botão de excluir visível apenas para administradores
            const btnLixeira = isAdmin ? `<button class="icon-btn" onclick="window.deletarReuniao('${d.id}')" style="color:#ff5252; opacity:0.5; margin-left:10px;" title="Apagar Registro">🗑️</button>` : '';

            // Lógica por Status
            if (r.status === 'pendente') {
                if (!souRemetente) {
                    // Convite recebido: mostra botões de ação
                    htmlParaMim += `
                    <div class="invite-card">
                        <div>
                            <h3>${r.titulo}</h3>
                            <p style="font-size:0.8rem; color:#aaa;">De: ${r.remetente.split('@')[0]}</p>
                            <p style="font-size:0.75rem; color:var(--primary); margin-top:5px;">📅 ${dataExibicao} às ${horaExibicao}</p>
                        </div>
                        <div class="invite-actions">
                            <button class="btn-primary" style="padding:6px 12px;" onclick="window.responderConvite('${d.id}', 'confirmado', '${emailOutraPessoa}')">Aceitar</button>
                            <button class="btn-secondary" style="padding:6px 12px; border-color:#ff5252; color:#ff5252;" onclick="window.responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')">Recusar</button>
                        </div>
                    </div>`;
                } else {
                    // Convite enviado: mostra status de aguardando
                    htmlEnviados += `
                    <div class="invite-card" style="opacity: 0.7; border-style: dashed; border-color: rgba(255,255,255,0.2);">
                        <div>
                            <h3 style="color:#aaa;">${r.titulo}</h3>
                            <p style="font-size:0.8rem; color:#666;">Para: ${nomeAlvo}</p>
                            <p style="font-size:0.75rem; color:#888; margin-top:5px;">📅 ${dataExibicao} às ${horaExibicao}</p>
                        </div>
                        <div class="invite-actions">
                            <span style="font-size:0.75rem; color:var(--text-muted);">⏳ Aguardando...</span>
                            <button class="icon-btn" onclick="window.responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')" style="color:#ff5252; margin-left:10px;" title="Cancelar Convite">✖</button>
                            ${btnLixeira}
                        </div>
                    </div>`;
                }
            }
            else if (r.status === 'confirmado') {
                // Reunião confirmada na agenda
                htmlConfirmados += `
                <div class="confirmed-item">
                    <div class="c-date" style="background: var(--primary); color:#000;"><strong>OK</strong></div>
                    <div style="flex:1;">
                        <h4 style="color:#fff; margin-bottom:5px;">${r.titulo}</h4>
                        <p style="font-size:0.8rem; color:var(--text-muted);">📅 ${dataExibicao} às ${horaExibicao}</p>
                        <p style="font-size:0.8rem; color:var(--primary);"><span class="status-dot green"></span> Com ${nomeAlvo}</p>
                    </div>
                    <button class="icon-btn" onclick="window.responderConvite('${d.id}', 'recusado', '${emailOutraPessoa}')" style="color:#ffc107;" title="Desmarcar Reunião">✖</button>
                    ${btnLixeira}
                </div>`;
            }
            else if (r.status === 'recusado') {
                // Histórico de recusas ou cancelamentos
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

        // 4. Injeção Final no HTML
        let finalInvites = '';
        if (htmlParaMim) finalInvites += `<h4 style="color:var(--primary); margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">PARA RESPONDER</h4>` + htmlParaMim;
        if (htmlEnviados) finalInvites += `<h4 style="color:#888; margin-top:20px; margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">ENVIADOS (AGUARDANDO)</h4>` + htmlEnviados;
        elInvites.innerHTML = finalInvites || '<p style="color:#666; text-align:center; padding: 15px;">Nenhum convite pendente.</p>';

        let finalConfirms = '';
        if (htmlConfirmados) finalConfirms += `<h4 style="color:var(--primary); margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">NA AGENDA</h4>` + htmlConfirmados;
        if (htmlRecusados) finalConfirms += `<h4 style="color:#ff5252; margin-top:20px; margin-bottom:10px; font-size:0.75rem; letter-spacing: 1px;">NEGADAS / CANCELADAS</h4>` + htmlRecusados;
        if(elConfirms) elConfirms.innerHTML = finalConfirms || '<p style="color:#666; text-align:center; padding: 15px;">Nenhuma reunião na agenda.</p>';

    } catch(e) { 
        console.error("Erro ao carregar reuniões:", e); 
    }
};

window.responderConvite = async function(id, novoStatus, emailOutraPessoa) {
    let motivo = "";

    if (novoStatus === 'recusado') {
        motivo = prompt("Qual o motivo do cancelamento / recusa?");
        if (motivo === null) return;
        motivo = motivo.trim() || "Sem motivo especificado.";
    }

    const reuniaoRef = doc(db, "reunioes", id);
    const snap = await getDoc(reuniaoRef);
    const dados = snap.data();

    let updateData = { status: novoStatus };
    if (novoStatus === 'recusado') updateData.motivoRecusa = motivo;

    await updateDoc(reuniaoRef, updateData);

    window.carregarReunioes();

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
        const qEventos = query(collection(db, "eventos"), where("reuniaoId", "==", id));
        const snapEventos = await getDocs(qEventos);
        snapEventos.forEach(ev => deleteDoc(doc(db, "eventos", ev.id)));
    }

    try {
        const qUser = query(collection(db, "usuarios"), where("email", "==", emailOutraPessoa));
        const snapUser = await getDocs(qUser);
        if (!snapUser.empty) {
            const uidAlvo = snapUser.docs[0].data().uid;
            const acao = novoStatus === 'confirmado' ? 'aceitou' : 'recusou/cancelou';

            let mensagemNotif = `${auth.currentUser.email.split('@')[0]} ${acao} a reunião.`;
            if (novoStatus === 'recusado') mensagemNotif += `\nMotivo: ${motivo}`;

            window.criarNotificacao(
                uidAlvo, 'reuniao',
                `Convite ${acao.charAt(0).toUpperCase() + acao.slice(1)}`,
                mensagemNotif, { abaAlvo: 'reunioes' }
            );
        }
    } catch(e) { console.error("Erro ao notificar resposta:", e); }
};

// Diário e Crypto
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
window.desbloquearCofre = () => {
    const senha = prompt("🔑 Digite sua Senha do Cofre.\n\n⚠️ ATENÇÃO: Nós NÃO salvamos essa senha no banco. Se você a esquecer, SEUS DADOS SERÃO PERDIDOS PARA SEMPRE, pois nem nós conseguimos descriptografar!");

    if (senha) {
        window.chaveDoCofre = senha;
        const btn = document.getElementById('btn-unlock-diary');
        btn.innerText = "🔓 Cofre Aberto";
        btn.style.borderColor = "#4caf50";
        btn.style.color = "#4caf50";
        window.carregarNotas();
    }
};

window.carregarNotas = async () => {
    const grid = document.getElementById('diary-entries');
    if(!grid || !auth.currentUser) return;

    const q = query(collection(db, "diario"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);

    let notas = snap.docs.map(d => ({id: d.id, ...d.data()}));
    
    notas.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    notas = notas.slice(0, 15);

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


window.deletarNota = async (id) => { if(confirm("Deseja queimar este registro? Esta ação é irreversível.")) { await deleteDoc(doc(db, "diario", id)); window.carregarNotas(); } };

window.salvarNota = async () => {
    const tit = document.getElementById('noteTitle').value.trim();
    const cont = document.getElementById('noteContent').value.trim();
    const mood = document.getElementById('noteMood').value;
    const tag = document.getElementById('noteTag').value;
    const querCriptografar = document.getElementById('noteEncrypt').checked;

    if (!cont || !auth.currentUser) return;

    if (querCriptografar && !window.chaveDoCofre) {
        alert("🔒 Para criar uma nota criptografada, primeiro clique em '🔑 Destrancar Cofre' e defina sua senha.");
        return;
    }

    const btn = document.querySelector('button[onclick="salvarNota()"]');
    btn.disabled = true;

    try {
        let conteudoFinal = cont;

        if (querCriptografar) {
            conteudoFinal = CryptoJS.AES.encrypt(cont, window.chaveDoCofre).toString();
        }

        await addDoc(collection(db, "diario"), {
            title: tit || "Registro sem título",
            content: conteudoFinal,
            mood: mood,
            tag: tag,
            encrypted: querCriptografar,
            userId: auth.currentUser.uid,
            dataCriacao: new Date().toISOString()
        });

        document.getElementById('noteTitle').value = '';
        document.getElementById('noteContent').value = '';
        document.getElementById('noteEncrypt').checked = false;
        window.setDiaryMode('edit');
        window.carregarNotas();
    } catch (e) { console.error(e); }

    btn.disabled = false;
};

window.abrirLeituraNota = async (id) => {
    const docSnap = await getDoc(doc(db, "diario", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        let textoFinal = d.content;

        // 1. Descriptografia (Mantida a sua lógica)
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

        // 2. Preenchimento do Modal (IDs Sincronizados)
        document.getElementById('leituraNotaTitulo').innerText = d.title || "Sem Título";
        document.getElementById('leituraNotaTag').innerText = (d.tag || "devlog").toUpperCase();
        document.getElementById('leituraNotaData').innerText = new Date(d.dataCriacao).toLocaleDateString();
        
        // Mood Icon
        const moodMap = { 'produtivo': '🔥', 'criativo': '🧠', 'neutro': '🧘', 'exausto': '💀' };
        document.getElementById('leituraNotaMood').innerText = moodMap[d.mood] || '🧘';

        // 3. Renderização do Markdown
        const container = document.getElementById('leituraNotaDesc');
        container.innerHTML = marked.parse(textoFinal);

        // 4. Abre o modal correto
        window.openModal('modalLerNota');
    }
};

// Backups Globais
window.fazerBackupBanco = async () => {
    if (window.userRole !== 'admin') return alert("Acesso negado.");
    
    const btn = document.querySelector('button[onclick="window.fazerBackupBanco()"]');
    const txtOriginal = btn.innerText;
    btn.innerText = "Empacotando dados... ⏳";
    btn.disabled = true;

    try {
        // Listamos as coleções que importam pro estúdio
        const colecoes = ["projetos", "tarefas", "wiki", "wiki_pastas", "artes", "audios", "lancamentos", "reunioes", "eventos", "brainstorm_ideias", "usuarios"];
        let backup = { data_exportacao: new Date().toISOString(), dados: {} };

        for (let colName of colecoes) {
            const snap = await getDocs(collection(db, colName));
            backup.dados[colName] = [];
            snap.forEach(d => backup.dados[colName].push({ id: d.id, ...d.data() }));
        }

        // Transforma o objeto num texto formatado bonitinho
        const jsonString = JSON.stringify(backup, null, 2);
        
        // Cria um "Arquivo Virtual" no navegador
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Simula um clique pra forçar o download
        const a = document.createElement('a');
        a.href = url;
        a.download = `HeartKey_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Faxina
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.mostrarToastNotificacao("Backup Concluído", "Cópia do banco salva no seu PC.", "geral");
    } catch (e) {
        console.error("Erro no Backup:", e);
        alert("Falha ao gerar o arquivo. Veja o console (F12).");
    }

    btn.innerText = txtOriginal;
    btn.disabled = false;
};

window.restaurarBackupBanco = async (e) => {
    if (window.userRole !== 'admin') return alert("Acesso negado.");

    const file = e.target.files[0];
    if (!file) return;

    // 1. A TRAVA NUCLEAR DE SEGURANÇA
    const confirmacao = prompt("☢️ ALERTA NUCLEAR ☢️\nIsso vai SOBRESCREVER o banco de dados atual com os dados deste arquivo. Tudo o que a equipe fez depois desse backup será PERDIDO.\n\nDigite 'CONFIRMAR' (tudo maiúsculo) para prosseguir:");

    if (confirmacao !== "CONFIRMAR") {
        e.target.value = ""; // Reseta o seletor de arquivo
        return alert("Restauração cancelada por segurança. Ufa! 😅");
    }

    const btn = document.querySelector('button[onclick="document.getElementById(\'json-upload\').click()"]');
    const txtOriginal = btn.innerText;
    btn.innerText = "Injetando dados... Não feche a aba! ⏳";
    btn.disabled = true;

    // 2. LÊ O ARQUIVO JSON
    const leitor = new FileReader();
    leitor.onload = async (evento) => {
        try {
            const jsonTexto = evento.target.result;
            const backup = JSON.parse(jsonTexto);

            if (!backup.dados) throw new Error("Arquivo JSON inválido ou de outro sistema.");

            const colecoes = Object.keys(backup.dados);

            // 3. INJETA COLEÇÃO POR COLEÇÃO, DOCUMENTO POR DOCUMENTO
            for (let colName of colecoes) {
                const documentos = backup.dados[colName];

                for (let docData of documentos) {
                    const idOriginal = docData.id;
                    
                    // Cria uma cópia limpando o campo "id" de dentro dos dados para não sujar o Firebase
                    const dadosParaSalvar = { ...docData };
                    delete dadosParaSalvar.id;

                    // O PULO DO GATO: setDoc força a criação do documento usando EXATAMENTE o mesmo ID que ele tinha antes!
                    await setDoc(doc(db, colName, idOriginal), dadosParaSalvar);
                }
            }

            window.mostrarToastNotificacao("Restauração Concluída", "A linha do tempo foi reescrita com sucesso!", "geral");
            
            // Força a página a recarregar após 2 segundos para puxar os dados novos limpos
            setTimeout(() => window.location.reload(), 2000); 

        } catch (erro) {
            console.error("Erro fatal na restauração:", erro);
            alert("Erro ao ler o arquivo. Verifique se é o JSON original do backup.");
        } finally {
            btn.innerText = txtOriginal;
            btn.disabled = false;
            e.target.value = ""; 
        }
    };

    // Aciona a leitura do arquivo
    leitor.readAsText(file);
};

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
