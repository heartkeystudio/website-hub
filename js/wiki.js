// ==========================================
// WIKI.JS - SISTEMA DE DOCUMENTAÇÃO (RESTAURADO)
// ==========================================
import { auth, db, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot, getDoc, orderBy } from './firebase.js';

window.wikiAtualId = null;
window.wikiCache = {};
window.wikiFoldersCache = [];
window.wikiPagesCache = [];
window.wikiPastasFechadas = new Set();
window.ultimaPastaSelecionada = null;
window.wikiTimeout = null;
window.itensSelecionadosWiki = []; 
window.ultimoClicadoId = null;
window.isSavingWiki = false;
window.lixeiraAberta = false;
window.wikiSortMode = localStorage.getItem('hub_wiki_sort') || 'manual';

// ==========================================
// 1. MOTOR DE RENDERIZAÇÃO E MODOS (MARKDOWN/OBSIDIAN)
// ==========================================
window.processarTagsCustomizadas = (html) => {
    let processado = html;

    // 1. Resolve a guerra do Markdown com o {center} blindando contra a tag <p>
    processado = processado.replace(/<p>\s*\{center\}\s*<\/p>/gi, '<div class="wiki-center">');
    processado = processado.replace(/<p>\s*\{\/center\}\s*<\/p>/gi, '</div>');
    processado = processado.replace(/\{center\}/gi, '<div class="wiki-center">');
    processado = processado.replace(/\{\/center\}/gi, '</div>');

    // 2. Links Internos
    processado = processado.replace(/\[\[(.*?)\]\]/g, (match, conteudo) => {
        let partes = conteudo.split('#');
        let titulo = partes[0].trim();
        let ancora = partes[1] ? partes[1].trim() : '';
        let tituloSafe = titulo.replace(/'/g, "\\'");
        let ancoraSafe = ancora.replace(/'/g, "\\'");
        let textoLink = ancora ? `${titulo} > ${ancora}` : titulo;
        return `<a class="wiki-internal-link" onclick="abrirWikiPorTitulo(event, '${tituloSafe}', '${ancoraSafe}')">${textoLink}</a>`;
    });

    // 3. Mídia e Imagens
    processado = processado.replace(/\{video:(.*?)\}/g, (match, url) => {
        let link = url.replace(/<[^>]+>/g, '').trim(); 
        if (link.includes('youtube.com/watch?v=')) {
            let id = link.split('v=')[1].split('&')[0];
            return `<iframe width="100%" height="450" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0;"></iframe>`;
        } 
        else if (link.includes('youtu.be/')) {
            let id = link.split('youtu.be/')[1].split('?')[0];
            return `<iframe width="100%" height="450" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0;"></iframe>`;
        } 
        else if (link.includes('drive.google.com/file/d/')) {
            const fileId = link.match(/[-\w]{25,}/); 
            if (fileId) return `<iframe width="100%" height="450" src="https://drive.google.com/file/d/${fileId[0]}/preview" frameborder="0" allowfullscreen style="border-radius:12px; margin: 15px 0;"></iframe>`;
        }
        else if (link.includes('dropbox.com')) {
            let dropLink = link.replace("dl=0", "raw=1").replace("dl=1", "raw=1");
            if (!dropLink.includes("raw=1")) dropLink += dropLink.includes("?") ? "&raw=1" : "?raw=1";
            return `<video width="100%" controls style="border-radius:12px; margin: 15px 0; background: #000;"><source src="${dropLink}">Seu navegador não suporta a tag de vídeo.</video>`;
        }
        else return `<video width="100%" controls style="border-radius:12px; margin: 15px 0; background: #000;"><source src="${link}">Seu navegador não suporta a tag de vídeo.</video>`;
    });

    processado = processado.replace(/\{img:\s*([^|}]+)(?:\|\s*([^}]+))?\}/g, (match, url, tamanho) => {
        let link = url.trim().replace(/<[^>]+>/g, '').trim(); 
        let sizeStyle = tamanho ? `width: ${tamanho.trim()} !important; max-height: none;` : '';
        return `<img src="${link}" class="wiki-custom-img" style="${sizeStyle}">`;
    });

    return processado;
};

window.abrirWikiPorTitulo = (e, titulo, ancora) => {
    e.preventDefault();
    const docEncontrado = window.wikiPagesCache.find(p => p.titulo.toLowerCase() === titulo.toLowerCase());
    if (docEncontrado) {
        window.abrirWiki(docEncontrado.id);
        if (ancora) {
            setTimeout(() => {
                const idAncora = ancora.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                const elemento = document.getElementById(idAncora);
                if (elemento) {
                    elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const corOriginal = elemento.style.color;
                    elemento.style.color = "var(--primary)";
                    setTimeout(() => elemento.style.color = corOriginal, 1500);
                }
            }, 100); 
        }
    } else {
        alert(`Documento "${titulo}" não encontrado!`);
    }
};

window.rolarParaAncora = (e, idAncora) => {
    if(e) e.preventDefault();
    const elemento = document.getElementById(idAncora);
    if (elemento) {
        elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const cor = elemento.style.color;
        elemento.style.color = "var(--primary)";
        setTimeout(() => elemento.style.color = cor, 1500);
    }
};

window.atualizarLayoutFolha = () => {
    const edit = document.getElementById('wiki-conteudo');
    const prev = document.getElementById('wiki-preview-area');
    if (!edit || !prev) return;

    const texto = edit.value;

    const customWidth = texto.match(/\{width:\s*([^}]+)\}/i);
    if (customWidth) {
        edit.style.setProperty('max-width', customWidth[1], 'important');
        prev.style.setProperty('max-width', customWidth[1], 'important');
    } else {
        edit.style.removeProperty('max-width');
        prev.style.removeProperty('max-width');
    }

    const customMargin = texto.match(/\{margin:\s*([^}]+)\}/i);
    if (customMargin) {
        edit.style.setProperty('padding', customMargin[1], 'important');
        prev.style.setProperty('padding', customMargin[1], 'important');
    } else {
        edit.style.removeProperty('padding');
        prev.style.removeProperty('padding');
    }
};

