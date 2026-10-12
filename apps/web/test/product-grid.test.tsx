// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won } from '@shop/core';
import type { ProductListItem } from '~/lib/queries/catalog/shelf';

/**
 * 상품 격자 — **목록 화면 넷이 함께 쓰는 배선.**
 *
 * 검사가 한 줄도 없었다. 카드 자체가 무엇을 그리는지는 `@shop/ui` 의 검사가 보고, 여기서 보는
 * 것은 **격자가 카드에 무엇을 넘기는가**다. 그 배선이 조용히 틀리는 모양이 둘 있다.
 *
 * 하나는 **찜을 카드마다 묻는 것**: 한 번에 가져오게 모아 두었는데 되돌아가면 상품 수만큼 질의가
 * 나간다. 서른넷이면 서른네 번이고, 화면은 똑같이 그려진다.
 *
 * 다른 하나는 **미리 받기**다. 격자가 화면 맨 위가 아니면 0 이어야 하는데(홈은 배너가 먼저다)
 * 넉 장을 미리 받기 목록에 올리고 있었다 — 배너와 대역폭을 나눠 쓰면서 정작 화면에는 안 보이는
 * 것들이다. 그것도 눈으로는 안 보인다.
 */

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));
const getWishlistedIds = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/wishlist/wishlist', () => ({ getWishlistedIds }));
vi.mock('~/lib/i18n/server', () => ({ getLocale: async () => 'ko' }));

/** 카드는 자기 검사가 있다(@shop/ui) — 여기서는 넘겨받은 값만 드러낸다 */
vi.mock('@shop/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shop/ui')>()),
  ProductCard: (props: Record<string, any>) => (
    <div
      data-card={props.name}
      data-href={props.href}
      data-priority={String(props.imagePriority)}
      data-sold-out={String(props.soldOut)}
      data-has-image={String(props.image !== undefined)}
      data-tone={props.placeholderTone}
      data-footer={props.footer ? 'yes' : 'no'}
    >
      {props.wishlistButton}
    </div>
  ),
}));
vi.mock('~/components/wishlist-button', () => ({
  WishlistButton: (props: Record<string, any>) => (
    <span data-wish={props.productId} data-on={String(props.initialWishlisted)} data-logged-in={String(props.loggedIn)} />
  ),
}));
vi.mock('~/components/compare-toggle', () => ({ CompareToggle: () => <span data-compare="yes" /> }));

const { ProductGrid } = await import('~/components/product-grid');

