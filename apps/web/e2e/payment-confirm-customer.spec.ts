import { test, expect } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, ready } from './state';

/*
 * **자기 손님으로 돈다.** 이 명세는 서버 장바구니를 비우고 채운다.
 * 다른 명세와 계정을 나눠 쓰면 한쪽이 비우는 순간 다른 쪽이 빈
 * 장바구니를 보게 된다 — 실제로 그렇게 산발로 졌다.
 */
test.use({ storageState: STATE_FILE.cartPayment });
// 이 파일 안에서도 장바구니를 나눠 쓰므로 한 번에 하나씩 돈다
test.describe.configure({ mode: 'serial' });

/**
 * 결제 확정 **이후**.
 *
 * 화면 검사는 오랫동안 주문 생성까지만 돌았다. 승인 · 결제완료 · 재고 확정은
 * 단위 검사로만 덮여 있었는데, **그건 고정된 값으로 도는 검사라 조회 필드를
 * 잘못 적어도 통과한다** — 주문 메일을 만들 때 실제로 겪었다.
 *
 * 못 열었던 이유는 게이트웨이 고르기가 "프로덕션 빌드" 와 "운영 배포" 를 같은
 * 것으로 보고 있었기 때문이다. 이 서버는 `next start` 로 도는 프로덕션 빌드라
 * 실제 결제 키를 요구받았다. 그 둘을 가르고 PAYMENT_GATEWAY=mock 을 대놓고
 * 켜서 연다(playwright.config 의 webServer 참고).
 */

/** 결제 화면까지 데려간다. 배송지는 시드가 기본으로 하나 넣어 둔다. */
async function toCheckout(page: import('@playwright/test').Page): Promise<void> {
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await ready(page);
  // 배송지가 없으면 주문 자체가 안 만들어진다 — 없으면 여기서 멈추는 편이 낫다
  await expect(page.getByRole('heading', { name: '배송지' })).toBeVisible();

  /*
   * 견적이 와야 결제 버튼이 열린다. 금액이 뜨기 전에 누르면 서버가 아직
   * 계산하지 않은 값으로 주문하는 셈이라, 폼이 막는 것이 맞다.
   */
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();

  /*
   * **약관 동의가 없으면 버튼이 안 열린다.** 처음 이 명세를 쓸 때 빠뜨렸고
   * 버튼이 계속 비활성이었다 — 폼이 제대로 막고 있었던 것이다.
   */
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
}

/**
 * 만든 주문을 되돌린다.
 *
 * **이 명세는 진짜 주문을 만들고, 그 주문은 결제까지 끝난다** — 재고가 깎인
 * 채로 남는다. 되돌리지 않으면 같은 DB 에서 반복할수록 재고가 말라 나중
 * 실행이 진다. 멱등 명세에서 이미 겪은 일이라 처음부터 붙인다.
 *
 * 되돌리는 길은 사용자가 쓰는 그 길이다. 결제완료 주문의 취소는 환불까지
 * 함께 도는 경로라, **이 정리 자체가 환불 경로를 한 번 더 밟는 셈**이다.
 */
async function undo(
  page: import('@playwright/test').Page,
  orderNo: string,
): Promise<void> {
  const res = await page.request.post(`/api/orders/${orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
  });
  // 못 되돌리면 다음 실행이 재고 없이 시작한다. 조용히 넘기지 않는다.
  expect(res.ok(), `주문 ${orderNo} 을 되돌리지 못했다 (${res.status()})`).toBe(true);
}

/** 주문 번호를 주소에서 꺼낸다 */
function orderNoOf(url: string): string {
  const hit = /\/order\/([^/?#]+)/.exec(url);
  expect(hit, `주문 화면으로 가지 않았다: ${url}`).not.toBeNull();
  return decodeURIComponent(hit![1]!);
}

test('카드로 결제하면 결제완료까지 간다', async ({ page }) => {
  await toCheckout(page);

  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();

  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const orderNo = orderNoOf(page.url());

  /*
   * **여기가 이 명세의 요점이다.** 주문이 만들어진 것과 결제가 승인된 것은
   * 다르다. 승인이 안 됐는데 화면이 결제완료를 보여 주면 재고만 묶인 채
   * 아무도 모른다.
   */
  await expect(page.getByText('결제완료').first()).toBeVisible();

  // 목록 조회도 같은 상태를 말해야 한다. 상세만 맞고 목록이 틀리면
  // 사용자는 주문 내역에서 자기 주문을 못 찾는다.
  await page.goto('/mypage/orders');
  await ready(page);
  await expect(page.getByText(orderNo)).toBeVisible();

  await undo(page, orderNo);
});

test('가상계좌는 결제완료가 아니라 입금대기다', async ({ page }) => {
  /*
   * 돈이 아직 안 들어온 주문이다. 여기서 결제완료로 넘어가면 **입금 없이
   * 상품이 나간다.** 상태 하나 차이지만 결과가 완전히 다르다.
   */
  await toCheckout(page);

  await page.getByRole('radio', { name: '가상계좌' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();

  await page.waitForURL(/\/order\//, { timeout: 30_000 });

  await expect(page.getByText('입금대기').first()).toBeVisible();
  await expect(page.getByText('결제완료')).toHaveCount(0);

  await undo(page, orderNoOf(page.url()));
});