window.setWikiMode = (mode) => {
    const edit = document.getElementById('wiki-conteudo');
    const prev = document.getElementById('wiki-preview-area');
    const toc = document.getElementById('wiki-toc');
    const metaPanel = document.getElementById('wiki-metadata'); 

    // O PULO DO GATO: Sempre atualiza o layout da folha lendo o {width} e {margin}
    if (typeof window.atualizarLayoutFolha === 'function') window.atualizarLayoutFolha();

    if (mode === 'preview') {
        if (edit && prev) {
            let textoBruto = edit.value;
            let htmlMetadados = '';

            // TOLERÂNCIA YAML: Encontra o bloco YAML mesmo se tiver um {width: 100%} antes dele
            const yamlRegex = /^[\s\n]*(?:\{[^}]+\}[\s\n]*)*---\n([\s\S]*?)\n---/;
            const matchYaml = textoBruto.match(yamlRegex);
            
            if (matchYaml) {
                const yaml = matchYaml[1];
                textoBruto = textoBruto.replace(/---\n[\s\S]*?\n---/, ''); 
                
                const linhasYaml = yaml.split('\n');
                htmlMetadados = '<div class="wiki-frontmatter">';
                linhasYaml.forEach(l => {
                    if(l.includes(':')) {
                        const [key, ...rest] = l.split(':');
                        htmlMetadados += `<div class="wiki-meta-row"><span class="wiki-meta-key">${key.trim()}</span><span class="wiki-meta-value">${rest.join(':').trim()}</span></div>`;
                    }
                });
                htmlMetadados += '</div>';
            }

            if (metaPanel) {
                metaPanel.innerHTML = htmlMetadados;
                metaPanel.style.display = htmlMetadados ? 'block' : 'none';
            }

            // MÁGICA 2: Remove as formatações inline ANTES do Markdown ser lido
            let textoLimpo = textoBruto;
            textoLimpo = textoLimpo.replace(/\{width:[^}]+\}/gi, '');
            textoLimpo = textoLimpo.replace(/\{margin:[^}]+\}/gi, '');
            
            textoLimpo = textoLimpo.replace(/\{cor:([^}]+)\}/gi, '<span style="color: $1;">');
            textoLimpo = textoLimpo.replace(/\{\/cor\}/gi, '</span>');
            
            textoLimpo = textoLimpo.replace(/\{font:([^}]+)\}/gi, '<span style="font-family: \'$1\';">');
            textoLimpo = textoLimpo.replace(/\{\/font\}/gi, '</span>');

            // O NOVO MOTOR DE CALLOUTS (Padrão Obsidian Completo)
            let textoComCallouts = textoLimpo.replace(/^> \[!([a-zA-Z]+)\](.*?)\n((?:>.*\n?)*)/gim, (match, tipo, titulo, conteudo) => {
                const limpo = conteudo.replace(/^>\s?/gm, ''); 
                
                // Dicionário completo de ícones
                const icones = { 
                    info: 'ℹ️', note: '📓', abstract: '📋', summary: '📋', tldr: '📋',
                    warning: '⚠️', caution: '⚠️', attention: '⚠️',
                    danger: '🚨', error: '🚨', bug: '🐛',
                    success: '✅', check: '✅', done: '✅',
                    tip: '💡', hint: '💡', 
                    question: '❓', help: '❓', faq: '❓',
                    quote: '💬', cite: '💬', example: '📝'
                };
                
                const t = tipo.toLowerCase();
                const iconeRender = icones[t] || '📌'; // Padrão se não achar o ícone
                const tituloRender = titulo.trim() || (t.charAt(0).toUpperCase() + t.slice(1)); // Capitaliza a primeira letra
                
                return `<div class="wiki-callout callout-${t}">
                            <div class="wiki-callout-title">${iconeRender} ${tituloRender}</div>
                            <div class="wiki-callout-content">\n\n${limpo}\n\n</div>
                        </div>`;
            });

            const textoConvertido = textoComCallouts.replace(/https?:\/\/(www\.)?dropbox\.com\/[^\s)]+/g, (match) => {
                if (window.converterLinkDireto) return window.converterLinkDireto(match);
                return match;
            });
            
            // Renderização Final
            let htmlGerado = marked.parse(textoConvertido);
            prev.innerHTML = window.processarTagsCustomizadas(htmlGerado);
            prev.dataset.originalHtml = prev.innerHTML;

            edit.style.setProperty('display', 'none', 'important');
            prev.style.setProperty('display', 'block', 'important');
            
            setTimeout(() => {
                 if (typeof window.desenharGraficosMermaid === 'function') {
                      window.desenharGraficosMermaid(prev);
                 }
            }, 100);
            
            document.getElementById('btn-wiki-preview')?.classList.add('active');
            document.getElementById('btn-wiki-edit')?.classList.remove('active');
            
            if (prev) {
                const headers = prev.querySelectorAll('h2, h3');
                if (headers.length > 0 && toc) {
                    let tocHtml = '<div class="wiki-toc-title">Nesta Página</div>';
                    headers.forEach(h => {
                        if(!h.id) h.id = h.innerText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                        const level = h.tagName.toLowerCase() === 'h2' ? 'toc-h2' : 'toc-h3';
                        tocHtml += `<a class="wiki-toc-item ${level}" onclick="window.rolarParaAncora(event, '${h.id}')">${h.innerText}</a>`;
                    });
                    toc.innerHTML = tocHtml;
                    toc.classList.add('active'); 
                } else if (toc) {
                    toc.classList.remove('active');
                }
            }

            if (window.wikiAtualId) window.carregarComentariosWiki(window.wikiAtualId);

        }
    } else {
        edit.style.setProperty('display', 'block', 'important');
        prev.style.setProperty('display', 'none', 'important');
        if (metaPanel) metaPanel.style.display = 'none'; 
        document.getElementById('btn-wiki-edit')?.classList.add('active');
        document.getElementById('btn-wiki-preview')?.classList.remove('active');
        if (toc) toc.classList.remove('active');
    }
};

window.toggleFullscreenWiki = () => {
    const layout = document.querySelector('.wiki-layout');
    const btn = document.getElementById('btn-wiki-fullscreen');
    
    if (layout) {
        layout.classList.toggle('fullscreen');
        document.body.classList.toggle('wiki-fullscreen-active');
        
        if (layout.classList.contains('fullscreen')) {
            btn.innerText = "🗗"; 
            btn.setAttribute('data-tooltip', 'Sair da Tela Cheia');
        } else {
            btn.innerText = "⛶"; 
            btn.setAttribute('data-tooltip', 'Tela Cheia');
        }
    }
};

// ==========================================
// 2. SALVAMENTO E HISTÓRICO
// ==========================================
window.triggerAutoSave = () => {
    const indicador = document.getElementById('wiki-autosave-indicator');
    if (indicador) {
        indicador.style.opacity = '1';
        indicador.style.color = 'var(--text-muted)';
        indicador.innerText = '⏳ Pendente...'; 
    }
    
    window.atualizarLayoutFolha();
    clearTimeout(window.wikiTimeout);
    
    window.wikiTimeout = setTimeout(() => {
        window.salvarPaginaWiki(true);
    }, 30000); 
};

window.salvarPaginaWiki = async (isAutoSave = false) => {
    if (window.isSavingWiki || !window.wikiAtualId) return; 

    const conteudoTexto = document.getElementById('wiki-conteudo').value;
    window.isSavingWiki = true;

    try {
        const docRef = doc(db, "wiki", window.wikiAtualId);
        const snapAtual = await getDoc(docRef);
        
        if (snapAtual.exists()) {
            const dadosAtuais = snapAtual.data();
            if (Math.abs(dadosAtuais.conteudo.length - conteudoTexto.length) > 10) {
                await addDoc(collection(db, "wiki_historico"), {
                    wikiId: window.wikiAtualId,
                    conteudo: dadosAtuais.conteudo,
                    autor: dadosAtuais.autorUltimaModificacao || 'Desconhecido',
                    dataSalvo: new Date().toISOString()
                });
            }
        }

        await updateDoc(docRef, {
            conteudo: conteudoTexto,
            autorUltimaModificacao: auth.currentUser.email,
            dataAtualizacao: new Date().toISOString()
        });
        
        if (isAutoSave) {
            const indicador = document.getElementById('wiki-autosave-indicator');
            if (indicador) {
                indicador.style.opacity = '1';
                indicador.style.color = 'var(--primary)';
                indicador.innerText = '✓ Salvo';
                setTimeout(() => indicador.style.opacity = '0', 2000); 
            }
        }
    } catch(e) { console.error("Erro ao salvar:", e); } 
    finally { window.isSavingWiki = false; }
};

window.abrirHistoricoWiki = () => {
    if (!window.wikiAtualId) return alert("Abra um documento primeiro.");
    const lista = document.getElementById('lista-historico-wiki');
    lista.innerHTML = '<li style="text-align:center; color:#888;">Buscando registros na máquina do tempo... ⏳</li>';
    window.openModal('modalHistoricoWiki');

    const q = query(collection(db, "wiki_historico"), where("wikiId", "==", window.wikiAtualId), orderBy("dataSalvo", "desc"), limit(20));
    
    onSnapshot(q, (snap) => {
        if (snap.empty) {
            lista.innerHTML = '<li style="text-align:center; color:#888; padding: 20px;">Nenhum histórico antigo encontrado para este documento.</li>';
            return;
        }

        lista.innerHTML = snap.docs.map(d => {
            const h = d.data();
            const dataF = new Date(h.dataSalvo).toLocaleString();
            const txtSeguro = h.conteudo.replace(/'/g, "'").replace(/"/g, "\"").replace(/\n/g, "\\n");
            
            return `
                <li style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border-left: 3px solid var(--primary);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px;">
                        <div>
                            <strong style="color:var(--primary); font-size: 0.9rem;">${dataF}</strong><br>
                            <span style="font-size: 0.75rem; color: #888;">Salvo por ${h.autor.split('@')[0]}</span>
                        </div>
                        <button class="btn-secondary" onclick="window.restaurarHistoricoWiki('${txtSeguro}')" style="font-size: 0.75rem; padding: 4px 8px;">🔄 Restaurar</button>
                    </div>
                    <div style="font-size: 0.75rem; color: #aaa; background: #000; padding: 10px; border-radius: 4px; max-height: 80px; overflow-y: hidden; mask-image: linear-gradient(to bottom, black 50%, transparent 100%);">
                        ${h.conteudo.substring(0, 150)}...
                    </div>
                </li>
            `;
        }).join('');
    });
};

