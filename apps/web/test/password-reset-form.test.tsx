// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const requestPasswordReset = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const resetPassword = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({
  authClient: { requestPasswordReset, resetPassword },
}));

const { ForgotPasswordForm } = await import('~/components/forgot-password-form');
const { ResetPasswordForm } = await import('~/components/reset-password-form');

const field = (label: string) =>
  screen.getByLabelText<HTMLInputElement>(new RegExp(`^${label}\\* \\(필수\\)$`));

beforeEach(() => {
  vi.clearAllMocks();
  requestPasswordReset.mockResolvedValue({ error: null });
  resetPassword.mockResolvedValue({ error: null });
});

describe('비밀번호 찾기', () => {
  it('가입 여부를 알려 주지 않는다 — 결과와 무관하게 같은 말을 한다', async () => {
    // 알려 주면 아무나 이 화면으로 가입 여부를 확인할 수 있게 된다
    requestPasswordReset.mockResolvedValue({ error: { status: 404 } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(field('이메일'), 'nobody@plain.test');
    await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('메일을 보냈습니다'));
  });

  it('요청 제한도 구분해 주지 않는다', async () => {
    // 429 를 구분해 주면 그 자체가 "처리됐다" 는 신호가 된다
    requestPasswordReset.mockResolvedValue({ error: { status: 429 } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(field('이메일'), 'demo@plain.test');
    await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
  });

  it('형식이 틀리면 보내지 않는다', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(field('이메일'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('돌아올 곳을 함께 보낸다', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(field('이메일'), 'demo@plain.test');
    await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }));

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'demo@plain.test', redirectTo: '/reset-password',
    }));
  });
});

describe('비밀번호 재설정', () => {
  const fill = async (password: string, confirm = password) => {
    const user = userEvent.setup();
    await user.type(field('새 비밀번호'), password);
    await user.type(field('새 비밀번호 확인'), confirm);
    return user;
  };

  it('토큰을 함께 보낸다', async () => {
    render(<ResetPasswordForm token="t-1" />);
    const user = await fill('quiet-harbor-42');

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({
      newPassword: 'quiet-harbor-42', token: 't-1',
    }));
  });

  it('바꾸고 나면 다시 로그인하게 하고 이유를 남긴다', async () => {
    render(<ResetPasswordForm token="t-1" />);
    const user = await fill('quiet-harbor-42');

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    // 세션이 끊기므로 왜 다시 로그인해야 하는지 알려 줘야 한다
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?reset=1'));
  });

  it('확인이 다르면 보내지 않는다', async () => {
    render(<ResetPasswordForm token="t-1" />);
    const user = await fill('quiet-harbor-42', 'different-value');

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('일치하지 않습니다'));
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('죽은 링크는 다시 받을 길을 준다 — "실패" 만 주면 같은 링크를 계속 누른다', async () => {
    resetPassword.mockResolvedValue({ error: { status: 400 } });
    render(<ResetPasswordForm token="t-old" />);
    const user = await fill('quiet-harbor-42');

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('만료'));
    expect(screen.getByRole('link', { name: '링크 다시 받기' }).getAttribute('href'))
      .toBe('/forgot-password');
  });

  it('그 밖의 실패는 다시 시도할 수 있게 남는다', async () => {
    resetPassword.mockResolvedValue({ error: { status: 500 } });
    render(<ResetPasswordForm token="t-1" />);
    const user = await fill('quiet-harbor-42');

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('바꾸지 못했습니다'));
    // 입력 칸이 사라지면 처음부터 다시 해야 한다
    expect(field('새 비밀번호').value).toBe('quiet-harbor-42');
  });
});
