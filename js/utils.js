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
    // 1. Verificações de segurança
    if (!container) return;
    
    // Aguarda um instante para garantir que a variável window.mermaid do HTML carregou
    if (typeof window.mermaid === 'undefined') {
        setTimeout(() => window.desenharGraficosMermaid(container), 200);
        return;
    }

    // 2. Busca todas as caixas de código que o Markdown gerou com a tag "mermaid"
    const blocos = container.querySelectorAll('pre code.language-mermaid, pre code.mermaid');
    if (blocos.length === 0) return;

    // Configura o tema Escuro antes de desenhar
    window.mermaid.initialize({ theme: 'dark', startOnLoad: false });

    // 3. Processa cada bloco individualmente
    for (let i = 0; i < blocos.length; i++) {
        const bloco = blocos[i];
        const preElement = bloco.parentElement;
        
        // Pega o código do diagrama do jeito que você digitou
        const codigoDiagrama = bloco.textContent;

        try {
            // Pede pro Mermaid transformar o texto em uma imagem SVG
            const idGerado = `mermaid-svg-${Date.now()}-${i}`;
            const { svg } = await window.mermaid.render(idGerado, codigoDiagrama);
            
            // Cria um container bonitinho para a imagem
            const divGrafico = document.createElement('div');
            divGrafico.className = 'mermaid-renderizado';
            divGrafico.style.textAlign = 'center';
            divGrafico.style.margin = '25px 0';
            divGrafico.innerHTML = svg;
            
            // Substitui a caixa de texto preta pela imagem do diagrama!
            preElement.parentNode.replaceChild(divGrafico, preElement);

        } catch (error) {
            console.error("Erro ao desenhar o diagrama Mermaid:", error);
            // Se o código tiver erro (ex: faltou uma seta), ele mostra o erro na tela pro usuário
            bloco.style.color = "#ff5252";
            bloco.innerText = `Erro na sintaxe do diagrama:\n${error.message}`;
        }
    }
};

 // Garanta que o 'increment' está importado no topo do arquivo!

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