window.restaurarHistoricoWiki = (textoRecuperado) => {
    if (confirm("ATENÇÃO: Isso vai substituir TODO o texto atual da tela por esta versão antiga. Tem certeza?")) {
        const input = document.getElementById('wiki-conteudo');
        input.value = textoRecuperado.replace(/\\n/g, '\n'); 
        window.setWikiMode('edit');
        window.salvarPaginaWiki(true); 
        window.closeModal('modalHistoricoWiki');
        window.mostrarToastNotificacao('Máquina do Tempo', 'Documento restaurado com sucesso!', 'geral');
    }
};

// ==========================================
// 3. CARREGAMENTO E ÁRVORE DE ARQUIVOS
// ==========================================
window.carregarWikiDoProjeto = (pid) => {
    onSnapshot(query(collection(db, "wiki_pastas"), where("projetoId", "==", pid)), (snap) => {
        window.wikiFoldersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderizarWikiTree();
    });

    onSnapshot(query(collection(db, "wiki"), where("projetoId", "==", pid)), (snap) => {
        window.wikiPagesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.wikiPagesCache.forEach(p => window.wikiCache[p.id] = p);
        window.renderizarWikiTree();
    });

    setTimeout(() => {
        const idSalva = localStorage.getItem('heartkey_ultima_wiki_id');
        if (!window.wikiAtualId && idSalva) {
            const existe = window.wikiPagesCache.find(p => p.id === idSalva);
            if (existe) window.abrirWiki(idSalva);
        }
    }, 500);
};

window.termoBuscaWiki = "";
window.filtrarWiki = () => {
    window.termoBuscaWiki = document.getElementById('wiki-search-input').value.toLowerCase();
    window.renderizarWikiTree();
};

window.mudarOrdemWiki = (mode) => {
    window.wikiSortMode = mode;
    localStorage.setItem('hub_wiki_sort', mode);
    window.renderizarWikiTree(); 
};

