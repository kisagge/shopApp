import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { STATE_FILE, ready, addFirstProductToCart } from './state';

/*
 * **자기 손님으로 돈다.** 이 명세는 서버 장바구니를 비우고 채운다.
 * 다른 명세와 계정을 나눠 쓰면 한쪽이 비우는 순간 다른 쪽이 빈
 * 장바구니를 보게 된다 — 실제로 그렇게 산발로 졌다.
 */
test.use({ storageState: STATE_FILE.cartA11y });
// 이 파일 안에서도 장바구니를 나눠 쓰므로 한 번에 하나씩 돈다
test.describe.configure({ mode: 'serial' });

/**
 * 로그인한 사람이 보는 화면.
 *
 * 손님 화면과 달리 **여기는 사람이 자기 정보를 다루는 자리**다 — 주소를
 * 고치고, 주문을 취소하고, 리뷰를 쓴다. 폼이 많은 만큼 이름표·오류 연결이
 * 어긋날 자리도 많다.
 */

const PAGES: readonly (readonly [string, string])[] = [
  ['마이페이지', '/mypage'],
  ['주문 내역', '/mypage/orders'],
  ['배송지', '/mypage/addresses'],
  ['찜', '/mypage/wishlist'],
  ['포인트', '/mypage/points'],
  ['쿠폰함', '/mypage/coupons'],
  ['내 리뷰', '/mypage/reviews'],
  ['내 문의', '/mypage/inquiries'],
  ['알림', '/mypage/notifications'],
  ['재입고 알림', '/mypage/restock'],
  ['1:1 문의 쓰기', '/support/ask'],
  ['탈퇴', '/mypage/close'],
];

for (const [name, path] of PAGES) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(path);
    await ready(page);
    await expectNoA11yViolations(page);
  });
}

/**
 * 결제 화면.
 *
 * **처음 훑기를 만들 때 여기가 빠져 있었다.** 서른아홉 장을 훑는다고 해 놓고
 * 정작 **돈이 오가는 화면**을 뺐다. 주소를 넣고 결제 수단을 고르는 폼이라
 * 이 앱에서 이름표가 가장 많이 붙는 자리이기도 하다.
 *
 * 담긴 것이 없으면 볼 것이 없어서 먼저 담는다 — 빈 화면을 훑으면 정작
 * 검사하려던 폼을 한 번도 못 본다.
 */
test('결제 화면에 접근성 위반이 없다', async ({ page }) => {
  const variantId = await addFirstProductToCart(page);
  test.skip(variantId === null, '재고 있는 조합이 없어 담지 못했다');

  await page.goto('/checkout');
  await ready(page);
  // 배송지 폼이 그려진 뒤에 훑는다. 그리기 전에 재면 빈 껍데기를 본다.
  await page.getByRole('button', { name: /결제|주문/ }).first().waitFor();

  await expectNoA11yViolations(page);
});

/**
 * 주문 상세.
 *
 * **자기가 볼 주문을 스스로 만든다.** 목록에 있는 것을 골라 쓰면 다른 검사가
 * 먼저 돌았는지에 따라 돌기도 하고 건너뛰기도 한다 — 갓 시드한 DB 에는
 * 주문이 없다. 건너뛰는 검사는 없는 검사와 같고, 그런데 통과한 것처럼
 * 보이는 것이 더 나쁘다.
 *
 * 끝나면 되돌린다. 진짜 DB 를 건드리는 검사라 흔적을 남기면 재고가 마른다 —
 * 멱등성 명세에서 실제로 그렇게 말랐다.
 */
test('주문 상세 화면에 접근성 위반이 없다', async ({ page }) => {
  const variantId = await addFirstProductToCart(page);
  test.skip(variantId === null, '재고 있는 조합이 없어 담지 못했다');

  const addresses = await page.request.get('/api/addresses');
  const { addresses: list } = (await addresses.json()) as { addresses: { id: string }[] };
  expect(list[0]?.id, '배송지가 하나는 있어야 한다').toBeTruthy();

  const created = await page.request.post('/api/orders', {
    data: {
      lines: [{ variantId, quantity: 1 }],
      addressId: list[0]!.id,
      paymentMethod: 'CARD' as const,
      agreedToTerms: true as const,
      idempotencyKey: `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { orderNo } = (await created.json()) as { orderNo: string };

  try {
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await expectNoA11yViolations(page);
  } finally {
    await page.request.post(`/api/orders/${orderNo}/cancel`, {
      data: { reason: '검사가 만든 주문을 되돌립니다' },
    });
  }
});
