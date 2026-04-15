// ==========================================================================
// ARTS.JS - Central de Artes, Referências Visuais e Paleta de Cores
// ===========================================================================
import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, getDoc, onSnapshot } from './firebase.js';

// ==========================================
// CONTROLES DE ESTADO DA GALERIA E ATELIÊ
// ==========================================
window.artFiltroAtual = 'all';
window.artStatusFiltroAtual = 'all';
window.arteEditandoId = null;
window.arteVisualizandoId = null;
window.artesProjetoCache = []; // Guarda as artes na memória para o carrossel

// Memória do Ateliê Imersivo
window.atelieZoom = 1;
window.ateliePanX = 0;
window.ateliePanY = 0;
window.isDraggingAtelie = false;
window.startX = 0;
window.startY = 0;
let atelieTimerFade;

// ==========================================
// 1. NAVEGAÇÃO E CARREGAMENTO DE ABAS
// ==========================================
window.aplicarFiltroArtes = () => {
    window.artFiltroAtual = document.getElementById('art-filter').value;
    window.artStatusFiltroAtual = document.getElementById('art-status-filter')?.value || 'all';
    window.carregarArtesDoProjeto(window.projetoAtualId);
};

window.switchArtSubTab = (viewId, btn) => {
    // 1. Esconde os conteúdos das abas
    document.querySelectorAll('.art-view-content').forEach(el => el.style.display = 'none');
    
    // 2. Reseta os botões
    const container = btn.closest('.audio-subtabs');
    if (container) container.querySelectorAll('.audio-subtab-btn').forEach(b => b.classList.remove('active'));

    // 3. Ativa a aba atual
    document.getElementById(viewId).style.display = 'block';
    btn.classList.add('active');

    // 4. MÁGICA DO LAYOUT: Esconde o Style Guide e expande o Moodboard
    const painelStyleGuide = document.getElementById('painel-style-guide');
    const artLayout = document.querySelector('.art-layout'); 

    if (viewId === 'view-galeria') {
        if (painelStyleGuide) painelStyleGuide.style.display = 'block'; 
        if (artLayout) artLayout.classList.remove('full-width'); // Volta para 2 colunas
        window.carregarArtesDoProjeto(window.projetoAtualId); 
    } else {
        if (painelStyleGuide) painelStyleGuide.style.display = 'none'; // Some com a barra lateral
        if (artLayout) artLayout.classList.add('full-width'); // Ativa 100% de largura no CSS
        window.carregarReferenciasArt(window.projetoAtualId); 
    }
    
    // Ajusta os botões de ação do topo (Novo Asset vs Novo Link)
    const btnGaleria = document.getElementById('btn-group-galeria');
    const btnRef = document.getElementById('btn-group-referencias');
    if (btnGaleria) btnGaleria.style.display = viewId === 'view-galeria' ? 'block' : 'none';
    if (btnRef) btnRef.style.display = viewId === 'view-galeria' ? 'none' : 'block';
};

window.abrirModalNovaArte = () => {
    window.arteEditandoId = null; // Avisa que é criação
    const modal = document.getElementById('modalNovaArte');
    if (!modal) return;

    const form = modal.querySelector('form');
    if (form) form.reset();

    const areaHistorico = document.getElementById('area-historico-versoes');
    const listaVersoes = document.getElementById('lista-versoes-gerenciador');
    if (areaHistorico) areaHistorico.style.display = 'none';
    if (listaVersoes) listaVersoes.innerHTML = '';

    const title = modal.querySelector('h2');
    if (title) title.innerText = "🖼️ Registrar Novo Asset";

    const submitBtn = modal.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.innerText = "Postar na Galeria";

    const artAlpha = document.getElementById('artAlpha');
    if (artAlpha) artAlpha.checked = true;

    window.openModal('modalNovaArte');
};

// ==========================================
// 2. EXTRATOR AUTOMÁTICO DE DNA VISUAL 🧪
// ==========================================
const extrairPaletaDaUrl = (url) => {
    return new Promise((resolve) => {
        const imgTemp = new Image();
        imgTemp.crossOrigin = "Anonymous";
        
        imgTemp.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 100; // Reduz para calcular rápido
            const scale = Math.min(maxSize / imgTemp.width, maxSize / imgTemp.height);
            canvas.width = imgTemp.width * scale;
            canvas.height = imgTemp.height * scale;
            ctx.drawImage(imgTemp, 0, 0, canvas.width, canvas.height);

            try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const cores = {};
                for (let i = 0; i < imgData.length; i += 4) {
                    const a = imgData[i + 3];
                    if (a < 128) continue;
                    
                    const rBin = Math.round(imgData[i] / 15) * 15;
                    const gBin = Math.round(imgData[i + 1] / 15) * 15;
                    const bBin = Math.round(imgData[i + 2] / 15) * 15;
                    const hex = rgbToHex(Math.min(255, rBin), Math.min(255, gBin), Math.min(255, bBin));
                    cores[hex] = (cores[hex] || 0) + 1;
                }
                const coresOrdenadas = Object.keys(cores).sort((a, b) => cores[b] - cores[a]);
                const paletaFinal = [];
                for (let hex of coresOrdenadas) {
                    if (paletaFinal.length >= 5) break;
                    let muitoParecida = false;
                    for (let corSalva of paletaFinal) {
                        if (distanciaCores(hex, corSalva) < 45) { muitoParecida = true; break; }
                    }
                    if (!muitoParecida) paletaFinal.push(hex);
                }
                resolve(paletaFinal);
            } catch(e) {
                resolve([]); 
            }
        };
        imgTemp.onerror = () => resolve([]); 
        imgTemp.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
    });
};

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}
function distanciaCores(hex1, hex2) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    if (!c1 || !c2) return 0;
    return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

