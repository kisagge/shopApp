import { test, expect } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart } from './state';

/**
 * 한 장짜리 쿠폰이 두 주문에 붙지 않는다.
 *
 * 주문 여섯을 한꺼번에 던진다. 손이 미끄러져 두 번 누르거나, 응답이 늦어 다시
 * 누르거나, 창을 여러 개 띄워 놓고 각각 결제하면 실제로 이렇게 된다.
 * **만원짜리 쿠폰이 두 번 깎이면 그만큼 그냥 나간 돈이고, 화면에는 아무 표시도
 * 나지 않는다.**
 *
 * 한 사람으로 겨루는 이유는 **쿠폰이 계정에 붙어 있기** 때문이다. 두 사람은
 * 애초에 같은 쿠폰을 들 수 없다.
 *
 * ── 이 검사가 증명하지 못하는 것 ──────────────────────────
 * **트랜잭션 안의 경쟁은 못 밟았다.** 쿠폰 도장도 재고와 같은 조건부 UPDATE 다
 * (`usedAt: null` 인 것만 잡는다). 그 줄을 읽고-나서-쓰기로 바꿔 놓고 여섯을
 * 던져 봤는데 **검사가 그대로 통과했다** — 요청들이 트랜잭션 창에서 겹치지
 * 않고 줄 서서 처리돼, 바깥쪽 조회가 먼저 "이미 쓴 쿠폰" 으로 막았다. 맥락을
 * 여섯 개로 갈라도 같았다.
 *
 * 그래서 여기서 지키는 것은 **결과**다 — 연달아 몇 번을 보내도 쿠폰은 한 번만
 * 먹는다. 막는 자리가 여럿이라 하나만 지워서는 안 무너지고, 도장을 아예 안
 * 찍게 하면 여섯 중 다섯이 만원을 깎고 여기서 걸린다. 재고 쪽(stock-race)은
 * 남은 재고가 음수인지로 보기 때문에 그 자리를 실제로 밟는다.
 *
 * **포인트도 같은 모양인데 못 밟았다.** 시드는 포인트를 주지 않고 포인트는
 * 구매확정으로만 쌓인다 — 이 검사 하나를 위해 주문을 사서 확정까지 밀어야
 * 한다. 운영진이 포인트를 얹어 주는 창구가 생기면 그때 함께 밟는다.
 */

test.use({ storageState: STATE_FILE.doubleSpender });
test.describe.configure({ mode: 'serial' });

/** 시드 쿠폰. 3만원 이상에서 1만원 정액이다. */
const COUPON = { code: 'WELCOME10000', amount: 10_000, minimum: 30_000 } as const;

