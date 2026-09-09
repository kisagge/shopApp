// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/** 브라우저에서는 네이티브 보정이 돌지 않는다 */
vi.mock('@shop/native', () => ({ isNativeShell: () => false }));

const { SessionNav } = await import('~/components/session-nav');

/**
 * **세션은 서버가 넘겨 준다.** 예전에는 이 검사가 `authClient.useSession()` 을
 * 갈아 끼웠는데, 그건 화면이 세션을 직접 묻던 시절의 모양이다.
 */
const signedIn = (role: string) => <SessionNav user={{ id: 'u1', name: '장이든', role }} />;
const signedOut = <SessionNav user={null} />;

const door = () => screen.queryByRole('link', { name: /페이지$/ });

describe('운영 화면으로 가는 문', () => {
  it('손님에게는 없다', () => {
    render(signedIn('CUSTOMER'));
    expect(screen.queryByRole('link', { name: '관리자 페이지' })).toBeNull();
  });

  it('로그인하지 않았으면 없다', () => {
    render(signedOut);
    expect(door()).toBeNull();
  });

  for (const [role, label] of [
    ['ADMIN', '관리자 페이지'],
    ['SUPER_ADMIN', '슈퍼관리자 페이지'],
    ['MERCHANT', '가맹점 페이지'],
  ] as const) {
    it(`${role} 에게는 있다 — 주소를 외워 치게 하지 않는다`, () => {
      render(signedIn(role));

      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', '/admin');
    });
  }

  it('모바일 메뉴에서도 같은 문을 낸다 — 좁은 화면이 이등 시민이 아니다', () => {
    render(<SessionNav user={{ id: 'u1', name: '장이든', role: 'ADMIN' }} variant="menu" />);

    expect(screen.getByRole('link', { name: '관리자 페이지' })).toHaveAttribute('href', '/admin');
  });
});
