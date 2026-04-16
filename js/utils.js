import { auth, db, collection, doc, updateDoc, addDoc, increment } from './firebase.js';

window.obterNomeExibicao = () => {
    if (window.meuApelido) return window.meuApelido;
    if (window.meuNome) return window.meuNome.split(' ')[0];
    if (auth.currentUser) return auth.currentUser.email.split('@')[0];
    return "Desconhecido";
};

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.irParaAba = (targetId) => {
    const btn = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    
    const section = document.getElementById(targetId);
    if (section) section.classList.add('active');
    if (btn) btn.classList.add('active');
    document.querySelector('.content-area').scrollTop = 0;
};

window.registrarAtividade = async (mensagem, tipo, icone) => {
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "registro_atividades"), {
            autor: window.obterNomeExibicao(), mensagem, tipo, icone, dataCriacao: new Date().toISOString()
        });
    } catch (e) { console.error(e); }
};

window.comprimirImagem = (file, maxWidth, quality) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                if (scale < 1) { canvas.width = maxWidth; canvas.height = img.height * scale; } 
                else { canvas.width = img.width; canvas.height = img.height; }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
};

window.converterLinkDireto = (url) => {
    if (!url) return "";
    let link = url.trim();
    if (link.includes("dropbox.com")) {
        link = link.replace("www.dropbox.com", "dl.dropboxusercontent.com");
        const urlObj = new URL(link);
        const rlkey = urlObj.searchParams.get("rlkey");
        link = link.split('?')[0];
        if (rlkey) link += `?rlkey=${rlkey}`;
        return link;
    }
    if (link.includes("drive.google.com/file/d/")) {
        const fileId = link.match(/[-\w]{25,}/);
        if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
    }
    return link;
};

