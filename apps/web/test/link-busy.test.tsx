// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

/**
 * 누른 그 자리에서 "가는 중" 을 알린다.
 *
 * **리뷰 정렬을 누르면 아무 일도 안 일어나 보였다.** 서버가 그 조각을 다시
 * 그리는 동안 화면은 옛 목록을 그대로 보여 준다 — 폰에서 재 보니 2초가
 * 넘도록 변화가 없었다.
 *
 * Suspense 뼈대로는 안 된다. React 는 라우터 전환 중에 **이미 있는 내용을
 * 뼈대로 바꾸지 않는다** — 경계에 `key` 를 걸어 봐도 마찬가지였고, 그림으로
 * 확인하고 되돌렸다. 그래서 링크 쪽에서 말한다.
 */

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '/x'}>{children}</a>
  ),
  useLinkStatus: () => linkStatus,
}));

const { LinkBusy } = await import('~/components/link-busy');

describe('누른 자리의 표시', () => {
  it('가만히 있을 때는 아무것도 그리지 않는다', () => {
    linkStatus.pending = false;
    const { container } = render(<LinkBusy />);
    expect(container.querySelector('.link-busy')).toBeNull();
  });

  it('이동이 진행 중이면 뜬다', () => {
    linkStatus.pending = true;
    const { container } = render(<LinkBusy />);
    expect(container.querySelector('.link-busy')).not.toBeNull();
  });

  it('낭독기에는 읽히지 않는다 — 경로 알림이 이미 말한다', () => {
    linkStatus.pending = true;
    const { container } = render(<LinkBusy />);
    expect(container.querySelector('.link-busy')).toHaveAttribute('aria-hidden', 'true');
  });

  it('링크 이름에 섞이지 않는다 — 탭 이름이 "도움순 로딩" 이 되면 안 된다', () => {
    linkStatus.pending = true;
    render(
      <a href="/x">
        도움순
        <LinkBusy />
      </a>,
    );
    expect(screen.getByRole('link').textContent).toBe('도움순');
  });
});
