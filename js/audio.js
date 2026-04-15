// ==========================================
// AUDIO.JS - Central de Áudio, Player e Rádio
// ==========================================
import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, onSnapshot, getDoc } from './firebase.js';

// ==========================================
// 1. INICIALIZAÇÃO E VARIÁVEIS GLOBAIS
// ==========================================
window.audioAtualExecucao = null; // Guarda qual áudio está tocando
window.audiosCache = [];
window.audioFiltroAtual = 'all';
window.audioIdAtualMestre = null;
window.fonteMidiaAtual = null; // Sabe se está tocando 'radio' ou 'projeto'
window.audioFeedbackAtualId = null;
window.audioEditandoId = null; // Controla o estado de edição
window.audioCamadasAtualMestre = 1; // Guarda o número de camadas do áudio que está no Master

// ==========================================
// 2. GERENCIAMENTO DE ÁUDIOS (CRUD)
// ==========================================
// 2.1 SALVAMENTO (Agora com Stems e Metadados)
// ==========================================
window.salvarAudio = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Sincronizando... ⏳"; btn.disabled = true;

    const titulo = document.getElementById('audioTitulo')?.value || "Trilha sem nome";
    const tag = document.getElementById('audioTag')?.value || "BGM";
    const bpm = document.getElementById('audioBpm')?.value || "--";
    const sampleRate = document.getElementById('audioSampleRate')?.value || "44.1kHz";
    const lufs = document.getElementById('audioLufs')?.value || "--";
    const loopStart = document.getElementById('audioLoopStart')?.value || null;
    const loopEnd = document.getElementById('audioLoopEnd')?.value || null;
    const letra = document.getElementById('audioLetra')?.value.trim() || "";
    const genero = document.getElementById('audioGenero')?.value || "";
    
    const urlsBrutas = [
        document.getElementById('audioUrl1')?.value.trim() || "",
        document.getElementById('audioUrl2')?.value.trim() || "",
        document.getElementById('audioUrl3')?.value.trim() || "",
        document.getElementById('audioUrl4')?.value.trim() || "",
        document.getElementById('audioUrl5')?.value.trim() || ""
    ];

    const camadasConvertidas = urlsBrutas
        .filter(url => url !== "")
        .map(url => window.converterLinkDireto(url));

    if (camadasConvertidas.length === 0) {
        alert("Forneça pelo menos um link de áudio!");
        btn.innerText = "Lançar para a Engine"; btn.disabled = false;
        return;
    }

    const assetsUrl = document.getElementById('audioAssetsUrl')?.value.trim() || ""; // Captura o link

    const dados = {
        titulo, tag, bpm, sampleRate, lufs, loopStart, loopEnd, letra,
        assetsUrl: assetsUrl, // <--- ADICIONE ESTA LINHA
        camadas: camadasConvertidas, 
        projetoId: window.projetoAtualId,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.audioEditandoId) {
            // MODO EDIÇÃO
            await updateDoc(doc(db, "audios", window.audioEditandoId), dados);
            window.mostrarToastNotificacao("HeartBeat", "Áudio atualizado com sucesso!", "audio");
            window.audioEditandoId = null;
        } else {
            // MODO CRIAÇÃO
            dados.enviadoPor = window.obterNomeExibicao();
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "audios"), dados);
            window.registrarAtividade(`lançou a trilha dinâmica "${titulo}"`, 'audio', '🎛️');
        }
        
        document.getElementById('formNovoAudio')?.reset();
        window.closeModal('modalNovoAudio');
    } catch(err) { 
        console.error("Erro ao salvar áudio:", err); 
    } finally {
        btn.innerText = "Lançar para a Engine"; btn.disabled = false;
    }
};
// 2.2 CARREGAMENTO E FILTROS
window.carregarAudiosDoProjeto = (pid) => {
    // Já puxa o moodboard junto de forma limpa
    if (window.carregarReferenciasAudio) window.carregarReferenciasAudio(pid);

    onSnapshot(query(collection(db, "audios"), where("projetoId", "==", pid)), (snap) => {
        window.audiosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderizarAudios();
    });
};

window.aplicarFiltroAudio = () => {
    window.audioFiltroAtual = document.getElementById('audio-filter').value;
    window.renderizarAudios(); // Redesenha a tela instantaneamente com o filtro novo!
};

