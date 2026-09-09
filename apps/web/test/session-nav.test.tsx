// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => {
  const state: { data: unknown; isPending: boolean } = { data: null, isPending: false };
  return state;
});
vi.mock('@shop/auth/client', () => ({
  authClient: { useSession: () => session },
  signOutEverywhere: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { SessionNav } = await import('~/components/session-nav');

const signedIn = (role: string) => {
  session.data = { user: { name: '장이든', role } };
  session.isPending = false;
};

const door = () => screen.queryByRole('link', { name: /페이지$/ });

beforeEach(() => {
  session.data = null;
  session.isPending = false;
});

describe('운영 화면으로 가는 문', () => {
  it('손님에게는 없다', () => {
    signedIn('CUSTOMER');
    render(<SessionNav />);
    expect(screen.queryByRole('link', { name: '관리자 페이지' })).toBeNull();
  });

  it('로그인하지 않았으면 없다', () => {
    render(<SessionNav />);
    expect(door()).toBeNull();
  });

  for (const [role, label] of [
    ['ADMIN', '관리자 페이지'],
    ['SUPER_ADMIN', '슈퍼관리자 페이지'],
    ['MERCHANT', '가맹점 페이지'],
  ] as const) {
    it(`${role} 에게는 있다 — 주소를 외워 치게 하지 않는다`, () => {
      signedIn(role);
      render(<SessionNav />);

      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', '/admin');
    });
  }

  it('모바일 메뉴에서도 같은 문을 낸다 — 좁은 화면이 이등 시민이 아니다', () => {
    signedIn('ADMIN');
    render(<SessionNav variant="menu" />);

    expect(screen.getByRole('link', { name: '관리자 페이지' })).toHaveAttribute('href', '/admin');
  });
});
