// @vitest-environment jsdom
import { render, screen, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { translatorFor } from '@shop/i18n';
import { ko } from '@shop/i18n/messages/ko';
import { OrderReceipt, type ReceiptOrder } from '~/components/order-receipt';
import { PrintButton } from '~/components/print-button';

/**
 * 주문 영수증.
 *
 * 금액 계산은 core(receiptTotals)가 본다. 여기서 보는 것은 **종이에 찍혀도 뜻이 남는가**다 — 표의 머리칸이
 * 이어져 있는지, 취소된 줄이 색이 아니라 글자로 적히는지, 결제 금액을 줄여 적지 않는지.
 */
const t = translatorFor('ko', ko);

const base: ReceiptOrder = {
  orderNo: '20260914-1234567',
  status: 'PAID',
  placedAt: new Date('2026-09-14T01:00:00Z'),
  paidAt: new Date('2026-09-14T01:02:00Z'),
  listTotal: 100_000,
  productDiscount: 10_000,
  couponDiscount: 0,
  pointsUsed: 1_000,
  shippingFee: 0,
  payable: 89_000,
  payment: { method: 'CARD' },
  refunds: [],
  items: [
    { id: 'i1', productName: '울 코트', brandName: '무어', optionLabel: '오트 / M', unitPrice: 59_000, quantity: 1, subtotal: 59_000, canceledAt: null, status: 'PAID' },
    { id: 'i2', productName: '울 비니', brandName: '무어', optionLabel: '차콜', unitPrice: 15_000, quantity: 2, subtotal: 30_000, canceledAt: null, status: 'PAID' },
  ],
};

const draw = (order: ReceiptOrder = base) =>
  render(<OrderReceipt order={order} locale="ko" t={t} issuedAt={new Date('2026-09-15T00:00:00Z')} />);

const valueOf = (label: string) => {
  const dt = screen.getAllByRole('term').find((el) => el.textContent === label);
  return dt?.nextElementSibling?.textContent;
};

describe('주문 영수증', () => {
  it('제목·주문번호·결제 수단·시각을 적는다 — 시각은 기계가 읽을 값도 함께', () => {
    draw();
    expect(screen.getByRole('heading', { level: 1, name: '주문 영수증' })).toBeTruthy();
    expect(screen.getByRole('article', { name: '주문 영수증' })).toBeTruthy();
    expect(valueOf('주문번호')).toBe('20260914-1234567');
    expect(valueOf('결제 수단')).toBe('신용·체크카드');
    expect(document.querySelector('time[datetime="2026-09-14T01:02:00.000Z"]')).not.toBeNull();
  });

  it('상품 표는 캡션과 열 머리·행 머리를 갖는다 — 낭독기가 "수량 2" 처럼 읽는다', () => {
    draw();
    const table = screen.getByRole('table', { name: '주문 상품' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['상품', '수량', '단가', '금액']);
    const beanie = within(table).getByRole('row', { name: /울 비니/ });
    expect(within(beanie).getByRole('rowheader').textContent).toContain('차콜');
    expect(within(beanie).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '15,000원', '30,000원']);
  });

  it('할인은 빼기 부호로 적는다 — 흑백으로 찍혀도 뺀 돈인지 안다', () => {
    draw();
    expect(valueOf('상품 할인')).toBe('-10,000원');
    expect(valueOf('포인트 사용')).toBe('-1,000원');
    expect(valueOf('결제 금액')).toBe('89,000원');
  });

  it('돌려준 게 없으면 "실제 결제 금액" 줄을 두지 않는다 — 같은 숫자가 두 번 찍힌다', () => {
    draw();
    expect(screen.queryByText('실제 결제 금액')).toBeNull();
  });

  it('일부 취소하면 그 줄에 글자로 적고, 결제 금액은 그대로 두고 돌려준 돈과 실제 낸 돈을 따로 적는다', () => {
    draw({
      ...base,
      items: [{ ...base.items[0]!, canceledAt: new Date(), status: 'CANCELLED' }, base.items[1]!],
      refunds: [{ amount: 59_000, points: 0, shippingDeducted: 0 }],
    });
    expect(screen.getByRole('row', { name: /울 코트/ }).textContent).toContain('(취소됨)');
    expect(screen.getByRole('row', { name: /울 비니/ }).textContent).not.toContain('취소');
    expect(valueOf('결제 금액')).toBe('89,000원');
    expect(valueOf('돌려받은 금액')).toBe('-59,000원');
    expect(valueOf('실제 결제 금액')).toBe('30,000원');
  });

  it('세금계산서·현금영수증이 아니라고 적는다', () => {
    draw();
    expect(screen.getByText(/세금계산서나 현금영수증을 대신하지 않습니다/)).toBeTruthy();
  });
});

describe('인쇄 단추', () => {
  it('누르면 브라우저 인쇄 창을 열고, 인쇄물에는 찍히지 않는다', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    render(<PrintButton />);
    const button = screen.getByRole('button', { name: '인쇄하기' });
    expect(button.className).toContain('print:hidden');
    await userEvent.setup().click(button);
    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
