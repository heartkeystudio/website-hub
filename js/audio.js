// ==========================================
// AUDIO.JS - Central de Áudio, Player e Rádio
// ==========================================
import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, onSnapshot, getDoc } from './firebase.js';

// ==========================================
// 1. INICIALIZAÇÃO E VARIÁVEIS GLOBAIS
// ==========================================
window.audioAtualExecucao = null; 
window.audiosCache = [];
window.audioFiltroAtual = 'all';
window.audioIdAtualMestre = null;
window.fonteMidiaAtual = null; 
window.audioFeedbackAtualId = null;
window.audioEditandoId = null; 
window.audioCamadasAtualMestre = 1; 

// ==========================================
// 2. GERENCIAMENTO DE ÁUDIOS (CRUD)
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
    const adminReq = document.getElementById('audioAdminReq')?.checked || false;
    
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

    const assetLinkValor = document.getElementById('audioAssetLink')?.value.trim() || ""; 

    const dados = {
        titulo, tag, bpm, sampleRate, lufs, loopStart, loopEnd, letra,
        assetLink: assetLinkValor,
        exigeAprovacao: adminReq,
        camadas: camadasConvertidas, 
        projetoId: window.projetoAtualId,
        dataAtualizacao: new Date().toISOString()
    };

    try {
        if (window.audioEditandoId) {
            await updateDoc(doc(db, "audios", window.audioEditandoId), dados);
            window.mostrarToastNotificacao("HeartBeat", "Áudio atualizado com sucesso!", "audio");
            window.audioEditandoId = null;
        } else {
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

window.carregarAudiosDoProjeto = (pid) => {
    if (window.carregarReferenciasAudio) window.carregarReferenciasAudio(pid);

    onSnapshot(query(collection(db, "audios"), where("projetoId", "==", pid)), (snap) => {
        window.audiosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderizarAudios();
    });
};

window.aplicarFiltroAudio = () => {
    window.audioFiltroAtual = document.getElementById('audio-filter').value;
    window.renderizarAudios();
};

// ==========================================
// 2.3 RENDERIZAÇÃO DA GALERIA VST STUDIO
// ==========================================
window.renderizarAudios = () => {
    if (!document.getElementById('vst-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'vst-pulse-style';
        style.innerHTML = `
            @keyframes pulseCyan {
                0% { box-shadow: 0 0 5px rgba(0,234,255,0.3); }
                100% { box-shadow: 0 0 18px rgba(0,234,255,0.9), 0 0 8px rgba(0,234,255,0.5); }
            }
            @keyframes pulseGreen {
                0% { box-shadow: 0 0 8px rgba(129, 254, 78, 0.4); }
                100% { box-shadow: 0 0 25px rgba(129, 254, 78, 0.9), 0 0 10px rgba(129, 254, 78, 0.5); }
            }

            /* Animação exclusiva para SVGs e Máscaras (Respeita o formato do desenho) */
            @keyframes pulseIconGlow {
                0% { filter: drop-shadow(0 0 2px var(--primary)); opacity: 0.8; }
                100% { filter: drop-shadow(0 0 8px var(--primary)) drop-shadow(0 0 12px var(--primary)); opacity: 1; }
            }
            
            /* Troca Perfeita de SVGs no Clique */
            .btn-base-normal { opacity: 1; transition: opacity 0.05s; }
            .btn-base-clicked { opacity: 0; transition: opacity 0.05s; }
            
            .vst-play-btn:active .btn-base-normal { opacity: 0; }
            .vst-play-btn:active .btn-base-clicked { opacity: 1; }
            
            /* Faz o LED (ícone) afundar junto com a arte da borracha */
            .vst-icon-wrapper { transition: transform 0.05s cubic-bezier(0.4, 0, 0.2, 1); }
            .vst-play-btn:active .vst-icon-wrapper { transform: translateY(2px) scale(0.96); filter: brightness(0.85); }
        `;
        document.head.appendChild(style);
    }
    
    const grid = document.getElementById('audios-grid');
    if (!grid) return;

    let filtrados = window.audiosCache;
    if (window.audioFiltroAtual !== 'all') {
        filtrados = window.audiosCache.filter(a => a.tag === window.audioFiltroAtual);
    }

    grid.innerHTML = filtrados.map(a => {
        const camadas = a.camadas || [a.arquivoUrl];
        const isDynamic = camadas.length > 1;

        // GERADOR DE ONDA GENÉRICA (ESTÉTICA INICIAL)
        let pontosOnda = ['0% 100%', '0% 50%'];
        let seed = 0; 
        for(let i=0; i<a.id.length; i++) seed += a.id.charCodeAt(i);
        
        for (let step = 3; step <= 97; step += 3) {
            let pico = Math.floor((Math.abs(Math.sin(seed + step) * 10000) % 1) * 70) + 10;
            pontosOnda.push(`${step}% ${pico}%`);
        }
        pontosOnda.push('100% 50%', '100% 100%');
        const formatoOndaInicial = `clip-path: polygon(${pontosOnda.join(', ')});`;

        const techSpecs = `
            <span class="badge" title="Sample Rate" style="background:rgba(0,0,0,0.5); border:1px solid #444; color:#aaa; font-size:0.55rem;">📻 ${a.sampleRate || '44.1kHz'}</span>
            <span class="badge" title="Loudness" style="background:rgba(0,0,0,0.5); border:1px solid #444; color:#aaa; font-size:0.55rem;">🔊 ${a.lufs !== '--' ? a.lufs+' LUFS' : '--'}</span>
            ${a.loopStart ? `<span class="badge" title="Loop Data" style="background:rgba(0,234,255,0.1); border:1px solid #00eaff; color:#00eaff; font-size:0.55rem;">🔁 Loop: ${a.loopStart}s ~ ${a.loopEnd}s</span>` : ''}
        `;

        const btnLetra = a.letra ? `<button class="icon-btn" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" style="font-size:0.75rem; color:#ffc107; margin-top: 10px;">📖 Ler Roteiro/Letra</button><div class="markdown-body" style="display:none; margin-top:5px; background:rgba(0,0,0,0.4)!important; font-size:0.8rem; padding:10px!important;">${a.letra.replace(/\n/g, '<br>')}</div>` : '';

        const souDono = a.enviadoPor === auth.currentUser.email;
        const souAdmin = window.userRole === 'admin';

        const badgeReview = a.aguardandoRevisao ? `<span class="badge" style="background: rgba(0, 234, 255, 0.2); color: #00eaff; border: 1px solid #00eaff; font-size:0.55rem;">🛎️ AGUARDANDO REVISÃO</span>` : '';
        const badgeAdmin = a.exigeAprovacao ? `<span class="badge" style="background: rgba(255, 193, 7, 0.2); color: #ffc107; border: 1px solid #ffc107; font-size:0.55rem;">⚠️ REVISÃO OBRIGATÓRIA</span>` : '';
        const badgeAprovado = a.statusAprovado ? `<span class="badge" style="background: rgba(129, 254, 78, 0.2); color: var(--primary); border: 1px solid var(--primary); font-size:0.55rem;">✅ APROVADO</span>` : '';

        const btnReview = (a.exigeAprovacao && !a.aguardandoRevisao && !a.statusAprovado) ? 
            `<button class="icon-btn" onclick="window.pedirRevisaoAudio('${a.id}', '${a.titulo.replace(/'/g, "\\'")}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#00eaff; display:flex; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.05);"><span>🛎️</span> Pedir Revisão</button>` : '';

        const btnApprove = (a.aguardandoRevisao && window.userRole === 'admin') ? 
            `<button class="icon-btn" onclick="window.aprovarAudioAdmin('${a.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ffc107; display:flex; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.05);"><span>🛡️</span> Aprovar Áudio</button>` : '';

        const btnReject = (a.aguardandoRevisao && window.userRole === 'admin') ? 
            `<button class="icon-btn" onclick="window.reprovarAudioAdmin('${a.id}', '${a.enviadoPor}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ff5252; display:flex; align-items:center; gap:8px;"><span>❌</span> Solicitar Ajustes</button>` : '';

        const btnReopen = (a.statusAprovado && window.userRole === 'admin') ? 
            `<button class="icon-btn" onclick="window.reabrirAudioAdmin('${a.id}', '${a.titulo.replace(/'/g, "\\'")}', '${a.enviadoPor}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ffc107; display:flex; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.05);"><span>🔓</span> Reabrir Ajustes</button>` : '';

        const menuAcoes = `
            <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="font-size:1.5rem; padding: 0 5px; color: #888;">⋮</button>
                <div class="dropdown-content" style="right: 0; top: 30px; min-width: 180px; background: #23232b; border: 1px solid #3a3a45; box-shadow: 0 10px 30px rgba(0,0,0,0.9);">
                    ${(souDono || souAdmin) ? `<button class="icon-btn" onclick="window.abrirEdicaoAudio('${a.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:var(--primary); display:flex; align-items:center; gap:8px;"><span>✏️</span> Editar Postagem</button>` : ''}
                    <button class="icon-btn" onclick="abrirFeedbackAudio('${a.id}', '${a.titulo.replace(/'/g, "\\'")}', '${camadas[0]}')" style="font-size:0.8rem; text-align:left; width:100%; padding:10px; color:#ffc107; display:flex; align-items:center; gap:8px;"><span>💬</span> Deixar Feedback</button>
                    ${btnReview} ${btnApprove} ${btnReject} ${btnReopen}
                    ${(souDono || souAdmin) ? `<button class="icon-btn del" onclick="deletarAudio('${a.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:10px; border-top:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; gap:8px;"><span>🗑️</span> Excluir</button>` : ''}
                </div>
            </div>
        `;

        const linkDownload = a.assetLink || a.assetsUrl;
        const btnDownloadAssets = linkDownload ? `
            <a href="${linkDownload}" target="_blank" class="vst-btn" 
            style="background: #2a2a32; color: var(--primary); border: 1px solid #3a3a45; padding: 10px; font-size: 0.75rem; text-decoration: none; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.5);"
            onmouseover="this.style.background='#33333d'; this.style.borderColor='var(--primary)';"
            onmouseout="this.style.background='#2a2a32'; this.style.borderColor='#3a3a45';">
            <span style="font-family: 'JetBrains Mono', monospace; font-weight: bold;">[↓] EXPORT ASSET</span>
            </a>` : '';

        const audioTagsHtml = camadas.map((url, index) => `
            <audio id="audio-elemento-${a.id}-${index}" src="${url}" 
                   ${index === 0 ? `ontimeupdate="atualizarProgresso('${a.id}')" onloadedmetadata="atualizarTempoTotal('${a.id}')" onended="audioTerminou('${a.id}')"` : ''}
                   preload="auto" ${a.loopStart ? 'loop' : ''}></audio>`).join('');

        return `
            <div class="audio-card" id="card-${a.id}" style="background: #1c1c21; border-radius: 8px; border: 1px solid #2d2d36; box-shadow: 0 10px 30px rgba(0,0,0,0.8); display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                
                <div style="background: #23232b; padding: 12px 15px; border-bottom: 2px solid var(--primary); display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <h4 style="font-size: 1rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px; margin: 0;">${a.titulo}</h4>
                        <div style="display: flex; gap: 5px; align-items: center; flex-wrap: wrap; font-family: 'JetBrains Mono', monospace;">
                            <span style="font-size: 0.6rem; background: #33333d; color: #aaa; padding: 2px 6px; border-radius: 3px;">${a.tag}</span>
                            <span style="font-size: 0.6rem; background: #33333d; color: #aaa; padding: 2px 6px; border-radius: 3px;">${a.bpm || '--'} BPM</span>
                            ${techSpecs}
                        </div>
                        <div style="display: flex; gap: 6px; margin-top: 2px;">
                            ${badgeAdmin} ${badgeReview} ${badgeAprovado}
                        </div>
                    </div>
                    ${menuAcoes}
                </div>

                <div style="flex: 1; display: flex; flex-direction: column;">
                    ${btnLetra}

                    <div style="position: relative; margin: 15px 0; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); overflow: hidden; border: 1px solid #2a2a32; background: transparent;">
                        
                        <img src="images/heartbeatas/spectogram_outsideframe_light.svg" style="position: absolute; center/cover no-repeat; z-index: 1; pointer-events: none;">
                        
                        <img src="images/heartbeatas/screw.svg" style="position: absolute; top: -48px; left: -48px; width: 128px; pointer-events: none; z-index: 2;">
                        <img src="images/heartbeatas/screw.svg" style="position: absolute; top: -48px; right: -48px; width: 128px; pointer-events: none; z-index: 2;">
                        <img src="images/heartbeatas/screw.svg" style="position: absolute; bottom: -48px; left: -48px; width: 128px; pointer-events: none; z-index: 2;">
                        <img src="images/heartbeatas/screw.svg" style="position: absolute; bottom: -48px; right: -48px; width: 128px; pointer-events: none; z-index: 2;">

                        <div style="position: relative; z-index: 3; padding: 25px 20px 20px 20px;">
                            
                            <div style="position: relative; width: 100%; height: 60px; background: #050506; border-radius: 4px; box-shadow: inset 0 5px 15px rgba(0,0,0,1); border: 1px solid #111; margin-bottom: 20px; overflow: hidden;" onclick="seekAudioDinamico(event, '${a.id}', ${camadas.length})">

                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: url('images/heartbeatas/spectogram_lcd_glass.webp') center/cover no-repeat; mix-blend-mode: screen; pointer-events: none; z-index: 5;"></div>

                                <div style="position: absolute; top: 15%; left: 0; width: 100%; height: 80%; z-index: 2; cursor: crosshair;">
                                    <div id="wave-mask-container-${a.id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; ${formatoOndaInicial} transition: clip-path 0.4s ease-out;">
                                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 4px);"></div>
                                        <div id="progress-${a.id}" style="position: absolute; top: 0; left: 0; width: 0%; height: 100%; background: repeating-linear-gradient(90deg, var(--primary) 0px, var(--primary) 2px, transparent 2px, transparent 4px);"></div>
                                    </div>
                                    
                                    <div id="needle-${a.id}" style="position: absolute; top: 0; left: 0%; width: 2px; height: 100%; background: #fff; box-shadow: 0 0 10px var(--primary); pointer-events: none; z-index: 3;"></div>
                                </div>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: center; width: 95%;">
                                
                                <div style="display: flex; gap: 15px; align-items: center;">
                                    <button class="vst-play-btn" id="btn-play-${a.id}" onclick="togglePlayAudioDinâmico('${a.id}', ${camadas.length})" 
                                            style="background: transparent; border: none; padding: 0; cursor: pointer; outline: none; width: 49px; height: 50px; position: relative; border-radius: 50%; flex-shrink: 0;">
                                        
                                        <img src="images/heartbeatas/rounded_button.svg" class="btn-base-normal" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none;">
                                        <img src="images/heartbeatas/rounded_button_clicked.svg" class="btn-base-clicked" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none;">
                                        
                                        <div class="vst-icon-wrapper" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                                            <div id="icon_play-mask-${a.id}" style="width: 22px; height: 22px; background-color: var(--primary); -webkit-mask: url('images/heartbeatas/icon_play.svg') no-repeat center / contain; mask: url('images/heartbeatas/icon_play.svg') no-repeat center / contain; transform: translateX(2px); animation: pulseIconGlow 1.5s infinite alternate ease-in-out;"></div>
                                        </div>
                                    </button>

                                    <div style="position: relative; padding: 0 8px; background: #050506; border-radius: 4px; box-shadow: inset 0 2px 10px rgba(0,0,0,1); border: 1px solid #111; display: flex; align-items: center; justify-content: center; height: 36px; min-width: 90px; white-space: nowrap; overflow: hidden; flex-shrink: 0;">
                                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: url('images/heartbeatas/time_lcd_glass.webp') center/cover no-repeat; opacity: 0.6; mix-blend-mode: screen; pointer-events: none;"></div>
                                        <span id="time-${a.id}" style="position: relative; z-index: 2; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--primary); font-weight: bold; letter-spacing: 1px; text-shadow: 0 0 5px var(--primary);">0:00 / 0:00</span>
                                    </div>
                                </div>

                                <button id="btn-loop-${a.id}" onclick="toggleLoopDinamico('${a.id}', ${camadas.length})" 
                                        style="background: transparent; border: 1px solid #444; color: ${a.loopStart ? 'var(--primary)' : '#666'}; padding: 4px 14px; border-radius: 4px; cursor: pointer; font-size: 1.5rem; font-family: 'JetBrains Mono', monospace; font-weight: bold; transition: all 0.2s; white-space: nowrap; flex-shrink: 0;"
                                        onmouseover="this.style.borderColor='var(--primary)';" onmouseout="this.style.borderColor='#444';">
                                    ∞
                                </button>
                            </div>
                        </div>
                    </div>

                    ${isDynamic ? `
                    <div style="padding: 0px; background: #1a1a20; border-top: 1px solid #000; box-shadow: inset 0 1px 0px rgba(255,255,255,0.03); flex: 1;">
                        <div style="position: relative; margin: 15px 0; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); overflow: hidden; border: 1px solid #2a2a32; background: transparent;">
                            <img src="images/heartbeatas/spectogram_outsideframe_light.svg" style="position: absolute; center/cover no-repeat; left: 0px; width: 100%; z-index: 1; pointer-events: none;">
                            
                            <img src="images/heartbeatas/screw.svg" style="position: absolute; top: -48px; left: -48px; width: 128px; pointer-events: none; z-index: 2;">
                            <img src="images/heartbeatas/screw.svg" style="position: absolute; top: -48px; right: -48px; width: 128px; pointer-events: none; z-index: 2;">
                            <img src="images/heartbeatas/screw.svg" style="position: absolute; bottom: -48px; left: -48px; width: 128px; pointer-events: none; z-index: 2;">
                            <img src="images/heartbeatas/screw.svg" style="position: absolute; bottom: -48px; right: -48px; width: 128px; pointer-events: none; z-index: 2;">

                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; padding: 5px 32px"
                                

                                <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #888; letter-spacing: 1px;">| HEARTBEAT A.S.</span>
                                <span id="intensity-val-${a.id}" style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--primary); background: #09090b; padding: 2px 6px; border: 1px solid #2a2a32; border-radius: 3px;">LVL: 0</span>
                            </div>
                            
                            <div style="position: relative; width: 80%; margin: 0 auto; padding: 15px 0;">
                                <input type="range" min="0" max="100" value="0" 
                                    style="width: 100%; height: 30px; opacity: 0; cursor: ew-resize; position: relative; z-index: 4; margin: 0;" 
                                    oninput="
                                        window.mudarIntensidadeAudio('${a.id}', this.value, ${camadas.length}); 
                                        document.getElementById('fader-fill-${a.id}').style.width = this.value + '%'; 
                                        document.getElementById('fader-thumb-${a.id}').style.left = this.value + '%';
                                    ">
                                <div style="position: absolute; top: 50%; left: 0; transform: translateY(-50%); width: 100%; height: 6px; background: #09090b; border: 1px solid #2a2a32; border-radius: 3px; z-index: 1; pointer-events: none;"></div>
                                <div id="fader-fill-${a.id}" style="position: absolute; top: 50%; left: 0; transform: translateY(-50%); width: 0%; height: 6px; background: var(--primary); border-radius: 3px; z-index: 2; pointer-events: none; animation: pulseGreen 1.5s infinite alternate ease-in-out;"></div>
                                
                                <div id="fader-thumb-${a.id}" style="position: absolute; top: 50%; left: 0%; transform: translate(-50%, -50%); width: 14px; height: 32px; background: linear-gradient(180deg, #2a2a32 0%, #1a1a20 100%); border-radius: 3px; border-top: 1px solid #444; border-bottom: 1px solid #000; box-shadow: 0 5px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.5); z-index: 3; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                                    <div style="width: 60%; height: 2px; background: var(--primary); box-shadow: 0 0 5px var(--primary);"></div>
                                </div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; width: 100%; font-size: 0.6rem; color: #555; font-family: 'JetBrains Mono', monospace; margin-bottom: 15px; text-shadow: 0px 1px 0px rgba(255, 255, 255, 0.05), 0px -1px 0px rgba(0, 0, 0, 0.8);">
                                <span style="flex: 1; text-align: center;">EXPLORATION</span>
                                <span style="flex: 1; text-align: center;">TENSION</span>
                                <span style="flex: 1; text-align: center;">COMBAT</span>
                            </div>

                            <div id="mixer-${a.id}" style="display: flex; justify-content: space-around; background: #09090b; padding: 12px; border-radius: 6px; border: 1px solid #2a2a32; box-shadow: inset 0 2px 10px rgba(0,0,0,0.8);">
                                ${camadas.map((url, i) => `
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                                        <div style="width: 16px; height: 45px; background: #111; border: 1px solid #222; border-radius: 2px; position: relative; overflow: hidden;">
                                            <div id="mixer-fill-${a.id}-${i}" style="width: 100%; position: absolute; bottom: 0; height: ${i === 0 ? '100%' : '0%'}; background: ${i === 0 ? 'var(--primary)' : 'transparent'}; box-shadow: ${i === 0 ? '0 0 10px var(--primary)' : 'none'}; transition: height 0.1s ease, background 0.2s ease;"></div>
                                            <div style="position: absolute; top:0; left:0; width: 100%; height: 100%; background: repeating-linear-gradient(0deg, transparent, transparent 3px, #111 3px, #111 4px); z-index: 2;"></div>
                                        </div>
                                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; color: #666;">CH_${i+1}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${audioTagsHtml}
                </div> 

                <div style="margin-top: auto; padding: 15px; background: #1c1c21; border-top: 1px solid #2d2d36;">
                    ${btnDownloadAssets}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: ${linkDownload ? '15px' : '0'};">
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #555;">
                            USR: <span style="color: var(--primary);">${a.enviadoPor ? a.enviadoPor.split('@')[0].toUpperCase() : 'UNKNOWN'}</span>
                        </span>
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #555;">${new Date(a.dataCriacao).toLocaleDateString()}</span>
                    </div>
                </div>
                
            </div>
        `;
    }).join('');
};

window.atualizarProgresso = (id) => {
    const audio = document.getElementById(`audio-elemento-${id}-0`);
    if (!audio) return;

    const camadasAtivas = document.querySelectorAll(`[id^="audio-elemento-${id}-"]`);
    if (camadasAtivas.length > 1 && !audio.paused) {
        const tempoMestre = audio.currentTime;
        for (let i = 1; i < camadasAtivas.length; i++) {
            if (Math.abs(camadasAtivas[i].currentTime - tempoMestre) > 0.4) {
                camadasAtivas[i].currentTime = tempoMestre;
            }
        }
    }

    const bar = document.getElementById(`progress-${id}`);
    const needle = document.getElementById(`needle-${id}`);
    const timeTxt = document.getElementById(`time-${id}`);

    if (audio.duration && !isNaN(audio.duration)) {
        const perc = (audio.currentTime / audio.duration) * 100;
        if (bar) bar.style.width = `${perc}%`;
        if (needle) needle.style.left = `${perc}%`;

        const curMin = Math.floor(audio.currentTime / 60);
        const curSeg = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        const durMin = Math.floor(audio.duration / 60);
        const durSeg = Math.floor(audio.duration % 60).toString().padStart(2, '0');

        if (timeTxt) timeTxt.innerText = `${curMin}:${curSeg} / ${durMin}:${durSeg}`;
    }

    if (id === window.audioIdAtualMestre) {
        const masterBar = document.getElementById('master-progress-fill');
        if (masterBar && audio.duration) masterBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    }
};

// ==========================================
// 3. MOTOR DE AUDIO DINÂMICO (MIXER / FMOD SIMULATOR)
// ==========================================
window.mudarIntensidadeAudio = (id, valor, numCamadas) => {
    const val = parseInt(valor);
    const lvlTxt = document.getElementById(`intensity-val-${id}`);
    if (lvlTxt) lvlTxt.innerText = `LVL: ${val}`;

    for (let i = 0; i < numCamadas; i++) {
        const audio = document.getElementById(`audio-elemento-${id}-${i}`);
        const bar = document.getElementById(`mixer-fill-${id}-${i}`);
        
        let volume = 0;
        
        // Camada 0 (Base) toca sempre no máximo
        if (i === 0) {
            volume = 1; 
        } else {
            // Distribui as outras camadas pela barra de 0 a 100
            const step = 100 / (numCamadas - 1);
            const startFade = (i - 1) * step;
            const endFade = i * step;

            if (val <= startFade) {
                volume = 0;
            } else if (val >= endFade) {
                volume = 1;
            } else {
                volume = (val - startFade) / (endFade - startFade);
            }
        }

        // Aplica o volume na tag <audio> real
        if (audio) audio.volume = volume;
        
        // Atualiza a luz dos LEDs virtuais do Mixer (L1, L2, L3...)
        if (bar) {
            bar.style.height = `${volume * 100}%`;
            // No seu JS, onde atualiza o bar.style.background:
            bar.style.background = volume > 0 ? 'var(--primary)' : 'rgba(129, 254, 78, 0.05)'; // Um verde quase imperceptível
            bar.style.boxShadow = volume > 0 ? '0 0 10px var(--primary)' : 'inset 0 2px 5px rgba(0,0,0,0.8)'; // Fundo "oco"
        }
    }
};

// Cache para não decodificar a mesma música duas vezes
window.waveformCache = {}; 

window.gerarWaveformReal = async (id, url) => {
    if (window.waveformCache[id]) return; // Já geramos, ignora!
    window.waveformCache[id] = true; // Trava para não gerar duplo

    const maskContainer = document.getElementById(`wave-mask-container-${id}`);
    const timeElement = document.getElementById(`time-${id}`);
    const textoOriginal = timeElement.innerText;
    timeElement.innerText = "Analisando..."; // Feedback visual de loading

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        
        // Baixa o arquivo para analisar
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        // Decodifica o áudio na RAM
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0); // Pega as frequências do canal esquerdo
        
        const samples = 120; // Quantidade de "tijolinhos" no gráfico (resolução)
        const blockSize = Math.floor(rawData.length / samples);
        
        // Começa o desenho do polígono no canto inferior esquerdo
        let pontos = ['0% 100%'];
        
        for (let i = 0; i < samples; i++) {
            let start = i * blockSize;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[start + j]);
            }
            let average = sum / blockSize;
            
            // Amplifica o sinal visualmente (ajuste o 1000 se ficar baixo/alto demais)
            let altura = Math.min(100, Math.max(2, average * 1000)); 
            let y = 100 - altura; // Inverte para o CSS (100% é o fundo da tela)
            
            pontos.push(`${(i / samples) * 100}% ${y}%`);
        }
        
        // Termina o desenho no canto inferior direito
        pontos.push('100% 100%');
        
        // Aplica a onda real na tela!
        if(maskContainer) maskContainer.style.clipPath = `polygon(${pontos.join(', ')})`;
        
    } catch (err) {
        console.error("Erro ao gerar waveform real (Possível bloqueio de CORS):", err);
        // Não faz nada! Deixa o espectrograma estético/genérico que já está na tela brilhando.
    } finally {
        if(timeElement) timeElement.innerText = textoOriginal;
    }
};

