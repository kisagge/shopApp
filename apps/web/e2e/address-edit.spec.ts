import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 배송지 고치기 — 지우고 다시 넣지 않고 그 줄을 고친다.
 *
 * 규칙(자기 것만, 도서산간 다시 판정, 기본 여부 유지)은 단위 검사가 본다. 여기서 보는 것은 사람이 받는 결과다: 수정을
 * 누르면 그 줄이 채워진 폼이 되고, 우편번호를 제주로 고치면 추가 배송비가 붙고, 저장하면 새로 고쳐도 남고, 기본 표시는
 * 그대로다. 그리고 키보드로 이어 쓸 수 있게 초점이 그 줄의 수정 단추로 돌아온다.
 *
 * 자기 손님(addressEditor)을 쓴다 — 주문 명세들이 기대는 기본 배송지를 건드리지 않는다. 끝나면 지운다.
 */

test.use({ storageState: STATE_FILE.addressEditor });

test('수정을 누르면 채워진 폼이 되고, 우편번호를 고치면 도서산간이 다시 판정되고, 새로 고쳐도 남는다', async ({ page }) => {
  test.setTimeout(60_000);

  // 앞선 실행이 남긴 배송지를 지운다
  const list = (await (await page.request.get('/api/addresses')).json()) as { addresses: { id: string }[] };
  for (const a of list.addresses) await page.request.delete(`/api/addresses/${a.id}`);

  await page.goto('/mypage/addresses');
  await ready(page);

  // ── 하나 넣는다(배송지가 없으면 폼이 열려 있다)
  const newForm = page.getByRole('region', { name: '새 배송지' });
  await newForm.getByLabel(/받는 분/).fill('주소 검사');
  await newForm.getByLabel(/휴대폰 번호/).fill('010-0000-2003');
  await newForm.getByLabel(/우편번호/).fill('04766');
  await newForm.getByLabel(/^주소/).fill('서울 성동구 왕십리로 1');
  await newForm.getByLabel(/상세 주소/).fill('101호');
  await newForm.getByRole('button', { name: '배송지 저장' }).click();
  const edit = page.getByRole('button', { name: '주소 검사 님의 배송지 수정' });
  await expect(edit).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/도서산간 추가 배송비/)).toHaveCount(0);

  // ── 고친다: 그 줄이 지금 값으로 채운 폼이 된다
  await edit.click();
  const form = page.getByRole('region', { name: '주소 검사 님의 배송지 수정' });
  await expect(form.getByLabel(/받는 분/)).toHaveValue('주소 검사');
  await expect(form.getByLabel(/상세 주소/)).toHaveValue('101호');
  await expect(form.getByText('이미 주문한 건의 배송지는 바뀌지 않습니다.', { exact: false })).toBeVisible();

  await form.getByLabel(/우편번호/).fill('63309');
  await form.getByLabel(/^주소/).fill('제주 제주시 첨단로 1');
  await form.getByLabel(/상세 주소/).fill('202호');
  await form.getByRole('button', { name: '고친 내용 저장' }).click();

  // 초점이 그 줄의 수정 단추로 돌아오고, 고친 값·도서산간·기본 표시가 보인다
  await expect(edit).toBeFocused({ timeout: 15_000 });
  const row = page.getByRole('listitem').filter({ has: edit });
  await expect(row).toContainText('제주 제주시 첨단로 1 202호');
  await expect(row).toContainText('도서산간 추가 배송비');
  await expect(row.getByText('기본', { exact: true })).toBeVisible();

  // ── 새로 고쳐도 남는다 — 한 줄뿐이다(지우고 다시 넣은 것이 아니다)
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: /님의 배송지 수정$/ })).toHaveCount(1);
  await expect(page.getByText('제주 제주시 첨단로 1 202호')).toBeVisible();

  // 뒷정리
  await page.getByRole('button', { name: '주소 검사 님의 배송지 삭제' }).click();
  await expect(edit).toHaveCount(0, { timeout: 15_000 });
});
