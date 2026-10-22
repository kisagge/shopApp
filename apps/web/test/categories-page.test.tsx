// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';

const getCategoryTree = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/catalog/products', () => ({ getCategoryTree }));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));

const Page = (await import('~/app/(shop)/categories/page')).default;

/**
 * 갈래 전체 화면.
 *
 * 머리와 발은 최상위만 보여 준다 — 하위 갈래로 가는 길이 상품 화면의 이동 경로뿐이었다.
 * 이 화면이 그 길을 연다. 빈 갈래를 거르는 것은 조회의 몫이고(category-tree 검사),
 * 여기서는 **길이 실제로 나 있는지**와 **수를 적는지**를 본다.
 */

const tree = [
  { slug: 'outer', name: '아우터', count: 5, children: [{ slug: 'coat', name: '코트', count: 3 }] },
  { slug: 'knit', name: '니트', count: 2, children: [] },
];

const open = async () => render(await Page());

beforeEach(() => {
  vi.clearAllMocks();
  getCategoryTree.mockResolvedValue(tree);
});

describe('갈래 전체', () => {
  it('제목이 그 갈래로 가는 길이다 — 상위 갈래에도 상품이 달린다', async () => {
    await open();

    const heading = screen.getByRole('heading', { level: 2, name: /아우터/ });
    expect(within(heading).getByRole('link', { name: '아우터' })).toHaveAttribute(
      'href', '/category/outer',
    );
  });

  it('하위 갈래로 가는 길을 함께 연다 — 여기가 이 화면의 요점이다', async () => {
    await open();

    expect(screen.getByRole('link', { name: /코트/ })).toHaveAttribute('href', '/category/coat');
  });

  it('갈래마다 몇 개가 있는지 적는다', async () => {
    // 수가 없으면 눌러 보고 나서야 알게 된다
    await open();

    expect(screen.getByRole('heading', { level: 2, name: /아우터/ }).textContent).toContain('상품 5개');
    expect(screen.getByRole('link', { name: /코트/ }).textContent).toContain('상품 3개');
  });

  it('자식이 없으면 빈 목록을 두지 않는다', async () => {
    await open();

    const knit = screen.getByRole('heading', { level: 2, name: /니트/ }).closest('li');
    expect(knit?.querySelector('ul')).toBeNull();
  });

  it('아무것도 없으면 그 사실을 말하고 갈 곳을 준다', async () => {
    // 빈 화면만 두면 "안 불러와진 것" 과 구분되지 않는다
    getCategoryTree.mockResolvedValue([]);

    await open();

    expect(screen.getByText('아직 보여 줄 카테고리가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 상품 보기' })).toHaveAttribute('href', '/search');
  });

  it('화면의 제목은 하나다', async () => {
    // 갈래마다 h2 를 쓴다 — 전부 h1 이면 낭독기에 주제가 여럿으로 들린다
    await open();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