window.togglePlayAudioDinâmico = async (id, numCamadas) => {
    const btnMask = document.getElementById(`icon_play-mask-${id}`);
    const tracks = [];
    for(let i=0; i<numCamadas; i++) tracks.push(document.getElementById(`audio-elemento-${id}-${i}`));

    window.sincronizarComMaster = (id, titulo, subtitulo, numCamadas, tipo = 'projeto') => {
        window.fonteMidiaAtual = tipo;
        window.audioIdAtualMestre = id;
        window.audioCamadasAtualMestre = numCamadas; 

        const player = document.getElementById('master-player-float');
        document.getElementById('master-player-title').innerText = titulo;
        document.getElementById('master-player-subtitle').innerText = subtitulo;

        player.classList.add('active');
    };

    if (tracks[0].paused) {
        
        // --- CHAMA A GERAÇÃO DE ONDA AQUI! ---
        window.gerarWaveformReal(id, tracks[0].src);
        // -------------------------------------

        window.mudarIntensidadeAudio(id, '0', numCamadas);
        try {
            await Promise.all(tracks.map(t => t.play()));
            if(btnMask) {
                btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_pause.svg')";
                btnMask.style.maskImage = "url('images/heartbeatas/icon_pause.svg')";
                btnMask.style.transform = "translateX(0px)"; // Zera o eixo para o Pause ficar no centro exato!
            }
            document.getElementById('master-icon_play').innerText = "⏸";
            window.audioAtualExecucao = id;
        } catch(e) { console.error("Erro Play Sincronizado:", e); }
    } else {
        tracks.forEach(t => t.pause());
        if(btnMask) {
            btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.maskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.transform = "translateX(2px)"; // Devolve os 2px para compensar a ilusão de ótica do Triângulo!
        }
        document.getElementById('master-icon_play').innerText = "▶";
        window.audioAtualExecucao = null;
    }
};

