const CACHE_NAME = 'heartkey-hub-v1';

// O navegador instala o motor de fundo
self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log("PWA: Service Worker Instalado!");
});

// Ativa e limpa caches velhos
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Intercepta as requisições (Com Blindagem para o Firebase)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // MÁGICA: Se a requisição for para o banco de dados do Google/Firebase, o Service Worker cruza os braços e deixa passar direto!
    if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase')) {
        return; // Retorna vazio faz a requisição seguir o fluxo natural do navegador
    }

    // Para o resto do site (HTML, CSS, Imagens), ele intercepta normalmente
    event.respondWith(fetch(event.request));
});