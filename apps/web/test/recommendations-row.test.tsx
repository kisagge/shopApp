// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won } from '@shop/core';
import { createTranslator } from '@shop/i18n/all';
import { readFileSync } from 'node:fs';

const getRecommendations = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/catalog/recommend', () => ({ getRecommendations }));
vi.mock('~/lib/i18n/server', () => ({
  getLocale: async () => 'ko',
  getT: async () => createTranslator('ko'),
}));

/** 카드는 자기 검사가 있다(@shop/ui) — 여기서는 넘겨받은 값만 드러낸다 */
vi.mock('@shop/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shop/ui')>()),
  ProductCard: (props: Record<string, any>) => (
    <div
      data-card={props.name}
      data-href={props.href}
      data-sizes={props.imageSizes}
      data-has-image={String(props.image !== undefined)}
      data-sold-out={String(props.soldOut)}
    >
      {props.wishlistButton}
    </div>
  ),
}));

const { Recommendations } = await import('~/components/recommendations');

/**
 * 함께 본 상품 줄. **문장 일곱이 전부 안 돌았다.**
 *
 * 조회는 촘촘히 재고 있다(`recommendations` — 순서·매대 조건·자기 자신·창).
 * 비어 있던 것은 **그 결과를 어떻게 내놓는가** 이고, 거기 규칙이 둘 있다.
 *
 * **제목이 근거를 따라간다.** 함께 본 기록이 들어간 줄에만 "함께 본 상품" 이라고
 * 적는다 — 인기 상품으로 채운 줄에 그렇게 적으면 **사실이 아니다.**
 *
 * **한두 개짜리 줄은 내놓지 않는다.** 추천이 아니라 빈자리처럼 보인다.
 */

const item = (slug: string, over: Record<string, unknown> = {}) => ({
  slug, brand: 'MOOR', name: `상품 ${slug}`,
  price: won(289_000), listPrice: won(413_000), discountPercent: 30,
  rating: 4.5, reviewCount: 12, soldOut: false, isNew: false,
  imageUrl: '/i/a.webp', imageAlt: '사진', blurDataUrl: undefined,
  ...over,
});

const rows = (count: number, fromCoView = true) => ({
  items: Array.from({ length: count }, (_, i) => item(`p-${i + 1}`)),
  fromCoView,
});

const row = async (over: { productId?: string; categorySlug?: string } = {}) =>
  render(<>{await Recommendations({
    productId: 'p-main',
    categorySlug: 'outer',
    ...over,
  })}</>);

beforeEach(() => {
  vi.clearAllMocks();
  getRecommendations.mockResolvedValue(rows(4));
});

describe('제목이 근거를 따라간다', () => {
  it('함께 본 기록으로 채운 줄은 그렇게 적는다', async () => {
    getRecommendations.mockResolvedValue(rows(4, true));

    await row();

    expect(screen.getByRole('heading').textContent).toBe('함께 본 상품');
  });

  it('인기 상품으로 채운 줄에는 그렇게 적지 않는다 — 사실이 아니다', async () => {
    getRecommendations.mockResolvedValue(rows(4, false));

    await row();

    expect(screen.getByRole('heading').textContent).not.toBe('함께 본 상품');
    expect(screen.getByRole('heading').textContent).toBeTruthy();
  });
});

describe('한두 개짜리 줄은 내놓지 않는다', () => {
  it.each([[0], [1], [2]])('%i개면 이 절을 아예 세우지 않는다', async (count) => {
    getRecommendations.mockResolvedValue(rows(count));

    const { container } = await row();

    expect(container).toBeEmptyDOMElement();
  });

  it('넷이면 세운다', async () => {
    getRecommendations.mockResolvedValue(rows(4));

    await row();

    expect(screen.getByRole('region', { name: /함께 본/ })).toBeInTheDocument();
  });
});

describe('무엇을 카드에 넘기는가', () => {
  it('그 상품으로 가는 길을 넘긴다', async () => {
    getRecommendations.mockResolvedValue(rows(3));

    const { container } = await row();

    expect(container.querySelector('[data-card="상품 p-1"]')?.getAttribute('data-href'))
      .toBe('/product/p-1');
  });

  it('가로 한 칸의 폭에 맞춘 표시 크기를 넘긴다 — 어긋나면 최적화가 헛돈다', async () => {
    getRecommendations.mockResolvedValue(rows(3));

    const { container } = await row();

    expect(container.querySelector('[data-card]')?.getAttribute('data-sizes'))
      .toBe('(min-width: 768px) 200px, 160px');
  });

  it('사진이 없으면 사진 자리를 안 넘긴다 — 빈 주소를 넘기면 깨진 그림이 뜬다', async () => {
    getRecommendations.mockResolvedValue({
      items: [item('p-1', { imageUrl: null }), item('p-2'), item('p-3')],
      fromCoView: true,
    });

    const { container } = await row();

    expect(container.querySelector('[data-card="상품 p-1"]')?.getAttribute('data-has-image'))
      .toBe('false');
  });

  it('설명 없는 사진도 안 넘긴다 — 낭독기에 빈 그림이 선다', async () => {
    getRecommendations.mockResolvedValue({
      items: [item('p-1', { imageAlt: null }), item('p-2'), item('p-3')],
      fromCoView: true,
    });

    const { container } = await row();

    expect(container.querySelector('[data-card="상품 p-1"]')?.getAttribute('data-has-image'))
      .toBe('false');
  });

  it('품절도 그대로 알린다 — 감추면 눌러 보고 알게 된다', async () => {
    getRecommendations.mockResolvedValue({
      items: [item('p-1', { soldOut: true }), item('p-2'), item('p-3')],
      fromCoView: true,
    });

    const { container } = await row();

    expect(container.querySelector('[data-card="상품 p-1"]')?.getAttribute('data-sold-out'))
      .toBe('true');
  });
});

describe('찜 단추를 붙이지 않는다', () => {
  it('카드에 찜 자리를 넘기지 않는다', async () => {
    /*
     * 붙이려면 보는 사람이 누구인지 알아야 하고, 그러면 이 줄이 사람마다 달라져
     * **캐싱할 수 없게 된다.** 추천은 사람이 아니라 상품에 붙는 값이라 모두에게
     * 같아도 된다 — 그래서 이 줄은 보는 사람을 묻지 않는다.
     */
    getRecommendations.mockResolvedValue(rows(3));

    const { container } = await row();

    for (const card of container.querySelectorAll('[data-card]')) {
      expect(card.children).toHaveLength(0);
    }
  });

  it('보는 사람을 묻지 않는다 — 묻는 순간 캐싱이 깨진다', async () => {
    const source = readFileSync('src/components/recommendations.tsx', 'utf8');

    expect(source).not.toContain('getViewer');
    expect(source).not.toContain('wishlist');
  });
});

describe('몇 개를 묻는가', () => {
  it('한 줄에 그릴 만큼만 묻는다 — 더 받아 버리면 그만큼 헛일이다', async () => {
    await row();

    expect(getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p-main', categorySlug: 'outer', limit: 8 }),
    );
  });
});