// ==========================================
// 2.3 RENDERIZAÇÃO DA GALERIA (O Simulador Dinâmico)
// ==========================================
window.renderizarAudios = () => {
    const grid = document.getElementById('audios-grid');
    if (!grid) return;

    let filtrados = window.audiosCache;
    if (window.audioFiltroAtual !== 'all') {
        filtrados = window.audiosCache.filter(a => a.tag === window.audioFiltroAtual);
    }

    grid.innerHTML = filtrados.map(a => {
        const camadas = a.camadas || [a.arquivoUrl]; // Fallback pra áudios antigos
        const isDynamic = camadas.length > 1;

        // Tags Nerds (Tech Specs)
        const techSpecs = `
            <span class="badge" title="Sample Rate" style="background:rgba(0,0,0,0.5); border:1px solid #444; color:#aaa; font-size:0.55rem;">📻 ${a.sampleRate || '44.1kHz'}</span>
            <span class="badge" title="Loudness" style="background:rgba(0,0,0,0.5); border:1px solid #444; color:#aaa; font-size:0.55rem;">🔊 ${a.lufs !== '--' ? a.lufs+' LUFS' : '--'}</span>
            ${a.loopStart ? `<span class="badge" title="Loop Data" style="background:rgba(0,234,255,0.1); border:1px solid #00eaff; color:#00eaff; font-size:0.55rem;">🔁 Loop: ${a.loopStart}s ~ ${a.loopEnd}s</span>` : ''}
        `;

        // Letra / Roteiro Dropdown
        const btnLetra = a.letra ? `<button class="icon-btn" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" style="font-size:0.75rem; color:#ffc107; margin-top: 10px;">📖 Ler Roteiro/Letra</button><div class="markdown-body" style="display:none; margin-top:5px; background:rgba(0,0,0,0.4)!important; font-size:0.8rem; padding:10px!important;">${a.letra.replace(/\n/g, '<br>')}</div>` : '';

       // O FADER DE INTENSIDADE E O MIXER
        const simuladorFader = isDynamic ? `
            <div style="margin-top: 15px; background: rgba(0,234,255,0.02); border: 1px dashed rgba(0,234,255,0.3); padding: 15px; border-radius: 12px;">
                <label style="font-size: 0.75rem; color: #00eaff; display: flex; justify-content: space-between; font-weight: bold;">
                    <span>🎛️ HeartBeat SE</span>
                    <span id="intensity-val-${a.id}">Nível: 0</span>
                </label>
                
                <input type="range" min="0" max="100" value="0" style="width: 100%; accent-color: #00eaff; margin-top: 10px; cursor: ew-resize;" oninput="window.mudarIntensidadeAudio('${a.id}', this.value, ${camadas.length})">
                
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #888; margin-top: 5px; font-weight: bold; text-transform: uppercase;">
                    <span>Exploração</span><span>Tensão</span><span>Combate</span>
                </div>

                <div class="dynamic-mixer-container" id="mixer-${a.id}">
                    ${camadas.map((url, i) => `
                        <div class="mixer-channel">
                            <div class="mixer-bar-bg">
                                <div class="mixer-bar-fill" id="mixer-fill-${a.id}-${i}" style="height: ${i === 0 ? '100%' : '0%'}; background: ${i === 0 ? 'var(--primary)' : 'transparent'}; box-shadow: ${i === 0 ? '0 0 10px var(--primary-glow)' : 'none'};"></div>
                            </div>
                            <span class="mixer-label">L${i+1}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        // Gera as tags de <audio> escondidas para cada camada
        const audioTagsHtml = camadas.map((url, index) => `
            <audio id="audio-elemento-${a.id}-${index}" src="${url}" 
                   ${index === 0 ? `ontimeupdate="atualizarProgresso('${a.id}')" onloadedmetadata="atualizarTempoTotal('${a.id}')" onended="audioTerminou('${a.id}')"` : ''}
                   preload="auto" ${a.loopStart ? 'loop' : ''}></audio>
        `).join('');

        // Lógica de permissão: Autor ou Admin
        const souDono = a.enviadoPor === auth.currentUser.email;
        const souAdmin = window.userRole === 'admin';

        const menuAcoes = `
            <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.5rem; padding: 0 5px;">⋮</button>
                <div class="dropdown-content" style="right: 0; top: 30px; min-width: 160px;">
                    ${(souDono || souAdmin) ? `<button class="icon-btn" onclick="window.abrirEdicaoAudio('${a.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:var(--primary); display:flex; align-items:center; gap:8px;"><span>✏️</span> Editar Postagem</button>` : ''}
                    <button class="icon-btn" onclick="abrirFeedbackAudio('${a.id}', '${a.titulo}', '${camadas[0]}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ffc107; display:flex; align-items:center; gap:8px;"><span>💬</span> Deixar Feedback</button>
                    ${(souDono || souAdmin) ? `<button class="icon-btn del" onclick="deletarAudio('${a.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:10px; border-top:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:8px;"><span>🗑️</span> Excluir</button>` : ''}
                </div>
            </div>
        `;

        const btnDownloadAssets = a.assetsUrl ? `
            <a href="${a.assetsUrl}" target="_blank" class="btn-secondary" 
            style="font-size: 0.65rem; padding: 4px 8px; color: var(--primary); border-color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 5px; margin-top: 10px; width: fit-content;"
            title="Abrir pasta de arquivos originais">
            <span>⬇️</span> BAIXAR FONTES
            </a>` : '';

        return `
            <div class="audio-card" id="card-${a.id}">
                <div class="audio-header">
                    <div style="flex: 1; overflow: hidden;">
                        <h4 class="audio-title">${a.titulo}</h4>
                        <div style="display: flex; gap: 5px; align-items: center; margin-top: 5px; flex-wrap: wrap;">
                            <span class="audio-tag tag-${a.tag}">${a.tag}</span>
                            <span class="badge" style="background: rgba(255,255,255,0.03); color: #888; border: 1px solid rgba(255,255,255,0.1); font-size: 0.6rem;">🥁 ${a.bpm} BPM</span>
                            ${techSpecs}
                        </div>
                    </div>
                    ${menuAcoes}
                </div>

                ${btnLetra}

                <div class="audio-player-zone" style="margin-top: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 10px;">
                    <div class="waveform-container-placeholder" style="height: 4px; background: #333; margin-bottom: 10px; border-radius: 2px;"></div>
                    
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button class="btn-play-custom" id="btn-play-${a.id}" onclick="togglePlayAudioDinâmico('${a.id}', ${camadas.length})">▶</button>
                        <div style="flex: 1;">
                            <div class="audio-progress-container" onclick="seekAudioDinamico(event, '${a.id}', ${camadas.length})" style="height: 8px;">
                                <div class="audio-progress-fill" id="progress-${a.id}"></div>
                            </div>
                            <div style="display:flex; justify-content: space-between; margin-top: 5px;">
                                <span class="audio-time" id="time-${a.id}" style="font-size: 0.65rem;">0:00 / 0:00</span>
                                <button id="btn-loop-${a.id}" onclick="toggleLoopDinamico('${a.id}', ${camadas.length})" style="background:none; border:none; color:#555; cursor:pointer; font-size:0.7rem; font-weight:bold;">🔁 LOOP: ${a.loopStart ? 'ON (Nativo)' : 'OFF'}</button>
                            </div>
                        </div>
                    </div>
                </div>
                ${simuladorFader}
                ${audioTagsHtml}
                ${btnDownloadAssets} <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.65rem; color: #666; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                        ✍️ Autor: <span style="color: var(--primary);">${a.enviadoPor ? a.enviadoPor.split('@')[0] : 'Desconhecido'}</span>
                    </span>
                    <span style="font-size: 0.6rem; color: #444;">${new Date(a.dataCriacao).toLocaleDateString()}</span>
                </div>
            </div>
        `;
    }).join('');
};

