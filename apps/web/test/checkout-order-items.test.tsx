// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect } from 'vitest';
import { LINE_ISSUE, type LineIssue } from '@shop/core';
import type { CartQuoteLine, CartQuoteResponse } from '@shop/contract';
import type { CartItem } from '~/stores/cart';
import { OrderItems } from '~/components/checkout/order-items';

/**
 * 결제 직전에 **무엇을 사는지 다시 보여 주는 자리.**
 *
 * 검사가 한 줄도 없었다. `checkout-form` 검사가 화면째로 그리면서 간접으로 밟기는 했지만,
 * 이 칸이 어느 수와 어느 금액을 짝지어 보여 주는지는 아무도 못 박지 않았다.
 *
 * **그래서 조용히 어긋나 있었다.** 수량은 장바구니가 들고 있던 값(요청한 수)인데 옆의 금액은
 * 견적이 셈한 값(재고에 맞춰 줄인 수)이다. "재고가 부족해 수량을 줄였습니다" 라고 적힌 줄에
 * 3 과 2개분 금액이 나란히 섰다 — 그 문장이 가리키는 바로 그 수만 안 고쳐져 있었다.
 * 타입 검사도 axe 도 통과한다. 두 수가 다른 곳에서 와서 둘 다 숫자이기 때문이다.
 */

const item = (over: Partial<CartItem> = {}): CartItem => ({
  variantId: 'v-1',
  productId: 'p-1',
  productName: '코튼 트윌 와이드 팬츠',
  brand: 'PLAIN',
  optionLabel: 'M',
  listPrice: 89_000,
  salePrice: 71_200,
  quantity: 3,
  selected: true,
  ...over,
});

const quoteLine = (over: Partial<CartQuoteLine> = {}): CartQuoteLine => ({
  variantId: 'v-1',
  productSlug: 'cotton-twill-wide-pants',
  productName: '코튼 트윌 와이드 팬츠',
  brandName: 'PLAIN',
  optionLabel: 'M',
  imageUrl: null,
  imageAlt: null,
  blurDataUrl: null,
  listPrice: 89_000,
  unitPrice: 71_200,
  discountPercent: 20,
  quantity: 3,
  requestedQuantity: 3,
  subtotal: 213_600,
  stock: 10,
  issue: null,
  ...over,
});

const quote = (...lines: CartQuoteLine[]): CartQuoteResponse =>
  ({ lines }) as CartQuoteResponse;

const money = (won: number) => `${won.toLocaleString('ko-KR')}원`;

const open = (items: CartItem[], q: CartQuoteResponse | undefined) =>
  render(<OrderItems items={items} quote={q} money={money} />);

/** 그 상품 줄 하나 — 사진·이름·수량·금액이 한 묶음이다 */
const row = (name: string) => screen.getByText(name).closest('li')!;

describe('무엇을 사는지', () => {
  it('브랜드·이름·옵션을 적는다', () => {
    open([item()], quote(quoteLine()));

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('PLAIN')).toBeDefined();
    expect(within(line).getByText(/M ·/)).toBeDefined();
  });

  it('줄 수를 제목에 적는다 — 몇 개를 사는지 세지 않아도 되게', () => {
    open([item(), item({ variantId: 'v-2', productName: '울 니트' })], quote(quoteLine()));

    expect(within(screen.getByRole('heading')).getByText('2')).toBeDefined();
  });

  /**
   * **담을 때 본 것과 같은 사진이라야 대조가 된다.** 그래서 장바구니가 들고 있는 값이 아니라
   * 견적이 준 주소를 쓴다 — 담아 둔 사이에 상품 사진이 바뀌었을 수 있다.
   */
  it('사진은 견적이 준 것을 쓴다', () => {
    open(
      [item({ imageUrl: '/old.jpg' })],
      quote(quoteLine({ imageUrl: '/new.jpg' })),
    );

    expect(screen.getByRole('presentation', { hidden: true }).getAttribute('src'))
      .toContain('new.jpg');
  });

  /** 사진을 아직 안 올린 상품이 있다. 빈 상자를 두면 무엇이 올 자리인지 모른다. */
  it('사진이 없으면 자리를 만들지 않는다', () => {
    open([item()], quote(quoteLine({ imageUrl: null })));

    expect(screen.queryAllByRole('presentation', { hidden: true })).toEqual([]);
  });
});

/**
 * **이 화면에서 수량과 금액은 반드시 같은 것을 가리켜야 한다.**
 *
 * 둘은 다른 곳에서 온다 — 수량은 브라우저의 장바구니, 금액은 서버의 견적. 어긋나도 둘 다
 * 숫자라 아무 검사도 지지 않는다. 돈을 내기 직전 화면이라 여기서 어긋나면 사람은 멈춘다.
 */