window.audioTerminou = (id) => { 
    const btnMask = document.getElementById(`icon_play-mask-${id}`);
    if(btnMask) {
        btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_play.svg')";
        btnMask.style.maskImage = "url('images/heartbeatas/icon_play.svg')";
        btnMask.style.transform = "translateX(4px)"; // Devolve o alinhamento
    }
};

window.seekAudioDinamico = (e, id, numCamadas) => {
    const mainTrack = document.getElementById(`audio-elemento-${id}-0`);
    if (!mainTrack || !mainTrack.duration) return;

    const cliqueX = e.offsetX;
    const larguraTotal = e.currentTarget.offsetWidth;
    const tempoAlvo = (cliqueX / larguraTotal) * mainTrack.duration;

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
};

window.seekAudio = (e, id) => {
    const mainTrack = document.getElementById(`audio-elemento-${id}-0`);
    if (!mainTrack || !mainTrack.duration || isNaN(mainTrack.duration)) return;

    const container = e.currentTarget;
    const cliqueX = e.offsetX;
    const larguraTotal = container.offsetWidth;
    const novaPorcentagem = cliqueX / larguraTotal;
    const tempoAlvo = novaPorcentagem * mainTrack.duration;

    for(let i=0; i<5; i++) {
        const t = document.getElementById(`audio-elemento-${id}-${i}`);
        if(t) t.currentTime = tempoAlvo;
    }
};

