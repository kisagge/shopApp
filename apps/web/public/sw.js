/*
 * 서비스워커 — 하는 일은 하나다.
 *
 * **아무것도 캐시하지 않는다.** 화면과 API 를 캐시하면 배포한 뒤에도 옛
 * 화면이 남고, 그걸 알아채는 데 오래 걸린다. 상품 가격이나 재고가 묵은
 * 채로 보이는 것은 쇼핑몰에서 특히 나쁘다. 캐싱은 이미 서버 쪽에서 한다.
 *
 * 여기서 하는 일은 **연결이 끊겼을 때 브라우저 오류 화면 대신 우리 화면을
 * 보여 주는 것**뿐이다. 네이티브 셸이 하는 일과 같다.
 */
const CACHE = 'plain-offline-v1';
const OFFLINE_PATH = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_PATH)));
  // 기다리지 않고 바로 새 워커로 넘어간다. 담아 둔 것이 없으니 위험하지 않다.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /*
   * 화면 이동만 가로챈다.
   *
   * 이미지·API 까지 가로채면 오프라인일 때 깨진 그림과 실패한 요청이
   * 그대로 남는데, 그건 브라우저가 이미 하는 일이다. 여기서 더할 것이 없다.
   */
  if (request.mode !== 'navigate') return;

  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PATH)));
});
