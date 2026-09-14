import { test, expect } from '@playwright/test';
import { layoutTests, layoutProblems, WIDTHS } from './layout';
import { STATE_FILE } from './state';
import { addFirstProductToCart } from './state';

/*
 * 주문 상세를 재려면 주문을 하나 만들어야 하고, 그러려면 장바구니를 쥔다.
 * **서버 장바구니는 계정에 하나뿐이라** 남과 나눠 쓰면 한쪽이 비우는 순간
 * 다른 쪽이 사라진다. 자기 손님을 따로 둔다.
 */
test.use({ storageState: STATE_FILE.cartLayout });
test.describe.configure({ mode: 'serial' });

/**
 * 로그인해야 보이는 화면의 자리.
 *
 * 주문 목록의 탭이 실기기에서 세로로 쌓였는데, 손님 화면만 재고 있었다면
 * 영영 못 봤을 자리다. 탭은 상태가 늘어날수록 좁아지므로 특히 그렇다.
 */
layoutTests(test, expect, [
  ['주문 목록', '/mypage/orders'],
  ['마이페이지', '/mypage'],
  ['주소록', '/mypage/addresses'],
  ['쿠폰함', '/mypage/coupons'],
  ['포인트', '/mypage/points'],
  ['찜', '/mypage/wishlist'],
  ['알림', '/mypage/notifications'],
  ['문의', '/mypage/inquiries'],
  ['내 리뷰', '/mypage/reviews'],
  ['재입고 알림', '/mypage/restock'],
  ['탈퇴', '/mypage/close'],
  // 담긴 것이 없으면 빈 화면이지만, 빈 화면도 무너질 수 있다
  ['결제', '/checkout'],
]);

/**
 * 주문 상세는 **돈이 줄줄이 적히는 화면**이다 — 상품·수량·할인·배송비·결제수단이
 * 한 표에 들어간다.
 *
 * **자기 자료를 스스로 만든다.** 처음에는 주문 목록에서 첫 줄을 눌러 들어가게
 * 했는데, 시드가 심는 주문은 리뷰어 계정 것이고 이 계정 것은 앞선 검사가
 * 우연히 남긴 것이었다 — 새로 시드한 DB 에서는 목록이 비어 30초를 기다리다
 * 졌다. 우연한 자료에 기대는 검사는 언젠가 진다.
 *
 * **끝나면 되돌린다.** 진짜 DB 를 건드리므로 흔적을 남기면 재고가 마른다.
 * 폭마다 다시 만들지 않고 한 번 만들어 넷을 다 잰다.
 */
test('주문 상세는 어느 폭에서도 자리가 무너지지 않는다', async ({ page }) => {
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
      idempotencyKey: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { orderNo } = (await created.json()) as { orderNo: string };

  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/order/${orderNo}`, { waitUntil: 'domcontentloaded' });

      const problems = await layoutProblems(page);

      expect(
        problems,
        `주문 상세 ${width}px 에서 자리가 어긋났다.\n` +
          problems.map((p) => `  · ${p.kind}: ${p.detail}`).join('\n'),
      ).toEqual([]);
    }

    // 결제 전 주문에는 영수증을 내지 않는다 — 내지 않은 돈의 증빙이 된다. 결제된 영수증의 자리는 partial-cancel 이 잰다
    await page.goto(`/order/${orderNo}/receipt`);
    await expect(page.getByText('결제가 끝난 주문만 영수증을 볼 수 있습니다.')).toBeVisible();
    await expect(page.getByRole('article', { name: '주문 영수증' })).toHaveCount(0);
    await page.goto(`/order/${orderNo}`);
    await expect(page.getByRole('link', { name: '영수증 보기' }), '결제 전 주문에 영수증 링크가 있다').toHaveCount(0);
  } finally {
    await page.request.post(`/api/orders/${orderNo}/cancel`, {
      data: { reason: '검사가 만든 주문을 되돌립니다' },
    });
  }
});
