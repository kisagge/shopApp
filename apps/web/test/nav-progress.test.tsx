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
    const { container } = render(<AppLink href="/product/x">코트</AppLink>);
    expect(container.querySelector('.nav-progress')).toBeNull();
  });

  it('이동이 진행 중이면 띠가 뜬다', () => {
    linkStatus.pending = true;
    const { container } = render(<AppLink href="/product/x">코트</AppLink>);
    expect(container.querySelector('.nav-progress')).not.toBeNull();
  });

  it('띠는 낭독기에 읽히지 않는다 — 경로 알림이 이미 말한다', () => {
    linkStatus.pending = true;
    const { container } = render(<AppLink href="/product/x">코트</AppLink>);
    expect(container.querySelector('.nav-progress')).toHaveAttribute('aria-hidden', 'true');
  });

  it('링크의 글자는 그대로다 — 띠가 이름에 섞이지 않는다', () => {
    linkStatus.pending = true;
    render(<AppLink href="/product/x">코트</AppLink>);
    expect(screen.getByRole('link').textContent).toBe('코트');
  });
});