// ==========================================
// 3. SALVAR ARTE (CRIAÇÃO E EDIÇÃO)
// ==========================================
window.salvarArte = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    if (!window.projetoAtualId) {
        if (window.mostrarToastNotificacao) window.mostrarToastNotificacao('Erro', 'Selecione um projeto antes de salvar o asset.', 'geral');
        if (btn) btn.disabled = false;
        return;
    }

    const titulo = document.getElementById('artTitulo')?.value.trim() || '';
    const tag = document.getElementById('artTag')?.value || 'concept';
    const status = document.getElementById('artStatus')?.value || 'wip';
    let urlForm = document.getElementById('artUrl')?.value.trim() || '';
    if (window.converterLinkDireto) urlForm = window.converterLinkDireto(urlForm);
    
    const resolucao = document.getElementById('artRes')?.value || 'N/A';
    const pivot = document.getElementById('artPivot')?.value || 'Center';
    const hasAlpha = document.getElementById('artAlpha')?.checked || false;

    if (!titulo || !urlForm) {
        if (window.mostrarToastNotificacao) window.mostrarToastNotificacao('Erro', 'Informe um título e um link para o asset.', 'geral');
        if (btn) btn.disabled = false;
        return;
    }

    try {
        if (window.arteEditandoId) {
            const arteAntiga = window.artesProjetoCache.find(a => a.id === window.arteEditandoId);
            let versoes = arteAntiga?.versoes || [arteAntiga?.url || urlForm];
            let novaPaleta = arteAntiga?.paleta || [];

            if (urlForm !== arteAntiga?.url) {
                if (btn) btn.innerText = 'Lendo DNA da correção... 🧪';
                versoes[versoes.length - 1] = urlForm;
                novaPaleta = await extrairPaletaDaUrl(urlForm);
            }

            await updateDoc(doc(db, 'artes', window.arteEditandoId), {
                titulo, tag, status, url: urlForm, versoes, paleta: novaPaleta,
                resolucao, pivot, alpha: hasAlpha, dataAtualizacao: new Date().toISOString()
            });
            if (window.mostrarToastNotificacao) window.mostrarToastNotificacao('Artes', 'Informações atualizadas com sucesso!', 'geral');
        } else {
            if (btn) btn.innerText = 'Lendo DNA da Arte... 🧪';
            const paletaExtraida = await extrairPaletaDaUrl(urlForm);

            await addDoc(collection(db, 'artes'), {
                titulo, tag, status, url: urlForm, versoes: [urlForm], paleta: paletaExtraida,
                resolucao, pivot, alpha: hasAlpha, projetoId: window.projetoAtualId,
                enviadoPor: window.obterNomeExibicao(), autorEmail: auth.currentUser.email, dataCriacao: new Date().toISOString()
            });
            window.registrarAtividade(`adicionou a arte "${titulo}" na galeria`, 'art', '🎨');
        }
        
        e.target.reset();
        window.closeModal('modalNovaArte');
        window.carregarArtesDoProjeto(window.projetoAtualId);
    } catch(err) {
        console.error('Erro:', err);
        alert('Erro ao salvar. Verifique os dados e tente novamente.');
    } finally {
        if (btn) {
            btn.innerText = 'Postar na Galeria';
            btn.disabled = false;
        }
    }
};

