// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { EmptyResults } from '~/components/empty-results';

/**
 * 결과가 없는 목록.
 *
 * "검색 결과가 없습니다" 와 한 줄 안내가 전부라, 다음에 할 수 있는 일은 뒤로 가기뿐이었다. 그 자리에서 갈 곳을 준다.
 */

const t = createTranslator('ko');
const categories = [{ slug: 'outer', name: '아우터' }, { slug: 'knit', name: '니트' }];

describe('갈 곳', () => {
  it('고른 조건이 있으면 조건만 지운 주소로 가는 링크를 둔다', () => {
    render(
      <EmptyResults
        t={t}
        title="검색 결과가 없습니다"
        reason="고른 색상·사이즈·브랜드를 줄여 보세요."
        clearHref={{ pathname: '/search', query: { q: '코트' } }}
        categories={categories}
      />,
    );

    expect(screen.getByRole('link', { name: '조건 지우고 다시 보기' })).toHaveAttribute('href', '/search?q=%EC%BD%94%ED%8A%B8');
  });

  it('고른 조건이 없으면 지울 링크를 두지 않는다 — 누르면 같은 화면이다', () => {
    render(<EmptyResults t={t} title="없음" reason="다른 검색어" clearHref={null} categories={categories} />);
    expect(screen.queryByRole('link', { name: '조건 지우고 다시 보기' })).toBeNull();
  });

  it('인기 검색어와 카테고리로 가는 길을 이름 붙은 묶음으로 둔다', () => {
    render(
      <EmptyResults t={t} title="없음" reason="다른 검색어" clearHref={null} popular={['니트', '코트']} categories={categories} />,
    );

    const popular = screen.getByRole('navigation', { name: '인기 검색어' });
    expect(within(popular).getByRole('link', { name: '니트' })).toHaveAttribute('href', '/search?q=%EB%8B%88%ED%8A%B8');
    const browse = screen.getByRole('navigation', { name: '카테고리 둘러보기' });
    expect(within(browse).getByRole('link', { name: '아우터' })).toHaveAttribute('href', '/category/outer');
  });

  it('권할 것이 없으면 빈 묶음을 그리지 않는다', () => {
    render(<EmptyResults t={t} title="없음" reason="없음" clearHref={null} categories={[]} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('제목 단계', () => {
  it('검색 화면에서는 h2, 안의 묶음은 h3 다', () => {
    render(<EmptyResults t={t} title="검색 결과가 없습니다" reason="…" clearHref={null} popular={['코트']} categories={categories} />);
    expect(screen.getByRole('heading', { level: 2, name: '검색 결과가 없습니다' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '인기 검색어' })).toBeInTheDocument();
  });

  it('목록의 h2 아래에 놓이면 h3, 안의 묶음은 h4 다 — 단계를 건너뛰지 않는다', () => {
    render(<EmptyResults t={t} level={3} title="조건에 맞는 상품이 없습니다" reason="…" clearHref={null} categories={categories} />);
    expect(screen.getByRole('heading', { level: 3, name: '조건에 맞는 상품이 없습니다' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: '카테고리 둘러보기' })).toBeInTheDocument();
  });

  it('상자의 이름은 제목이다', () => {
    render(<EmptyResults t={t} title="검색 결과가 없습니다" reason="…" clearHref={null} categories={[]} />);
    expect(screen.getByRole('region', { name: '검색 결과가 없습니다' })).toBeInTheDocument();
  });
});