window.renderizarWikiTree = () => {
    const container = document.getElementById('wiki-tree-container');
    if (!container) return;

    const searchInput = document.getElementById('wiki-search-input');
    if (searchInput && !document.getElementById('wiki-sort-select')) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex'; wrap.style.gap = '10px'; wrap.style.marginBottom = '15px';
        searchInput.style.marginBottom = '0';
        searchInput.parentNode.insertBefore(wrap, searchInput);
        wrap.appendChild(searchInput);
        wrap.insertAdjacentHTML('beforeend', `
            <select id="wiki-sort-select" class="wiki-sort-select" onchange="window.mudarOrdemWiki(this.value)">
                <option value="manual" ${window.wikiSortMode === 'manual' ? 'selected' : ''}>✋ Ordem Manual</option>
                <option value="az" ${window.wikiSortMode === 'az' ? 'selected' : ''}>🔤 A-Z</option>
                <option value="date" ${window.wikiSortMode === 'date' ? 'selected' : ''}>📅 Mais Recentes</option>
            </select>
        `);
    }

    const pastasPorPai = { 'root': [], 'trash': [] };
    window.wikiFoldersCache.forEach(f => {
        const pai = f.parentId || 'root';
        if (!pastasPorPai[pai]) pastasPorPai[pai] = [];
        pastasPorPai[pai].push(f);
    });

    const arquivosPorPasta = { 'root': [], 'trash': [] };
    window.wikiPagesCache.forEach(p => {
        const pasta = p.pastaId || 'root';
        if (!arquivosPorPasta[pasta]) arquivosPorPasta[pasta] = [];
        arquivosPorPasta[pasta].push(p);
    });

    const ordenarArray = (arr, isFolder) => {
        if (!arr) return [];
        return arr.sort((a, b) => {
            if (window.wikiSortMode === 'az') {
                const nomeA = (a.nome || a.titulo).toLowerCase();
                const nomeB = (b.nome || b.titulo).toLowerCase();
                return nomeA.localeCompare(nomeB);
            } else if (window.wikiSortMode === 'date') {
                return new Date(b.dataCriacao) - new Date(a.dataCriacao);
            } else {
                return (a.ordem || 9999999999999) - (b.ordem || 9999999999999);
            }
        });
    };

    Object.keys(pastasPorPai).forEach(k => pastasPorPai[k] = ordenarArray(pastasPorPai[k], true));
    Object.keys(arquivosPorPasta).forEach(k => arquivosPorPasta[k] = ordenarArray(arquivosPorPasta[k], false));

    if (window.termoBuscaWiki && window.termoBuscaWiki.trim() !== "") {
        const termo = window.termoBuscaWiki.trim();
        let htmlBusca = `<div style="font-size: 0.75rem; color: var(--primary); margin-bottom: 10px; font-weight:bold;">Resultados da busca:</div>`;
        const matches = window.wikiPagesCache.filter(p => p.titulo.toLowerCase().includes(termo) || p.conteudo.toLowerCase().includes(termo));
        
        if (matches.length === 0) {
            htmlBusca += `<div style="color: #888; font-size: 0.8rem; text-align: center; padding: 20px;">Nenhum documento encontrado.</div>`;
        } else {
            matches.forEach(p => {
                const nomePasta = p.pastaId && p.pastaId !== 'trash' ? (window.wikiFoldersCache.find(f => f.id === p.pastaId)?.nome || "Pasta Desconhecida") : "Raiz";
                htmlBusca += `
                    <div class="wiki-file-item" style="flex-direction: column; align-items: flex-start; gap: 2px;" onclick="window.abrirWiki('${p.id}')">
                        <div style="font-size: 0.7rem; color: #888;">📁 ${nomePasta}</div>
                        <div><span class="wiki-search-highlight">📄 ${p.titulo}</span></div>
                    </div>`;
            });
        }
        container.innerHTML = htmlBusca;
        return; 
    }

    const construirArvore = (parentId, inTrash = false) => {
        let html = '';
        
        if (pastasPorPai[parentId]) {
            pastasPorPai[parentId].forEach(f => {
                const isFechada = window.wikiPastasFechadas.has(f.id);
                const seta = isFechada ? '▶' : '▼';
                const classeLixo = inTrash ? 'item-apagado' : '';
                const isSelecionada = (f.id === window.ultimaPastaSelecionada);
                const classeSelecionada = isSelecionada ? 'selected' : '';
                const isMultiSelected = window.itensSelecionadosWiki.some(i => i.id === f.id);
                const classeMulti = isMultiSelected ? 'multi-selected' : '';

                const isFav = window.meusFavoritosWiki && window.meusFavoritosWiki.includes(f.id);
                const textoFav = isFav ? '🌟 Desfavoritar' : '⭐ Favoritar';
                const corFav = isFav ? 'color: #ffc107;' : '';

                const menuAcoes = inTrash ? '' : `
                    <div class="comment-menu-container wiki-item-actions">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            <button onclick="window.toggleFavoritoWiki(event, '${f.id}')" style="${corFav}">${textoFav}</button>
                            <button onclick="window.renomearPastaWiki(event, '${f.id}', '${f.nome.replace(/'/g, "\\'")}')">✏️ Renomear</button>
                            <button class="del" onclick="window.deletarPastaWiki(event, '${f.id}')">🗑️ Excluir Pasta</button>
                        </div>
                    </div>
                `;

                const temSubpastas = pastasPorPai[f.id] && pastasPorPai[f.id].length > 0;
                const temArquivos = arquivosPorPasta[f.id] && arquivosPorPasta[f.id].length > 0;
                let conteudoDaPasta = construirArvore(f.id, inTrash);
                
                if (!temSubpastas && !temArquivos && !inTrash) {
                    conteudoDaPasta = `<div style="padding: 10px 15px 10px 30px; color: #555; font-size: 0.75rem; font-style: italic; pointer-events: none;">📂 Pasta vazia... solte arquivos aqui.</div>`;
                }

                html += `
                    <div style="margin-top: 5px;" class="${classeLixo}">
                        <div class="wiki-folder-header ${classeSelecionada} ${classeMulti} wiki-node-item" 
                             title="${f.nome.replace(/"/g, '"')}" 
                             data-node-id="${f.id}" data-node-type="folder"
                             draggable="true" 
                             ondragstart="window.dragStartWiki(event, '${f.id}', 'folder')" 
                             onclick="window.handleWikiItemClick(event, '${f.id}', 'folder', '${f.nome.replace(/'/g, "\\'")}')" 
                             ondblclick="window.togglePastaWiki(event, '${f.id}')" 
                             ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, '${f.id}')">
                            <div class="wiki-item-name">
                                <span class="folder-toggle-icon" onclick="window.togglePastaWiki(event, '${f.id}')">${seta}</span>
                                <span>📁</span>
                                <span class="wiki-item-text">${f.nome}</span>
                            </div>
                            ${menuAcoes}
                        </div>
                        <div class="wiki-folder-content wiki-dropzone" id="folder-${f.id}" style="display: ${isFechada ? 'none' : 'block'};" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, '${f.id}')">
                            ${conteudoDaPasta}
                        </div>
                    </div>
                `;
            });
        }
        
        if (arquivosPorPasta[parentId]) {
            arquivosPorPasta[parentId].forEach(p => {
                const classeLixo = inTrash ? 'item-apagado' : '';
                const classeAtiva = (p.id === window.wikiAtualId) ? 'active' : '';
                const temNotificacao = window.cacheNotificacoes && window.cacheNotificacoes.some(n => n.contextId === p.id || n.contextId === p.id + '_note');
                const pingoHtml = temNotificacao ? '<span class="item-dot" style="flex-shrink:0;"></span>' : '';
                const isMultiSelected = window.itensSelecionadosWiki.some(i => i.id === p.id);
                const classeMulti = isMultiSelected ? 'multi-selected' : '';

                const isFav = window.meusFavoritosWiki && window.meusFavoritosWiki.includes(p.id);
                const textoFav = isFav ? '🌟 Desfavoritar' : '⭐ Favoritar';
                const corFav = isFav ? 'color: #ffc107;' : '';

                const menuAcoes = inTrash ? '' : `
                    <div class="comment-menu-container wiki-item-actions">
                        <button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button>
                        <div class="dropdown-content">
                            <button onclick="window.toggleFavoritoWiki(event, '${p.id}')" style="${corFav}">${textoFav}</button>
                            <button onclick="window.renomearArquivoWikiDireto(event, '${p.id}', '${p.titulo.replace(/'/g, "\\'")}')">✏️ Renomear</button>
                            <button class="del" onclick="window.deletarArquivoWikiDireto(event, '${p.id}')">🗑️ Excluir Arquivo</button>
                        </div>
                    </div>
                `;

                html += `
                    <div class="wiki-file-item ${classeLixo} ${classeAtiva} ${classeMulti} wiki-node-item" 
                         title="${p.titulo.replace(/"/g, '"')}" 
                         data-node-id="${p.id}" data-node-type="file"
                         draggable="true" 
                         ondragstart="window.dragStartWiki(event, '${p.id}', 'file')" 
                         onclick="window.handleWikiItemClick(event, '${p.id}', 'file', '${p.titulo.replace(/'/g, "\\'")}')">
                        <div class="wiki-item-name">
                            <span>📄</span> 
                            <span class="wiki-item-text">${p.titulo}</span>
                            ${pingoHtml}
                        </div>
                        ${menuAcoes}
                    </div>
                `;
            });
        }
        return html;
    };

    let arvoreCompleta = construirArvore('root');
    let arvoreLixeira = construirArvore('trash', true); 

    let btnEsvaziar = (arvoreLixeira && window.userRole === 'admin') 
        ? `<button class="btn-primary" onclick="window.esvaziarLixeira()" style="background: transparent; color: #ff5252; border: 1px solid #ff5252; width: 100%; margin-top: 15px; font-size: 0.8rem;">🔥 Esvaziar Definitivamente</button>` 
        : '';

    const setaLixeira = window.lixeiraAberta ? '▼' : '▶';
    const displayLixeira = window.lixeiraAberta ? 'block' : 'none';
    const paddingLixeira = window.lixeiraAberta ? '15px' : '10px 15px';
    const margemTitulo = window.lixeiraAberta ? '10px' : '0';
    const isRootSelected = (window.ultimaPastaSelecionada === null);

    container.innerHTML = `
        <div class="wiki-root-node ${isRootSelected ? 'selected' : ''}" onclick="window.selecionarRaizWiki(event)" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'root')">
            <div class="wiki-item-name" title="Raiz do Workspace">
                <span style="width: 22px; display: inline-block; text-align: center; font-size: 0.9rem;">☁️</span>
                <span class="wiki-item-text" style="font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #888;">Workspace</span>
            </div>
        </div>

        <div class="wiki-root-children wiki-dropzone" id="folder-root" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'root')">
            ${arvoreCompleta}
        </div>

        <div class="wiki-trash-zone wiki-dropzone" id="folder-trash" ondragover="window.dragOverWiki(event)" ondragleave="window.dragLeaveWiki(event)" ondrop="window.dropWiki(event, 'trash')" style="padding: ${paddingLixeira};">
            <div class="wiki-trash-title" onclick="window.toggleLixeiraWiki(event)" style="cursor: pointer; display: flex; align-items: center; gap: 6px; margin-bottom: ${margemTitulo}; transition: 0.2s;">
                <span class="folder-toggle-icon" style="margin-left: 0; color: #ff5252;">${setaLixeira}</span> 
                <span>🗑️ Lixeira</span>
            </div>
            
            <div style="display: ${displayLixeira};">
                <div style="font-size: 0.75rem; color: #888; margin-bottom: 10px;">Arraste pastas e arquivos para cá.</div>
                ${arvoreLixeira}
                ${btnEsvaziar}
            </div>
        </div>
    `;
};

