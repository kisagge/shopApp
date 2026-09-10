import { chromium } from '@playwright/test';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const page = ctx.pages()[0];
const SITE = 'https://shop-app-web-tau.vercel.app';

await page.goto(`${SITE}/product/cotton-twill-wide-pants`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);
await page.getByRole('radio', { name: '베이지', exact: true }).click();
await page.getByRole('radio', { name: '32', exact: true }).click();
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

await page.getByRole('button', { name: /원 결제하기/ }).click();
// 주문 만들기가 끝나고 확정이 도는 즈음
await page.waitForTimeout(2600);
console.log('주소:', page.url());
console.log('그때 화면:', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 200));
await page.screenshot({ path: '/tmp/during.png' });
await page.waitForURL(/\/order\//, { timeout: 60000 });
console.log('주문:', page.url().split('/order/')[1]);
await b.close();
