import { auth, provider, db, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';

// 1. Primeiro carregamos os utilitários e motores básicos
import './utils.js';
import './notifications.js';
import './pomodoro.js';
import './audio.js';

// 2. Depois carregamos as funcionalidades das abas
import './dashboard.js';
import './projects.js';
import './brainstorm.js';
import './management.js';
import './mural.js';
import './qa.js';
import './war-room.js';
import './wiki.js';
import './arts.js';

// 3. Por ÚLTIMO, carregamos a autenticação (que vai chamar as funções acima)
import './auth.js';

// ==========================================
// 1. INICIALIZAÇÃO DO SISTEMA
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('PWA: Service Worker registrado com sucesso!'))
            .catch(err => console.error('PWA: Falha ao registrar Service Worker', err));
    });
}

// Inicializa o motor do diagrama
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// ==========================================
// 2. NAVEGAÇÃO E INTERFACE PRINCIPAL
// ==========================================
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
        const target = btn.getAttribute('data-target');
        
        // Limpeza Segura (Rotinas Restauradas)
        if (target !== 'wiki' && typeof window.fecharSessaoWiki === 'function') window.fecharSessaoWiki();
        if (typeof window.marcarNotificacoesComoLidas === 'function') window.marcarNotificacoesComoLidas(target);

        if (typeof window.irParaAba === 'function') {
            window.irParaAba(target);
        }

        // Esconde menu no mobile ao clicar
        if (window.innerWidth <= 768) {
            document.getElementById('main-sidebar')?.classList.remove('active');
            document.getElementById('mobile-sidebar-backdrop')?.classList.remove('active');
        }
    };
});

// Eventos de Sidebar, Modais e Mobile
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop');
const mobileContactsBtn = document.getElementById('mobile-contacts-btn');
const mobileContactsBackdrop = document.getElementById('mobile-contacts-backdrop');

if (mobileMenuBtn) mobileMenuBtn.onclick = () => {
    document.getElementById('main-sidebar')?.classList.toggle('active');
    mobileSidebarBackdrop?.classList.toggle('active');
};
if (mobileSidebarBackdrop) mobileSidebarBackdrop.onclick = () => {
    document.getElementById('main-sidebar')?.classList.remove('active');
    mobileSidebarBackdrop.classList.remove('active');
};
if (mobileContactsBtn) mobileContactsBtn.onclick = () => {
    document.getElementById('sidebar-integrantes')?.classList.toggle('active');
    mobileContactsBackdrop?.classList.toggle('active');
};
if (mobileContactsBackdrop) mobileContactsBackdrop.onclick = () => {
    document.getElementById('sidebar-integrantes')?.classList.remove('active');
    mobileContactsBackdrop.classList.remove('active');
};

const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => document.getElementById('main-sidebar').classList.toggle('collapsed'));
}

// Fechamento Universal de Modais (Clique Fora)
document.addEventListener('click', (e) => { 
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); 
});

// Fechamento Universal de Modais (Escape Keyboard)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
});