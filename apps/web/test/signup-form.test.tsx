// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const signUpEmail = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));

const { SignUpForm } = await import('~/components/signup-form');

/**
 * 라벨로 입력을 찾는다.
 *
 * Field 는 라벨 뒤에 별표와 "(필수)" 를 붙이므로 부분 일치로 찾으면
 * "비밀번호" 가 "비밀번호 확인" 까지 잡는다. 끝을 고정해 정확히 가른다.
 */
const field = (label: string) =>
  screen.getByLabelText<HTMLInputElement>(new RegExp(`^${label}\\* \\(필수\\)$`));

const fill = async (over: Partial<Record<string, string>> = {}) => {
  const user = userEvent.setup();
  const values: Record<string, string> = {
    이메일: 'buyer@plain.test',
    이름: '구매자',
    비밀번호: 'quiet-harbor-42',
    '비밀번호 확인': 'quiet-harbor-42',
    ...over,
  };
  for (const [label, value] of Object.entries(values)) {
    const input = field(label);
    await user.clear(input);
    if (value) await user.type(input, value);
  }
  /*
   * **필수 동의를 함께 켠다.** 폼이 칸 검사보다 동의를 먼저 보기 때문이다 — 안 켜면 여기 있는 검사들이 전부 "동의부터
   * 하세요" 에서 멈춘다. 동의 자체는 signup-consent 검사가 따로 본다.
   */
  await user.click(screen.getByLabelText(/이용약관에 동의합니다/));
  await user.click(screen.getByLabelText(/개인정보 수집/));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  signUpEmail.mockResolvedValue({ error: null });
});

describe('접근성', () => {
  it('모든 입력에 라벨이 붙어 있다', () => {
    render(<SignUpForm />);

    for (const label of ['이메일', '이름', '비밀번호', '비밀번호 확인']) {
      expect(field(label)).toBeTruthy();
    }
  });

  it('비밀번호 칸은 새 비밀번호로 알린다 — 관리자가 기존 것을 채우면 안 된다', () => {
    render(<SignUpForm />);

    for (const label of ['비밀번호', '비밀번호 확인']) {
      const input = field(label);
      expect(input.type).toBe('password');
      expect(input.autocomplete).toBe('new-password');
    }
  });

  it('오류는 그 칸에 붙어 aria 로 연결된다 — 빨간 글씨만으로는 전달되지 않는다', async () => {
    render(<SignUpForm />);
    const user = await fill({ '비밀번호 확인': 'different-value' });

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    const input = field('비밀번호 확인');
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('일치하지 않습니다');
  });
});

describe('보내기 전에 거른다', () => {
  it('확인이 다르면 서버를 부르지 않는다', async () => {
    render(<SignUpForm />);
    const user = await fill({ '비밀번호 확인': 'different-value' });

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('이메일에서 나온 비밀번호를 막는다', async () => {
    render(<SignUpForm />);
    const user = await fill({ 비밀번호: 'buyer-1234', '비밀번호 확인': 'buyer-1234' });

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('이메일과 너무 비슷한'));
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('한 칸에 오류가 여러 개여도 하나만 보여 준다', async () => {
    render(<SignUpForm />);
    // 짧고, 확인과도 다르다
    const user = await fill({ 비밀번호: 'ab', '비밀번호 확인': 'cd' });

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => {
      const messages = screen.getAllByRole('alert').map((el) => el.textContent);
      expect(messages.filter((m) => m?.includes('8자 이상'))).toHaveLength(1);
    });
  });

  it('고치기 시작하면 그 칸의 오류만 사라진다', async () => {
    render(<SignUpForm />);
    const user = await fill({ 이메일: 'not-an-email', '비밀번호 확인': 'different-value' });
    await user.click(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(2));

    await user.type(field('이메일'), 'x');

    // 이메일 오류만 사라지고 비밀번호 확인 오류는 남는다
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(1));
    expect(screen.getByRole('alert').textContent).toContain('일치하지 않습니다');
  });
});

describe('서버 응답', () => {
  it('성공하면 홈으로 보내고 기록을 남긴다', async () => {
    render(<SignUpForm />);
    const user = await fill();

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(signUpEmail).toHaveBeenCalledWith({
      email: 'buyer@plain.test', password: 'quiet-harbor-42', name: '구매자',
    }));
    expect(track).toHaveBeenCalledWith('sign_up', { method: 'email' });
    expect(push).toHaveBeenCalledWith('/');
  });

  it('확인란은 서버로 보내지 않는다', async () => {
    render(<SignUpForm />);
    const user = await fill();

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(signUpEmail).toHaveBeenCalled());
    expect(signUpEmail.mock.calls[0]?.[0]).not.toHaveProperty('passwordConfirm');
  });

  it('이미 가입된 주소는 숨기지 않는다', async () => {
    // 로그인 실패와 다르다. 여기서 숨기면 왜 안 되는지 영원히 알 수 없다.
    signUpEmail.mockResolvedValue({ error: { status: 422, code: 'USER_ALREADY_EXISTS' } });
    render(<SignUpForm />);
    const user = await fill();

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('이미 가입된 이메일'));
    expect(push).not.toHaveBeenCalled();
  });

  it('요청 제한은 따로 말해 준다', async () => {
    signUpEmail.mockResolvedValue({ error: { status: 429 } });
    render(<SignUpForm />);
    const user = await fill();

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('요청이 너무 잦습니다'));
  });

  it('그 밖의 실패는 다시 시도할 수 있게 남는다', async () => {
    signUpEmail.mockResolvedValue({ error: { status: 500 } });
    render(<SignUpForm />);
    const user = await fill();

    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('가입에 실패했습니다'));
    // 입력한 값이 날아가면 처음부터 다시 쳐야 한다
    expect(field('이메일').value).toBe('buyer@plain.test');
  });
});