// ==========================================
// 4. EVENTOS DE CLIQUES E CRIAÇÕES
// ==========================================
window.selecionarPastaWiki = (e, folderId) => {
    e.stopPropagation();
    window.ultimaPastaSelecionada = folderId;
    document.querySelectorAll('.wiki-folder-header, .wiki-root-node').forEach(el => el.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
};

window.selecionarRaizWiki = (e) => {
    if (e) e.stopPropagation();
    window.ultimaPastaSelecionada = null;
    document.querySelectorAll('.wiki-folder-header').forEach(el => el.classList.remove('selected'));
    const rootNode = document.querySelector('.wiki-root-node');
    if (rootNode) rootNode.classList.add('selected');
};

window.togglePastaWiki = (e, folderId) => {
    e.stopPropagation(); 
    if (window.wikiPastasFechadas.has(folderId)) window.wikiPastasFechadas.delete(folderId);
    else window.wikiPastasFechadas.add(folderId);
    window.renderizarWikiTree();
};

window.abrirWiki = (id) => {
    window.wikiAtualId = id;
    localStorage.setItem('heartkey_ultima_wiki_id', id);

    const d = window.wikiCache[id];
    if (!d) return;

    document.getElementById('wiki-titulo').value = d.titulo;
    document.getElementById('wiki-conteudo').value = d.conteudo;
    window.setWikiMode('preview');
    window.renderizarWikiTree();
    
    if (typeof window.limparNotificacaoItem === 'function') window.limparNotificacaoItem(id);
};

window.novaPaginaWiki = async () => {
    if (!window.projetoAtualId) return;
    const nomeDoc = prompt("Nome do novo documento:", "Novo Documento");
    if (!nomeDoc || nomeDoc.trim() === "") return; 
    
    try {
        const docRef = await addDoc(collection(db, "wiki"), {
            titulo: nomeDoc.trim(), conteudo: "", projetoId: window.projetoAtualId,
            pastaId: window.ultimaPastaSelecionada, ordem: Date.now(), dataCriacao: new Date().toISOString(),
            autorUltimaModificacao: auth.currentUser.email
        });
        
        window.wikiAtualId = docRef.id;
        localStorage.setItem('heartkey_ultima_wiki_id', docRef.id);
        
        const inputConteudo = document.getElementById('wiki-conteudo');
        if(inputConteudo) {
            inputConteudo.value = "";
            window.setWikiMode('edit');
            setTimeout(() => inputConteudo.focus(), 100); 
        }
    } catch(e) { console.error("Erro ao criar documento:", e); }
};

window.novaPastaWiki = async () => {
    const nome = prompt("Nome da nova pasta:");
    if (!nome || !window.projetoAtualId) return;
    try {
        await addDoc(collection(db, "wiki_pastas"), {
            nome: nome, projetoId: window.projetoAtualId,
            parentId: window.ultimaPastaSelecionada, ordem: Date.now(), dataCriacao: new Date().toISOString()
        });
    } catch(e) { console.error(e); }
};

window.renomearPastaWiki = async (e, folderId, nomeAtual) => {
    e.stopPropagation(); 
    const novoNome = prompt("Renomear pasta para:", nomeAtual);
    if (!novoNome || novoNome.trim() === "" || novoNome === nomeAtual) return;
    try { await updateDoc(doc(db, "wiki_pastas", folderId), { nome: novoNome.trim() }); } 
    catch(err) { console.error(err); }
};

window.renomearArquivoWikiDireto = async (e, id, nomeAtual) => {
    e.stopPropagation(); 
    const novoNome = prompt("Renomear documento para:", nomeAtual);
    if (novoNome && novoNome.trim() !== "" && novoNome !== nomeAtual) {
        try {
            await updateDoc(doc(db, "wiki", id), { titulo: novoNome.trim(), dataAtualizacao: new Date().toISOString() });
            if (window.wikiAtualId === id) {
                const tituloInput = document.getElementById('wiki-titulo');
                if(tituloInput) tituloInput.value = novoNome.trim();
            }
        } catch(err) { console.error(err); }
    }
};

window.deletarArquivoWikiDireto = async (e, id) => {
    e.stopPropagation(); 
    if (confirm("Mover este arquivo para a lixeira?")) {
        try {
            await updateDoc(doc(db, "wiki", id), { pastaId: 'trash', dataAtualizacao: new Date().toISOString() });
            if (window.wikiAtualId === id) window.fecharSessaoWiki();
        } catch(err) { console.error(err); }
    }
};

window.deletarPastaWiki = async (e, folderId) => {
    e.stopPropagation(); 
    if(confirm("Apagar esta pasta? Os arquivos e sub-pastas voltarão para a raiz.")) {
        const filesToMove = window.wikiPagesCache.filter(p => p.pastaId === folderId);
        for (let file of filesToMove) await updateDoc(doc(db, "wiki", file.id), { pastaId: null });
        
        const foldersToMove = window.wikiFoldersCache.filter(f => f.parentId === folderId);
        for (let folder of foldersToMove) await updateDoc(doc(db, "wiki_pastas", folder.id), { parentId: null });
        
        await deleteDoc(doc(db, "wiki_pastas", folderId));
    }
};

window.esvaziarLixeira = async () => {
    if(window.userRole !== 'admin') return alert("Apenas administradores podem esvaziar a lixeira!");
    if(!confirm("🔥 ATENÇÃO: Isso vai apagar PARA SEMPRE todos os arquivos e pastas da lixeira. Tem certeza absoluta?")) return;

    const btn = document.querySelector('button[onclick="window.esvaziarLixeira()"]');
    if(btn) btn.innerText = "Queimando... ⏳";

    const pastasNaLixeira = window.wikiFoldersCache.filter(f => f.parentId === 'trash');
    const arquivosNaLixeira = window.wikiPagesCache.filter(p => p.pastaId === 'trash');

    const exterminarConteudo = async (folderId) => {
        const subPastas = window.wikiFoldersCache.filter(f => f.parentId === folderId);
        for (let f of subPastas) {
            await exterminarConteudo(f.id);
            await deleteDoc(doc(db, "wiki_pastas", f.id));
        }
        const arquivos = window.wikiPagesCache.filter(p => p.pastaId === folderId);
        for (let a of arquivos) await deleteDoc(doc(db, "wiki", a.id));
    };

    try {
        for (let f of pastasNaLixeira) { await exterminarConteudo(f.id); await deleteDoc(doc(db, "wiki_pastas", f.id)); }
        for (let a of arquivosNaLixeira) { await deleteDoc(doc(db, "wiki", a.id)); }
    } catch(e) { console.error(e); }
};

window.fecharSessaoWiki = () => {
    window.wikiAtualId = null;
    localStorage.removeItem('heartkey_ultima_wiki_id');
    
    const titulo = document.getElementById('wiki-titulo');
    const conteudo = document.getElementById('wiki-conteudo');
    const preview = document.getElementById('wiki-preview-area');
    const toc = document.getElementById('wiki-toc');
    const metadata = document.getElementById('wiki-metadata');
    
    if (titulo) titulo.value = '';
    if (conteudo) conteudo.value = '';
    if (preview) preview.innerHTML = ''; 
    
    if (toc) toc.classList.remove('active');
    if (metadata) metadata.style.display = 'none';

    window.setWikiMode('edit');
    window.renderizarWikiTree();
};

window.handleWikiItemClick = (e, id, tipo, nomeAtual) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation(); 

        if (e.shiftKey && window.ultimoClicadoId) {
            const nodes = Array.from(document.querySelectorAll('.wiki-node-item'));
            const startIndex = nodes.findIndex(n => n.getAttribute('data-node-id') === window.ultimoClicadoId);
            const endIndex = nodes.findIndex(n => n.getAttribute('data-node-id') === id);

            if (startIndex !== -1 && endIndex !== -1) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);
                for (let i = start; i <= end; i++) {
                    const nId = nodes[i].getAttribute('data-node-id');
                    const nType = nodes[i].getAttribute('data-node-type');
                    if (!window.itensSelecionadosWiki.find(item => item.id === nId)) {
                        window.itensSelecionadosWiki.push({ id: nId, type: nType });
                    }
                }
                window.renderizarWikiTree();
                return;
            }
        }

        const index = window.itensSelecionadosWiki.findIndex(i => i.id === id);
        if (index > -1) window.itensSelecionadosWiki.splice(index, 1);
        else window.itensSelecionadosWiki.push({ id: id, type: tipo });

        window.ultimoClicadoId = id; 
        window.renderizarWikiTree();
        return;
    }

    if (e.detail === 1) {
        window.itensSelecionadosWiki = [{ id: id, type: tipo }];
        window.ultimoClicadoId = id; 
        if (tipo === 'folder') window.selecionarPastaWiki(e, id);
        else window.abrirWiki(id);
        window.renderizarWikiTree();
    } 
    else if (e.detail === 3) {
        e.stopPropagation();
        if (tipo === 'folder') window.renomearPastaWiki(e, id, nomeAtual);
        else window.renomearArquivoWikiDireto(e, id, nomeAtual);
    }
};