// 2.4 DELETAR ÁUDIO
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
// 3. O MOTOR DE ÁUDIO SINCRONIZADO (NOVIDADE)
// ==========================================

// Crossfade / Matemática da Intensidade e Mixer Visual (Blindado para SFX)
window.mudarIntensidadeAudio = (id, valorStr, numCamadas) => {
    const valor = parseInt(valorStr);
    
    // CORREÇÃO: Só tenta atualizar o texto se ele existir na tela (Áudios Dinâmicos)
    const displayNivel = document.getElementById(`intensity-val-${id}`);
    if (displayNivel) displayNivel.innerText = `Nível: ${valor}`;
    
    const l0 = document.getElementById(`audio-elemento-${id}-0`);
    if (l0) l0.volume = 1.0; 

    // Atualiza o visualizador se ele existir
    const fill0 = document.getElementById(`mixer-fill-${id}-0`);
    if (fill0) {
        fill0.style.height = '100%';
        fill0.style.background = 'var(--primary)';
    }

    if (numCamadas > 1) {
        const fatia = 100 / (numCamadas - 1);
        for (let i = 1; i < numCamadas; i++) {
            const track = document.getElementById(`audio-elemento-${id}-${i}`);
            const inicioFatia = (i - 1) * fatia;
            const progressoNestaFatia = (valor - inicioFatia) / fatia;
            const volumeCalc = Math.min(1, Math.max(0, progressoNestaFatia));

            if (track) track.volume = volumeCalc;
            
            const fill = document.getElementById(`mixer-fill-${id}-${i}`);
            if (fill) {
                fill.style.height = `${volumeCalc * 100}%`;
                let cor = i >= 4 ? '#ff5252' : (i >= 2 ? '#ffc107' : 'var(--primary)');
                fill.style.background = cor;
            }
        }
    }
};

