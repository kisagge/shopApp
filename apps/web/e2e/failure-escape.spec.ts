import { test, expect, type Page, type Route } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, ready } from './state';

/**
 * **창구가 실패했을 때 손님이 빠져나갈 수 있는가.**
 *
 * 화면 검사 94개 중 창구를 실패시켜 보는 것이 **하나뿐이었다**(결제 승인 거절). 그런데
 * 이 저장소에서 되풀이된 결함이 바로 거기다:
 *
 *   - 배송지를 못 불러오면 **영원히 "불러오는 중"** 이었고 빠져나갈 단추도 없었다
 *   - 결제 금액이 없는 까닭이 둘(묻는 중·못 받았다)인데 **하나로 보였다**
 *   - 주문하기가 실패하면 단추가 **"주문 처리 중…" 으로 멈췄다**
 *
 * 셋 다 고쳤고 단위 검사가 붙들고 있다. 그런데 **단위 검사는 조각을 따로 그린다** —
 * 진짜 화면에서 그 자리에 닿을 수 있는지, 닿았을 때 누를 것이 있는지는 보지 않는다.
 * 배송지 결함이 정확히 그 틈에 있었다: 오류를 그리는 코드는 있었고 **그 위의 이른 반환이
 * 가로막아** 닿지 못했다.
 *
 * 그래서 여기서는 **요청을 가로채 실패를 만들고**, 손님이 쓰는 길로 빠져나가 본다.
 */
test.use({ storageState: STATE_FILE.failureEscaper });
// 서버 장바구니는 계정에 하나뿐이다 — 이 파일 안에서도 한 번에 하나씩 돈다
test.describe.configure({ mode: 'serial' });

/** 그 주소로 가는 요청을 한 번 깨뜨린다. 본문은 비워 둔다 — 화면의 기본 문구를 보려고 */
const breakOnce = (page: Page, pattern: string) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  { times: 1 });

/** 장바구니에 하나 담고 결제 화면까지 */
async function toCheckout(page: Page): Promise<void> {
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await ready(page);
}

/**
 * **실패를 로딩으로 보여 주지 않는다.**
 *
 * 목록을 못 불러오면 목록은 `null` 인 채로 남는데, 예전에는 그 자리가 "불러오는 중" 을
 * 돌려줬다. 오류를 그리는 자리는 목록과 함께 아래에 있어서 **영영 닿지 못했다** — 못
 * 불러온 사람은 기다리는 화면을 보고, 취소도 그 아래에 있어 **빠져나갈 길조차 없었다.**
 */
test('배송지를 못 불러오면 그렇게 말하고, 다시 시도·취소를 준다', async ({ page }) => {
  await toCheckout(page);

  await breakOnce(page, '**/api/addresses');
  // 기본 배송지가 있으면 고르는 자리는 "변경" 뒤에 있다
  await page.getByRole('button', { name: '변경' }).click();

  const alert = page.getByRole('alert').filter({ hasText: '배송지를 불러오지 못했습니다' });
  await expect(alert).toBeVisible();
  // 기다리는 화면이 아니다 — 이것이 그 결함의 모양이었다
  await expect(page.getByText('불러오는 중')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '취소' })).toBeVisible();

  // 가로채기는 한 번뿐이다 — 다시 시도하면 이번에는 온다
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await expect(alert).toHaveCount(0);
});

/**
 * **금액이 없는 까닭은 둘이다.** 아직 묻는 중인 것과 못 받아 온 것. 하나로 보이면 손님은
 * 기다리면 된다고 여기고, 운영자는 "금액이 안 뜬다" 는 문의를 받는다.
 *
 * 금액을 모르면 **주문 단추도 열리지 않는다** — 서버가 계산하지 않은 값으로 주문하는 셈이다.
 */
test('금액을 못 불러오면 그렇게 적고, 주문 단추를 열지 않는다', async ({ page }) => {
  await addFirstProductToCart(page);
  // 견적은 화면이 뜰 때 바로 묻는다 — 가기 전에 깨뜨린다
  await page.route('**/api/cart/quote', (route: Route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));

  await page.goto('/checkout');
  await ready(page);

  await expect(page.getByRole('alert').filter({ hasText: '금액을 불러오지 못했습니다' })).toBeVisible();
  // 금액이 없으니 단추에 금액도 없고, 눌러도 되지 않는다
  const submit = page.getByRole('button', { name: '주문하기' });
  await expect(submit).toBeVisible();
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
});

/**
 * **보내는 중 표시는 풀려야 한다.**
 *
 * 주문하기가 실패했는데 단추가 "주문 처리 중…" 으로 남으면, 손님은 기다리다 새로
 * 고치고 — 그때 주문이 이미 만들어졌는지 알 수 없다. 말하고, 다시 누를 수 있어야 한다.
 */
test('주문하기가 실패하면 말하고, 다시 누를 수 있다', async ({ page }) => {
  await toCheckout(page);
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();

  const pay = page.getByRole('button', { name: /원 결제하기/ });
  await expect(pay).toBeVisible();

  await breakOnce(page, '**/api/orders');
  await pay.click();

  await expect(page.getByRole('alert').filter({ hasText: '주문에 실패했습니다' })).toBeVisible();
  // "주문 처리 중…" 에서 돌아왔다 — 멈춰 있으면 이 단추가 보이지 않는다
  await expect(pay).toBeVisible();
  await expect(page.getByText('주문 처리 중…')).toHaveCount(0);
});