window.abrirEdicaoArte = (id) => {
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
    const arte = window.artesProjetoCache.find(a => a.id === id);
    if(!arte) return;

    window.arteEditandoId = id;
    
    if(document.getElementById('artTitulo')) document.getElementById('artTitulo').value = arte.titulo;
    if(document.getElementById('artTag')) document.getElementById('artTag').value = arte.tag;
    if(document.getElementById('artStatus')) document.getElementById('artStatus').value = arte.status;
    if(document.getElementById('artRes')) document.getElementById('artRes').value = arte.resolucao || '';
    if(document.getElementById('artPivot')) document.getElementById('artPivot').value = arte.pivot || 'Center';
    if(document.getElementById('artAlpha')) document.getElementById('artAlpha').checked = arte.alpha !== false;
    if(document.getElementById('artUrl')) document.getElementById('artUrl').value = arte.url; 

    // GERENCIADOR DE VERSÕES
    const areaHistorico = document.getElementById('area-historico-versoes');
    const listaVersoes = document.getElementById('lista-versoes-gerenciador');
    
    if (arte.versoes && arte.versoes.length > 0) {
        if (areaHistorico) areaHistorico.style.display = 'block';
        if (listaVersoes) {
            listaVersoes.innerHTML = arte.versoes.map((v, index) => `
                <div class="version-item">
                    <img src="${v}" class="version-thumb-mini">
                    <div class="version-info">v${index + 1} - ${v.substring(0, 20)}...</div>
                    <div class="version-actions">
                        <button type="button" class="icon-btn" title="Substituir Link" onclick="window.substituirVersaoArte('${id}', ${index})">✏️</button>
                        <button type="button" class="icon-btn" title="Apagar Versão" style="color: #ff5252;" onclick="window.removerVersaoArte('${id}', ${index})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    } else {
        if (areaHistorico) areaHistorico.style.display = 'none';
    }

    const modal = document.getElementById('modalNovaArte');
    if (modal) {
        const title = modal.querySelector('h2');
        const submitBtn = modal.querySelector('button[type="submit"]');
        if (title) title.innerText = "✏️ Editar Asset";
        if (submitBtn) submitBtn.innerText = "Salvar Alterações";
    }
    window.openModal('modalNovaArte');
};

// ==========================================
// 4. RENDERIZAR GALERIA (COM CARROSSEL)
// ==========================================
window.carregarArtesDoProjeto = (pid) => {
    const grid = document.getElementById('art-gallery-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "artes"), where("projetoId", "==", pid)), (snap) => {
        window.artesProjetoCache = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        let filtradas = window.artesProjetoCache;
        if (window.artFiltroAtual !== 'all') filtradas = filtradas.filter(a => a.tag === window.artFiltroAtual);
        if (window.artStatusFiltroAtual !== 'all') filtradas = filtradas.filter(a => a.status === window.artStatusFiltroAtual);

        grid.innerHTML = filtradas.map(a => {
            const statusColor = a.status === 'done' ? 'var(--primary)' : (a.status === 'review' ? '#ffc107' : '#888');
            const isDonoOuAdmin = (a.autorEmail === auth.currentUser?.email || window.userRole === 'admin');
            
            let paletaHtml = '';
            if (a.paleta && a.paleta.length > 0) {
                paletaHtml = `<div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${a.paleta.map(hex => `<div class="mini-swatch" style="background: ${hex};" onclick="event.stopPropagation(); navigator.clipboard.writeText('${hex}'); if(window.mostrarToastNotificacao) window.mostrarToastNotificacao('Cor Copiada', '${hex}', 'geral')" title="Copiar ${hex}"></div>`).join('')}</div>`;
            }

            const resBadge = a.resolucao && a.resolucao !== "N/A" ? `<span title="Resolução" style="font-size: 0.65rem; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); color: #ccc;">📐 ${a.resolucao}</span>` : '';
            const pivotBadge = a.pivot ? `<span title="Ponto de Pivô" style="font-size: 0.65rem; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); color: #ccc;">📍 ${a.pivot}</span>` : '';
            const alphaBadge = a.alpha ? `<span title="Alpha Transparência" style="font-size: 0.65rem; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); color: #ccc;">🏁 Alpha</span>` : '';

            const btnApagar = isDonoOuAdmin ? `<button class="icon-btn" onclick="event.stopPropagation(); window.deletarArte('${a.id}')" style="color:#ff5252; font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; margin-top:5px; border-top:1px solid rgba(255,255,255,0.1);">🗑️ Excluir</button>` : '';

            const menu3Pontos = `
                <div style="position:relative; display:inline-block; margin-left: auto;">
                    <button class="icon-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')" style="padding:0 5px; font-size:1.2rem; line-height:0.5; color:var(--text-muted);">⋮</button>
                    <div class="dropdown-content">
                        ${isDonoOuAdmin ? `<button class="icon-btn" onclick="event.stopPropagation(); window.abrirEdicaoArte('${a.id}')" style="font-size:0.8rem; text-align:left; width:100%; padding:8px 10px; color:#e0e0e0;">✏️ Editar</button>` : ''}
                        ${btnApagar}
                    </div>
                </div>
            `;

            // UI DO CARROSSEL
            const temCarrossel = a.versoes && a.versoes.length > 1;
            const btnLeft = temCarrossel ? `<button onclick="event.stopPropagation(); window.mudarCarrosselArte('${a.id}', -1)" style="position: absolute; left: 5px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; z-index: 5;">&lt;</button>` : '';
            const btnRight = temCarrossel ? `<button onclick="event.stopPropagation(); window.mudarCarrosselArte('${a.id}', 1)" style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; z-index: 5;">&gt;</button>` : '';
            const contadorVersao = temCarrossel ? `<span id="contador-${a.id}" style="position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.8); color: #fff; font-size: 0.6rem; padding: 3px 6px; border-radius: 4px; font-weight: bold; border: 1px solid rgba(255,255,255,0.2);">v${a.versoes.length}/${a.versoes.length}</span>` : '';

            // O CLIQUE ABRE O ATELIÊ IMERSIVO
            return `
                <div class="art-card">
                    <div style="position: relative; width: 100%; height: 180px; overflow: hidden; border-radius: 10px 10px 0 0;">
                        <img src="${a.url}" id="img-art-${a.id}" class="art-thumb" onclick="window.abrirVisualizadorAtelie('${a.id}', this.src, '${a.titulo.replace(/'/g, "\\'")}')" style="cursor: pointer; height: 100%; object-fit: cover;" title="Clique para abrir no Ateliê">
                        ${btnLeft} ${btnRight} ${contadorVersao}
                    </div>
                    
                    <div class="art-info">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <h4 onclick="window.editarTituloArte('${a.id}', '${a.titulo.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-right: 10px;" title="Clique para editar o título">${a.titulo}</h4>
                            ${menu3Pontos}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                            <span class="badge" style="font-size:0.55rem; padding:2px 6px;">${a.tag}</span>
                            <span style="font-size:0.6rem; color:${statusColor}; font-weight:bold;">● ${a.status.toUpperCase()}</span>
                        </div>
                        <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 5px;">
                            ${resBadge} ${pivotBadge} ${alphaBadge}
                        </div>
                        ${paletaHtml}
                        <div style="margin-top:10px;">
                             <span style="font-size: 0.6rem; color: #666;">Por ${a.enviadoPor}</span>
                        </div>
                    </div>
                </div>`;
        }).join('') || '<p style="color:#666; grid-column:1/-1; text-align:center;">Nenhum asset encontrado com os filtros atuais.</p>';
    });
};

