import { auth, db, collection, getDocs, query, where, doc, updateDoc, onSnapshot, orderBy, limit } from './firebase.js';

window.custoMensalEstimado = 3000;
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