window.togglePlayAudioDinâmico = async (id, numCamadas) => {
    const btn = document.getElementById(`btn-play-${id}`);
    const tracks = [];
    for(let i=0; i<numCamadas; i++) tracks.push(document.getElementById(`audio-elemento-${id}-${i}`));

    const card = window.audiosCache.find(a => a.id === id);
    window.sincronizarComMaster = (id, titulo, subtitulo, numCamadas, tipo = 'projeto') => {
        window.fonteMidiaAtual = tipo;
        window.audioIdAtualMestre = id;
        window.audioCamadasAtualMestre = numCamadas; // MÁGICA: Agora o Master sabe o que está tocando

        const player = document.getElementById('master-player-float');
        document.getElementById('master-player-title').innerText = titulo;
        document.getElementById('master-player-subtitle').innerText = subtitulo;

        player.classList.add('active');
    };

    if (tracks[0].paused) {
        // Antes de dar play, força os volumes para o ponto zero do Fader!
        window.mudarIntensidadeAudio(id, '0', numCamadas);

        try {
            await Promise.all(tracks.map(t => t.play()));
            if(btn) btn.innerText = "⏸";
            document.getElementById('master-play-icon').innerText = "⏸";
            window.audioAtualExecucao = id;
        } catch(e) { console.error("Erro Play Sincronizado:", e); }
    } else {
        tracks.forEach(t => t.pause());
        if(btn) btn.innerText = "▶";
        document.getElementById('master-play-icon').innerText = "▶";
        window.audioAtualExecucao = null;
    }
};

window.seekAudioDinamico = (e, id, numCamadas) => {
    const mainTrack = document.getElementById(`audio-elemento-${id}-0`);
    if (!mainTrack || !mainTrack.duration) return;

    const cliqueX = e.offsetX;
    const larguraTotal = e.currentTarget.offsetWidth;
    const tempoAlvo = (cliqueX / larguraTotal) * mainTrack.duration;

    // Arrasta TODAS as cabeças de reprodução para o mesmo tempo!
    for(let i=0; i<numCamadas; i++) {
        const t = document.getElementById(`audio-elemento-${id}-${i}`);
        if(t) t.currentTime = tempoAlvo;
    }
};

window.toggleLoopDinamico = (id, numCamadas) => {
    const btn = document.getElementById(`btn-loop-${id}`);
    let isLooping = false;
    for(let i=0; i<numCamadas; i++) {
        const t = document.getElementById(`audio-elemento-${id}-${i}`);
        if(t) {
            t.loop = !t.loop;
            isLooping = t.loop;
        }
    }
    btn.style.color = isLooping ? "var(--primary)" : "#555";
    btn.innerText = `🔁 LOOP: ${isLooping ? 'ON' : 'OFF'}`;
};

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