const item = (over: Partial<ProductListItem> = {}): ProductListItem => ({
  id: 'p-1', slug: 'wool-coat', brand: 'MOOR', categorySlug: 'outer',
  name: '울 코트', price: won(289_000), listPrice: won(413_000), discountPercent: 30,
  rating: 4.5, reviewCount: 12, soldOut: false, isNew: false,
  imageUrl: '/i/coat.webp', imageAlt: '울 코트', blurDataUrl: undefined,
  ...over,
});

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => item({ id: `p-${i}`, slug: `s-${i}`, name: `상품 ${i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue({ id: 'u-1' });
  getWishlistedIds.mockResolvedValue(new Set<string>());
});

const open = async (props: Record<string, unknown> = {}) =>
  render(await ProductGrid({ products: [item()], ...props }));

const cards = () => [...document.querySelectorAll('[data-card]')];

describe('찜 여부는 한 번에 가져온다', () => {
  it('상품이 서른넷이어도 한 번만 묻는다', async () => {
    await open({ products: many(34) });

    expect(getWishlistedIds).toHaveBeenCalledTimes(1);
    expect(getWishlistedIds.mock.calls[0]![1]).toHaveLength(34);
  });

  it('찜한 것만 눌린 상태로 내려간다', async () => {
    getWishlistedIds.mockResolvedValue(new Set(['p-1']));

    await open({ products: [item({ id: 'p-1' }), item({ id: 'p-2', slug: 'other', name: '니트' })] });

    expect(document.querySelector('[data-wish="p-1"]')?.getAttribute('data-on')).toBe('true');
    expect(document.querySelector('[data-wish="p-2"]')?.getAttribute('data-on')).toBe('false');
  });

  /** 비로그인에게는 찜이 없다 — 물으면 빈 답을 받으려고 질의만 한 번 나간다 */
  it('비로그인이면 아예 묻지 않는다', async () => {
    getViewer.mockResolvedValue(null);

    await open();

    expect(getWishlistedIds).not.toHaveBeenCalled();
    expect(document.querySelector('[data-wish]')?.getAttribute('data-logged-in')).toBe('false');
  });

  it('상품이 없으면 빈 격자다 — 질의도 빈 목록으로 한 번', async () => {
    await open({ products: [] });

    expect(cards()).toHaveLength(0);
    expect(screen.getByRole('list')).toBeDefined();
  });
});

/**
 * **미리 받기는 화면의 가장 큰 그림 하나를 위한 것이지, 목록이 아니다.**
 */
describe('미리 받을 사진', () => {
  it('앞의 넉 장만 미리 받는다', async () => {
    await open({ products: many(6) });

    expect(cards().map((c) => c.getAttribute('data-priority')))
      .toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
  });

  it('0 을 주면 한 장도 미리 받지 않는다 — 격자가 맨 위가 아닌 화면', async () => {
    await open({ products: many(6), priorityCount: 0 });

    expect(cards().every((c) => c.getAttribute('data-priority') === 'false')).toBe(true);
  });

  it('상품보다 큰 수를 줘도 있는 만큼만이다', async () => {
    await open({ products: many(2), priorityCount: 10 });

    expect(cards()).toHaveLength(2);
    expect(cards().every((c) => c.getAttribute('data-priority') === 'true')).toBe(true);
  });
});

describe('비교 담기', () => {
  /** 훑어보는 목록에만 붙인다 — 홈의 추천 줄까지 체크박스를 깔면 화면이 조작 장치로 덮인다 */
  it('받을 때만 카드에 붙는다', async () => {
    await open({ compare: true });

    expect(cards()[0]?.getAttribute('data-footer')).toBe('yes');
  });

  it('기본은 붙이지 않는다', async () => {
    await open();

    expect(cards()[0]?.getAttribute('data-footer')).toBe('no');
  });
});

describe('카드에 넘기는 값', () => {
  it('주소는 slug 로 짓는다', async () => {
    await open();

    expect(cards()[0]?.getAttribute('data-href')).toBe('/product/wool-coat');
  });

  it('품절은 그대로 넘긴다 — 격자가 판단하지 않는다', async () => {
    await open({ products: [item({ soldOut: true })] });

    expect(cards()[0]?.getAttribute('data-sold-out')).toBe('true');
  });

  /** 사진은 주소와 대체글이 **둘 다** 있을 때만 사진이다 — 반쪽이면 자리표시자가 맞다 */
  it.each([
    ['둘 다 있으면 사진', { imageUrl: '/i/a.webp', imageAlt: '코트' }, 'true'],
    ['대체글이 없으면 자리표시자', { imageUrl: '/i/a.webp', imageAlt: undefined }, 'false'],
    ['주소가 없으면 자리표시자', { imageUrl: undefined, imageAlt: '코트' }, 'false'],
  ])('%s', async (_label, over, expected) => {
    await open({ products: [item(over)] });

    expect(cards()[0]?.getAttribute('data-has-image')).toBe(expected);
  });

  /** 자리표시자 색이 다 같으면 빈 격자가 한 덩어리로 보인다 — 돌려 쓴다 */
  it('자리표시자 색을 돌려 쓴다', async () => {
    await open({ products: many(6) });

    const tones = cards().map((c) => c.getAttribute('data-tone'));
    expect(new Set(tones).size).toBeGreaterThan(1);
    expect(tones[0]).toBe(tones[5]);
  });

  /** 이벤트 추적이 이 값으로 어느 상품을 눌렀는지 집는다 */
  it('줄마다 상품 id 를 적어 둔다', async () => {
    await open();

    expect(document.querySelector('li')?.getAttribute('data-product-id')).toBe('p-1');
  });
});

describe('격자', () => {
  it('목록이다 — 낭독기가 몇 개인지 말할 수 있다', async () => {
    await open({ products: many(3) });

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('열 수는 받은 값으로 바뀐다', async () => {
    await open({ columns: 'lg:grid-cols-5' });

    expect(screen.getByRole('list').className).toContain('lg:grid-cols-5');
  });
});