window.toggleLixeiraWiki = (e) => {
    if (e) e.stopPropagation();
    window.lixeiraAberta = !window.lixeiraAberta;
    window.renderizarWikiTree(); 
};

// ==========================================
// 5. DRAG AND DROP MÁGICO
// ==========================================
window.dragStartWiki = (e, itemId, type) => { 
    e.stopPropagation();
    if (!window.itensSelecionadosWiki.find(i => i.id === itemId)) {
        window.itensSelecionadosWiki = [{ id: itemId, type: type }];
        window.renderizarWikiTree();
    }
    e.dataTransfer.setData("items", JSON.stringify(window.itensSelecionadosWiki)); 
};

window.dragOverWiki = (e) => { 
    e.preventDefault(); e.stopPropagation(); 
    const target = e.currentTarget;
    target.classList.remove('wiki-drop-above', 'wiki-drop-below', 'wiki-drop-inside');

    if (window.wikiSortMode !== 'manual') {
        if (target.getAttribute('data-node-type') === 'folder' || target.id === 'folder-root' || target.id === 'folder-trash') {
            target.classList.add('wiki-drop-inside');
        }
        return;
    }

    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (target.id === 'folder-root' || target.id === 'folder-trash') {
        target.classList.add('wiki-drop-inside');
        return;
    }

    const type = target.getAttribute('data-node-type');
    
    if (y < height * 0.25) target.classList.add('wiki-drop-above');
    else if (y > height * 0.75) target.classList.add('wiki-drop-below');
    else {
        if (type === 'folder') target.classList.add('wiki-drop-inside');
        else target.classList.add('wiki-drop-below');
    }
};

window.dragLeaveWiki = (e) => { 
    e.stopPropagation(); 
    e.currentTarget.classList.remove('wiki-drop-above', 'wiki-drop-below', 'wiki-drop-inside'); 
};

window.dropWiki = async (e, targetId) => {
    e.preventDefault(); e.stopPropagation(); 
    const targetEl = e.currentTarget;
    
    let dropAction = 'inside';
    if (targetEl.classList.contains('wiki-drop-above')) dropAction = 'above';
    else if (targetEl.classList.contains('wiki-drop-below')) dropAction = 'below';
    
    targetEl.classList.remove('wiki-drop-above', 'wiki-drop-below', 'wiki-drop-inside');
    
    const pacote = e.dataTransfer.getData("items");
    if (!pacote) return;
    const itensArrastados = JSON.parse(pacote);

    try {
        for (let item of itensArrastados) {
            let collectionName = item.type === 'folder' ? 'wiki_pastas' : 'wiki';
            let parentField = item.type === 'folder' ? 'parentId' : 'pastaId';
            
            let novoParentId = targetId === 'root' ? null : targetId;
            let novaOrdem = Date.now(); 

            if (dropAction !== 'inside' && targetId !== 'root' && targetId !== 'trash') {
                const cacheAlvo = item.type === 'folder' ? window.wikiFoldersCache : window.wikiPagesCache;
                const dadosAlvo = cacheAlvo.find(i => i.id === targetId);
                
                if (dadosAlvo) {
                    novoParentId = item.type === 'folder' ? dadosAlvo.parentId : dadosAlvo.pastaId;
                    if (dropAction === 'above') novaOrdem = (dadosAlvo.ordem || Date.now()) - 0.5;
                    else novaOrdem = (dadosAlvo.ordem || Date.now()) + 0.5;
                }
            }

            if (item.type === 'folder') {
                if (item.id === novoParentId) continue;
                let checkId = novoParentId;
                let isDescendant = false;
                while (checkId != null && checkId !== 'trash') {
                    if (checkId === item.id) { isDescendant = true; break; }
                    const parent = window.wikiFoldersCache.find(f => f.id === checkId);
                    checkId = parent ? parent.parentId : null;
                }
                if (isDescendant) continue;
            }

            await updateDoc(doc(db, collectionName, item.id), { [parentField]: novoParentId, ordem: novaOrdem });
        }
        window.itensSelecionadosWiki = [];
    } catch(err) { console.error(err); }
};

// ==========================================
// 6. SISTEMA DE FAVORITOS (DASHBOARD)
// ==========================================
window.meusFavoritosWiki = [];

setTimeout(() => {
    if(auth.currentUser) {
        onSnapshot(doc(db, "usuarios", auth.currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                window.meusFavoritosWiki = docSnap.data().favoritosWiki || [];
                if (window.renderizarWikiTree) window.renderizarWikiTree(); 
                window.renderizarFavoritosDashboard(); 
            }
        });
    }
}, 2000);

window.toggleFavoritoWiki = async (e, id) => {
    e.stopPropagation(); 
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    let favs = [...window.meusFavoritosWiki]; 
    if (favs.includes(id)) favs = favs.filter(f => f !== id); 
    else favs.push(id); 

    window.meusFavoritosWiki = favs;
    window.renderizarWikiTree(); 
    window.renderizarFavoritosDashboard(); 
    await updateDoc(userRef, { favoritosWiki: favs });
};

window.renderizarFavoritosDashboard = async () => {
    const pContainer = document.getElementById('dash-priorities'); 
    if (!pContainer) return;

    let block = document.getElementById('bloco-favoritos-dash');
    if (!block) {
        block = document.createElement('div');
        block.id = 'bloco-favoritos-dash';
        block.style.marginTop = '25px';
        pContainer.parentNode.appendChild(block); 
    }

    if (!window.meusFavoritosWiki || window.meusFavoritosWiki.length === 0) {
        block.innerHTML = ''; return;
    }

    let arquivosFavs = [];
    try {
        const promessas = window.meusFavoritosWiki.map(id => getDoc(doc(db, "wiki", id)));
        const snaps = await Promise.all(promessas);
        snaps.forEach(snap => { if(snap.exists()) arquivosFavs.push({ id: snap.id, ...snap.data() }); });
    } catch(e) { console.error(e); }

    if(arquivosFavs.length > 0) {
        block.innerHTML = `
            <h3 style="font-size: 1rem; color: #fff; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">⭐ Documentos Favoritos</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                ${arquivosFavs.map(f => `
                    <div onclick="window.abrirWikiPeloAtalho('${f.id}', '${f.projetoId}')"
                         style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; border: 1px solid rgba(255,255,255,0.02);"
                         onmouseover="this.style.background='rgba(255, 235, 59, 0.1)'; this.style.borderColor='rgba(255, 235, 59, 0.3)'" 
                         onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.02)'">
                        <span style="font-size: 1.2rem;">📄</span> 
                        <strong style="font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${f.titulo}">${f.titulo}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    } else { block.innerHTML = ''; }
};

window.abrirWikiPeloAtalho = async (wikiId, projetoId) => {
    window.irParaAba('projetos');
    localStorage.setItem('heartkey_ultima_wiki_id', wikiId);
    window.wikiAtualId = null; 
    try {
        const projSnap = await getDoc(doc(db, "projetos", projetoId));
        if (projSnap.exists()) {
            const p = projSnap.data();
            await window.abrirProjeto(projSnap.id, p.nome, p.githubRepo, p.capaBase64, p.versaoAlvo);
            const btnWiki = document.querySelector('button[onclick*="tab-wiki"]');
            if (btnWiki) window.switchProjectTab('tab-wiki', btnWiki);
        }
    } catch(e) { console.error(e); }
};

// ==========================================
// 7. FEEDBACK E COMENTÁRIOS NO DOCUMENTO
// ==========================================
window.abrirFeedbackWiki = () => {
    if (!window.wikiAtualId) return window.mostrarToastNotificacao('Aviso', 'Abra ou crie um documento primeiro.', 'geral');
    
    const selecao = window.getSelection().toString().trim();
    const inputBox = document.getElementById('wiki-comment-input');
    
    if (selecao) inputBox.value = `> "${selecao}"\n\n`;
    else inputBox.value = ""; 
    
    const docData = window.wikiCache[window.wikiAtualId];
    document.getElementById('wiki-feedback-titulo').innerText = docData ? docData.titulo : "Documento";
    
    window.carregarComentariosWiki(window.wikiAtualId);
    window.openModal('modalFeedbackWiki');
    setTimeout(() => inputBox.focus(), 100);
    
    if(typeof window.limparNotificacaoItem === 'function') window.limparNotificacaoItem(window.wikiAtualId + '_note');
};

