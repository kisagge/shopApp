/**
 * 이름을 바꾸는 순간 **여러 렌더가 이미 떠 있게** 해 두고 잰다.
 *
 * 가설: 무효화 직전에 시작된 렌더가 무효화 뒤에 끝나면서, 옛 값을 새 값인
 * 척 캐시에 다시 써 넣는다. 그러면 그 뒤 요청은 옛 주소를 그대로 연다.
 * 한가한 서버에서는 창이 너무 좁아 안 잡혔다 — 부하로 창을 넓힌다.
 */
import { readFileSync } from 'node:fs';

const B = 'http://localhost:3110';
const ORIGINAL = 'suede-trucker-blouson';
const RENAMED = 'suede-trucker-blouson-e2e';
const NOISE = Number(process.env.NOISE ?? 40);
const ROUNDS = Number(process.env.ROUNDS ?? 25);

const state = JSON.parse(readFileSync('test-results/.auth/admin.json', 'utf8'));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const H = { cookie, 'content-type': 'application/json' };

const found = await (await fetch(`${B}/api/admin/products/search?q=${encodeURIComponent('트러커')}`, { headers: H })).json();
const target = found.products?.find((p) => p.slug === ORIGINAL) ?? found.products?.find((p) => p.slug === RENAMED);
if (!target) { console.log('상품을 못 찾았다:', JSON.stringify(found).slice(0, 200)); process.exit(1); }

const rename = async (slug) => {
  const r = await fetch(`${B}/api/admin/products/${target.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ slug }) });
  if (!r.ok) throw new Error(`이름 변경 실패 ${r.status} ${await r.text()}`);
};
await rename(ORIGINAL);

let running = true;
let noiseCount = 0;
// 옛 주소와 무거운 화면을 함께 두드린다 — 렌더가 늘 여러 개 떠 있게
const PATHS = [`/product/${ORIGINAL}`, '/', `/category/outer-coat`, `/product/${ORIGINAL}`];
const noise = Array.from({ length: NOISE }, async (_, i) => {
  while (running) {
    await fetch(B + PATHS[i % PATHS.length], { redirect: 'manual' }).then((r) => r.text()).catch(() => {});
    noiseCount++;
  }
});

let moved = 0, stayed = 0, other = 0;
const t0 = Date.now();
for (let i = 0; i < ROUNDS; i++) {
  await rename(RENAMED);
  const r = await fetch(`${B}/product/${ORIGINAL}`, { redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) moved++;
  else if (r.status === 200) { stayed++; console.log(`  ${i + 1}회차: 옛 주소가 200 으로 그대로 열렸다 ← 재현`); }
  else other++;
  await rename(ORIGINAL);
  await new Promise((s) => setTimeout(s, 60));
}
running = false;
await Promise.all(noise);
console.log(`\n잡음 ${NOISE}갈래 (${noiseCount}회 요청) · ${ROUNDS}회 시도 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(`  넘어감 ${moved} · 옛 주소 그대로 ${stayed} · 그 밖 ${other}`);
