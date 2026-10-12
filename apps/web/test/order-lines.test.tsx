// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import type { OrderLine } from '~/app/(shop)/order/[orderNo]/order-lines';

/**
 * 주문 상품 줄 — **받은 물건을 확인하는 자리.**
 *
 * 검사가 한 줄도 없었다. 여기 적히는 것은 **산 그때의 값**이고(살아 있는 상품에서 다시 읽지 않는다),
 * 줄마다 지금 무슨 일이 걸려 있는지를 이름표로 말한다 — 취소됨·반품 진행 중·교환 진행 중·반품 환불.
 * 그 네 말이 섞이면 손님은 자기 물건이 어떤 상태인지 모른다.
 *
 * **흐리게만 하면 색을 못 보는 사람에게는 알 길이 없다.** 그래서 글자로도 적는다 — 그 약속을 여기서
 * 못 박는다. 후기로 가는 길은 core 가 정하고(`orderLineReviewLink`) 여기서는 그 답을 그린다.
 */

vi.mock('~/lib/i18n/server', async () => {
  const { createTranslator } = await import('@shop/i18n/all');
  const t = createTranslator('ko');
  return { getT: async () => t, getLocale: async () => 'ko' };
});

const { OrderLines } = await import('~/app/(shop)/order/[orderNo]/order-lines');

const line = (over: Partial<OrderLine> = {}): OrderLine =>
  ({
    id: 'i-1', canceledAt: null, status: 'DELIVERED',
    productName: '울 코트', brandName: 'MOOR', optionLabel: '오트 / M',
    imageUrl: '/i/coat.webp', quantity: 2, subtotal: 578_000,
    variant: { productId: 'p-1' }, review: null,
    ...over,
  });

const open = async (props: Record<string, unknown> = {}) =>
  render(await OrderLines({
    items: [line()],
    orderStatus: 'DELIVERED',
    productSlugs: new Map([['p-1', 'wool-coat']]),
    exchanging: false,
    ...props,
  }));

const row = () => screen.getAllByRole('listitem')[0]!;

describe('줄에 적는 것', () => {
  it('브랜드·상품명·옵션·수량·금액을 적는다', async () => {
    await open();

    expect(within(row()).getByText('MOOR')).toBeDefined();
    expect(within(row()).getByText('울 코트')).toBeDefined();
    expect(row().textContent).toContain('오트 / M');
    expect(row().textContent).toContain('2');
    expect(row().textContent).toContain('578,000');
  });

  it('몇 줄인지 제목에 적는다', async () => {
    await open({ items: [line(), line({ id: 'i-2', productName: '니트' })] });

    expect(screen.getByRole('region', { name: /주문 상품/ }).textContent).toContain('2');
  });

  /**
   * **주문에 박아 둔 사진이다.** 살아 있는 상품에서 다시 읽지 않는다 — 상품이 바뀌거나 지워져도
   * 산 것은 그대로 남아야 한다. 사진은 이름 옆의 장식이라 낭독기에서는 숨긴다.
   */
  it('사진은 낭독기에서 숨긴다 — 이름이 이미 글자로 있다', async () => {
    await open();

    expect(row().querySelector('[aria-hidden="true"] img, img[aria-hidden="true"]')).not.toBeNull();
  });

  it('사진이 없으면 자리도 만들지 않는다', async () => {
    await open({ items: [line({ imageUrl: null })] });

    expect(row().querySelector('img')).toBeNull();
  });
});

/**
 * **산 물건의 화면으로 간다.** 다시 사거나 설명을 다시 보려면 검색부터 해야 했다.
 */
describe('상품으로 가는 길', () => {
  it('매대에 있으면 링크를 건다', async () => {
    await open();

    expect(within(row()).getByRole('link', { name: '울 코트' }).getAttribute('href'))
      .toBe('/product/wool-coat');
  });

  /** 내린 상품은 404 로 끝나는 막다른 길이다 — 이름만 적는다 */
  it('내린 상품이면 링크를 걸지 않는다', async () => {
    await open({ productSlugs: new Map() });

    expect(within(row()).queryByRole('link', { name: '울 코트' })).toBeNull();
    expect(within(row()).getByText('울 코트')).toBeDefined();
  });

  it('이름은 주문에 박힌 그때의 이름이다 — 지금 상품명이 아니다', async () => {
    await open({ items: [line({ productName: '옛 이름 코트' })] });

    expect(within(row()).getByRole('link', { name: '옛 이름 코트' })).toBeDefined();
  });
});

