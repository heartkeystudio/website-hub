import { auth, db, doc, updateDoc, increment } from './firebase.js';

// ==========================================
// POMODORO V3 - SISTEMA DE ESTILOS E CACHE
// ==========================================

window.focoV3 = {
    tempoRestante: 25 * 60,
    intervalo: null,
    audio: new Audio(),
    tarefaSelecionadaId: null
};

// --- FUNÇÃO DE ESTILO (A QUE DEU ERRO) ---
window.mudarEstiloTimer = () => {
    const seletor = document.getElementById('foco-v3-style');
    if (!seletor) return;

    const estilo = seletor.value;
    const cardPrincipal = document.querySelector('.focus-main-card');
    
    if (cardPrincipal) {
        // Remove classes antigas com segurança
        cardPrincipal.classList.remove('style-classic', 'style-minimal', 'style-terminal');
        // Aplica a nova classe de design
        cardPrincipal.classList.add(`style-${estilo}`);
        // Salva no bolso do navegador para não perder no F5
        localStorage.setItem('hub_foco_style', estilo);
        console.log(`🎨 Estilo alterado para: ${estilo}`);
    }
};

// --- MOTOR DO TIMER ---
window.iniciarFocoV3 = () => {
    if (window.focoV3.intervalo) return;
    
    document.getElementById('foco-v3-display')?.classList.add('timer-rodando');
    document.getElementById('pomodoro-display')?.classList.add('timer-rodando-dash'); // Brilho no Dash
    
    if (window.focoV3.audio.src) window.focoV3.audio.play();

    window.focoV3.intervalo = setInterval(() => {
        window.focoV3.tempoRestante--;
        window.atualizarDisplayV3();

        if (window.focoV3.tempoRestante <= 0) {
            window.pausarFocoV3();
            window.finalizarSessaoFoco();
        }
    }, 1000);
};

window.pausarFocoV3 = () => {
    clearInterval(window.focoV3.intervalo);
    window.focoV3.intervalo = null;
    document.getElementById('foco-v3-display')?.classList.remove('timer-rodando');
    document.getElementById('pomodoro-display')?.classList.remove('timer-rodando-dash'); // Remove brilho
    window.focoV3.audio.pause();
};

window.resetarFocoV3 = () => {
    window.pausarFocoV3();
    const mins = parseInt(document.getElementById('foco-v3-minutos').value) || 25;
    window.focoV3.tempoRestante = mins * 60;
    window.atualizarDisplayV3();
};

window.atualizarDisplayV3 = () => {
    const m = Math.floor(window.focoV3.tempoRestante / 60).toString().padStart(2, '0');
    const s = (window.focoV3.tempoRestante % 60).toString().padStart(2, '0');
    const tempoStr = `${m}:${s}`;

    // 1. Atualiza o cronômetro gigante do Santuário
    const focusDisplay = document.getElementById('foco-v3-display');
    if (focusDisplay) focusDisplay.innerText = tempoStr;

    // 2. Atualiza o cronômetro pequeno do Dashboard (A SINCRONIA!)
    const dashDisplay = document.getElementById('pomodoro-display');
    if (dashDisplay) dashDisplay.innerText = tempoStr;

    // 3. Atualiza a aba do navegador
    document.title = `(${tempoStr}) HeartKey Hub`;
};

window.iniciarPomodoro = window.iniciarFocoV3;
window.pausarPomodoro = window.pausarFocoV3;
window.resetarPomodoro = window.resetarFocoV3;

// --- CARREGAMENTO INICIAL ---
const inicializarSantuario = () => {
    // 1. Carrega o Estilo Salvo
    const salvo = localStorage.getItem('hub_foco_style') || 'classic';
    const select = document.getElementById('foco-v3-style');
    if (select) {
        select.value = salvo;
        window.mudarEstiloTimer();
    }
    // 2. Carrega as notas do Cornell
    if (typeof window.carregarRascunhoCornell === 'function') {
        window.carregarRascunhoCornell();
    }
};

// Dá um pequeno tempo para o HTML ser pintado antes de configurar
setTimeout(inicializarSantuario, 500);

// ... (Mantenha as funções de Cornell e Soundscape que já enviamos)

// --- 2. GESTÃO DE TAREFAS DOS PROJETOS ---
window.renderizarTarefasNoFoco = () => {
    const lista = document.getElementById('foco-tasks-list');
    if (!lista) return;

    if (!window.projetoAtualId || !window.tarefasProjetoCache || window.tarefasProjetoCache.length === 0) {
        lista.innerHTML = '<li style="color:#666; text-align:center; padding:10px;">Abra um projeto para selecionar seu foco.</li>';
        return;
    }

    const tarefasAtivas = window.tarefasProjetoCache.filter(t => t.status !== 'done');
    lista.innerHTML = tarefasAtivas.map(t => `
        <li class="priority-item" onclick="window.selecionarTarefaParaFoco('${t.id}', '${t.titulo.replace(/'/g, "\\'")}')" style="cursor:pointer; margin-bottom:5px; list-style:none;">
            <span class="badge badge-${t.tag}" style="font-size:0.5rem;">${t.tag}</span>
            <span style="margin-left:10px; font-size:0.85rem; color:#fff;">${t.titulo}</span>
        </li>
    `).join('') || '<li style="color:#666; text-align:center;">Todas as tarefas concluídas!</li>';
};