window.carregarComentariosWiki = (wikiId) => {
    const lista = document.getElementById('lista-comentarios-wiki');
    const q = query(collection(db, "comentarios_wiki"), where("wikiId", "==", wikiId), orderBy("dataCriacao", "asc"));
    
    onSnapshot(q, (snap) => {
        let abertosHtml = ''; let resolvidosHtml = ''; let countResolvidos = 0;

        snap.docs.forEach(d => {
            const c = d.data();
            const isMe = c.autorEmail === auth.currentUser.email;
            const isAdmin = window.userRole === 'admin';
            const isResolved = c.status === 'resolved';

            let menuHtml = '';
            if (isMe || isAdmin) {
                const btnResolve = !isResolved ? `<button onclick="window.resolverComentarioWiki('${d.id}')" style="color: #4caf50; font-weight: bold;">✅ Resolver Nota</button>` : '';
                const btnDelete = isAdmin ? `<button class="del" onclick="window.deletarComentarioWiki('${d.id}')" style="border-top: 1px solid rgba(255,255,255,0.1);">🗑️ Apagar</button>` : '';

                menuHtml = `<div class="comment-menu-container"><button class="comment-menu-trigger" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋮</button><div class="dropdown-content">${btnResolve}${btnDelete}</div></div>`;
            }
            
            const corBorda = isResolved ? '#4caf50' : (isMe ? 'var(--primary)' : '#ffc107');
            const opacidade = isResolved ? '0.6' : '1';
            let conteudoVisual = "";

            if (c.tipo === 'sugestao') {
                // Renderiza o markdown e remove os <p> malditos que empurram o layout
                let renderNovo = marked.parse((c.textoNovo || "").replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>'));
                renderNovo = renderNovo.replace(/^<p>/, '').replace(/<\/p>\n?$/, '');
                
                conteudoVisual = `
                    <div style="background: rgba(0,0,0,0.2); border-left: 3px solid #00eaff; border-radius: 4px; padding: 8px; margin: 4px 0; font-size: 0.8rem; line-height: 1.4;">
                        <div style="color: #ff5252; margin-bottom: 4px;">
                            <span style="font-weight: 800; font-size: 0.7rem; opacity: 0.7;">- REMOVER:</span> 
                            <span style="text-decoration: line-through;">${c.textoAntigo}</span>
                        </div>
                        <div style="color: #00eaff;">
                            <span style="font-weight: 800; font-size: 0.7rem; opacity: 0.7;">+ ADICIONAR:</span> 
                            <span>${renderNovo}</span>
                        </div>
                    </div>`;
                    
                if (!isResolved) {
                    conteudoVisual += `<button onclick="window.aceitarSugestaoWiki('${d.id}')" style="width: 100%; padding: 5px; font-size: 0.75rem; font-weight: bold; background: rgba(0, 234, 255, 0.1); color: #00eaff; border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 4px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#00eaff'; this.style.color='#000'" onmouseout="this.style.background='rgba(0, 234, 255, 0.1)'; this.style.color='#00eaff'">✨ Aplicar Alteração</button>`;
                }
            } else {
                conteudoVisual = marked.parse((c.texto || "").replace(/@([a-zA-Z0-9_À-ÿ]+)/g, '<span class="chat-mention">@$1</span>'));
            }

            // O PULO DO GATO: As tags 'min-height: 0 !important' e 'height: auto !important' matam qualquer herança gigante do CSS
            const itemHtml = `<li class="art-comment-item ${isMe ? 'is-me' : ''}" style="border-left-color: ${corBorda}; margin-bottom: 5px; opacity: ${opacidade}; transition: 0.3s; min-height: 0 !important; height: auto !important; flex: none !important; display: block;">${menuHtml}<div class="comment-top-row"><span class="comment-author">${c.autor}</span><span class="comment-time">${new Date(c.dataCriacao).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div><div class="comment-text markdown-body" style="background:transparent!important; padding:0!important; border:none!important; box-shadow:none!important; min-height: 0 !important; height: auto !important;">${conteudoVisual}</div></li>`;

            if (isResolved) { resolvidosHtml += itemHtml; countResolvidos++; } 
            else abertosHtml += itemHtml;
        });
        
        let finalHtml = abertosHtml;
        if (countResolvidos > 0) {
            finalHtml += `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);"><button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'" style="background: transparent; border: none; color: #888; font-size: 0.8rem; cursor: pointer; width: 100%; text-align: left;">▶ Mostrar ${countResolvidos} resolvidas</button><ul style="display: none; list-style: none; padding: 0; flex-direction: column; gap: 5px; margin-top: 10px;">${resolvidosHtml}</ul></div>`;
        }
        lista.innerHTML = finalHtml || '<li style="color:#666; text-align:center; padding:15px;">Documento limpo!</li>';

        const preview = document.getElementById('wiki-preview-area');
        if (preview && preview.dataset.originalHtml && preview.style.display !== 'none') {
            let htmlPintado = preview.dataset.originalHtml;
            
            snap.docs.forEach(d => {
                const c = d.data();
                if (c.status !== 'resolved') {
                    
                    // Pega o alvo SEMPRE pela citação para garantir precisão máxima
                    let alvo = "";
                    const match = (c.texto || "").match(/^>\s*"([^"]+)"/);
                    if (match) alvo = match[1];
                    else alvo = c.textoAntigo; 

                    if (alvo && alvo.trim().length > 2) {
                        // MÁGICA: Escapa os caracteres e permite que o marcador ignore espaços extras ou tags HTML (como negrito) no meio da frase!
                        const regexSafe = alvo.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s*(?:<[^>]+>)*\\s*');
                        
                        try {
                            const regex = new RegExp(`(${regexSafe})`, 'gi'); // 'gi' faz ele ignorar maiúsculas/minúsculas
                            htmlPintado = htmlPintado.replace(regex, `<span class="wiki-highlight" onclick="window.abrirFeedbackWiki()" title="Nota/Sugestão de ${c.autor}">$1</span>`);
                        } catch(e) {}
                    }
                }
            });
            preview.innerHTML = htmlPintado;

            // Pede ao Mermaid para redesenhar os gráficos após a pintura
            setTimeout(() => {
                if (typeof window.desenharGraficosMermaid === 'function') {
                    window.desenharGraficosMermaid(preview);
                }
            }, 100);
        }
    });
};

window.aceitarSugestaoWiki = async (id) => {
    window.preventWikiScroll = true; 
    try {
        const comSnap = await getDoc(doc(db, "comentarios_wiki", id));
        if (!comSnap.exists()) return;
        const c = comSnap.data();

        const wikiRef = doc(db, "wiki", c.wikiId);
        const wikiSnap = await getDoc(wikiRef);
        if (!wikiSnap.exists()) return;
        const w = wikiSnap.data();

        if (w.conteudo.includes(c.textoAntigo)) {
            const novoConteudo = w.conteudo.replace(c.textoAntigo, c.textoNovo);
            await updateDoc(wikiRef, { conteudo: novoConteudo, dataAtualizacao: new Date().toISOString() });
            await updateDoc(doc(db, "comentarios_wiki", id), { status: 'resolved', dataResolucao: new Date().toISOString(), resolvidoPor: window.obterNomeExibicao() });

            if (window.wikiAtualId === c.wikiId) {
                document.getElementById('wiki-conteudo').value = novoConteudo;
                window.setWikiMode('preview'); 
            }
            if(window.mostrarToastNotificacao) window.mostrarToastNotificacao('Mágica Feita!', 'O texto foi substituído e a nota foi resolvida.', 'geral');
        } else {
            alert("⚠️ Não foi possível encontrar o texto original no documento.");
        }
    } catch (e) { console.error(e); }
};

