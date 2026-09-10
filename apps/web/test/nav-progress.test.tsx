// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

/**
 * 누른 것을 곧바로 알린다.
 *
 * **폰에서 재 보니 0.9~1.5초 동안 아무 일도 안 일어났다.** 홈에서 상품을
 * 누르면 주소조차 안 바뀐 채 홈이 그대로 떠 있다가 갑자기 상세로 바뀐다.
 * 서버가 느린 것이 아니다 — 상품 상세의 첫 바이트는 /api/health 와 같다.
 * 시간은 110KB 를 받아 그리는 데 들고, 그동안 화면이 조용하다.
 *
 * **loading.tsx 로는 못 고친다.** 그것을 두면 없는 상품 주소가 200 으로
 * 나가는 가짜 404 가 된다(streaming-boundaries 검사가 막고 있다). 그래서
 * 경로가 아니라 **누름**에 붙인다.
 */

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLinkStatus: () => linkStatus,
}));

const { AppLink } = await import('~/components/app-link');

describe('이동 중 표시', () => {
  it('가만히 있을 때는 아무것도 그리지 않는다', () => {
    linkStatus.pending = false;
    render(<AppLink href="/product/x">코트</AppLink>);
    expect(document.querySelector('.nav-progress')).toBeNull();
  });

  it('이동이 진행 중이면 띠가 뜬다', () => {
    linkStatus.pending = true;
    render(<AppLink href="/product/x">코트</AppLink>);
    expect(document.querySelector('.nav-progress')).not.toBeNull();
  });

  /**
   * **링크 안에 두면 자리가 어긋난다.**
   *
   * `position: fixed` 는 조상에 `transform` 이나 `backdrop-filter` 가 있으면
   * 화면이 아니라 그 조상을 기준으로 삼는다. 비교함 띠가 `backdrop-blur` 를
   * 쓰는데, 그 안의 '견주어보기' 를 누르자 띠가 화면 맨 위가 아니라
   * **비교함을 가로질러** 그려졌다. 링크가 어디에 살든 같아야 한다.
   */
  it('링크 안이 아니라 body 에 그린다 — 조상이 자리를 가로채지 못하게', () => {
    linkStatus.pending = true;
    const { container } = render(<AppLink href="/product/x">코트</AppLink>);

    expect(container.querySelector('.nav-progress'), '링크 안에 있으면 안 된다').toBeNull();
    const bar = document.querySelector('.nav-progress');
    expect(bar).not.toBeNull();
    expect(bar?.parentElement).toBe(document.body);
  });

  it('띠는 낭독기에 읽히지 않는다 — 경로 알림이 이미 말한다', () => {
    linkStatus.pending = true;
    render(<AppLink href="/product/x">코트</AppLink>);
    expect(document.querySelector('.nav-progress')).toHaveAttribute('aria-hidden', 'true');
  });

  it('링크의 글자는 그대로다 — 띠가 이름에 섞이지 않는다', () => {
    linkStatus.pending = true;
    render(<AppLink href="/product/x">코트</AppLink>);
    expect(screen.getByRole('link').textContent).toBe('코트');
  });
});
