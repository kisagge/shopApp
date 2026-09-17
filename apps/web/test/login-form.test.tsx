// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 로그인 뒤에는 통째로 새로 연다(세션이 바뀌었다) — 이동은 location.assign 으로 본다
const assign = vi.fn<(...a: any[]) => any>();

const email = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { signIn: { email } } }));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));

const { LoginForm } = await import('~/components/login-form');

/**
 * 로그인 실패를 **무엇 때문인지 알려도 되는 만큼만** 나눠 말한다.
 *
 * 비밀번호·이메일 어느 쪽이 틀렸는지는 말하지 않는다(가입 여부가 샌다). 요청 제한과 이용 정지는
 * 말한다 — 둘 다 "틀렸다" 로 들으면 맞는 비밀번호로 계속 다시 시도한다.
 */
async function submit(next?: string) {
  const user = userEvent.setup();
  render(next === undefined ? <LoginForm /> : <LoginForm next={next} />);
  await user.type(screen.getByLabelText(/이메일/), 'demo@plain.test');
  await user.type(screen.getByLabelText(/비밀번호/), 'whatever-pass');
  await user.click(screen.getByRole('button', { name: '로그인' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign });
});

describe('로그인 실패 문구', () => {
  it('정지된 계정은 정지됐다고 말하고 이동하지 않는다', async () => {
    email.mockResolvedValue({ error: { status: 403, code: 'ACCOUNT_SUSPENDED' } });
    await submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('이용이 정지된 계정'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('다른 403 은 정지로 읽지 않는다 — 코드로만 가린다', async () => {
    email.mockResolvedValue({ error: { status: 403, code: 'SOMETHING_ELSE' } });
    await submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('올바르지 않습니다'));
  });

  it('갈 곳이 없으면 홈으로 간다', async () => {
    email.mockResolvedValue({ error: null });
    await submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('성공하면 로그인하러 오기 전의 자리로 돌아간다', async () => {
    /*
     * 한동안 이 폼은 갈 곳을 받지 않아 늘 홈으로 갔다. 결제하려다 로그인한 사람이 홈을 봤고,
     * 바로 구매로 온 사람은 무엇을 사려 했는지 잃었다.
     */
    email.mockResolvedValue({ error: null });
    await submit('/checkout?now=1');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/checkout?now=1'));
  });
});