window.selecionarTarefaParaFoco = (id, titulo) => {
    window.focoV3.tarefaSelecionadaId = id;
    document.getElementById('foco-current-task').innerHTML = `🎯 <span style="color: var(--primary);">FOCADO EM:</span> ${titulo}`;
};

// --- 3. MÉTODO CORNELL (CACHE LOCAL) ---
window.autoSaveCornell = () => {
    const data = {
        titulo: document.getElementById('cornell-title').value,
        cues: document.getElementById('cornell-cues-text').value,
        notes: document.getElementById('cornell-notes-text').value,
        summary: document.getElementById('cornell-summary-text').value
    };
    localStorage.setItem('heartkey_cornell_draft', JSON.stringify(data));
    
    const status = document.getElementById('cornell-save-status');
    if (status) {
        status.innerText = "Gravando...";
        setTimeout(() => status.innerText = "Sincronizado no Navegador", 500);
    }
};

window.carregarRascunhoCornell = () => {
    const draft = JSON.parse(localStorage.getItem('heartkey_cornell_draft'));
    if (draft) {
        document.getElementById('cornell-title').value = draft.titulo || "";
        document.getElementById('cornell-cues-text').value = draft.cues || "";
        document.getElementById('cornell-notes-text').value = draft.notes || "";
        document.getElementById('cornell-summary-text').value = draft.summary || "";
    }
};

// Carrega o cache assim que a aba é aberta
setTimeout(window.carregarRascunhoCornell, 1000);

// --- 4. IMPORTAÇÃO E EXPORTAÇÃO (.TXT) ---

window.exportarCornellTXT = () => {
    const titulo = document.getElementById('cornell-title').value || "ANOTACAO_FOCO";
    const cues = document.getElementById('cornell-cues-text').value;
    const notes = document.getElementById('cornell-notes-text').value;
    const summary = document.getElementById('cornell-summary-text').value;
    const dataHoje = new Date().toLocaleDateString();

    // FORMATO EXATO SOLICITADO 
    const conteudo = `=== ${titulo.toUpperCase().replace(/\s/g, '_')} ===\nData: ${dataHoje}\n\n--- PALAVRAS-CHAVE / TÓPICOS ---\n${cues}\n\n--- ANOTAÇÕES GERAIS ---\n${notes}\n\n--- RESUMO ---\n${summary}`;

    const blob = new Blob([conteudo], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HeartKey_${titulo.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
};

window.processarImportacaoCornell = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        try {
            // Regex para extrair as partes do seu modelo 
            const titleMatch = text.match(/===\s*(.*?)\s*===/);
            const cuesMatch = text.match(/--- PALAVRAS-CHAVE \/ TÓPICOS ---\s*([\s\S]*?)--- ANOTAÇÕES GERAIS ---/);
            const notesMatch = text.match(/--- ANOTAÇÕES GERAIS ---\s*([\s\S]*?)--- RESUMO ---/);
            const summaryMatch = text.match(/--- RESUMO ---\s*([\s\S]*)/);

            if(titleMatch) document.getElementById('cornell-title').value = titleMatch[1].replace(/_/g, ' ');
            if(cuesMatch) document.getElementById('cornell-cues-text').value = cuesMatch[1].trim();
            if(notesMatch) document.getElementById('cornell-notes-text').value = notesMatch[1].trim();
            if(summaryMatch) document.getElementById('cornell-summary-text').value = summaryMatch[1].trim();

            window.autoSaveCornell(); // Salva no cache após importar
            window.mostrarToastNotificacao("Importação", "Anotação carregada com sucesso!", "geral");
        } catch (error) {
            alert("Erro ao ler o formato do arquivo .txt");
        }
        event.target.value = ''; 
    };
    reader.readAsText(file);
};

window.exportarCornellParaDevLog = () => {
    const titulo = document.getElementById('cornell-title').value || "Sessão de Foco";
    const cues = document.getElementById('cornell-cues-text').value;
    const notes = document.getElementById('cornell-notes-text').value;
    const summary = document.getElementById('cornell-summary-text').value;

    const markdown = `# 🎯 ${titulo}\n\n### 📌 Tópicos\n${cues}\n\n### 📝 Notas\n${notes}\n\n### 💡 Resumo\n> ${summary}`;

    window.irParaAba('diario');
    setTimeout(() => {
        document.getElementById('noteTitle').value = `[Foco] ${titulo}`;
        document.getElementById('noteContent').value = markdown;
    }, 300);
};

window.trocarSomFocoV3 = () => {
    const som = document.getElementById('foco-v3-sound').value;
    window.focoV3.audio.pause();
    if (som === 'rain') window.focoV3.audio.src = 'https://assets.mixkit.co/active_storage/sfx/2507/2507-preview.mp3';
    else if (som === 'fire') window.focoV3.audio.src = 'https://assets.mixkit.co/active_storage/sfx/2400/2400-preview.mp3';
    else if (som === 'lofi') window.focoV3.audio.src = 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3';
    else return;
    window.focoV3.audio.loop = true;
    if (window.focoV3.intervalo) window.focoV3.audio.play();
};