/**
 * **쓴 글은 남아야 한다.**
 *
 * 문의는 사람이 **글을 쓰고** 누르는 일이다. 실패했는데 글까지 지우면 다시 쓰게 된다 —
 * 그러느라 그만두는 사람도 있다.
 *
 * 이 폼에는 결함이 있었다: 실패하면 경고 자리에 `support.submit`, 곧 **'문의 보내기'**
 * (단추 이름)가 떴다. 단위 검사가 그 고침을 붙들지만, **진짜 화면에서 그 경고에 닿는지**
 * 는 보지 않는다 — 배송지 결함이 정확히 그 틈이었다.
 */
test('문의를 보내지 못하면 말하고, 쓴 글은 남는다', async ({ page }) => {
  await page.goto('/support/ask');
  await ready(page);

  const content = page.getByLabel('문의 내용');
  await content.fill('배송이 3일째 멈춰 있습니다.');

  await breakOnce(page, '**/api/inquiries');
  await page.getByRole('button', { name: '문의 보내기' }).click();

  await expect(page.getByRole('alert').filter({ hasText: '문의를 보내지 못했습니다' })).toBeVisible();
  // 단추 이름이 오류 자리에 오지 않는다 — 그것이 그 결함의 모양이었다
  await expect(page.getByRole('alert').filter({ hasText: /^문의 보내기$/ })).toHaveCount(0);
  // 접수했다고도 하지 않는다
  await expect(page.getByText('문의를 접수했습니다', { exact: false })).toHaveCount(0);
  await expect(content).toHaveValue('배송이 3일째 멈춰 있습니다.');
});

/**
 * **지우지 못했으면 줄이 남아 있어야 하고, 그렇다고 말해야 한다.**
 *
 * 배송지 지우기는 한 번 더 묻고 보낸다. 거기서 실패했는데 아무 말이 없으면 **줄은 그대로
 * 남아 있는데** 사람은 지워진 줄 알고 나간다 — 다음에 와서 그 주소를 보고 지웠는지
 * 안 지웠는지 헷갈린다.
 */
test('배송지를 지우지 못하면 말하고, 그 줄은 남는다', async ({ page }) => {
  await page.goto('/mypage/addresses');
  await ready(page);

  const rows = page.getByRole('listitem');
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: /님의 배송지 삭제$/ }).first().click();
  await breakOnce(page, '**/api/addresses/*');
  await page.getByRole('button', { name: /님의 배송지 삭제 확인$/ }).first().click();

  await expect(page.getByRole('alert').filter({ hasText: '배송지를 지우지 못했습니다' })).toBeVisible();
  await expect(rows).toHaveCount(before);
});

/**
 * **적은 값은 남아야 한다.**
 *
 * 회원정보는 이름과 연락처뿐이지만, 실패했는데 칸을 비우면 다시 적게 된다. 그리고
 * **"저장했다" 고 말하지 않는 것**이 함께 중요하다 — 둘 다 말하면 사람은 저장된 줄 안다.
 */
test('회원정보를 저장하지 못하면 말하고, 적은 값은 남는다', async ({ page }) => {
  await page.goto('/mypage/account');
  await ready(page);

  const phone = page.getByLabel(/^연락처/);
  await phone.fill('01099998888');

  await breakOnce(page, '**/api/account/profile');
  await page.getByRole('button', { name: '저장' }).click();

  await expect(page.getByRole('alert').filter({ hasText: '회원정보를 저장하지 못했습니다' })).toBeVisible();
  await expect(phone).toHaveValue('01099998888');
  // 저장되지 않았으니 저장했다고 하지 않는다
  await expect(page.getByText('회원정보를 저장했습니다', { exact: false })).toHaveCount(0);
});

/**
 * **낙관적으로 칠한 하트는 실패하면 되돌아와야 하고, 왜인지 보여야 한다.**
 *
 * 누르는 순간 하트를 칠해 두고 서버에 보낸다(기다리게 하면 느린 화면이 된다). 실패하면
 * 되돌리는데, **예전에는 이유가 `sr-only` 에만 있었다** — 눈으로 보는 사람에게는 하트가
 * 깜빡이고 원래대로 돌아간 것이 전부였다. 로그인이 풀렸는지, 망이 끊겼는지, 다시 누르면
 * 되는지 알 방법이 없었다.
 *
 * 그 고침이 **진짜 화면에서 보이는지**가 여기서 볼 것이다 — 단위 검사는 조각을 따로
 * 그리므로 상품 화면의 그 자리에 닿는지는 보지 않는다.
 */
test('찜하기가 실패하면 하트가 되돌아오고, 그 자리에 이유가 보인다', async ({ page }) => {
  await page.goto('/product/nylon-coach-blouson');
  await ready(page);

  const add = page.getByRole('button', { name: /찜하기$/ }).first();
  await expect(add).toBeVisible();

  await breakOnce(page, '**/api/wishlist/*');
  await add.click();

  await expect(page.getByRole('alert').filter({ hasText: '처리하지 못했습니다' })).toBeVisible();
  // 하트가 되돌아왔다 — 찜한 것으로 남아 있으면 안 한 것을 했다고 보이는 셈이다
  await expect(page.getByRole('button', { name: /찜하기$/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /찜 해제$/ })).toHaveCount(0);
});
