// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const social = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { signIn: { social } } }));

const { GoogleButton } = await import('~/components/google-button');

beforeEach(() => {
  vi.clearAllMocks();
  social.mockResolvedValue({ error: null });
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