window.seekMaster = (e) => {
    if (!window.audioIdAtualMestre) return;
    window.seekAudio(e, window.audioIdAtualMestre);
};

window.atualizarTempoTotal = (id) => { window.atualizarProgresso(id); }; 

// ==========================================
// 4. SISTEMA MASTER PLAYER
// ==========================================
window.sincronizarComMaster = (id, titulo, subtitulo, tipo = 'projeto') => {
    window.fonteMidiaAtual = tipo;
    window.audioIdAtualMestre = id;

    const player = document.getElementById('master-player-float');
    document.getElementById('master-player-title').innerText = titulo;
    document.getElementById('master-player-subtitle').innerText = subtitulo;

    player.classList.add('active'); 
};

window.togglePlayMaster = () => {
    if (window.fonteMidiaAtual === 'radio') {
        const masterBtn = document.getElementById('master-icon_play');
        if (window.playerRadio.paused) {
            window.playerRadio.play();
            masterBtn.innerText = "⏸";
        } else {
            window.playerRadio.pause();
            masterBtn.innerText = "▶";
        }
    } else if (window.fonteMidiaAtual === 'projeto' && window.audioIdAtualMestre) {
        window.togglePlayAudioDinâmico(window.audioIdAtualMestre, window.audioCamadasAtualMestre);
    }
};

