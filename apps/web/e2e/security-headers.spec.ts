import { test, expect } from '@playwright/test';

/**
 * 보안 헤더.
 *
 * 하나도 없었다. 붙이는 것보다 **붙인 것이 화면을 깨지 않는지** 확인하는 쪽이
 * 어렵고, 그래서 여기서 보는 것은 헤더의 존재와 **CSP 위반이 없는가** 둘이다.
 * 나머지 명세 전부가 이 CSP 아래에서 돌므로, 스크립트가 막히면 그쪽이 먼저
 * 무너진다 — 이 파일은 헤더 자체를 못 박아 두는 자리다.
 */

const EXPECTED: Readonly<Record<string, RegExp>> = {
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
  'referrer-policy': /^strict-origin-when-cross-origin$/,
  'permissions-policy': /camera=\(\)/,
  'strict-transport-security': /max-age=\d+/,
};

test('보안 헤더가 붙어 있다', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();

  for (const [name, pattern] of Object.entries(EXPECTED)) {
    expect(headers[name], name).toMatch(pattern);
  }
});

test('CSP 가 nonce 로 걸린다 — unsafe-inline 만 있는 CSP 는 있으나 마나다', async ({ page }) => {
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];

  expect(csp).toBeTruthy();
  expect(csp, 'nonce 가 요청마다 새로 나와야 한다').toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(csp, 'SDK 가 스스로 심는 스크립트를 위해 필요하다').toContain("'strict-dynamic'");
  expect(csp, '남의 페이지에 끼워 넣지 못하게').toContain("frame-ancestors 'none'");
  expect(csp, '주소창 바꿔치기를 막는다').toContain("base-uri 'none'");
});

test('요청마다 다른 nonce 를 준다 — 같으면 nonce 를 두는 뜻이 없다', async ({ page }) => {
  const read = async () => {
    const response = await page.goto('/');
    return /'nonce-([^']+)'/.exec(response!.headers()['content-security-policy'] ?? '')?.[1];
  };

  const first = await read();
  const second = await read();

  expect(first).toBeTruthy();
  expect(second).not.toBe(first);
});

test('CSP 아래에서도 화면이 살아 있다', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });

  await page.goto('/');

  // 스크립트가 막히면 하이드레이션이 안 되어 콤보박스가 반응하지 않는다
  const box = page.locator('#site-search');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect
    .poll(async () => {
      await box.fill('코');
      await box.fill('코트');
      return box.getAttribute('aria-expanded');
    })
    .toBe('true');

  expect(violations, violations.join('\n')).toEqual([]);
});