window.mudarCarrosselArte = (arteId, direcao) => {
    const arte = window.artesProjetoCache.find(a => a.id === arteId);
    if (!arte || !arte.versoes) return;
    
    const imgElement = document.getElementById(`img-art-${arteId}`);
    let currentIndex = arte.versoes.indexOf(imgElement.src);
    if (currentIndex === -1) currentIndex = arte.versoes.length - 1; 
    
    let nextIndex = currentIndex + direcao;
    if (nextIndex >= arte.versoes.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = arte.versoes.length - 1;

    imgElement.src = arte.versoes[nextIndex];
    const contador = document.getElementById(`contador-${arteId}`);
    if (contador) contador.innerText = `v${nextIndex + 1}/${arte.versoes.length}`;
};

// ==========================================
// 5. GESTÃO DE VERSÕES (SUBSTITUIR / ADICIONAR / APAGAR)
// ==========================================
window.substituirVersaoArte = async (id, index) => {
    const arte = window.artesProjetoCache.find(a => a.id === id);
    if (!arte) return;

    const novoLink = prompt("Cole o novo link para esta versão específica:", arte.versoes[index]);
    if (!novoLink || novoLink === arte.versoes[index]) return;

    let linkFormatado = novoLink.trim();
    if (window.converterLinkDireto) linkFormatado = window.converterLinkDireto(linkFormatado);

    let novasVersoes = [...arte.versoes];
    novasVersoes[index] = linkFormatado;

    let updateData = { versoes: novasVersoes };
    if (index === arte.versoes.length - 1) {
        updateData.url = linkFormatado;
        if (document.getElementById('artUrl')) document.getElementById('artUrl').value = linkFormatado;
    }

    try {
        await updateDoc(doc(db, "artes", id), updateData);
        if(window.mostrarToastNotificacao) window.mostrarToastNotificacao("Artes", `Versão v${index+1} substituída!`, "geral");
        window.carregarArtesDoProjeto(window.projetoAtualId);
        setTimeout(() => window.abrirEdicaoArte(id), 500); // Recarrega o modal
    } catch(e) { console.error(e); }
};

window.removerVersaoArte = async (id, index) => {
    const arte = window.artesProjetoCache.find(a => a.id === id);
    if (!arte) return;

    if (arte.versoes.length <= 1) {
        return alert("Você não pode apagar a única imagem deste asset. Use 'Excluir Asset' se quiser apagar tudo.");
    }
    if (!confirm(`Deseja apagar permanentemente a versão v${index + 1} deste histórico?`)) return;

    let novasVersoes = [...arte.versoes];
    novasVersoes.splice(index, 1); 

    let updateData = { versoes: novasVersoes };
    if (arte.url === arte.versoes[index]) {
        updateData.url = novasVersoes[novasVersoes.length - 1];
    }

    try {
        await updateDoc(doc(db, "artes", id), updateData);
        if(window.mostrarToastNotificacao) window.mostrarToastNotificacao("Artes", "Versão removida do histórico.", "geral");
        window.carregarArtesDoProjeto(window.projetoAtualId);
        setTimeout(() => window.abrirEdicaoArte(id), 500); 
    } catch(e) { console.error(e); }
};

window.adicionarNovaVersaoArte = async () => {
    const id = window.arteEditandoId;
    if (!id) return;

    const inputUrl = document.getElementById('novaVersaoUrl');
    if (!inputUrl) return;
    
    let novaUrl = inputUrl.value.trim();
    if (!novaUrl) return alert("Cole o link da nova imagem primeiro.");

    if (window.converterLinkDireto) novaUrl = window.converterLinkDireto(novaUrl);

    const btn = inputUrl.nextElementSibling;
    const textoOriginal = btn.innerText;
    btn.innerText = "⏳";
    btn.disabled = true;

    try {
        const arte = window.artesProjetoCache.find(a => a.id === id);
        let novasVersoes = arte.versoes ? [...arte.versoes] : [arte.url];
        
        if (novasVersoes.includes(novaUrl)) {
            alert("Esta versão já existe no histórico!");
            return;
        }

        if(window.mostrarToastNotificacao) window.mostrarToastNotificacao("Ateliê", "Extraindo DNA da nova arte...", "geral");
        const novaPaleta = await extrairPaletaDaUrl(novaUrl); 

        novasVersoes.push(novaUrl);

        await updateDoc(doc(db, "artes", id), { 
            url: novaUrl, 
            versoes: novasVersoes,
            paleta: novaPaleta,
            dataAtualizacao: new Date().toISOString()
        });

        inputUrl.value = ''; 
        if(window.mostrarToastNotificacao) window.mostrarToastNotificacao("Artes", "Evolução adicionada ao histórico!", "geral");
        
        window.carregarArtesDoProjeto(window.projetoAtualId);
        setTimeout(() => window.abrirEdicaoArte(id), 500); 
    } catch(e) {
        console.error(e);
        alert("Erro ao adicionar nova versão.");
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
};

window.deletarArte = async (id) => {
    if(confirm("Apagar este asset da galeria?")) {
        await deleteDoc(doc(db, "artes", id));
        // Faxina
        const qNotifs = query(collection(db, "comentarios_arte"), where("arteId", "==", id));
        const snap = await getDocs(qNotifs);
        snap.forEach(d => deleteDoc(doc(db, "comentarios_arte", d.id)));
    }
};

window.editarTituloArte = async (id, tituloAtual) => {
    const novoTitulo = prompt("Renomear asset para:", tituloAtual);
    if (novoTitulo && novoTitulo.trim() !== "" && novoTitulo !== tituloAtual) {
        try {
            await updateDoc(doc(db, "artes", id), { titulo: novoTitulo.trim() });
            if (window.mostrarToastNotificacao) window.mostrarToastNotificacao('Sucesso', 'Título atualizado!', 'geral');
        } catch (e) { console.error(e); }
    }
};

// ==========================================
// 6. ATELIÊ IMERSIVO (CONTROLES E PINOS)
// ==========================================
window.abrirVisualizadorAtelie = (id, url, titulo) => {
    window.arteVisualizandoId = id;
    
    window.atelieZoom = 1;
    window.ateliePanX = 0;
    window.ateliePanY = 0;
    window.aplicarTransformAtelie();

    const img = document.getElementById('atelieImagemPrincipal');
    if (img) {
        img.src = url;
        img.style.filter = 'none'; 
    }

    const gridOverlay = document.getElementById('atelieGrid');
    if (gridOverlay) gridOverlay.style.display = 'none'; 
    
    const zoomText = document.getElementById('atelieZoomText');
    if (zoomText) zoomText.innerText = '100%';

    window.carregarPinosArte(id);
    
    if (typeof window.limparNotificacaoItem === 'function') window.limparNotificacaoItem(id);

    window.openModal('modalAtelieArte');
};

window.fecharAtelieArte = () => {
    window.closeModal('modalAtelieArte');
    clearTimeout(atelieTimerFade);
    window.arteVisualizandoId = null;
};

// --- MOTOR DE ZOOM E PAN ---
window.mudarZoomAtelie = (delta) => {
    window.atelieZoom += delta;
    if (window.atelieZoom < 0.2) window.atelieZoom = 0.2;
    if (window.atelieZoom > 5) window.atelieZoom = 5;
    
    const zoomText = document.getElementById('atelieZoomText');
    if (zoomText) zoomText.innerText = Math.round(window.atelieZoom * 100) + '%';
    
    window.aplicarTransformAtelie();
};

window.aplicarTransformAtelie = () => {
    const wrapper = document.getElementById('atelieImagemWrapper');
    if (wrapper) {
        wrapper.style.transform = `translate(${window.ateliePanX}px, ${window.ateliePanY}px) scale(${window.atelieZoom})`;
    }
};

setTimeout(() => {
    const canvas = document.getElementById('atelieCanvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        window.mudarZoomAtelie(e.deltaY < 0 ? 0.15 : -0.15);
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        window.isDraggingAtelie = true;
        window.hasMovedAtelie = false; 
        
        window.clickInicialX = e.clientX;
        window.clickInicialY = e.clientY;

        window.startX = e.clientX - window.ateliePanX;
        window.startY = e.clientY - window.ateliePanY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!window.isDraggingAtelie) return;
        
        if (Math.abs(e.clientX - window.clickInicialX) > 4 || Math.abs(e.clientY - window.clickInicialY) > 4) {
            window.hasMovedAtelie = true; 
        }

        window.ateliePanX = e.clientX - window.startX;
        window.ateliePanY = e.clientY - window.startY;
        window.aplicarTransformAtelie();
    });

    window.addEventListener('mouseup', () => { window.isDraggingAtelie = false; if(canvas) canvas.style.cursor = 'crosshair'; });
    
    // Imersão: Fade Out nas Barras de Ferramentas
    const container = document.getElementById('atelieContainer');
    if (container && !container.dataset.mouseOk) {
        container.dataset.mouseOk = 'true';
        container.addEventListener('mousemove', () => {
            container.classList.remove('idle');
            clearTimeout(atelieTimerFade);
            atelieTimerFade = setTimeout(() => container.classList.add('idle'), 2500);
        });
    }

}, 1000);