window.ajustarVolumeMaster = (valor) => {
    document.querySelectorAll('audio').forEach(a => a.volume = valor);
    if (window.playerRadio) window.playerRadio.volume = valor;
    localStorage.setItem('hub_master_volume', valor);
};

window.fecharPlayerMestre = () => {
    if (window.fonteMidiaAtual === 'radio') {
        window.playerRadio.pause();
        const status = document.getElementById('radio-status');
        if(status) status.innerText = 'Offline';
    }
    else if (window.fonteMidiaAtual === 'projeto' && window.audioIdAtualMestre) {
        const audio = document.getElementById(`audio-elemento-${window.audioIdAtualMestre}-0`);
        if(audio) audio.pause();
        const btnMask = document.getElementById(`icon_play-mask-${window.audioIdAtualMestre}`);
        if(btnMask) {
            btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.maskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.transform = "translateX(4px)"; // Devolve o alinhamento
        }
    }

    document.getElementById('master-player-float').classList.remove('active');
    document.getElementById('master-icon_play').innerText = "▶";
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

window.abrirModalNovaReferencia = () => {
    window.refAudioEditandoId = null;
    document.getElementById('refTitulo').value = '';
    document.getElementById('refUrl').value = '';
    if(document.getElementById('refImageUrl')) document.getElementById('refImageUrl').value = '';
    if(document.getElementById('refBpm')) document.getElementById('refBpm').value = '120';
    document.querySelector('#modalNovaReferencia h2').innerText = "📌 Nova Referência (Moodboard)";
    window.openModal('modalNovaReferencia');
};

window.abrirEdicaoReferenciaAudio = (id, titulo, urlEmbed, imageUrl, bpm) => {
    window.refAudioEditandoId = id;
    document.getElementById('refTitulo').value = titulo || '';
    document.getElementById('refUrl').value = urlEmbed || '';
    if(document.getElementById('refImageUrl')) document.getElementById('refImageUrl').value = imageUrl || '';
    if(document.getElementById('refBpm')) document.getElementById('refBpm').value = bpm || 120;
    
    document.querySelector('#modalNovaReferencia h2').innerText = "✏️ Editar Referência";
    window.openModal('modalNovaReferencia');
};

window.salvarReferenciaAudio = async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('refTitulo').value;
    let url = document.getElementById('refUrl').value.trim();
    
    let imageUrl = document.getElementById('refImageUrl')?.value.trim() || null;
    if (imageUrl) {
        imageUrl = window.converterLinkDireto(imageUrl); 
    }
    
    const bpm = parseInt(document.getElementById('refBpm')?.value) || 120;

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
            await updateDoc(doc(db, "referencias_audio", window.refAudioEditandoId), dados);
            window.refAudioEditandoId = null;
        } else {
            dados.dataCriacao = new Date().toISOString();
            await addDoc(collection(db, "referencias_audio"), dados);
        }
        
        window.closeModal('modalNovaReferencia');
    } catch(err) { console.error(err); }
};

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

    const audioOriginal = document.getElementById(`audio-elemento-${id}-0`);
    const playerModal = document.getElementById('player-feedback');

    const tempoDeOndeParou = audioOriginal ? audioOriginal.currentTime : 0;

    if (window.audioAtualExecucao) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}-0`);
        const btnMask = document.getElementById(`icon_play-mask-${window.audioAtualExecucao}`);
        const masterBtn = document.getElementById('master-icon_play');

        if(audioAntigo) audioAntigo.pause();
        if(btnMask) {
            btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.maskImage = "url('images/heartbeatas/icon_play.svg')";
        }
        if(masterBtn) masterBtn.innerText = "▶";

        window.audioAtualExecucao = null;
    }

    document.getElementById('feedback-titulo').innerText = `Feedback: ${titulo}`;
    playerModal.src = url;

    playerModal.onloadedmetadata = () => {
        playerModal.currentTime = tempoDeOndeParou;
    };

    window.carregarComentariosAudio(id);
    window.openModal('modalFeedbackAudio');
    window.limparNotificacaoItem(id);
};

window.fecharFeedbackAudio = () => {
    document.getElementById('player-feedback').pause(); 
    window.closeModal('modalFeedbackAudio');
};

window.salvarComentarioAudio = async (e) => {
    e.preventDefault();
    if (!window.audioFeedbackAtualId) return;

    const input = document.getElementById('feedback-texto');
    const player = document.getElementById('player-feedback');
    const tempo = parseFloat(player.currentTime.toFixed(2));

    try {
        await addDoc(collection(db, "comentarios_audio"), {
            audioId: window.audioFeedbackAtualId,
            texto: input.value,
            tempoPosicao: tempo, 
            autor: auth.currentUser.email.split('@')[0],
            dataCriacao: new Date().toISOString()
        });

        const audioReferencia = window.audiosCache.find(a => a.id === window.audioFeedbackAtualId);

        if (audioReferencia && audioReferencia.enviadoPor !== auth.currentUser.email) {
            const qUser = query(collection(db, "usuarios"), where("email", "==", audioReferencia.enviadoPor));
            const snapUser = await getDocs(qUser);

            if (!snapUser.empty) {
                const donoUid = snapUser.docs[0].data().uid;
                window.criarNotificacao(
                    donoUid, 'audio', 'Feedback Recebido',
                    `${auth.currentUser.email.split('@')[0]} comentou em "${audioReferencia.titulo}"`,
                    { abaAlvo: 'projetos', subAba: 'tab-audios', projetoId: window.projetoAtualId, contextId: window.audioFeedbackAtualId }
                );
            }
        }
        input.value = ''; 
    } catch(err) { console.error(err); }
};

window.carregarComentariosAudio = (audioId) => {
    const lista = document.getElementById('lista-comentarios');
    onSnapshot(query(collection(db, "comentarios_audio"), where("audioId", "==", audioId)), (snap) => {
        let comentarios = snap.docs.map(d => ({id: d.id, ...d.data()}));
        comentarios.sort((a,b) => a.tempoPosicao - b.tempoPosicao);

        if (comentarios.length === 0) {
            lista.innerHTML = '<li style="color:#666; text-align:center; padding:15px;">Seja o primeiro a deixar um feedback! Aperte o pause e digite abaixo.</li>';
            return;
        }

        lista.innerHTML = comentarios.map(c => {
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
    player.play(); 
};

window.deletarComentarioAudio = async (id) => {
    if(confirm("Apagar comentário?")) await deleteDoc(doc(db, "comentarios_audio", id));
};

// ==========================================
// 7. HEARTKEY RADIO GLOBAL ENGINE
// ==========================================
window.playerRadio = new Audio();
window.radioConfigGlobal = {}; 

window.iniciarEscutaRadioGlobal = () => {
    onSnapshot(doc(db, "configuracoes", "radio_global"), (docSnap) => {
        if (docSnap.exists()) {
            window.radioConfigGlobal = docSnap.data();
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

window.iniciarRadioFrequencia = async () => {
    const config = window.radioConfigGlobal;

    if (!config.playlist || config.playlist.trim() === "") {
        return alert("O Admin ainda não configurou a playlist global.");
    }

    if (window.audioAtualExecucao) {
        const audioAntigo = document.getElementById(`audio-elemento-${window.audioAtualExecucao}-0`);
        if(audioAntigo) audioAntigo.pause();
        const btnMask = document.getElementById(`icon_play-mask-${window.audioAtualExecucao}`);
        if(btnMask) {
            btnMask.style.webkitMaskImage = "url('images/heartbeatas/icon_play.svg')";
            btnMask.style.maskImage = "url('images/heartbeatas/icon_play.svg')";
        }
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

        window.sincronizarComMaster('radio', '📻 Rádio HeartKey', 'Transmissão Global do Estúdio', 'radio');
        document.getElementById('master-icon_play').innerText = "⏸";

    } catch (e) { console.error("Erro ao tocar rádio:", e); }

    window.playerRadio.onended = () => {
        if (!window.radioStatus?.estaTocandoNoticia) window.iniciarRadioFrequencia();
    };
};

setInterval(() => {
    const config = window.radioConfigGlobal;
    if (!config.horario) return;

    const agora = new Date();
    const horaAtual = agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (horaAtual === config.horario && !window.radioStatus?.estaTocandoNoticia) {
        window.dispararPlantaoGlobal();
    }
}, 60000);

window.fadeAudio = (audio, duration = 2000) => {
    return new Promise((resolve) => {
        const volumeOriginal = audio.volume;
        const intervalo = 50; 
        const passos = duration / intervalo;
        const reducaoPorPasso = volumeOriginal / passos;

        const timerFade = setInterval(() => {
            if (audio.volume > reducaoPorPasso) {
                audio.volume -= reducaoPorPasso;
            } else {
                audio.volume = 0;
                clearInterval(timerFade);
                audio.pause();
                audio.volume = volumeOriginal; 
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

    await window.fadeAudio(window.playerRadio, 2000);
    window.mostrarToastNotificacao("📻 RÁDIO", "Iniciando Boletim Informativo...", "geral");

    window.playerRadio.src = vinhetaUrl;
    window.playerRadio.play();

    window.playerRadio.onended = async () => {
        window.playerRadio.src = noticiaUrl;
        window.playerRadio.play();

        window.playerRadio.onended = () => {
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

window.abrirConfigRadio = () => {
    document.getElementById('cfg-radio-vinheta').value = localStorage.getItem('radio_vinheta') || "";
    document.getElementById('cfg-radio-noticia').value = localStorage.getItem('radio_noticia') || "";
    document.getElementById('cfg-radio-horario').value = localStorage.getItem('radio_horario') || "09:00";
    window.openModal('modalConfigRadio');
};

// ==========================================
// 8. NAVEGAÇÃO E UTILITÁRIOS
// ==========================================
window.switchAudioSubTab = (viewId, btn, index) => {
    document.querySelectorAll('.audio-view-content').forEach(el => el.style.display = 'none');
    
    const container = btn.closest('.audio-subtabs');
    container.querySelectorAll('.audio-subtab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const slider = document.getElementById('audio-slider');
    if (slider) {
        slider.style.left = index === 0 ? '4px' : '50%';
    }

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.style.display = 'block';
};

window.abrirEdicaoAudio = (id) => {
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
    
    const audio = window.audiosCache.find(a => a.id === id);
    if (!audio) return;

    window.audioEditandoId = id;

    if(document.getElementById('audioTitulo')) document.getElementById('audioTitulo').value = audio.titulo || "";
    if(document.getElementById('audioTag')) document.getElementById('audioTag').value = audio.tag || "BGM";
    if(document.getElementById('audioBpm')) document.getElementById('audioBpm').value = audio.bpm || "";
    if(document.getElementById('audioSampleRate')) document.getElementById('audioSampleRate').value = audio.sampleRate || "48kHz";
    if(document.getElementById('audioLufs')) document.getElementById('audioLufs').value = audio.lufs || "";
    if(document.getElementById('audioLoopStart')) document.getElementById('audioLoopStart').value = audio.loopStart || "";
    if(document.getElementById('audioLoopEnd')) document.getElementById('audioLoopEnd').value = audio.loopEnd || "";
    if(document.getElementById('audioLetra')) document.getElementById('audioLetra').value = audio.letra || "";
    
    const inputAsset = document.getElementById('audioAssetLink');
    if (inputAsset) inputAsset.value = audio.assetLink || audio.assetsUrl || ""; 

    const camadas = audio.camadas || [];
    for (let i = 1; i <= 5; i++) {
        const input = document.getElementById(`audioUrl${i}`);
        if (input) input.value = camadas[i - 1] || "";
    }

    const modal = document.getElementById('modalNovoAudio');
    if (modal) {
        modal.querySelector('h2').innerText = "✏️ Editar Áudio (Engine)";
        modal.querySelector('button[type="submit"]').innerText = "Salvar Alterações";
    }

    if(document.getElementById('audioAdminReq')) {
        document.getElementById('audioAdminReq').checked = audio.exigeAprovacao || false;
    }

    window.openModal('modalNovoAudio');
};

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

window.pularFaixaMaster = (direcao) => {
    if (window.fonteMidiaAtual === 'projeto' && window.audiosCache && window.audiosCache.length > 0) {
        const indexAtual = window.audiosCache.findIndex(a => a.id === window.audioIdAtualMestre);
        if (indexAtual === -1) return;

        let novoIndex;
        if (direcao === 'next') {
            novoIndex = indexAtual + 1 >= window.audiosCache.length ? 0 : indexAtual + 1;
        } else {
            novoIndex = indexAtual - 1 < 0 ? window.audiosCache.length - 1 : indexAtual - 1;
        }

        const proximoAudio = window.audiosCache[novoIndex];
        const numCamadas = proximoAudio.camadas ? proximoAudio.camadas.length : 1;

        window.togglePlayAudioDinâmico(proximoAudio.id, numCamadas);
    } 
    else if (window.fonteMidiaAtual === 'radio') {
        if (typeof window.avancarMusicaRadio === 'function') {
            window.avancarMusicaRadio(direcao); 
        } else {
            window.mostrarToastNotificacao("Rádio", "A transmissão da rádio atual não permite pular faixas.", "geral");
        }
    }
};  

window.reprovarAudioAdmin = async (id, enviadoPor) => {
    if (window.userRole !== 'admin') return;
    try {
        await updateDoc(doc(db, "audios", id), { aguardandoRevisao: false, statusAprovado: false });
        window.mostrarToastNotificacao("Audio", "Ajustes solicitados! O criador foi avisado.", "audio");

        if (enviadoPor) {
            const snapUsers = await getDocs(query(collection(db, "usuarios"), where("email", "==", enviadoPor)));
            if (!snapUsers.empty) {
                const donoUid = snapUsers.docs[0].data().uid;
                window.criarNotificacao(
                    donoUid, 'audio', '❌ Ajustes Solicitados', 
                    `O Diretor pediu correções no áudio. Veja os feedbacks marcados no tempo!`, 
                    { abaAlvo: 'projetos', subAba: 'tab-audios', projetoId: window.projetoAtualId, contextId: id }
                );
            }
        }
    } catch (err) { console.error(err); }
};

window.reabrirAudioAdmin = async (id, titulo, enviadoPor) => {
    if (window.userRole !== 'admin') return;
    if (!confirm(`Deseja retirar a aprovação de "${titulo}" e reabri-la para ajustes?`)) return;
    
    try {
        await updateDoc(doc(db, "audios", id), { 
            statusAprovado: false, 
            aguardandoRevisao: false 
        });
        
        window.mostrarToastNotificacao("Audio", "Aprovação removida. O áudio está aberto novamente.", "audio");

        if (enviadoPor) {
            const snapUsers = await getDocs(query(collection(db, "usuarios"), where("email", "==", enviadoPor)));
            if (!snapUsers.empty) {
                const donoUid = snapUsers.docs[0].data().uid;
                window.criarNotificacao(
                    donoUid, 'audio', '🔓 Áudio Reaberto', 
                    `A aprovação de "${titulo}" foi retirada pelo Diretor para novos ajustes.`, 
                    { abaAlvo: 'projetos', subAba: 'tab-audios', projetoId: window.projetoAtualId, contextId: id }
                );
            }
        }
    } catch (err) { console.error(err); }
};

window.deletarAudio = async (id) => {
    if(confirm("Apagar este áudio?")) {
        try {
            await deleteDoc(doc(db, "audios", id));

            const qNotifs = query(collection(db, "notificacoes"), where("contextId", "==", id));
            const snapNotifs = await getDocs(qNotifs);

            if (!snapNotifs.empty) {
                const promessasLimpeza = snapNotifs.docs.map(d =>
                    updateDoc(doc(db, "notificacoes", d.id), { lida: true })
                );
                await Promise.all(promessasLimpeza);
            }
        } catch (err) {
            console.error("Erro ao deletar áudio e limpar rastros:", err);
        }
    }
};