// 3.2 CONTROLE DE PROGRESSO E SEEK
// 3.3 CONTROLE DE PROGRESSO E SEEK
window.seekAudio = (e, id) => {
    // Busca a Camada 0 (A música base que dita o tempo)
    const mainTrack = document.getElementById(`audio-elemento-${id}-0`);

    // Trava de segurança: Impede a matemática de quebrar se não tiver tempo total
    if (!mainTrack || !mainTrack.duration || isNaN(mainTrack.duration)) return;

    const container = e.currentTarget;
    const cliqueX = e.offsetX;
    const larguraTotal = container.offsetWidth;
    const novaPorcentagem = cliqueX / larguraTotal;
    const tempoAlvo = novaPorcentagem * mainTrack.duration;

    // MÁGICA: Ao clicar na barra, ele arrasta TODAS as camadas (até 5) pro mesmo tempo!
    for(let i=0; i<5; i++) {
        const t = document.getElementById(`audio-elemento-${id}-${i}`);
        if(t) t.currentTime = tempoAlvo;
    }
};

// --- ATUALIZADOR DE PROGRESSO E MOTOR ANTI-DRIFT (SUAVE) ---
window.atualizarProgresso = (id) => {
    const audio = document.getElementById(`audio-elemento-${id}-0`);
    if (!audio) return;

    // 1. O MOTOR FMOD ANTI-DRIFT (Sincronização Suave)
    const camadasAtivas = document.querySelectorAll(`[id^="audio-elemento-${id}-"]`);
    if (camadasAtivas.length > 1 && !audio.paused) {
        const tempoMestre = audio.currentTime;
        for (let i = 1; i < camadasAtivas.length; i++) {
            const trackLayer = camadasAtivas[i];
            
            // CORREÇÃO: Aumentamos a tolerância de 0.15 para 0.4 segundos.
            // Isso impede que os micro-desvios normais do navegador fiquem "picotando" (clipping) o áudio toda hora.
            if (Math.abs(trackLayer.currentTime - tempoMestre) > 0.4) {
                trackLayer.currentTime = tempoMestre;
            }
        }
    }

    // 2. ATUALIZA O CARD INDIVIDUAL (Barra de tempo)
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

    // 3. SINCRONIZA COM O MASTER PLAYER NO RODAPÉ
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

// ==========================================
// 4. SISTEMA MASTER PLAYER
// ==========================================
// 4.1 CONTROLE CENTRALIZADO
window.sincronizarComMaster = (id, titulo, subtitulo, tipo = 'projeto') => {
    window.fonteMidiaAtual = tipo;
    window.audioIdAtualMestre = id;

    const player = document.getElementById('master-player-float');
    document.getElementById('master-player-title').innerText = titulo;
    document.getElementById('master-player-subtitle').innerText = subtitulo;

    player.classList.add('active'); // Pula na tela
};

// 4.2 CONTROLES DO MASTER PLAYER
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
        // Usa a memória global para dar play/pause nas múltiplas camadas
        window.togglePlayAudioDinâmico(window.audioIdAtualMestre, window.audioCamadasAtualMestre);
    }
};

// 4.3 AJUSTE DE VOLUME MASTER
window.ajustarVolumeMaster = (valor) => {
    // Abaixa das músicas dos projetos
    document.querySelectorAll('audio').forEach(a => a.volume = valor);
    // Abaixa da rádio global
    if (window.playerRadio) window.playerRadio.volume = valor;
    // Salva preferência
    localStorage.setItem('hub_master_volume', valor);
};

// 4.4 FECHAR MASTER PLAYER
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

// ==========================================
// 5. MOODBOARD DE REFERÊNCIAS ÁUDIO-VISUAIS
// ==========================================