// --- LIGHTROOM FILTROS ---
window.toggleLightroom = (filtro) => {
    const img = document.getElementById('atelieImagemPrincipal');
    const grid = document.getElementById('atelieGrid');
    if (!img || !grid) return;
    
    if (filtro === 'grayscale') {
        const atual = img.style.filter;
        img.style.filter = atual.includes('grayscale') ? 'none' : 'grayscale(100%)';
    } 
    else if (filtro === 'flip') {
        // Precisa alterar a lógica do flip para funcionar junto com o scale() do Pan
        img.style.transform = img.style.transform.includes('scaleX(-1)') ? 'scaleX(1)' : 'scaleX(-1)';
    }
    else if (filtro === 'grid') {
        grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
        const wrapper = document.getElementById('atelieImagemWrapper');
        grid.style.width = `${wrapper.clientWidth * window.atelieZoom}px`;
        grid.style.height = `${wrapper.clientHeight * window.atelieZoom}px`;
        grid.style.transform = `translate(calc(-50% + ${window.ateliePanX}px), calc(-50% + ${window.ateliePanY}px))`;
    }
};

// ==========================================
// 7. PINOS 2D E FEEDBACK
// ==========================================
window.adicionarPinoArte = async (e) => {
    e.preventDefault(); 
    if (window.hasMovedAtelie || !window.arteVisualizandoId) return;

    const img = document.getElementById('atelieImagemPrincipal');
    if (!img) return;

    const rect = img.getBoundingClientRect();
    
    // Calcula a porcentagem exata
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return;

    const texto = prompt("💬 Qual o seu feedback para este ponto exato da imagem?");
    if (texto && texto.trim() !== "") {
        try {
            await addDoc(collection(db, "comentarios_arte"), {
                arteId: window.arteVisualizandoId,
                texto: texto.trim(),
                posX: xPercent,
                posY: yPercent,
                autor: window.obterNomeExibicao(),
                autorEmail: auth.currentUser.email,
                dataCriacao: new Date().toISOString()
            });

            // Gamificação / Notificação
            const arteRef = doc(db, "artes", window.arteVisualizandoId);
            const artSnap = await getDoc(arteRef);
            if (artSnap.exists() && artSnap.data().autorEmail !== auth.currentUser.email) {
                const donoEmail = artSnap.data().autorEmail;
                const qUser = query(collection(db, "usuarios"), where("email", "==", donoEmail));
                const userSnap = await getDocs(qUser);
                if (!userSnap.empty) {
                    if(typeof window.criarNotificacao === 'function'){
                        window.criarNotificacao(userSnap.docs[0].id, 'art', 'Feedback Direcionado', `${window.obterNomeExibicao()} cravou um feedback na sua arte.`, { abaAlvo: 'projetos', subAba: 'tab-artes', projetoId: window.projetoAtualId, contextId: window.arteVisualizandoId });
                    }
                }
            }
        } catch(err) { console.error(err); }
    }
};

