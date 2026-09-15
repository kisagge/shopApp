import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 대시보드 기간을 직접 고르고 지난 기간과 비교한다.
 *
 * 금액 규칙과 비교 창은 단위 검사가 본다. 여기서 보는 것은 **주소에 남는 기간과 화면이 맞는가**다: 직접 고른 기간이
 * 주소에 남고, 지표마다 "지난 기간" 이 그 앞 같은 길이로 적히며, 틀린 기간은 이유와 함께 7일로 돌아간다.
 */

const kstDay = (offsetDays: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const label = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

test('직접 고른 기간이 주소에 남고, 지표마다 같은 길이의 바로 앞 기간이 적힌다', async ({ page }) => {
  await page.goto('/admin');
  await ready(page);

  // 기본은 탭(7일)이 골라져 있고 비교 문구가 있다
  await expect(page.getByRole('navigation', { name: '집계 기간' }).locator('[aria-current="true"]')).toHaveText('7일');
  await expect(page.getByText(/지난 기간 /).first()).toBeVisible();

  // ── 지난 날로만 된 5일을 고른다: 오늘-9 ~ 오늘-5 → 지난 기간은 오늘-14 ~ 오늘-10
  const form = page.getByRole('form', { name: '기간 직접 고르기' });
  await form.getByLabel('시작일').fill(kstDay(-9));
  await form.getByLabel('종료일').fill(kstDay(-5));
  await form.getByRole('button', { name: '적용' }).click();
  await page.waitForURL(/from=.*to=/);
  await ready(page);

  // 탭은 아무것도 골라지지 않았고, 지표 제목이 5일이다
  await expect(page.getByRole('navigation', { name: '집계 기간' }).locator('[aria-current="true"]')).toHaveCount(0);
  const kpis = page.getByRole('region', { name: /주요 지표/ });
  await expect(kpis.getByText('5일 순매출')).toBeVisible();
  await expect(kpis.getByText(`지난 기간 ${label(kstDay(-14))} – ${label(kstDay(-10))}`).first()).toBeVisible();
  await expect(form.getByLabel('시작일')).toHaveValue(kstDay(-9));
});

test('시작일이 종료일보다 뒤면 이유를 알리고 최근 7일을 보여 준다', async ({ page }) => {
  await page.goto(`/admin?from=${kstDay(-2)}&to=${kstDay(-5)}`);
  await ready(page);
  const form = page.getByRole('form', { name: '기간 직접 고르기' });
  await expect(form.getByRole('alert')).toHaveText('시작일이 종료일보다 뒤입니다. 최근 7일을 보여 줍니다.');
  await expect(form.getByLabel('시작일')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('최근 7일 순매출')).toBeVisible();
});
