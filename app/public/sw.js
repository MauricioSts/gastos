// Service worker do Minimau.
//
// Existe por um motivo so: abrir rapido no celular. Sem ele, cada abertura do
// app baixa de novo o HTML, o bundle, o CSS e as fontes -- em rede movel isso e
// a diferenca entre a tela aparecer na hora e aparecer depois de segundos.
//
// Politica por tipo de arquivo, e nao uma regra unica:
//
//   /assets/*        cache primeiro, para sempre. O nome tem hash do conteudo,
//                    entao arquivo novo tem URL nova -- nunca serve versao
//                    velha por engano.
//   fontes, icones   cache primeiro. Nao mudam.
//   HTML (navegacao) rede primeiro com cache de reserva. O HTML aponta para os
//                    assets com hash, entao ele e a unica coisa que PRECISA
//                    chegar atualizada; sem rede, serve a ultima copia.
//   /api/*           nunca passa por aqui. Dinheiro nao se serve de cache: o
//                    saldo velho seria mostrado como se fosse o de agora.
//                    Quem guarda o ultimo retrato e o snapshot no localStorage,
//                    que a tela marca como "dado de antes".
const VERSAO = 'minimau-v1';
const CASCA = `${VERSAO}-casca`;

// O minimo para a tela abrir offline. Os assets com hash entram sozinhos no
// cache conforme sao pedidos: listar nomes com hash aqui exigiria gerar este
// arquivo no build.
const ESSENCIAIS = [
  '/',
  '/manifest.webmanifest',
  '/fontes/chakra-700-latin.woff2',
  '/fontes/plexmono-400-latin.woff2',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CASCA)
      // addAll falha inteiro se um arquivo falhar; um a um deixa o SW instalar
      // mesmo que a rede esteja ruim no momento.
      .then((cache) => Promise.all(ESSENCIAIS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n !== CASCA).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

const ehImutavel = (url) => url.pathname.startsWith('/assets/')
  || url.pathname.startsWith('/fontes/')
  || url.pathname.startsWith('/icones/')
  || url.pathname.startsWith('/splash/');

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Outro dominio (a API, por exemplo): o SW nao se mete.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (ehImutavel(url)) {
    evento.respondWith(
      caches.match(req).then((emCache) => emCache || fetch(req).then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CASCA).then((cache) => cache.put(req, copia));
        }
        return resposta;
      })),
    );
    return;
  }

  // Navegacao e o resto: rede primeiro, cache como rede de seguranca.
  if (req.mode === 'navigate' || req.destination === 'document') {
    evento.respondWith(
      fetch(req)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CASCA).then((cache) => cache.put('/', copia));
          return resposta;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req))),
    );
  }
});