window.carregarPinosArte = (arteId) => {
    const containerPinos = document.getElementById('ateliePinosContainer');
    const listaSidebar = document.getElementById('listaPinosArte');
    const contador = document.getElementById('contadorPinos');
    
    if (!containerPinos || !listaSidebar) return;

    onSnapshot(query(collection(db, "comentarios_arte"), where("arteId", "==", arteId)), (snap) => {
        containerPinos.innerHTML = '';
        listaSidebar.innerHTML = '';
        if (contador) contador.innerText = snap.size;

        let pinIndex = 1;
        const comentarios = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => new Date(a.dataCriacao) - new Date(b.dataCriacao));
        
        comentarios.forEach((c) => {
            const isMe = c.autorEmail === auth.currentUser?.email;
            const isAdmin = window.userRole === 'admin';
            
            // Pino na Imagem
            const pino = document.createElement('div');
            pino.className = 'art-pin';
            pino.style.left = `${c.posX}%`;
            pino.style.top = `${c.posY}%`;
            pino.innerText = pinIndex;
            pino.title = `${c.autor}: ${c.texto}`;
            containerPinos.appendChild(pino);

            // Card na Sidebar
            const btnApagar = (isMe || isAdmin) ? `<button class="icon-btn" onclick="window.deletarComentarioArte('${c.id}')" style="color:#ff5252; padding:0;">🗑️</button>` : '';
            
            listaSidebar.innerHTML += `
                <li class="pin-comment-card">
                    <div class="pin-number">${pinIndex}</div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
                            <strong style="color:var(--primary); font-size:0.75rem;">${c.autor}</strong>
                            ${btnApagar}
                        </div>
                        <p style="color:#ccc; font-size:0.8rem; margin:0; line-height: 1.3;">${c.texto}</p>
                    </div>
                </li>
            `;
            pinIndex++;
        });
        
        setTimeout(() => { listaSidebar.scrollTop = listaSidebar.scrollHeight; }, 100);
    });
};

window.deletarComentarioArte = async (id) => {
    if (confirm("Apagar este feedback?")) await deleteDoc(doc(db, "comentarios_arte", id));
};

// ==========================================
// 8. CORES DO PROJETO (STYLE GUIDE)
// ==========================================
window.adicionarCorPaleta = async () => {
    if (!window.projetoAtualId) return;
    const cor = prompt('Cole o código HEX da cor (ex: #ff0000):');
    if (!cor) return;

    const corTrim = cor.trim();
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(corTrim)) return alert("HEX Inválido.");

    try {
        await addDoc(collection(db, 'projeto_cores'), { hex: corTrim, projetoId: window.projetoAtualId });
        window.carregarCoresProjeto(window.projetoAtualId);
    } catch (e) { console.error(e); }
};

window.carregarCoresProjeto = async (pid) => {
    const container = document.getElementById('palette-container');
    if (!container) return;

    try {
        const snap = await getDocs(query(collection(db, "projeto_cores"), where("projetoId", "==", pid))); 
        container.innerHTML = snap.docs.map(d => `
            <div class="color-swatch"
                 style="background: ${d.data().hex}"
                 onclick="navigator.clipboard.writeText('${d.data().hex}'); if(window.mostrarToastNotificacao) window.mostrarToastNotificacao('Style Guide', 'HEX Copiado!', 'geral')"
                 data-tooltip="${d.data().hex}">
                 <button class="icon-btn delete-color-btn" onclick="event.stopPropagation(); window.deletarCorPaleta('${d.id}', '${d.data().hex}')">×</button>
            </div>`).join('');
    } catch(e) { console.error(e); }
};

window.deletarCorPaleta = async (id, hex) => {
    if (confirm(`Deseja remover a cor ${hex} do Style Guide?`)) {
        try {
            await deleteDoc(doc(db, "projeto_cores", id));
            window.carregarCoresProjeto(window.projetoAtualId);
        } catch (e) { console.error(e); }
    }
};

// ==========================================
// 9. HEARTREF (MOODBOARD INFINITO E REFERÊNCIAS)
// ==========================================
window.salvarReferenciaArt = async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('artRefTitulo').value;
    let url = document.getElementById('artRefUrl').value.trim();

    if (window.converterLinkDireto) url = window.converterLinkDireto(url);

    try {
        await addDoc(collection(db, "referencias_arte"), {
            titulo, url, projetoId: window.projetoAtualId,
            enviadoPor: window.obterNomeExibicao(), dataCriacao: new Date().toISOString()
        });
        document.getElementById('formNovaReferenciaArt').reset();
        window.closeModal('modalNovaReferenciaArt');
        
        window.carregarReferenciasArt(window.projetoAtualId); 
    } catch(err) { console.error("Erro ao salvar referência:", err); }
};

window.deletarReferenciaArt = async (id) => {
    if(confirm("Remover esta referência visual?")) await deleteDoc(doc(db, "referencias_arte", id));
};