test('한 장짜리 쿠폰이 두 주문에 붙지 않는다', async ({ page, browser }) => {
  const claim = await page.request.post('/api/coupons/claim', {
    data: { code: COUPON.code },
    failOnStatusCode: false,
  });
  // 두 번째 실행부터는 이미 받은 상태다 — 그것도 정상이다
  expect([200, 409], `쿠폰을 못 받았다 (${claim.status()})`).toContain(claim.status());

  /*
   * **자기 상품을 쓴다.** 여섯을 한꺼번에 사므로 한 변형에서 여섯 개가 빠진다 —
   * 홈의 첫 상품을 쓰면 그것을 담으려던 다른 명세가 재고를 못 만난다.
   */
  const variantId = await addProductToCart(page, RACE_PRODUCT.coupon);
  expect(variantId, '담을 수 있는 상품이 없다 — 시드가 비었다').not.toBeNull();

  const body = (await (await page.request.get('/api/addresses')).json()) as
    | { id: string; isDefault: boolean }[]
    | { addresses: { id: string; isDefault: boolean }[] };
  const rows = Array.isArray(body) ? body : body.addresses;
  const address = rows.find((a) => a.isDefault) ?? rows[0];
  expect(address, '시드가 이 계정에 배송지를 안 만들었다').toBeDefined();

  /*
   * **최소 주문 금액을 넘겨야 쿠폰이 붙는다.** 안 넘기면 둘 다 쿠폰 없이
   * 성공하고, 검사는 아무것도 겨루지 않은 채 통과한다. 상품 값은 시드에
   * 따라 달라지므로 수량으로 맞춘다.
   */
  const unitPrice = await (async () => {
    const res = await page.request.post('/api/cart/quote', {
      data: { lines: [{ variantId: variantId!, quantity: 1 }] },
    });
    const line = ((await res.json()) as { lines: { unitPrice: number; stock: number }[] }).lines[0];
    return { price: line!.unitPrice, stock: line!.stock };
  })();

  const quantity = Math.ceil(COUPON.minimum / unitPrice.price);
  expect(
    unitPrice.stock,
    `${COUPON.minimum}원을 넘기려면 ${quantity}개가 필요한데 재고가 ${unitPrice.stock}개다`,
  ).toBeGreaterThanOrEqual(quantity);

  /*
   * **맥락을 따로 둔다.** 한 `page.request` 에서 여섯을 던지면 Playwright 가
   * 그 창구로 줄을 세운다. 같은 세션 파일로 맥락을 여럿 열면 **같은 사람이
   * 창을 여러 개 띄운 것**과 같아진다 — 실제로 그렇게 쓰는 사람이 있다.
   */
  const senders = await Promise.all(
    Array.from({ length: 6 }, () => browser.newContext({ storageState: STATE_FILE.doubleSpender })),
  );

  const send = (context: import('@playwright/test').BrowserContext) =>
    context.request.post('/api/orders', {
      data: {
        lines: [{ variantId: variantId!, quantity }],
        addressId: address!.id,
        paymentMethod: 'CARD',
        agreedToTerms: true,
        couponCode: COUPON.code,
      },
      failOnStatusCode: false,
    });

  /*
   * **여섯을 한꺼번에 던진다.** 둘로는 모자랐다 — 한두 번으로는 "쓴 쿠폰은
   * 못 쓴다" 만 확인하는 셈이고, 여러 번 보내야 어느 한 번이라도 도장을
   * 빠뜨리는지 드러난다.
   */
  const responses = await Promise.all(senders.map(send));
  const results = await Promise.all(
    responses.map(async (r) => ({
      status: r.status(),
      body: (await r.json()) as Record<string, unknown>,
    })),
  );

  const made = results.filter((r) => r.status < 400);
  try {
    /*
     * **여기가 이 파일의 요점이다.** 한 장짜리 쿠폰이 두 주문에 붙으면
     * 만원을 두 번 깎아 준 것이다. 화면에는 아무 표시도 나지 않는다.
     */
    expect(
      made.length,
      `쿠폰 한 장으로 주문이 ${made.length}건 만들어졌다 — ${JSON.stringify(results)}`,
    ).toBe(1);

    /*
     * 나머지는 쿠폰 때문에 막혀야 한다. 재고 때문에 막힌 것이 섞이면 쿠폰을
     * 겨룬 것이 아니므로, 적어도 하나는 쿠폰이라고 말해야 한다.
     */
    const codes = results.filter((r) => r.status >= 400).map((r) => r.body['code']);
    expect(codes, `거절 이유에 쿠폰이 없다: ${JSON.stringify(codes)}`).toContain('COUPON_INVALID');

    // 쿠폰이 실제로 값을 깎았는지도 본다 — 안 깎였으면 겨룬 것이 아무것도 없다
    const paid = made[0]!.body['payable'] as number;
    expect(paid, '쿠폰이 안 붙었다').toBeLessThanOrEqual(unitPrice.price * quantity - COUPON.amount);
  } finally {
    await Promise.all(senders.map((c) => c.close()));
    // 되돌린다. 취소는 쿠폰도 돌려주므로 다음 실행이 다시 겨룰 수 있다.
    for (const r of made) {
      await page.request
        .post(`/api/orders/${r.body['orderNo'] as string}/cancel`, {
          data: { reason: '검사가 만든 주문을 되돌립니다' },
          failOnStatusCode: false,
        })
        .catch(() => null);
    }
  }
});
