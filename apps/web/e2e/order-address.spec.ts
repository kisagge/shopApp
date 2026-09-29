import { test, expect } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, payWithCard, undoOrder } from './state';

/**
 * 출고 전 주문의 배송지를 손님이 고친다.
 *
 * **아무도 못 고쳤다.** 상세주소를 잘못 적으면 출고 전이라도 방법이 없어, 취소하고 다시 사거나(쿠폰·적립금이
 * 다시 계산되고 재고가 잠깐 풀린다) 1:1 문의로 부탁해야 했다. 운영자도 화면에서 할 수 없어 DB 를 만졌다.
 *
 * 규칙(checkAddressEdit)과 장부(update-address)는 단위 검사가 본다. 여기서 보는 것은 사람이 밟는 길이다:
 * - 주문 상세에서 그 자리로 열리고, 고치면 상세에 바뀐 주소가 보인다
 * - **도서산간으로 옮기려 하면 결제가 끝난 주문에서는 막히고**, 왜 안 되는지 화면에 남는다
 * - 막힌 뒤에도 주문의 주소는 그대로다 — 반쯤 바뀌어 있으면 안 된다
 *
 * 자기 손님(orderAddressEditor)과 자기 상품(RACE_PRODUCT.orderAddress)을 쓴다.
 */

test.use({ storageState: STATE_FILE.orderAddressEditor });

/** 제주 — 도서산간이다(REMOTE_RANGES) */
const JEJU = '63309';

test('출고 전 배송지를 고치고, 도서산간으로 옮기는 것은 결제 뒤라 막힌다', async ({ page }) => {
  test.setTimeout(120_000);

  const variant = await addProductToCart(page, RACE_PRODUCT.orderAddress);
  expect(variant, '담을 수 있는 옵션이 없다').not.toBeNull();

  const orderNo = await payWithCard(page);

  try {
    await page.goto(`/order/${orderNo}`);
    await ready(page);

    // ── 같은 권역 안에서 고친다 — 상세주소 오타·받는 사람 변경이 가장 흔한 경우다
    await page.getByRole('button', { name: '배송지 수정' }).click();
    const form = page.getByRole('region', { name: `${orderNo} 배송지 수정` });
    await expect(form).toBeVisible();

    await form.getByLabel(/상세 주소/).fill('101동 1001호');
    await form.getByLabel('배송 요청사항').fill('부재 시 경비실에 맡겨 주세요');
    await form.getByRole('button', { name: '배송지 저장' }).click();

    // 저장했다는 말이 폼이 닫힌 뒤에도 남는다 — 닫히면서 사라지면 됐는지 알 수 없다
    await expect(page.getByRole('status').filter({ hasText: '배송지를 바꿨습니다' })).toBeVisible();
    // 상세에 바뀐 주소가 보인다 — 서버가 그리는 자리다
    await expect(page.getByText('101동 1001호')).toBeVisible();
    await expect(page.getByText('부재 시 경비실에 맡겨 주세요')).toBeVisible();

    // ── 도서산간으로 옮기면 배송비가 달라진다. 결제가 끝난 주문은 그 차액을 주고받을 길이 없다
    await page.getByRole('button', { name: '배송지 수정' }).click();
    const again = page.getByRole('region', { name: `${orderNo} 배송지 수정` });
    await again.getByLabel(/우편번호/).fill(JEJU);
    // 저장하기 전에 추가 배송비가 붙는다는 것을 먼저 알려 준다
    await expect(again.getByText(/제주특별자치도/)).toBeVisible();

    await again.getByRole('button', { name: '배송지 저장' }).click();

    const refusal = again.getByRole('alert');
    await expect(refusal).toContainText('도서산간');
    await expect(refusal, '다음 수를 알려 준다').toContainText('취소하고 다시 주문');

    // 막혔으면 주문은 그대로다 — 우편번호만 바뀌고 배송비는 옛 권역인 주문이 남으면 안 된다
    await page.reload();
    await ready(page);
    await expect(page.getByText(`(${JEJU})`)).toHaveCount(0);
    await expect(page.getByText('101동 1001호')).toBeVisible();
  } finally {
    await undoOrder(page, orderNo);
  }
});