let hrState = {
    panX: -50000 + (window.innerWidth / 2), 
    panY: -50000 + (window.innerHeight / 2),
    zoom: 1, isPanning: false, startX: 0, startY: 0, mouseX: 0, mouseY: 0,
    isDraggingNode: false, nodeAtualId: null, nodeStartX: 0, nodeStartY: 0,
    hoveredNodeId: null, selectedNodeId: null
};

window.setHoveredNode = (id) => { hrState.hoveredNodeId = id; };

function atualizarMundoHeartRef() {
    const world = document.getElementById('heartref-world');
    if(world) world.style.transform = `translate(${hrState.panX}px, ${hrState.panY}px) scale(${hrState.zoom})`;
}
setTimeout(atualizarMundoHeartRef, 500);

window.focarObjeto = (id) => {
    const node = document.getElementById(`node-${id}`);
    if (!node) return;
    const viewport = document.getElementById('heartref-viewport');
    hrState.zoom = 1; 
    hrState.panX = (viewport.offsetWidth / 2) - (parseFloat(node.style.left) + node.offsetWidth / 2);
    hrState.panY = (viewport.offsetHeight / 2) - (parseFloat(node.style.top) + node.offsetHeight / 2);
    atualizarMundoHeartRef();
    hrState.selectedNodeId = id;
};

window.addEventListener('keydown', (e) => {
    if (!document.getElementById('view-ref-visual') || document.getElementById('view-ref-visual').style.display === 'none') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (document.activeElement.contentEditable === "true") return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hrState.hoveredNodeId) {
            window.deletarReferenciaArt(hrState.hoveredNodeId);
            window.setHoveredNode(null); 
        }
    }
    if (e.key.toLowerCase() === 'f') {
        const alvoId = hrState.hoveredNodeId || hrState.selectedNodeId;
        if (alvoId) window.focarObjeto(alvoId);
    }
});