if (!document.getElementById('moodboard-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'moodboard-pulse-style';
    style.innerHTML = `
        @keyframes pulseMoodboard {
            0% { transform: scale(1); filter: brightness(0.4) contrast(1.1); }
            100% { transform: scale(1.12); filter: brightness(1.3) contrast(1.2); box-shadow: inset 0 0 50px rgba(255,193,7,0.3); }
        }
    `;
    document.head.appendChild(style);
}

window.refAudioEditandoId = null;

// ABRE MODAL PARA CRIAR NOVA
window.abrirModalNovaReferencia = () => {
    window.refAudioEditandoId = null;
    document.getElementById('refTitulo').value = '';
    document.getElementById('refUrl').value = '';
    if(document.getElementById('refImageUrl')) document.getElementById('refImageUrl').value = '';
    if(document.getElementById('refBpm')) document.getElementById('refBpm').value = '120';
    document.querySelector('#modalNovaReferencia h2').innerText = "📌 Nova Referência (Moodboard)";
    window.openModal('modalNovaReferencia');
};

// ABRE MODAL PARA EDITAR EXISTENTE
window.abrirEdicaoReferenciaAudio = (id, titulo, urlEmbed, imageUrl, bpm) => {
    window.refAudioEditandoId = id;
    document.getElementById('refTitulo').value = titulo || '';
    document.getElementById('refUrl').value = urlEmbed || '';
    if(document.getElementById('refImageUrl')) document.getElementById('refImageUrl').value = imageUrl || '';
    if(document.getElementById('refBpm')) document.getElementById('refBpm').value = bpm || 120;
    
    document.querySelector('#modalNovaReferencia h2').innerText = "✏️ Editar Referência";
    window.openModal('modalNovaReferencia');
};

// SALVAR OU ATUALIZAR
window.salvarReferenciaAudio = async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('refTitulo').value;
    let url = document.getElementById('refUrl').value.trim();
    
    let imageUrl = document.getElementById('refImageUrl')?.value.trim() || null;
    if (imageUrl) {
        imageUrl = window.converterLinkDireto(imageUrl); // Conversão vital pro Dropbox funcionar
    }
    
    const bpm = parseInt(document.getElementById('refBpm')?.value) || 120;

    // Conversores Inteligentes de Embed
    if (url.includes('youtube.com/watch?v=')) {
        url = url.replace('watch?v=', 'embed/');
        if (url.includes('&')) url = url.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        url = url.replace('youtu.be/', 'youtube.com/embed/');
    } else if (url.includes('spotify.com/track/')) {
        url = url.replace('/track/', '/embed/track/');
    }

    const dados = {
        titulo: titulo,
        urlEmbed: url,
        imageUrl: imageUrl, 
        bpm: bpm, 
        projetoId: window.projetoAtualId,
        enviadoPor: auth.currentUser.email.split('@')[0],
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.refAudioEditandoId) {
            // ATUALIZA SE ESTIVER EDITANDO
            await updateDoc(doc(db, "referencias_audio", window.refAudioEditandoId), dados);
            window.refAudioEditandoId = null;
        } else {
            // CRIA NOVO
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "referencias_audio"), dados);
        }
        
        window.closeModal('modalNovaReferencia');
    } catch(err) { console.error(err); }
};

