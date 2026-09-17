// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const social = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { signIn: { social } } }));

const isNativeShell = vi.hoisted(() => vi.fn<() => boolean>());
const nativeGoogleIdToken = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/native', () => ({ isNativeShell, nativeGoogleIdToken }));

const { GoogleButton } = await import('~/components/google-button');

const NATIVE_IDS = { webClientId: 'web-1', iosClientId: 'ios-1' };

beforeEach(() => {
  vi.clearAllMocks();
  social.mockResolvedValue({ error: null });
  isNativeShell.mockReturnValue(false);
  nativeGoogleIdToken.mockResolvedValue('jwt-1');
  vi.stubGlobal('location', { assign: vi.fn() });
});

describe('돌아갈 곳', () => {
  /*
   * next 는 주소에 실린 값이다. 한동안 그대로 location.assign 과 callbackURL 에 넘겨서,
   * `?next=https://다른곳` 링크로 우리 로그인 화면을 거쳐 남의 사이트로 보낼 수 있었다.
   */
  it('우리 사이트 안의 경로면 로그인 뒤 거기로 간다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton next="/checkout?now=1" />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    expect(social.mock.calls[0]![0].callbackURL).toBe('/checkout?now=1');
  });

  it.each(['https://evil.test', '//evil.test'])('%s 는 받지 않고 홈으로 보낸다', async (next) => {
    const user = userEvent.setup();
    render(<GoogleButton next={next} />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    expect(social.mock.calls[0]![0].callbackURL).toBe('/');
  });

  it('앱에서도 걸러서 연다', async () => {
    const user = userEvent.setup();
    isNativeShell.mockReturnValue(true);
    render(<GoogleButton next="https://evil.test" nativeIds={NATIVE_IDS} />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    await vi.waitFor(() => expect(location.assign).toHaveBeenCalledWith('/'));
  });
});

describe('구글 버튼', () => {
  it('이름은 글자가 준다 — 로고만으로는 읽히지 않는다', () => {
    render(<GoogleButton />);

    const button = screen.getByRole('button', { name: '구글로 계속하기' });
    // 로고는 장식이라 접근성 트리에 없어야 한다
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('실패하면 우리 화면으로 돌아오게 한다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    // 인증 서버 기본 오류 화면은 우리 것이 아니고 다음 행동도 못 알려 준다
    expect(social).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      errorCallbackURL: '/login',
    }));
  });

  it('원래 가려던 곳이 있으면 그리로 돌려보낸다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton next="/checkout" />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    expect(social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: '/checkout' }));
  });

  it('가려던 곳이 없으면 홈으로 보낸다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    expect(social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: '/' }));
  });

  it('누르면 진행 중임을 알린다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    // 구글로 넘어가기까지 시간이 걸린다. 아무 반응이 없으면 다시 누른다.
    expect(screen.getByRole('button', { name: '이동 중…' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('앱에서는 브라우저로 넘기지 않는다', () => {
  it('네이티브면 ID 토큰을 받아 그 자리에서 로그인한다', async () => {
    // 웹뷰 안에서 구글 OAuth 를 열면 "안전하지 않은 브라우저" 로 끝난다
    isNativeShell.mockReturnValue(true);
    const user = userEvent.setup();
    render(<GoogleButton nativeIds={NATIVE_IDS} />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    await waitFor(() => expect(social).toHaveBeenCalledWith({
      provider: 'google',
      idToken: { token: 'jwt-1' },
    }));
    // 이동(callbackURL)을 쓰지 않는다
    expect(social.mock.calls[0]?.[0]).not.toHaveProperty('callbackURL');
  });

  it('셸이어도 ID 가 없으면 웹 방식으로 간다', async () => {
    isNativeShell.mockReturnValue(true);
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    await waitFor(() => expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/' }),
    ));
    expect(nativeGoogleIdToken).not.toHaveBeenCalled();
  });

  it('브라우저에서는 네이티브 경로를 타지 않는다', async () => {
    const user = userEvent.setup();
    render(<GoogleButton nativeIds={NATIVE_IDS} />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    expect(nativeGoogleIdToken).not.toHaveBeenCalled();
  });

  it('취소하면 로그인된 척하지 않고 알린다', async () => {
    isNativeShell.mockReturnValue(true);
    nativeGoogleIdToken.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<GoogleButton nativeIds={NATIVE_IDS} />);

    await user.click(screen.getByRole('button', { name: '구글로 계속하기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('실패'));
    expect(social).not.toHaveBeenCalled();
  });
});