window.desenharGraficosMermaid = async (container) => {
    if (!container) return;
    
    if (typeof window.mermaid === 'undefined') {
        setTimeout(() => window.desenharGraficosMermaid(container), 200);
        return;
    }

    const blocos = container.querySelectorAll('pre code.language-mermaid, pre code.mermaid');
    if (blocos.length === 0) return;

    window.mermaid.initialize({ theme: 'dark', startOnLoad: false });

    for (let i = 0; i < blocos.length; i++) {
        const bloco = blocos[i];
        const preElement = bloco.parentElement;
        
        let codigoDiagrama = bloco.textContent || bloco.innerText;
        codigoDiagrama = codigoDiagrama.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

        try {
            const idGerado = `mermaid-svg-${Date.now()}-${i}`;
            const { svg } = await window.mermaid.render(idGerado, codigoDiagrama);
            
            const divGrafico = document.createElement('div');
            divGrafico.className = 'mermaid-renderizado';
            divGrafico.style.textAlign = 'center';
            divGrafico.style.margin = '25px 0';
            divGrafico.style.cursor = 'zoom-in';
            divGrafico.title = "Clique para abrir a Mesa de Luz";
            divGrafico.innerHTML = svg;
            
            // O PULO DO GATO: A NOVA MESA DE LUZ COM ZOOM 🔍
            divGrafico.onclick = () => {
                let overlay = document.getElementById('mermaid-zoom-overlay');
                
                // Cria a tela de fundo se ela não existir
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'mermaid-zoom-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0'; overlay.style.left = '0';
                    overlay.style.width = '100vw'; overlay.style.height = '100vh';
                    overlay.style.background = 'rgba(0,0,0,0.95)';
                    overlay.style.zIndex = '2147483647';
                    overlay.style.display = 'flex';
                    overlay.style.justifyContent = 'center';
                    overlay.style.alignItems = 'center';
                    document.body.appendChild(overlay);
                }
                
                // Injeta a tela de rolagem e os botões de controle do Zoom
                overlay.innerHTML = `
                    <div id="mermaid-scroll-box" style="background: #111; border-radius: 12px; width: 95vw; height: 95vh; box-shadow: 0 0 50px rgba(0,0,0,1); border: 1px solid var(--primary); overflow: auto; position: relative;">
                        
                        <button id="close-mermaid-btn" style="position: fixed; top: 30px; right: 40px; background: rgba(255,82,82,0.2); color: #ff5252; border: 1px solid #ff5252; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.5rem; z-index: 1000; display: flex; align-items: center; justify-content: center; transition: 0.2s;">×</button>
                        
                        <div style="position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); border: 1px solid var(--primary); padding: 10px 20px; border-radius: 30px; display: flex; gap: 20px; align-items: center; z-index: 1000; backdrop-filter: blur(5px);">
                            <button id="m-zoom-out" style="background: transparent; color: #fff; border: none; cursor: pointer; font-size: 1.1rem; font-weight: bold; transition: 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#fff'">-</button>
                            <span id="m-zoom-text" style="color: var(--primary); font-weight: bold; min-width: 50px; text-align: center; font-size: 0.9rem;">100%</span>
                            <button id="m-zoom-in" style="background: transparent; color: #fff; border: none; cursor: pointer; font-size: 1.1rem; font-weight: bold; transition: 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#fff'">+</button>
                        </div>

                        <div id="mermaid-svg-wrapper" style="width: 100%; min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 50px;">
                            ${svg}
                        </div>
                    </div>`;
                
                const scrollBox = overlay.querySelector('#mermaid-scroll-box');
                const wrapper = overlay.querySelector('#mermaid-svg-wrapper');
                const svgDentro = overlay.querySelector('svg');
                const zoomText = overlay.querySelector('#m-zoom-text');
                
                let currentScale = 1; // 100%

                // A função que estica e encolhe a imagem DE VERDADE
                const updateZoom = (newScale) => {
                    currentScale = Math.max(0.5, Math.min(newScale, 5)); // Limite de 50% a 500%
                    zoomText.innerText = Math.round(currentScale * 100) + '%';
                    
                    if (wrapper) {
                        // Esticamos a caixa que envolve o SVG. Isso obriga a barra de rolagem a aparecer!
                        wrapper.style.width = (100 * currentScale) + '%';
                        wrapper.style.minWidth = (100 * currentScale) + '%';
                    }
                };

                if(svgDentro) {
                    // MATA AS TRAVAS DO MERMAID: Forçamos o SVG a obedecer o tamanho da nossa caixa
                    svgDentro.removeAttribute('width'); 
                    svgDentro.removeAttribute('height');
                    svgDentro.style.width = '100%';
                    svgDentro.style.height = 'auto';
                    svgDentro.style.maxWidth = 'none'; // Tira o limite máximo
                    
                    // Adiciona a animação suave na caixa de fora
                    wrapper.style.transition = 'width 0.2s ease-out, min-width 0.2s ease-out';
                    
                    updateZoom(1); 
                    
                    // Clique direto na imagem para dar Zoom Rápido
                    svgDentro.style.cursor = 'zoom-in';
                    svgDentro.onclick = (e) => {
                        e.stopPropagation();
                        // Se estiver menor que 300%, ele amplia. Se passar, reseta.
                        if(currentScale < 3) updateZoom(currentScale + 0.5);
                        else updateZoom(1); 
                        
                        svgDentro.style.cursor = currentScale >= 3 ? 'zoom-out' : 'zoom-in';
                    };
                }

                // Ligando os botões da barra inferior
                overlay.querySelector('#m-zoom-in').onclick = (e) => { e.stopPropagation(); updateZoom(currentScale + 0.25); };
                overlay.querySelector('#m-zoom-out').onclick = (e) => { e.stopPropagation(); updateZoom(currentScale - 0.25); };
                
                // Botão de Fechar e clicar fora da imagem
                const closeOverlay = () => overlay.style.display = 'none';
                overlay.querySelector('#close-mermaid-btn').onclick = closeOverlay;
                
                scrollBox.onclick = (e) => {
                    if (e.target === scrollBox || e.target === wrapper) closeOverlay();
                };

                overlay.style.display = 'flex';
            };
            
            preElement.parentNode.replaceChild(divGrafico, preElement);

        } catch (error) {
            console.error("Erro ao desenhar o diagrama Mermaid:", error);
            bloco.style.color = "#ff5252";
            bloco.innerText = `Erro na sintaxe do diagrama:\n${error.message}`;
        }
    }
};

// ==========================================
// MOTOR DE GAMIFICAÇÃO (XP)
// ==========================================
window.pontuarGamificacao = async (tipoAcao, userId, tag, reverter = false, multiplicador = 1) => {
    if (!userId) return;
    
    // 1. Define os pontos base (A Regra do Jogo)
    let pontosBase = 0;
    if (tipoAcao === 'checklist') pontosBase = 5;  // 5 XP por caixinha marcada
    if (tipoAcao === 'tarefa') pontosBase = 20;    // 20 XP por tarefa concluída
    if (tipoAcao === 'bug') pontosBase = 30;       // Matar bug dá mais XP!
    
    // 2. Aplica a dificuldade
    let pontosGanhos = Math.round(pontosBase * multiplicador);
    
    // 3. Sistema Anti-Cheat (Tira os pontos se a pessoa desmarcar a caixa)
    if (reverter) pontosGanhos = -pontosGanhos;
    
    // Se não tiver ponto pra dar, aborta
    if (pontosGanhos === 0) return;

    try {
        // 4. Injeta os pontos no Firebase do Usuário
        await updateDoc(doc(db, "usuarios", userId), {
            xp: increment(pontosGanhos)
        });

        // 5. Mostra o aviso na tela (Só se for ponto positivo e para o próprio usuário)
        if (pontosGanhos > 0 && userId === auth.currentUser?.uid) {
            if (typeof window.mostrarToastNotificacao === 'function') {
                window.mostrarToastNotificacao('LEVEL UP!', `+${pontosGanhos} XP adquiridos!`, tag);
            }
        }
    } catch (e) {
        console.error("Erro ao processar XP:", e);
    }
};