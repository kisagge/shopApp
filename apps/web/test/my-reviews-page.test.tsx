// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';

/**
 * 내 리뷰 — **쓸 것과 쓴 것이 한 화면에 있다.**
 *
 * 목록이 둘이니 쪽도 둘이다. 그 둘이 한 칸(`?page=`)을 같이 쓰면 쓴 후기를 넘길 때 쓸 후기도
 * 함께 넘어가 버린다 — 쓰려고 열어 둔 폼이 사라지는 자리다. 그리고 한 화면에 쪽 이동이 둘인데
 * 이름이 같으면 낭독기에는 어느 목록의 것인지 없다.
 *
 * **쓸 것 목록은 50개에서 잘려 있었다.** 마이페이지 뱃지는 상한 없이 세어 "쓸 수 있는 후기
 * 63" 이라 적는데 들어오면 50개뿐이었다. 쪽으로 넘기고, 전체 수를 제목에 적는다.
 */

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); }));
vi.mock('next/navigation', () => ({ redirect }));

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));

const getReviewableItems = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getMyReviews = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/reviews', () => ({
  getReviewableItems, getMyReviews, MY_REVIEW_PAGE_SIZE: 20, MY_REVIEWABLE_PAGE_SIZE: 10,
}));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));
// 폼과 사진 올리기는 따로 받아 오는 무거운 조각이다 — 여기서 보는 것은 그 바깥이다
vi.mock('~/app/(shop)/mypage/reviews/review-form', () => ({ ReviewForm: () => <div /> }));

const Page = (await import('~/app/(shop)/mypage/reviews/page')).default;

const user = { id: 'u-1', role: 'CUSTOMER', merchantId: null, name: '손' };

const item = (id: string) => ({
  orderItemId: id, orderNo: '20260915-1234567', productSlug: 'wool-coat',
  productName: '울 코트', brandName: '무어', optionLabel: '오트 / M',
  imageUrl: null, deliveredAt: new Date('2026-09-10T00:00:00Z'),
});

const open = (params: Record<string, string> = {}) =>
  Page({ searchParams: Promise.resolve(params) }).then(render);

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue(user);
  getReviewableItems.mockResolvedValue({ items: [item('oi-1')], total: 63 });
  getMyReviews.mockResolvedValue({ items: [], total: 0 });
});

describe('쓸 후기 목록', () => {
  it('몇 개가 있는지 제목에 적는다 — 뱃지가 센 수가 이 수다', async () => {
    await open();
    const section = screen.getByRole('region', { name: /쓸 수 있는 상품/ });
    expect(section.textContent).toContain('63');
  });

  it('주소의 쪽을 그대로 조회에 넘긴다', async () => {
    await open({ writing: '3' });
    expect(getReviewableItems).toHaveBeenCalledWith(user, 3);
  });

  it('쪽이 없으면 첫 쪽이다', async () => {
    await open();
    expect(getReviewableItems).toHaveBeenCalledWith(user, 1);
  });

  it('이상한 쪽은 첫 쪽으로 본다', async () => {
    await open({ writing: '-2' });
    expect(getReviewableItems).toHaveBeenCalledWith(user, 1);
  });
});

describe('쪽 이동이 둘', () => {
  beforeEach(() => {
    getMyReviews.mockResolvedValue({ items: [], total: 40 });
  });

  it('이름이 서로 다르다 — 같으면 낭독기에 어느 목록인지 없다', async () => {
    await open();

    const navs = screen.getAllByRole('navigation', { name: /쪽 이동/ });
    const names = navs.map((n) => n.getAttribute('aria-label'));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.some((n) => n?.includes('쓸 수 있는 상품'))).toBe(true);
    expect(names.some((n) => n?.includes('내가 쓴 리뷰'))).toBe(true);
  });

  it('한쪽을 넘겨도 다른 쪽은 보던 자리에 남는다', async () => {
    /*
     * 한 칸을 같이 쓰면 쓴 후기를 넘길 때 쓸 후기가 1쪽으로 돌아간다 — 쓰려고 열어 둔
     * 폼이 사라지는 자리다.
     */
    await open({ writing: '2' });

    const written = screen.getByRole('navigation', { name: /내가 쓴 리뷰/ });
    const next = Array.from(written.querySelectorAll('a')).find((a) => a.textContent === '2');
    expect(next?.getAttribute('href')).toContain('writing=2');
    expect(next?.getAttribute('href')).toContain('page=2');
  });
});
