import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { parseCsv } from '@shop/core';
import { SEED_ACCOUNT } from '@shop/auth/seed-fixtures';
import { ready } from './state';

/**
 * 감사 로그를 기간·행위자로 좁히고, 그 조건 그대로 내려받는다.
 *
 * 조건 만들기와 파일 모양은 단위 검사가 본다. 여기서 보는 것은 **화면의 조건과 파일이 같은 기록을 담는가**와,
 * 내려받은 사람도 기록에 남는가다. 기록은 스스로 만든다 — 내려받기 한 번이 곧 `audit.export` 한 줄이다(다른
 * 명세가 무엇을 남겼는지에 기대지 않는다).
 */

test.describe.configure({ mode: 'serial' });

const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function download(page: Page): Promise<string[][]> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV 내려받기' }).click(),
  ]);
  return parseCsv((await readFile(await file.path())).toString('utf8'));
}

test('행위자·오늘로 좁히면 목록과 내려받은 파일이 그 사람의 오늘 기록만 담고, 받은 것도 남는다', async ({ page }) => {
  // 내 기록을 하나 만든다 — 조건 없이 내려받기
  await page.goto('/admin/audit');
  await ready(page);
  await download(page);

  // ── 행위자와 기간을 걸고 적용
  await page.goto('/admin/audit');
  await ready(page);
  const actor = page.getByLabel('행위자');
  const mine = actor.locator('option', { hasText: SEED_ACCOUNT.admin });
  await expect(mine, '방금 내려받았는데 행위자 선택지에 내가 없다').toHaveCount(1);
  await actor.selectOption({ value: (await mine.getAttribute('value'))! });
  await page.getByLabel('시작일').fill(kstToday());
  await page.getByLabel('종료일').fill(kstToday());
  await page.getByRole('button', { name: '적용' }).click();
  await page.waitForURL(/actor=.*from=.*to=/);
  await ready(page);

  // 목록: 전부 나, 방금 한 내려받기가 보인다
  const log = page.getByRole('region', { name: '관리자 동작 기록' });
  const rows = log.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  const emails = await rows.locator('td:nth-child(2)').allTextContents();
  expect(emails.every((t) => t.includes(SEED_ACCOUNT.admin)), `다른 사람 기록이 섞였다: ${emails.join(' / ')}`).toBe(true);
  await expect(log.getByRole('cell', { name: '감사 로그 내려받기', exact: true }).first()).toBeVisible();

  // 파일: 같은 조건 — 전부 나, 전부 오늘(KST), 목록의 첫 줄과 같은 기록으로 시작
  const [header, ...lines] = await download(page);
  const col = { at: header!.indexOf('시각'), email: header!.indexOf('이메일'), code: header!.indexOf('동작 코드') };
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every((l) => l[col.email] === SEED_ACCOUNT.admin)).toBe(true);
  expect(lines.every((l) => l[col.at]!.startsWith(kstToday()))).toBe(true);
  expect(lines.some((l) => l[col.code] === 'audit.export')).toBe(true);
});

test('기간이 거꾸로면 이유를 알리고, 조건이 빠진 목록을 내려받게 두지 않는다', async ({ page }) => {
  await page.goto('/admin/audit?from=2026-09-10&to=2026-09-01');
  await ready(page);
  await expect(page.locator('form [role="alert"]')).toContainText('시작일이 종료일보다 뒤입니다');
  await expect(page.getByLabel('시작일')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'CSV 내려받기' })).toHaveCount(0);
});
