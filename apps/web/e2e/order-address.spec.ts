import { test, expect } from '@playwright/test';
import {
  STATE_FILE, RACE_PRODUCT, addProductToCart, ready, payWithCard, undoOrderAsAdmin,
} from './state';

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
 * - **운영자도 같은 폼으로 고치고**, 그 한 번이 감사 로그에 남는다
 * - 손님이 고친 것도 **처리 이력**에 남고, 출고 전이라면 **목록에서도** 눈에 띈다 — 피킹 목록을
 *   이미 뽑은 사람은 주문을 열어 볼 이유가 없다
 * - **송장을 붙이려 하면 한 번 더 묻는다** — 그 둘을 지나쳐 왔다면 거기가 마지막 문이다
 *
 * 자기 손님(orderAddressEditor)과 자기 상품(RACE_PRODUCT.orderAddress)을 쓴다.
 */

test.use({ storageState: STATE_FILE.orderAddressEditor });

/** 제주 — 도서산간이다(REMOTE_RANGES) */
const JEJU = '63309';

test('출고 전 배송지를 고치고, 도서산간으로 옮기는 것은 결제 뒤라 막힌다', async ({ page, browser }) => {
  test.setTimeout(120_000);

  const variant = await addProductToCart(page, RACE_PRODUCT.orderAddress);
  expect(variant, '담을 수 있는 옵션이 없다').not.toBeNull();

  const orderNo = await payWithCard(page);

  /*
   * 어드민 창구를 처음부터 쥔다. **배송 준비로 옮겨 놓고 끝나므로** 손님은 스스로 취소할 수 없다
   * (core 의 isCancellableByCustomer) — 되돌리기는 운영진 창구로 나간다.
   */
  const admin = await browser.newContext({ storageState: STATE_FILE.admin });

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

    /*
     * **같은 거절을 일본어로 물으면 일본어로 온다.** 오류 문구는 오래도록 한국어로 박혀 있었고,
     * 화면은 서버가 준 message 를 그대로 보여 준다 — 일본어로 사던 사람이 막히는 순간에만 한국어를 봤다.
     */
    const inJapanese = await page.request.patch(`/api/orders/${orderNo}/address`, {
      headers: { 'accept-language': 'ja' },
      data: {
        recipient: '장보영', phone: '010-1234-5678',
        postalCode: JEJU, address1: '제주 제주시 첨단로 242',
      },
    });
    expect(inJapanese.status()).toBe(409);
    const body = (await inJapanese.json()) as { code: string; message: string };
    expect(body.code).toBe('ZONE_CHANGE_AFTER_PAYMENT');
    expect(body.message, `한국어가 그대로 나갔다: ${body.message}`).toMatch(/[ぁ-んァ-ン]/);

    // 막혔으면 주문은 그대로다 — 우편번호만 바뀌고 배송비는 옛 권역인 주문이 남으면 안 된다
    await page.reload();
    await ready(page);
    await expect(page.getByText(`(${JEJU})`)).toHaveCount(0);
    await expect(page.getByText('101동 1001호')).toBeVisible();

    // ── 운영자도 같은 폼으로 고친다. 전화를 받고도 할 수 있는 것이 없어 DB 를 직접 만지던 자리다
    {
      const adminPage = await admin.newPage();
      await adminPage.goto(`/admin/orders/${orderNo}`);
      await ready(adminPage);

      /*
       * **손님이 고친 것을 운영자가 알 수 있어야 한다.** 화면에는 새 주소가 보이지만, 피킹 목록을 이미
       * 뽑았거나 송장을 붙이려던 사람에게는 그 사실이 어디에도 나타나지 않았다.
       */
      const history = adminPage.getByRole('table', { name: '주문 상태 변경 이력' });
      await expect(history).toContainText('배송지 변경 (손님)');
      await expect(history, '무엇이 바뀌었는지까지 적는다').toContainText('상세주소');

      // 이력을 뒤지지 않고도 알아야 하는 자리다 — 배송 정보 위에 한 줄
      await expect(adminPage.getByRole('region', { name: '배송 정보' }))
        .toContainText('배송지는');

      /*
       * **목록에서 눈에 띈다.** 출고 준비를 하던 사람은 주문을 열어 볼 이유가 없어서, 이력에만 남으면
       * 옛 주소로 보내고 나서야 안다.
       */
      await adminPage.goto('/admin/orders?q=' + orderNo);
      await ready(adminPage);
      await expect(adminPage.getByRole('row', { name: new RegExp(orderNo) }))
        .toContainText('배송지 변경');

      await adminPage.goto(`/admin/orders/${orderNo}`);
      await ready(adminPage);

      await adminPage.getByRole('button', { name: '배송지 수정' }).click();
      const adminForm = adminPage.getByRole('region', { name: `${orderNo} 배송지 수정` });
      await adminForm.getByLabel(/받는 분/).fill('장부장');
      await adminForm.getByRole('button', { name: '배송지 저장' }).click();
      await expect(adminPage.getByRole('status').filter({ hasText: '배송지를 바꿨습니다' })).toBeVisible();

      /*
       * **마지막 문.** 누르면 물건이 그 주소로 떠난다 — 목록의 표시와 위의 안내를 지나쳐 왔다면 여기서
       * 멈춘다. 여기서는 확인까지만 보고 등록하지는 않는다(등록하면 오배송을 실제로 만든다).
       *
       * 송장 칸은 배송 준비부터 선다(core 의 canRegisterShipment) — 결제완료에서 배송중으로 가는
       * 길은 없다. 그 한 걸음을 먼저 옮긴다.
       */
      const moved = await adminPage.request.post(`/api/admin/orders/${orderNo}/status`, {
        data: { to: 'PREPARING' },
      });
      expect(moved.ok(), `배송 준비로 옮기지 못했다 (${moved.status()})`).toBe(true);
      await adminPage.goto(`/admin/orders/${orderNo}`);
      await ready(adminPage);

      await adminPage.getByLabel(/송장번호/).fill('123456789012');
      await adminPage.getByRole('button', { name: '송장 등록하고 배송 시작' }).click();
      const ask = adminPage.getByRole('group', { name: '배송지가 바뀐 주문입니다' });
      await expect(ask).toBeVisible();
      await expect(ask, '무엇을 붙이려는지 되읽어 준다').toContainText('1234-5678-9012');
      await ask.getByRole('button', { name: '취소' }).click();
      await expect(adminPage.getByRole('button', { name: '송장 등록하고 배송 시작' })).toBeVisible();

      // 남의 주소를 대신 바꾼 일이라 누가 무엇을 무엇으로 바꿨는지 남는다
      await adminPage.goto('/admin/audit');
      await ready(adminPage);
      const log = adminPage.getByRole('region', { name: '관리자 동작 기록' });
      await expect(log.getByRole('cell', { name: '배송지 수정', exact: true }).first()).toBeVisible();

      // 운영자가 고친 줄도 그 주문의 처리 이력에 남는다
      await adminPage.goto(`/admin/orders/${orderNo}`);
      await ready(adminPage);
      await expect(adminPage.getByRole('table', { name: '주문 상태 변경 이력' }))
        .toContainText('배송지 변경 (운영) — 받는 분');
    }

    // 손님 화면에도 운영자가 고친 값이 그대로 보인다 — 두 창구가 같은 주문을 본다
    await page.reload();
    await ready(page);
    await expect(page.getByText('장부장')).toBeVisible();
  } finally {
    await undoOrderAsAdmin(admin, orderNo);
    await admin.close();
  }
});
