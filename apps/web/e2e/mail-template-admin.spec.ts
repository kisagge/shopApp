import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 메일 문구를 고치고 미리 본다 — 미리보기는 실제로 보내는 코드가 만든 메일이다.
 *
 * e2e 에서는 메일을 받아 볼 수 없다(발송은 콘솔로 떨어진다). 그래서 **보내는 함수로 만든 미리보기**를 끝점으로 본다:
 * 고친 제목에 예시 상품이 끼워져 나오고, 저장한 문구가 다시 열어도 남고, 틀린 값은 저장 전에 막힌다. 보내는 코드가
 * 저장한 문구를 쓰는지는 단위 검사가 본다.
 *
 * 문구는 가게 전체의 값이라 끝나면 반드시 기본으로 되돌린다.
 */

const SUBJECT = '{item} 다시 들어왔어요 — 문구 검사';

test('재입고 메일 제목을 고쳐 미리 보고 저장하면 다시 열어도 남고, 틀린 값은 막힌다', async ({ page }) => {
  try {
    await page.goto('/admin/mail-templates?locale=ko&kind=RESTOCK');
    await ready(page);
    await expect(page.getByRole('link', { name: '재입고' })).toHaveAttribute('aria-current', 'page');

    const subject = page.getByLabel('제목');
    await expect(subject).toHaveAttribute('placeholder', /재입고/);

    // 틀린 값 — 재입고 제목에 주문번호는 없다
    await subject.fill('{orderNo} 재입고');
    await expect(subject).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled();

    // 미리보기 — 서버가 실제 메일로 만든다
    await subject.fill(SUBJECT);
    await page.getByRole('button', { name: '미리보기' }).click();
    await expect(page.getByTestId('mail-preview-subject')).toHaveText('울 코트 (오트 / M) 다시 들어왔어요 — 문구 검사');
    const frame = page.frameLocator('iframe[title="재입고 메일 미리보기"]');
    await expect(frame.getByText('상품 보러 가기')).toBeVisible();

    // 저장 → 다시 열어도 남고, 탭에 고친 표시
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.getByRole('status').filter({ hasText: '저장했습니다.' })).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByLabel('제목')).toHaveValue(SUBJECT);
    await expect(page.getByRole('link', { name: /재입고.*\(고침\)/ })).toBeVisible();

    // 되돌리기
    await page.getByRole('button', { name: '모두 기본 문구로' }).click();
    await expect(page.getByRole('status').filter({ hasText: '기본 문구로 되돌렸습니다.' })).toBeVisible();
    await expect(page.getByLabel('제목')).toHaveValue('');
  } finally {
    await page.request.patch('/api/admin/mail-templates', {
      data: { kind: 'RESTOCK', locale: 'ko', subject: null, heading: null, lead: null },
      failOnStatusCode: false,
    });
  }
});
