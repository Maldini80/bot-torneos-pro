const CACHE_NAME = "vpg-fantasy-cache-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/pages-shared.css",
  "/style.css",
  "/profile-modals.css",
  "/private_pages/fantasy.css",
  "/private_pages/fantasy.js",
  "/client.js",
  "/dashboard.js",
  "/home-news.js",
  "/logo-the-blitz.png",
  "/form-bg.png",
  "/hero-bg.png"
];

// Instalar el Service Worker y precachear los recursos estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Precaching app shell assets");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Fuerza al Service Worker a tomar el control inmediatamente
  self.skipWaiting();
});

// Activar el Service Worker y limpiar cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Asegura que los clientes se controlen inmediatamente tras la activación
  self.clients.claim();
});

// Estrategia de Fetch: Network-First con fallback a Caché
// Esto garantiza que siempre cargue la información en tiempo real del servidor de Render,
// pero si el servidor no responde o el móvil no tiene internet, muestra la última versión guardada.
self.addEventListener("fetch", (event) => {
  // Solo interceptamos peticiones GET (las APIs POST de pujas y fichajes no se cachean)
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Evitamos cachear peticiones externas como llamadas a Discord OAuth o APIs de terceros
  if (!url.origin.includes(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si la respuesta de red es válida, la clonamos y guardamos en caché
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si falla la red (offline), cargamos desde la caché local del móvil
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en caché y falla la red, podemos mostrar una respuesta básica o vacía
          if (event.request.headers.get("accept").includes("text/html")) {
            return caches.match("/");
          }
        });
      })
  );
});