// RENDERIZAR NA TELA
window.carregarReferenciasAudio = (pid) => {
    const grid = document.getElementById('moodboard-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "referencias_audio"), where("projetoId", "==", pid)), (snap) => {
        if (snap.empty) {
            grid.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); font-size:0.85rem; text-align:center; padding:40px;">O Moodboard está vazio. Cole links do Youtube ou Spotify!</div>`;
            return;
        }
        
        grid.innerHTML = snap.docs.map(d => {
            const r = d.data();
            const isSpotify = r.urlEmbed.includes('spotify.com') || r.urlEmbed.includes('spotify.com/track/');
            const h = isSpotify ? '152px' : '200px';
            const tempoAnimacao = 60 / (r.bpm || 120);

            let bgHtml = '';
            let cardStyle = `background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid var(--border-color); min-height: 380px; display: flex; flex-direction: column;`;

            if (r.imageUrl) {
                bgHtml = `
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${r.imageUrl}'); background-size: cover; background-position: center; z-index: 0; animation: pulseMoodboard ${tempoAnimacao}s infinite alternate ease-in-out; border-radius: inherit; will-change: transform;"></div>
                    <div style="position: absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(to top, rgba(15,15,18,0.98) 5%, rgba(15,15,18,0.3) 100%); z-index: 1; pointer-events: none; border-radius: inherit;"></div>
                `;
                cardStyle = `position: relative; min-height: 380px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,193,7,0.5); box-shadow: 0 15px 40px rgba(0,0,0,0.8); border-radius: 16px; -webkit-mask-image: -webkit-radial-gradient(white, black); mask-image: radial-gradient(white, black); isolation: isolate;`;
            }

            const safeImg = r.imageUrl ? r.imageUrl.replace(/'/g, "%27") : '';
            const safeTit = r.titulo ? r.titulo.replace(/'/g, "\\'") : '';

            // MENU DE AÇÕES OCULTO (Lápis e Lixeira)
            const menuTresPontos = `
                <div class="comment-menu-container">
                    <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="background: rgba(0,0,0,0.6); width:32px; height:32px; border-radius:8px; color:#fff; font-size:1.2rem; line-height:1;">⋮</button>
                    <div class="dropdown-content" style="right: 0; top: 40px; min-width: 130px;">
                        <button onclick="window.abrirEdicaoReferenciaAudio('${d.id}', '${safeTit}', '${r.urlEmbed}', '${safeImg}', ${r.bpm})">✏️ Editar</button>
                        <button class="del" onclick="deletarReferencia('${d.id}')">🗑️ Excluir</button>
                    </div>
                </div>
            `;

            return `
                <div class="moodboard-card" style="${cardStyle}">
                    ${bgHtml}
                    
                    <div style="position: relative; z-index: 2; padding: 20px; flex: 1; display: flex; flex-direction: column;">
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 20px;">
                            <strong style="color:#fff; font-size:1.2rem; text-shadow: 0 2px 10px rgba(0,0,0,0.5); flex:1; padding-right:10px;">${r.titulo}</strong>
                            <div style="display:flex; gap: 8px;">
                                <button class="icon-btn" onclick="const iframe = document.getElementById('iframe-container-${d.id}'); iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none'; this.innerText = iframe.style.display === 'none' ? '🙈' : '👁️';" style="background: rgba(0,0,0,0.6); width:32px; height:32px; border-radius:8px; color:#fff; font-size:1rem;" title="Mostrar/Esconder">👁️</button>
                                ${menuTresPontos}
                            </div>
                        </div>
                        
                        <div id="iframe-container-${d.id}" style="margin-bottom: 20px; transition: all 0.3s ease;">
                            <div style="border-radius: 12px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);">
                                <iframe src="${r.urlEmbed}" height="${h}" width="100%" allow="encrypted-media; fullscreen" allowfullscreen style="border:none; display: block;"></iframe>
                            </div>
                        </div>

                        <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                            ${r.imageUrl ? `<span class="badge" style="background: rgba(255,193,7,0.2); color: #ffc107; border: 1px solid rgba(255,193,7,0.4); padding: 5px 12px; font-weight: 800; font-size: 0.75rem;">💓 ${r.bpm} BPM</span>` : '<span></span>'}
                            <span style="font-size:0.65rem; color:#aaa; font-weight: bold; opacity: 0.8; text-transform:uppercase;">POR ${r.enviadoPor}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    });
};

window.deletarReferencia = async (id) => {
    if(confirm("Apagar referência?")) await deleteDoc(doc(db, "referencias_audio", id));
};

// ==========================================
// 6. SISTEMA DE FEEDBACK COM TIMESTAMPS
// ==========================================
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
// 7. HEARTKEY RADIO GLOBAL ENGINE
// ==========================================
window.playerRadio = new Audio();
window.radioConfigGlobal = {}; // Cache da programação vinda do banco

// 7.1 CONFIGURAÇÃO E ESCUTA GLOBAL
window.iniciarEscutaRadioGlobal = () => {
    onSnapshot(doc(db, "configuracoes", "radio_global"), (docSnap) => {
        if (docSnap.exists()) {
            window.radioConfigGlobal = docSnap.data();
            console.log("📻 Programação da rádio atualizada pelo Admin.");
        }
    });
};

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

// 7.2 PLAYER DA RÁDIO
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

// 7.3 AGENDADOR DE PLANTÃO
setInterval(() => {
    const config = window.radioConfigGlobal;
    if (!config.horario) return;

    const agora = new Date();
    const horaAtual = agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (horaAtual === config.horario && !window.radioStatus?.estaTocandoNoticia) {
        window.dispararPlantaoGlobal();
    }
}, 60000);

// 7.4 MOTOR DE RÁDIO COM FADE OUT
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

// 7.5 CONFIGURAÇÃO LOCAL DA RÁDIO
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

// ==========================================
// 8. NAVEGAÇÃO E UTILITÁRIOS
// ==========================================
// --- NAVEGAÇÃO DAS SUB-ABAS DE ÁUDIO ---
window.switchAudioSubTab = (viewId, btn, index) => {
    document.querySelectorAll('.audio-view-content').forEach(el => el.style.display = 'none');
    
    const container = btn.closest('.audio-subtabs');
    container.querySelectorAll('.audio-subtab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Move a pílula visualmente
    const slider = document.getElementById('audio-slider');
    if (slider) {
        slider.style.left = index === 0 ? '4px' : '50%';
    }

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.style.display = 'block';
};

window.abrirEdicaoAudio = (id) => {
    // Fecha qualquer dropdown aberto
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
    
    const audio = window.audiosCache.find(a => a.id === id);
    if (!audio) return;

    window.audioEditandoId = id;

    // Preenche os campos básicos
    document.getElementById('audioTitulo').value = audio.titulo || "";
    document.getElementById('audioTag').value = audio.tag || "BGM";
    document.getElementById('audioBpm').value = audio.bpm || "";
    document.getElementById('audioSampleRate').value = audio.sampleRate || "48kHz";
    document.getElementById('audioLufs').value = audio.lufs || "";
    document.getElementById('audioLoopStart').value = audio.loopStart || "";
    document.getElementById('audioLoopEnd').value = audio.loopEnd || "";
    document.getElementById('audioLetra').value = audio.letra || "";
    document.getElementById('audioAssetsUrl').value = audio.assetsUrl || "";

    // Preenche os links das camadas (Stems)
    const camadas = audio.camadas || [];
    for (let i = 1; i <= 5; i++) {
        const input = document.getElementById(`audioUrl${i}`);
        if (input) input.value = camadas[i - 1] || "";
    }

    // Muda o visual do Modal para "Modo Edição"
    const modal = document.getElementById('modalNovoAudio');
    modal.querySelector('h2').innerText = "✏️ Editar Áudio (Engine)";
    modal.querySelector('button[type="submit"]').innerText = "Salvar Alterações";

    window.openModal('modalNovoAudio');
};

// Reset do estado ao clicar no botão "+ Enviar Áudio"
const btnNovoAudioOriginal = document.querySelector('button[onclick*="modalNovoAudio"]');
if (btnNovoAudioOriginal) {
    const originalOnClick = btnNovoAudioOriginal.onclick;
    btnNovoAudioOriginal.onclick = () => {
        window.audioEditandoId = null;
        document.getElementById('formNovoAudio').reset();
        const modal = document.getElementById('modalNovoAudio');
        modal.querySelector('h2').innerText = "🎵 Lançar Novo Áudio (Game Ready)";
        modal.querySelector('button[type="submit"]').innerText = "🚀 Lançar para a Engine";
        window.openModal('modalNovoAudio');
    };
}

/* ==========================================================================
   CONTROLE DE PULAR FAIXA (NEXT / PREV)
   ========================================================================== */
window.pularFaixaMaster = (direcao) => {
    // 1. Lógica para Áudios do Projeto (HeartBeat Engine)
    if (window.fonteMidiaAtual === 'projeto' && window.audiosCache && window.audiosCache.length > 0) {
        
        // Acha qual é o número (index) da música tocando agora na lista
        const indexAtual = window.audiosCache.findIndex(a => a.id === window.audioIdAtualMestre);
        if (indexAtual === -1) return;

        let novoIndex;
        if (direcao === 'next') {
            // Se for o último áudio, volta pro primeiro (0)
            novoIndex = indexAtual + 1 >= window.audiosCache.length ? 0 : indexAtual + 1;
        } else {
            // Se for o primeiro e voltar, vai pro último
            novoIndex = indexAtual - 1 < 0 ? window.audiosCache.length - 1 : indexAtual - 1;
        }

        const proximoAudio = window.audiosCache[novoIndex];
        const numCamadas = proximoAudio.camadas ? proximoAudio.camadas.length : 1;

        // Simula o clique do usuário no card da próxima música
        window.togglePlayAudioDinâmico(proximoAudio.id, numCamadas);
    } 
    // 2. Lógica para a Rádio Global (Se aplicável)
    else if (window.fonteMidiaAtual === 'radio') {
        if (typeof window.avancarMusicaRadio === 'function') {
            window.avancarMusicaRadio(direcao); // Pula se houver playlist na rádio
        } else {
            window.mostrarToastNotificacao("Rádio", "A transmissão da rádio atual não permite pular faixas.", "geral");
        }
    }
};  

