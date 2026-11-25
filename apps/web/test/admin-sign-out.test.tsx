// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const signOutEverywhere = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('@shop/auth/client', () => ({ signOutEverywhere }));

const { AdminSignOut } = await import('~/components/admin-sign-out');

/**
 * 운영 화면의 로그아웃. **문장 일곱이 전부 안 돌았다.**
 *
 * 끊는 함수 자체는 잘 재고 있고(`sign-out-door` — 문을 지나는지, 서버가 실패해도
 * 토큰을 지우는지), **이 단추가** 그것을 부르는지는 아무도 보지 않았다.
 *
 * 그리고 거기 조용한 실패가 있었다: 끊는 쪽이 터지면 `router.push` 까지 못 가서
 * **아무 일도 안 일어났다.** 누른 사람은 나간 줄 알고 자리를 떠나는데 화면은 운영
 * 화면 그대로다 — 공용 기기에서 그것이 가장 나쁘다. 함께 고쳤다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  signOutEverywhere.mockResolvedValue(undefined);
});

const click = async () => {
  render(<AdminSignOut />);
  await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
};

describe('누르면', () => {
  it('두 곳을 다 끊는 문을 지난다 — 서버 세션만 끊으면 기기의 토큰이 남는다', async () => {
    await click();

    expect(signOutEverywhere).toHaveBeenCalledOnce();
  });

  it('끊은 뒤에 홈으로 보낸다 — 먼저 보내면 토큰이 남은 채로 화면만 바뀐다', async () => {
    const order: string[] = [];
    signOutEverywhere.mockImplementation(() => {
      order.push('cut');
      return Promise.resolve();
    });
    push.mockImplementation(() => void order.push('go'));

    await click();

    expect(order).toEqual(['cut', 'go']);
  });

  it('끊는 쪽이 터져도 이 화면을 떠난다 — 나간 줄 알고 떠나게 두지 않는다', async () => {
    /*
     * 공용 기기에서 가장 나쁜 모양이다. 문이 이미 "서버 쪽이 실패해도 토큰은
     * 지운다" 로 되어 있으니, 그 뜻을 화면에서도 잇는다.
     */
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    signOutEverywhere.mockRejectedValue(new Error('저장소가 막혔다'));

    await click();

    expect(push).toHaveBeenCalledWith('/');
    // 화면은 나가지만 못 끊은 까닭은 남는다 — 안 남기면 쫓을 길이 없다
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('받아 오는 때', () => {
  it('누르기 전에는 인증 SDK 를 부르지 않는다 — 모든 운영 화면이 그 무게를 지지 않게', async () => {
    /*
     * 이 단추는 운영 레이아웃에 있다. SDK 를 정적으로 들이면 **누르지 않는
     * 사람까지** gzip 12KB 를 더 받는다. 그래서 누른 순간에 받는다.
     */
    render(<AdminSignOut />);

    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  it('그 선언이 소스에 그대로 있다 — 정적으로 바뀌면 다시 무거워진다', () => {
    const source = readFileSync('src/components/admin-sign-out.tsx', 'utf8');

    expect(source).toContain("await import('@shop/auth/client')");
    expect(source).not.toMatch(/^import .*@shop\/auth\/client/m);
  });
});
