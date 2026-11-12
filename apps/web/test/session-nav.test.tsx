// @vitest-environment jsdom
import { act, render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

/**
 * 셸 여부를 검사마다 바꾼다 — 브라우저에서는 네이티브 보정이 돌지 않고, 앱에서만
 * 돈다. 기본은 브라우저다(아래 기존 검사들이 그 전제로 쓰였다).
 */
const shell = vi.hoisted(() => ({ native: false }));
vi.mock('@shop/native', () => ({ isNativeShell: () => shell.native }));

/**
 * 인증 SDK 는 `import()` 로만 불린다 — 브라우저 묶음에 안 들어가게 한 선택이고
 * `auth-client-boundary` 가 그 경계를 지킨다. 여기서는 그 안쪽을 갈아 끼운다.
 */
const auth = vi.hoisted(() => ({
  signOutEverywhere: vi.fn<(...a: any[]) => any>(),
  authClient: { getSession: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/auth/client', () => auth);

beforeEach(() => {
  vi.clearAllMocks();
  shell.native = false;
  auth.signOutEverywhere.mockResolvedValue(undefined);
  auth.authClient.getSession.mockResolvedValue({ data: null });
});

const { SessionNav } = await import('~/components/session-nav');
type NavUser = Parameters<typeof SessionNav>[0]['user'];

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

describe('로그아웃', () => {
  /*
   * **모든 기기에서 끊는다.** 서버 세션을 지우고 기기에 들고 있던 토큰까지
   * 치우는 일은 `signOutEverywhere` 한 곳에 모여 있고(`sign-out-door` 가 그
   * 문과 그 안을 본다), 여기서 보는 것은 **이 자리가 그 문을 지나는가**다.
   */
  it('헤더에서 누르면 그 문을 지나고 화면을 다시 그린다', async () => {
    render(signedIn('CUSTOMER'));

    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(auth.signOutEverywhere).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('모바일 메뉴에서도 같은 문을 지난다 — 좁은 화면이 이등 시민이 아니다', async () => {
    render(<SessionNav user={{ id: 'u1', name: '장이든', role: 'CUSTOMER' }} variant="menu" />);

    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(auth.signOutEverywhere).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('앱에서 쿠키가 날아갔을 때의 보정', () => {
  /*
   * 웹뷰는 앱을 다시 띄울 때 쿠키를 잃는 경우가 있고, 그때 서버는 세션을 보지
   * 못한다. 앱은 그 대비로 토큰을 따로 들고 있어(Bearer) **앱에서만** 한 번 더
   * 물어 본다. 브라우저에서는 `import()` 자체가 일어나지 않는다 — 그래야 모든
   * 화면이 인증 SDK 12KB 를 받지 않는다.
   */
  const nativeBoard = (user: NavUser | null = null) => {
    shell.native = true;
    return render(<SessionNav user={user} />);
  };

  it('브라우저에서는 묻지 않는다', async () => {
    render(signedOut);

    await act(async () => {});
    expect(auth.authClient.getSession).not.toHaveBeenCalled();
  });

  it('서버가 이미 알아봤으면 앱에서도 묻지 않는다', async () => {
    nativeBoard({ id: 'u1', name: '장이든', role: 'CUSTOMER' });

    await act(async () => {});
    expect(auth.authClient.getSession).not.toHaveBeenCalled();
  });

  it('앱에서 서버가 못 알아봤으면 한 번 물어 그 사람으로 그린다', async () => {
    auth.authClient.getSession.mockResolvedValue({
      data: { user: { id: 'u9', name: '장보영', role: 'ADMIN' } },
    });
    nativeBoard();

    expect(await screen.findByText('장보영')).toBeInTheDocument();
    expect(auth.authClient.getSession).toHaveBeenCalledTimes(1);
  });

  it('세션이 없으면 로그인하라고 그대로 둔다', async () => {
    nativeBoard();

    await act(async () => {});
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  });

  it('id 가 없는 답은 사람으로 보지 않는다 — 이름만 든 답으로 로그인 상태를 만들지 않는다', async () => {
    auth.authClient.getSession.mockResolvedValue({ data: { user: { name: '누구' } } });
    nativeBoard();

    await act(async () => {});
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  });

  it('id 만 든 답으로는 운영 문이 열리지 않는다', async () => {
    /*
     * 이름과 역할이 없는 답이다. 역할의 기본값(`?? 'CUSTOMER'`)은 이 화면에서
     * **보이지 않는다** — 역할이 없는 것과 손님인 것이 똑같이 문을 닫기 때문이다
     * (돌연변이로 재 봤다). 여기서 못 박는 것은 그 문이 닫혀 있다는 사실이다.
     */
    auth.authClient.getSession.mockResolvedValue({ data: { user: { id: 'u9' } } });
    nativeBoard();

    await waitFor(() => expect(auth.authClient.getSession).toHaveBeenCalled());
    await act(async () => {});
    // 운영 콘솔로 가는 길이 없다 — 역할을 모르는 답으로 그 문을 열지 않는다
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
    expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  });

  it('날아간 보정의 늦은 답이 되살아나지 않는다 — 로그아웃한 사람이 다시 뜨면 안 된다', async () => {
    /*
     * **이 자리는 로그아웃에서 드러난다.** 앱이 묻는 중에 서버 세션이 도착하면
     * 보정은 버려지는데(`alive = false`), 그 뒤 로그아웃으로 세션이 사라지면
     * 화면은 다시 "로그인" 이어야 한다. 버리지 않으면 **늦게 온 옛 답이 그때
     * 상태로 들어가** 방금 나간 사람이 그대로 떠 있다.
     */
    let give!: (value: unknown) => void;
    auth.authClient.getSession.mockReturnValueOnce(new Promise((resolve) => { give = resolve; }));
    shell.native = true;
    const { rerender } = render(<SessionNav user={null} />);

    // 서버 세션이 도착했다 — 묻던 것은 버린다
    rerender(<SessionNav user={{ id: 'u1', name: '서버가 아는 사람', role: 'CUSTOMER' }} />);
    // 그 사람이 로그아웃했다 — 다시 물어 보고, 이번에는 아무도 없다
    rerender(<SessionNav user={null} />);

    await act(async () => {
      give({ data: { user: { id: 'u9', name: '나간 사람', role: 'ADMIN' } } });
    });

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByText('나간 사람')).toBeNull();
  });

  it('보정이 먼저 답했어도 서버가 알아본 사람이 앞선다', async () => {
    /*
     * **둘이 함께 차는 순서는 이것뿐이다.** 보정이 먼저 답해 그 사람으로 그려진
     * 뒤에 서버가 알아본 사람이 온다(앱에서 화면을 옮기면 그렇게 된다). 그때는
     * 서버 쪽이 참이다 — 보정은 서버가 못 알아봤을 때의 대비일 뿐이고, 둘이
     * 다르면 쿠키를 잃기 전의 옛 사람이 보정 쪽이다.
     */
    auth.authClient.getSession.mockResolvedValue({
      data: { user: { id: 'u9', name: '보정이 아는 사람', role: 'ADMIN' } },
    });
    shell.native = true;
    const { rerender } = render(<SessionNav user={null} />);

    expect(await screen.findByText('보정이 아는 사람')).toBeInTheDocument();

    rerender(<SessionNav user={{ id: 'u1', name: '서버가 아는 사람', role: 'CUSTOMER' }} />);

    expect(screen.getByText('서버가 아는 사람')).toBeInTheDocument();
    expect(screen.queryByText('보정이 아는 사람')).toBeNull();
  });
});