/**
 * **흐리게만 하면 색을 못 보는 사람에게는 취소됐는지 알 길이 없다.** 네 말이 각각 다른 일을 가리킨다.
 */
describe('줄에 걸린 일을 글자로 말한다', () => {
  const mark = () => within(row()).queryByText(/취소됨|반품 환불|반품 진행 중|교환 진행 중/);

  it('아무 일도 없으면 이름표가 없다 — 늘 붙어 있으면 아무도 안 본다', async () => {
    await open();

    expect(mark()).toBeNull();
  });

  it('취소된 줄은 "취소됨"', async () => {
    await open({ items: [line({ canceledAt: new Date('2026-10-01T00:00:00+09:00'), status: 'CANCELLED' })] });

    expect(mark()?.textContent).toBe('취소됨');
  });

  it('반품 신청 중인 줄은 "반품 진행 중"', async () => {
    await open({ items: [line({ status: 'RETURN_REQUESTED' })] });

    expect(mark()?.textContent).toBe('반품 진행 중');
  });

  /** 같은 상태라도 걸린 신청이 교환이면 다른 말이어야 한다 — 손님은 교환을 신청했다 */
  it('교환이 걸려 있으면 "교환 진행 중"', async () => {
    await open({ items: [line({ status: 'RETURN_REQUESTED' })], exchanging: true });

    expect(mark()?.textContent).toBe('교환 진행 중');
  });

  /**
   * 줄만 환불된 것과 주문 전체가 환불된 것은 다르다. 주문이 통째로 환불됐으면 큰 제목이 이미 그
   * 말을 하므로 줄마다 되풀이하지 않는다.
   */
  it('줄만 환불됐으면 "반품 환불"', async () => {
    await open({
      items: [line({ canceledAt: new Date('2026-10-01T00:00:00+09:00'), status: 'REFUNDED' })],
      orderStatus: 'DELIVERED',
    });

    expect(mark()?.textContent).toBe('반품 환불');
  });

  it('주문 전체가 환불됐으면 줄에는 "취소됨" 만 적는다', async () => {
    await open({
      items: [line({ canceledAt: new Date('2026-10-01T00:00:00+09:00'), status: 'REFUNDED' })],
      orderStatus: 'REFUNDED',
    });

    expect(mark()?.textContent).toBe('취소됨');
  });
});

/**
 * **주문을 보다가 후기로 간다.** 받은 물건을 확인하는 자리가 후기를 떠올리는 자리인데, 다른 메뉴에서
 * 그 줄을 다시 찾아야 했다. 갈 수 있는지는 core 가 정하고(`orderLineReviewLink`) 여기서는 그린다.
 */
describe('후기로 가는 길', () => {
  const link = () => within(row()).queryByRole('link', { name: /후기/ });

  it('배송완료면 쓰러 가는 길을 둔다', async () => {
    await open({ orderStatus: 'DELIVERED' });

    expect(link()?.getAttribute('href')).toBe('/mypage/reviews#review-item-i-1');
  });

  /** "후기 쓰기" 가 여럿이면 어느 것인지 모른다 — 링크 이름에 상품명을 붙인다 */
  it('링크 이름에 상품명이 붙는다', async () => {
    await open();

    expect(link()?.textContent).toContain('울 코트');
  });

  it('이미 쓴 줄은 고치러 가는 길이다', async () => {
    await open({ items: [line({ review: { id: 'r-9', deletedAt: null } })] });

    expect(link()?.getAttribute('href')).toBe('/mypage/reviews/r-9/edit');
    expect(link()?.textContent).toContain('고치기');
  });

  it('아직 못 받은 주문에는 길이 없다', async () => {
    await open({ orderStatus: 'PREPARING' });

    expect(link()).toBeNull();
  });

  /** 취소한 줄에는 쓸 후기가 없다 — 그 물건을 받지 않았다 */
  it('취소된 줄에는 길이 없다', async () => {
    await open({ items: [line({ canceledAt: new Date('2026-10-01T00:00:00+09:00') })] });

    expect(link()).toBeNull();
  });

  it('지운 후기가 있던 줄에는 다시 쓰는 길도 없다', async () => {
    await open({
      items: [line({ review: { id: 'r-9', deletedAt: new Date('2026-10-02T00:00:00+09:00') } })],
    });

    expect(link()).toBeNull();
  });
});

describe('구조', () => {
  it('제목이 붙은 구역이고, 줄은 목록이다', async () => {
    await open({ items: [line(), line({ id: 'i-2' })] });

    expect(screen.getByRole('region', { name: /주문 상품/ })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