describe('수량과 금액이 같은 것을 가리킨다', () => {
  it('문제가 없으면 담은 수를 그대로 적는다', () => {
    open([item({ quantity: 3 })], quote(quoteLine({ quantity: 3, subtotal: 213_600 })));

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('3')).toBeDefined();
    expect(within(line).getByText('213,600원')).toBeDefined();
  });

  /*
   * 여기가 고장이 있던 자리다. 3 을 담았고 재고가 2 라, 견적은 2개분(142,400원)을 셈하면서
   * "수량을 줄였습니다" 라고 알린다. 그런데 수량 칸은 3 이었다.
   */
  it('재고에 맞춰 줄었으면 줄어든 수와 그 금액이 함께 선다', () => {
    open(
      [item({ quantity: 3 })],
      quote(quoteLine({ quantity: 2, requestedQuantity: 3, subtotal: 142_400, stock: 2, issue: 'STOCK_REDUCED' })),
    );

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('142,400원')).toBeDefined();
    // 요청한 수만 적으면 금액과 어긋나고, 줄어든 수만 적으면 무엇이 깎였는지 모른다
    expect(within(line).getByText('3→2')).toBeDefined();
    expect(within(line).queryByText('3')).toBeNull();
  });

  it('줄였다고 말하면서 안 줄인 수를 보여 주지 않는다', () => {
    open(
      [item({ quantity: 9 })],
      quote(quoteLine({ quantity: 1, requestedQuantity: 9, subtotal: 71_200, stock: 1, issue: 'STOCK_REDUCED' })),
    );

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('재고가 부족해 수량을 줄였습니다')).toBeDefined();
    expect(line.textContent).toContain('9→1');
  });

  /** 품절·판매 종료는 한 개도 안 들어간다. 담은 수를 그대로 두면 "3개 삽니다" 로 읽힌다. */
  it.each([
    ['품절', 'SOLD_OUT'],
    ['판매 종료', 'NOT_FOUND'],
    ['판매 중지', 'INACTIVE'],
  ] as const)('%s 이면 0 을 적는다 — 금액도 0 이다', (_why, issue) => {
    open(
      [item({ quantity: 3 })],
      quote(quoteLine({ quantity: 0, requestedQuantity: 3, subtotal: 0, stock: 0, issue })),
    );

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('0')).toBeDefined();
    expect(within(line).getByText('0원')).toBeDefined();
  });

  /** 견적이 아직 안 왔으면 장바구니의 수가 우리가 가진 유일한 수다 */
  it('견적이 오기 전에는 담은 수를 적고 금액은 비워 둔다', () => {
    open([item({ quantity: 3 })], undefined);

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('3')).toBeDefined();
    expect(within(line).getByText('—')).toBeDefined();
  });

  /** 견적에 그 줄이 빠져 있는 경우(새로 담은 직후). 0 을 적으면 "안 산다" 는 거짓말이 된다. */
  it('견적에 아직 그 줄이 없으면 담은 수를 적는다', () => {
    open([item({ variantId: 'v-2', quantity: 4 })], quote(quoteLine({ variantId: 'v-1' })));

    const line = row('코튼 트윌 와이드 팬츠');
    expect(within(line).getByText('4')).toBeDefined();
    expect(within(line).getByText('—')).toBeDefined();
  });
});

/**
 * **문제는 그 줄 자리에서 말한다.** 위쪽에 한 줄로 모아 두면 어느 상품 이야기인지 알 수 없다.
 */
describe('줄마다 무엇이 잘못됐는지', () => {
  it.each(LINE_ISSUE)('%s 에 사람이 읽을 문장이 있다', (issue: LineIssue) => {
    open([item()], quote(quoteLine({ quantity: 0, issue })));

    const said = screen.getByRole('status').textContent ?? '';
    // 코드가 그대로 새어 나오면 손님은 'STOCK_REDUCED' 를 읽게 된다
    expect(said).not.toContain(issue);
    expect(said.length).toBeGreaterThan(0);
  });

  it('문제가 없으면 아무 말도 하지 않는다 — 늘 뜨는 알림은 읽히지 않게 된다', () => {
    open([item()], quote(quoteLine({ issue: null })));

    expect(screen.queryByRole('status')).toBeNull();
  });

  /** 두 줄이 있으면 문제가 난 줄에만 붙어야 한다 */
  it('문제가 난 줄에만 붙는다', () => {
    open(
      [item(), item({ variantId: 'v-2', productName: '울 니트' })],
      quote(
        quoteLine({ issue: null }),
        quoteLine({ variantId: 'v-2', productName: '울 니트', quantity: 0, issue: 'SOLD_OUT' }),
      ),
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(within(row('울 니트')).getByRole('status')).toBeDefined();
  });
});

describe('빈 주문서', () => {
  it('담긴 것이 없으면 줄도 없다 — 제목은 0 이다', () => {
    open([], quote());

    expect(within(screen.getByRole('heading')).getByText('0')).toBeDefined();
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
