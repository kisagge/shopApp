// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';

const { PageNav } = await import('~/app/admin/page-nav');

/**
 * 쪽 번호 — « ‹ 1 2 3 4 5 › »
 *
 * 운영 목록은 훑고 처리하는 자리라 "더 보기" 로만 내려가면 일곱 쪽 뒤로 가려고 여섯 번을 눌러야 한다.
 */

const nav = (page: number, total = 250) =>
  render(
    <PageNav
      page={page}
      total={total}
      pageSize={25}
      hrefOf={(n) => ({ pathname: '/admin/orders' as const, query: { page: String(n) } })}
    />,
  );

describe('쪽 번호', () => {
  it('지금 쪽을 가운데 두고 다섯을 그린다', () => {
    nav(5);
    for (const n of [3, 4, 5, 6, 7]) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
  });

  it('지금 쪽은 링크가 아니고, 그 사실을 말한다', () => {
    /*
     * 굵게만 그리면 그건 눈으로만 보이는 상태다. 같은 자리로 가는 링크를 두면 낭독기는 갈 곳이 있는 것처럼 읽는다.
     */
    nav(5);
    const here = screen.getByText('5');
    expect(here.getAttribute('aria-current')).toBe('page');
    expect(here.tagName).not.toBe('A');
  });

  it('다른 쪽은 링크이고 어디로 가는지 이름이 붙는다', () => {
    nav(5);
    const third = screen.getByRole('link', { name: '3쪽' });
    expect(third.getAttribute('href')).toContain('page=3');
  });

  it('첫 쪽에서는 앞으로 가는 화살표가 링크가 아니다', () => {
    // 눌러도 같은 자리로 오는 링크는 탭 순서에 쓸모없는 정거장을 만든다
    nav(1);
    expect(screen.queryByRole('link', { name: '첫 쪽' })).toBeNull();
    expect(screen.queryByRole('link', { name: '이전 쪽' })).toBeNull();
    expect(screen.getByRole('link', { name: '다음 쪽' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '마지막 쪽' })).toBeInTheDocument();
  });

  it('마지막 쪽에서는 뒤로 가는 화살표가 링크가 아니다', () => {
    nav(10);
    expect(screen.queryByRole('link', { name: '다음 쪽' })).toBeNull();
    expect(screen.getByRole('link', { name: '첫 쪽' })).toBeInTheDocument();
  });

  it('한 쪽뿐이면 아무것도 그리지 않는다 — 늘 같은 자리로 가는 번호 하나는 길이 아니다', () => {
    const { container } = nav(1, 10);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('쪽 이동이라는 이름이 붙은 길이다', () => {
    nav(3);
    expect(screen.getByRole('navigation', { name: '쪽 이동' })).toBeInTheDocument();
  });

  it('첫 쪽 링크에는 page 를 싣지 않는다 — 주소가 두 벌이 되면 같은 화면이 둘이 된다', () => {
    nav(3);
    const first = screen.getByRole('link', { name: '첫 쪽' });
    expect(first.getAttribute('href')).toBe('/admin/orders?page=1');
  });
});