setTimeout(() => {
    const viewport = document.getElementById('heartref-viewport');
    if (!viewport) return;

    viewport.addEventListener('mousedown', (e) => {
        if (e.button === 1 || e.button === 2) { // Clique do Meio ou Direito
            e.preventDefault(); 
            hrState.isPanning = true;
            hrState.startX = e.clientX - hrState.panX;
            hrState.startY = e.clientY - hrState.panY;
            viewport.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (document.getElementById('view-ref-visual').style.display === 'none') return;

        const rect = viewport.getBoundingClientRect();
        hrState.mouseX = e.clientX - rect.left;
        hrState.mouseY = e.clientY - rect.top;

        if (hrState.isPanning) {
            e.preventDefault(); 
            hrState.panX = e.clientX - hrState.startX;
            hrState.panY = e.clientY - hrState.startY;
            atualizarMundoHeartRef();
        }

        if (hrState.isDraggingNode && hrState.nodeAtualId) {
            const node = document.getElementById(`node-${hrState.nodeAtualId}`);
            let deltaX = (e.clientX - hrState.nodeStartX) / hrState.zoom;
            let deltaY = (e.clientY - hrState.nodeStartY) / hrState.zoom;
            
            let novoX = hrState.nodeOrigX + deltaX;
            let novoY = hrState.nodeOrigY + deltaY;

            if (e.ctrlKey) { 
                novoX = Math.round(novoX / 40) * 40;
                novoY = Math.round(novoY / 40) * 40;
            }
            node.style.left = `${novoX}px`;
            node.style.top = `${novoY}px`;
        }

        if (hrState.isResizingNode && hrState.nodeAtualId) {
            const node = document.getElementById(`node-${hrState.nodeAtualId}`);
            if (node) {
                let deltaX = (e.clientX - hrState.nodeStartX) / hrState.zoom;
                let deltaY = (e.clientY - hrState.nodeStartY) / hrState.zoom;
                
                let novoW = Math.max(50, hrState.startNodeW + deltaX);
                let novoH = Math.max(50, hrState.startNodeH + deltaY);

                if (e.ctrlKey) {
                    node.classList.add('is-cropping');
                    node.style.width = `${novoW}px`;
                    node.style.height = `${novoH}px`;
                    node.style.setProperty('--crop-w', `${hrState.imgOrigW}px`);
                    node.style.setProperty('--crop-h', `${hrState.imgOrigH}px`);
                } else {
                    node.classList.remove('is-cropping');
                    node.style.width = `${novoW}px`;
                    if (e.shiftKey) { node.style.height = `${novoH}px`; } 
                    else { node.style.height = `${novoW * (hrState.startNodeH / hrState.startNodeW)}px`; }
                }
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (hrState.isPanning) {
            hrState.isPanning = false;
            viewport.style.cursor = 'grab';
        }
        if ((hrState.isDraggingNode || hrState.isResizingNode) && hrState.nodeAtualId) {
            const node = document.getElementById(`node-${hrState.nodeAtualId}`);
            if (node) {
                updateDoc(doc(db, "referencias_arte", hrState.nodeAtualId), { 
                    x: parseFloat(node.style.left), y: parseFloat(node.style.top),
                    w: parseFloat(node.style.width), h: parseFloat(node.style.height),
                    isCropped: node.classList.contains('is-cropping'),
                    cropW: parseFloat(node.style.getPropertyValue('--crop-w') || node.style.width),
                    cropH: parseFloat(node.style.getPropertyValue('--crop-h') || node.style.height)
                });
            }
        }
        hrState.isDraggingNode = false;
        hrState.isResizingNode = false;
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const worldX = (hrState.mouseX - hrState.panX) / hrState.zoom;
        const worldY = (hrState.mouseY - hrState.panY) / hrState.zoom;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        hrState.zoom *= zoomFactor;
        
        if (hrState.zoom < 0.1) hrState.zoom = 0.1;
        if (hrState.zoom > 5) hrState.zoom = 5;

        hrState.panX = hrState.mouseX - (worldX * hrState.zoom);
        hrState.panY = hrState.mouseY - (worldY * hrState.zoom);

        atualizarMundoHeartRef();
    });
}, 1000);

window.addEventListener('paste', async (e) => {
    if (!document.getElementById('view-ref-visual') || document.getElementById('view-ref-visual').style.display === 'none') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    const textoColado = e.clipboardData.getData('text').trim();
    if (textoColado.startsWith('http')) {
        if (window.mostrarToastNotificacao) window.mostrarToastNotificacao("HeartRef", "Puxando imagem... ⏳", "geral");
        
        let urlFinal = textoColado;
        if (window.converterLinkDireto) urlFinal = window.converterLinkDireto(urlFinal);

        const worldX = (hrState.mouseX - hrState.panX) / hrState.zoom;
        const worldY = (hrState.mouseY - hrState.panY) / hrState.zoom;

        try {
            await addDoc(collection(db, "referencias_arte"), {
                url: urlFinal, projetoId: window.projetoAtualId,
                x: worldX, y: worldY, w: 400, h: "auto", dataCriacao: new Date().toISOString()
            });
            window.carregarReferenciasArt(window.projetoAtualId);
        } catch(err) { console.error(err); }
    }
});

window.iniciarDragNode = (e, id) => {
    e.preventDefault(); e.stopPropagation(); 
    
    const node = document.getElementById(`node-${id}`);
    document.querySelectorAll('.heartref-node').forEach(n => n.style.zIndex = 10);
    node.style.zIndex = 100;

    hrState.isDraggingNode = true;
    hrState.nodeAtualId = id;
    hrState.selectedNodeId = id; 
    
    hrState.nodeStartX = e.clientX;
    hrState.nodeStartY = e.clientY;
    
    hrState.nodeOrigX = parseFloat(node.style.left) || 0;
    hrState.nodeOrigY = parseFloat(node.style.top) || 0;
};

window.carregarReferenciasArt = async (pid) => {
    const world = document.getElementById('heartref-world');
    if (!world) return;

    onSnapshot(query(collection(db, "referencias_arte"), where("projetoId", "==", pid)), (snap) => {
        world.innerHTML = snap.docs.map(d => {
            const r = d.data();
            const posX = r.x || 50000; const posY = r.y || 50000;
            const width = r.w || 300; const height = r.h || 'auto';
            const heightPx = height === 'auto' ? 'auto' : `${height}px`;
            
            const cropClass = r.isCropped ? 'is-cropping' : '';
            const cropStyles = r.isCropped ? `--crop-w: ${r.cropW}px; --crop-h: ${r.cropH}px;` : '';

            let conteudo = r.tipo === "texto" 
                ? `<div class="heartref-text" 
                        onblur="this.contentEditable=false; window.salvarTextoNode('${d.id}', this.innerText)"
                        ondblclick="this.contentEditable=true; this.focus(); event.stopPropagation();">
                        ${r.texto || "Texto"}
                   </div>`
                : `<img src="${r.url}" draggable="false" ondblclick="window.focarObjeto('${d.id}')">`;

            return `
                <div id="node-${d.id}" class="heartref-node ${cropClass}" 
                     style="left: ${posX}px; top: ${posY}px; width: ${width}px; height: ${heightPx}; ${cropStyles} z-index: 10;"
                     onmousedown="if(event.button === 0) window.iniciarDragNode(event, '${d.id}')"
                     onmouseenter="window.setHoveredNode('${d.id}')"
                     onmouseleave="window.setHoveredNode(null)">
                    ${conteudo}
                    <div class="hr-resize-handle" onmousedown="window.iniciarResizeNode(event, '${d.id}')"></div>
                </div>`;
        }).join('');
    });
};

window.iniciarResizeNode = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    const node = document.getElementById(`node-${id}`);
    const img = node.querySelector('img');
    
    hrState.isResizingNode = true;
    hrState.nodeAtualId = id;
    hrState.nodeStartX = e.clientX;
    hrState.nodeStartY = e.clientY;
    
    hrState.startNodeW = node.offsetWidth;
    hrState.startNodeH = node.offsetHeight;

    hrState.imgOrigW = img ? img.offsetWidth : hrState.startNodeW;
    hrState.imgOrigH = img ? img.offsetHeight : hrState.startNodeH;
};

// --- CRIA TEXTO NO DUPLO CLIQUE (FUNDO) ---
setTimeout(() => {
    const viewportLocal = document.getElementById('heartref-viewport');
    if (viewportLocal) {
        viewportLocal.addEventListener('dblclick', async (e) => {
            if (e.target !== viewportLocal && e.target.id !== 'heartref-world') return;
            const worldX = (hrState.mouseX - hrState.panX) / hrState.zoom;
            const worldY = (hrState.mouseY - hrState.panY) / hrState.zoom;

            try {
                await addDoc(collection(db, "referencias_arte"), {
                    tipo: "texto", texto: "Escreva algo...", projetoId: window.projetoAtualId,
                    x: worldX, y: worldY, w: 200, h: 50, dataCriacao: new Date().toISOString()
                });
                window.carregarReferenciasArt(window.projetoAtualId);
            } catch(err) { console.error(err); }
        });
    }
}, 1000);

window.salvarTextoNode = (id, texto) => {
    updateDoc(doc(db, "referencias_arte", id), { texto: texto });
};