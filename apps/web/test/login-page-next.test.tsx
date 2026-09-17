// @vitest-environment jsdom
import { render } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 로그인 화면이 주소의 next 를 **걸러서** 두 로그인 길에 넘기는가.
 *
 * 이메일 로그인은 한동안 next 를 받지 않아 늘 홈으로 갔고, 구글 로그인은 거르지 않고 그대로 썼다.
 */

const loginProps = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const googleProps = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/components/login-form', () => ({
  LoginForm: (props: unknown) => { loginProps(props); return null; },
}));
vi.mock('~/components/google-button', () => ({
  GoogleButton: (props: unknown) => { googleProps(props); return null; },
  OrDivider: () => null,
}));
vi.mock('@shop/auth', () => ({ googleEnabled: () => true, googleNativeClientIds: () => null }));

const Page = (await import('~/app/(shop)/login/page')).default;

const open = async (params: Record<string, string>) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

beforeEach(() => vi.clearAllMocks());

describe('돌아갈 곳', () => {
  it('우리 경로면 두 로그인 길에 그대로 넘긴다', async () => {
    await open({ next: '/checkout?now=1' });

    expect(loginProps).toHaveBeenCalledWith(expect.objectContaining({ next: '/checkout?now=1' }));
    expect(googleProps).toHaveBeenCalledWith(expect.objectContaining({ next: '/checkout?now=1' }));
  });

  it('다른 사이트면 홈으로 바꿔 넘긴다', async () => {
    await open({ next: 'https://evil.test' });

    expect(loginProps).toHaveBeenCalledWith(expect.objectContaining({ next: '/' }));
    expect(googleProps).toHaveBeenCalledWith(expect.objectContaining({ next: '/' }));
  });

  it('없으면 홈', async () => {
    await open({});
    expect(loginProps).toHaveBeenCalledWith(expect.objectContaining({ next: '/' }));
  });
});
