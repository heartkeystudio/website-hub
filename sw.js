const CACHE_NAME = 'heartkey-hub-v1';

// O navegador instala o motor de fundo
self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log("Service Worker do Hub Instalado!");
});

// Ativa e limpa caches velhos
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Intercepta as requisições (Necessário para o PWA ser validado)
self.addEventListener('fetch', (event) => {
    // Por enquanto, apenas deixa a internet fluir normalmente
    event.respondWith(fetch(event.request));
});