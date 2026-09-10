import { chromium } from '@playwright/test';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const page = ctx.pages()[0];
const SITE = 'https://shop-app-web-tau.vercel.app';

await ctx.addInitScript(() => {
  const W = window;
  W.__marks = [];
  const M = (n) => W.__marks.push({ n, t: Math.round(performance.now()) });
  const of = W.fetch.bind(W);
  W.fetch = async (...a) => {
    const url = String(a[0] && a[0].url ? a[0].url : a[0]).replace(location.origin, '');
    const short = url.split('?')[0] + (url.includes('_rsc') ? ' (RSC)' : '');
    M('요청 ▶ ' + short);
    const r = await of(...a);
    M('요청 ◀ ' + short + ' ' + r.status);
    return r;
  };
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k].bind(history);
    history[k] = (...a) => { M('주소바뀜 → ' + a[2]); return orig(...a); };
  }
  /* 결제 버튼이 잠겼는지 · 무슨 글자인지 바뀔 때마다 남긴다 */
  W.__watch = () => {
    let last = '';
    const tick = () => {
      const btn = [...document.querySelectorAll('button')].find((e) =>
        /결제하기|주문 처리 중/.test(e.textContent || ''));
      const now = btn ? `${btn.disabled ? '잠김' : '눌림가능'} "${btn.textContent.trim().slice(0, 18)}"` : '없음';
      if (now !== last) { M('버튼 ' + now); last = now; }
      if (W.__watching) requestAnimationFrame(tick);
    };
    W.__watching = true;
    tick();
  };
});

for (const size of ['28', '30']) {
  await page.goto(`${SITE}/product/cotton-twill-wide-pants`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  await page.getByRole('radio', { name: '베이지', exact: true }).click();
  await page.getByRole('radio', { name: size, exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /장바구니 담기/ }).click();
  await page.waitForTimeout(2200);
  await page.goto(`${SITE}/cart`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /주문하기/ }).click();
  await page.waitForURL('**/checkout', { timeout: 25000 });
  await page.waitForTimeout(3500);
  await page.getByRole('checkbox', { name: /약관에 동의|주문 내용을 확인/ }).first().check();
  await page.waitForTimeout(400);

  await page.evaluate(() => { window.__marks = []; window.__t0 = performance.now(); window.__watch(); });
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 90000 });
  await page.waitForTimeout(2500);

  const marks = await page.evaluate(() => {
    window.__watching = false;
    const t0 = window.__t0;
    return (window.__marks || [])
      .filter((m) => /confirm|\/order\/|주소바뀜|api\/orders|버튼/.test(m.n))
      .map((m) => ({ n: m.n, t: Math.round(m.t - t0) }));
  });
  console.log(`\n═══ 사이즈 ${size}  (클릭 기준 ms)`);
  for (const m of marks) console.log(`${String(m.t).padStart(6)}  ${m.n}`);
  console.log('  주문:', page.url().split('/order/')[1]);
}
await b.close();