window.resolverComentarioWiki = async (id) => {
    try { await updateDoc(doc(db, "comentarios_wiki", id), { status: 'resolved', dataResolucao: new Date().toISOString(), resolvidoPor: window.obterNomeExibicao() }); } 
    catch(e) { console.error(e); }
};

window.deletarComentarioWiki = async (id) => { if (confirm("Apagar esta nota?")) await deleteDoc(doc(db, "comentarios_wiki", id)); };

window.salvarComentarioWiki = async (e, tipo = 'nota') => {
    if(e) e.preventDefault();
    if (!window.wikiAtualId || !auth.currentUser) return;

    const input = document.getElementById('wiki-comment-input');
    const textoRaw = input.value.trim();
    if (!textoRaw) return;

    let textoAntigo = ""; let textoNovo = textoRaw;

    if (tipo === 'sugestao') {
        const match = textoRaw.match(/^>\s*"([^"]+)"/);
        if (match) {
            textoAntigo = match[1];
            textoNovo = textoRaw.replace(/^>\s*"[^"]+"\s*/, '').trim(); 
            if(!textoNovo) return alert("Digite o texto novo abaixo da citação para sugerir a troca!");
        } else return alert("Selecione (grife) o texto no documento primeiro!");
    }

    try {
        await addDoc(collection(db, "comentarios_wiki"), {
            wikiId: window.wikiAtualId, texto: textoRaw, textoAntigo, textoNovo, tipo,
            autor: window.obterNomeExibicao(), autorEmail: auth.currentUser.email,
            status: 'open', dataCriacao: new Date().toISOString()
        });

        // Radar de Menções
        const mencoes = textoRaw.match(/@([a-zA-Z0-9_À-ÿ]+)/g);
        let notificados = new Set();

        if (mencoes && mencoes.length > 0) {
            if (!window.todosUsuariosCache) {
                const snapUsers = await getDocs(collection(db, "usuarios"));
                window.todosUsuariosCache = snapUsers.docs.map(d => ({ uid: d.data().uid, nome: d.data().nome || "", apelido: d.data().apelido || "", email: d.data().email }));
            }
            mencoes.forEach(mencao => {
                const nomeMencao = mencao.replace('@', '').toLowerCase();
                const alvo = window.todosUsuariosCache.find(u => (u.apelido.toLowerCase() === nomeMencao) || (u.nome.split(' ')[0].toLowerCase() === nomeMencao));
                if (alvo && alvo.email !== auth.currentUser.email && !notificados.has(alvo.uid)) {
                    if(typeof window.criarNotificacao === 'function') window.criarNotificacao(alvo.uid, 'geral', 'Você foi mencionado!', `${window.obterNomeExibicao()} te marcou em um documento.`, { abaAlvo: 'projetos', subAba: 'tab-wiki', projetoId: window.projetoAtualId, contextId: window.wikiAtualId + '_note' });
                    notificados.add(alvo.uid); 
                }
            });
        }
        input.value = ""; document.getElementById('mention-suggestions').style.display = 'none';
    } catch(err) { console.error(err); }
};

window.listaUsuariosEquipe = []; 

setTimeout(() => { 
    const textarea = document.getElementById('wiki-comment-input');
    if (!textarea) return;

    textarea.addEventListener('input', async (e) => {
        const sugestoesBox = document.getElementById('mention-suggestions');
        if (!sugestoesBox) return;

        const cursor = textarea.selectionStart;
        const textToCursor = textarea.value.substring(0, cursor);
        const palavras = textToCursor.split(/[\s\n]/);
        const ultimaPalavra = palavras[palavras.length - 1];

        if (ultimaPalavra.startsWith('@')) {
            if (window.listaUsuariosEquipe.length === 0) {
                const snap = await getDocs(collection(db, "usuarios"));
                window.listaUsuariosEquipe = snap.docs.map(d => ({ apelido: d.data().apelido || d.data().nome.split(' ')[0], nomeFull: d.data().nome }));
            }
            const termo = ultimaPalavra.substring(1).toLowerCase(); 
            const matches = window.listaUsuariosEquipe.filter(u => u.apelido.toLowerCase().includes(termo) || u.nomeFull.toLowerCase().includes(termo));

            if (matches.length > 0) {
                sugestoesBox.innerHTML = matches.map(u => `<li onmousedown="window.inserirMencao('${u.apelido}', ${cursor}, '${ultimaPalavra}')" style="padding: 10px 15px; cursor: pointer; color: #fff; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='var(--primary)'; this.style.color='#000';" onmouseout="this.style.background='transparent'; this.style.color='#fff';"><strong style="font-size: 0.95rem;">@${u.apelido}</strong> <br><span style="font-size: 0.65rem; opacity: 0.7;">${u.nomeFull}</span></li>`).join('');
                sugestoesBox.style.display = 'block';
            } else { sugestoesBox.style.display = 'none'; }
        } else { sugestoesBox.style.display = 'none'; }
    });
}, 1000);

window.inserirMencao = (apelido, cursorPosition, palavraDigitada) => {
    const textarea = document.getElementById('wiki-comment-input');
    const textoInteiro = textarea.value;
    const inicioPalavra = cursorPosition - palavraDigitada.length;
    const textoAntes = textoInteiro.substring(0, inicioPalavra);
    const textoDepois = textoInteiro.substring(cursorPosition);
    textarea.value = textoAntes + '@' + apelido + ' ' + textoDepois;
    document.getElementById('mention-suggestions').style.display = 'none';
    textarea.focus();
};

window.acionarComentarioFantasma = () => {
    const floatingBtn = document.getElementById('floating-comment-btn');
    const inputBox = document.getElementById('wiki-comment-input');
    if (!window.wikiAtualId) return;
    if (window.textoFantasma) inputBox.value = `> "${window.textoFantasma}"\n\n`;
    window.carregarComentariosWiki(window.wikiAtualId);
    window.openModal('modalFeedbackWiki');
    window.getSelection().removeAllRanges();
    if(floatingBtn) floatingBtn.style.display = 'none';
    setTimeout(() => inputBox.focus(), 100);
};

document.addEventListener('mouseup', () => {
    const previewArea = document.getElementById('wiki-preview-area');
    const floatingBtn = document.getElementById('floating-comment-btn');
    if (!previewArea || !floatingBtn || previewArea.style.display === 'none') {
        if(floatingBtn) floatingBtn.style.display = 'none'; return;
    }
    const selecao = window.getSelection();
    const texto = selecao.toString().trim();
    if (texto.length > 0 && previewArea.contains(selecao.anchorNode)) {
        const range = selecao.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        floatingBtn.style.display = 'flex';
        floatingBtn.style.top = `${rect.top - 45}px`; 
        floatingBtn.style.left = `${rect.left + (rect.width / 2) - 25}px`;
        window.textoFantasma = texto;
    } else {
        floatingBtn.style.display = 'none';
        window.textoFantasma = "";
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (window.wikiAtualId) {
            e.preventDefault(); 
            clearTimeout(window.wikiTimeout); 
            window.salvarPaginaWiki(true); 
            if(typeof window.mostrarToastNotificacao === 'function') window.mostrarToastNotificacao('Wiki', 'Documento salvo manualmente!', 'geral');
            return; 
        }
    }
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'F2') {
        e.preventDefault(); 
        if (window.ultimaPastaSelecionada && window.ultimaPastaSelecionada !== 'root') {
            const pasta = window.wikiFoldersCache.find(p => p.id === window.ultimaPastaSelecionada);
            if (pasta) window.renomearPastaWiki(e, pasta.id, pasta.nome);
        } else if (window.wikiAtualId) {
            const arquivo = window.wikiPagesCache.find(p => p.id === window.wikiAtualId);
            if (arquivo) window.renomearArquivoWikiDireto(e, arquivo.id, arquivo.titulo);
        }
    }
});