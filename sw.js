/* 离线缓存：首次打开后即可断网使用 */
var CACHE = 'examapp-v9';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/store.js',
  './js/parser.js',
  './js/quiz.js',
  './js/app.js',
  './vendor/xlsx.full.min.js',
  './vendor/fflate.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 应用外壳/脚本走「网络优先」：保证打开就拿到最新版本，离线时回退缓存；
   体积大的第三方库走「缓存优先」并后台更新 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  var url = new URL(req.url);
  var isCode = req.mode === 'navigate' || /\.(html|js|css|json|webmanifest)$/.test(url.pathname) ||
    url.pathname === './' || url.pathname.slice(-1) === '/';

  if (isCode) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.status === 200) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () { });
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
