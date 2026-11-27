/* Service worker sederhana: app shell cache-first, audio murottal cache saat dipakai. */
const SHELL = 'tahfidz-shell-v1';
const AUDIO = 'tahfidz-audio-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== AUDIO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // audio ayat (murottal CDN atau rekaman lokal): cache setelah diputar sekali.
  // Hanya host yang dikenal yang boleh masuk cache, dan jumlahnya dibatasi agar
  // penyimpanan peranti tidak dipenuhi oleh tanggapan tak terduga.
  const isAudio = url.pathname.endsWith('.mp3');
  const hostAudioDikenal = url.origin === self.location.origin || url.hostname === 'everyayah.com';
  if (isAudio) {
    event.respondWith(
      caches.open(AUDIO).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          const bolehSimpan = hostAudioDikenal && (res.ok || (res.type === 'opaque' && url.hostname === 'everyayah.com'));
          if (bolehSimpan) {
            cache.put(request, res.clone());
            const kunci = await cache.keys();
            if (kunci.length > 400) await cache.delete(kunci[0]); // buang yang terlama
          }
          return res;
        } catch {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // navigasi: jaringan dulu, jatuh ke shell saat offline
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html').then((r) => r ?? Response.error())));
    return;
  }

  // aset lain (JS/CSS/font/JSON): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok && res.type === 'basic') cache.put(request, res.clone());
          return res;
        } catch {
          return hit ?? new Response('', { status: 504 });
        }
      })
    );
  }
});
