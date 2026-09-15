// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const changePassword = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { changePassword } }));

const { ProfileForm, PasswordForm } = await import('~/components/account-forms');

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  changePassword.mockResolvedValue({ error: null });
});

/** 입력 칸의 이름과 거기 이어진 설명·오류 */
const described = (input: HTMLElement) =>
  (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '').join(' ');

describe('회원정보 폼', () => {
  it('지금 값을 채워 두고, 저장하면 서버가 맞춘 연락처로 칸을 갈고 결과를 상태로 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ name: '홍길동', phone: '010-1234-5678' }));
    const user = userEvent.setup();
    render(<ProfileForm name="홍길동" phone={null} />);

    expect(screen.getByLabelText<HTMLInputElement>(/^이름/).value).toBe('홍길동');
    const phone = screen.getByLabelText<HTMLInputElement>(/^연락처/);
    expect(described(phone)).toContain('비워 두면 지웁니다');
    await user.type(phone, '01012345678');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('회원정보를 저장했습니다.'));
    expect(phone.value).toBe('010-1234-5678');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: '홍길동', phone: '01012345678' });
    expect(refresh).toHaveBeenCalled();
  });

  it('틀린 값은 보내지 않고 그 칸에 이유를 잇는다', async () => {
    const user = userEvent.setup();
    render(<ProfileForm name="홍길동" phone={null} />);
    await user.clear(screen.getByLabelText(/^이름/));
    await user.type(screen.getByLabelText(/^연락처/), '02-123-4567');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(described(screen.getByLabelText(/^이름/))).toContain('이름을 입력해 주세요'));
    expect(described(screen.getByLabelText(/^연락처/))).toContain('휴대폰 번호 형식');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('비밀번호 변경 폼', () => {
  const fill = async (current: string, next: string, confirm = next) => {
    const user = userEvent.setup();
    render(<PasswordForm email="kim@plain.test" />);
    await user.type(screen.getByLabelText(/^지금 비밀번호/), current);
    await user.type(screen.getByLabelText(/^새 비밀번호\*/), next);
    await user.type(screen.getByLabelText(/^새 비밀번호 확인/), confirm);
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  };

  it('바꾸면 다른 기기 로그인을 끊고, 칸을 비우고, 결과를 알린다', async () => {
    await fill('old-pass-123', 'quiet-harbor-42');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('비밀번호를 바꿨습니다'));
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'old-pass-123', newPassword: 'quiet-harbor-42', revokeOtherSessions: true });
    expect(screen.getByLabelText<HTMLInputElement>(/^지금 비밀번호/).value).toBe('');
  });

  it('지금 비밀번호가 틀리면 그 칸에 알린다 — 새 비밀번호 쪽을 고치게 두지 않는다', async () => {
    changePassword.mockResolvedValue({ error: { status: 400, code: 'INVALID_PASSWORD' } });
    await fill('wrong-pass-1', 'quiet-harbor-42');
    await waitFor(() => expect(described(screen.getByLabelText(/^지금 비밀번호/))).toContain('지금 비밀번호가 맞지 않습니다'));
    expect(screen.queryByRole('alert', { name: /못했습니다/ })).toBeNull();
  });

  it('확인이 다르거나 지금과 같으면 보내지 않는다', async () => {
    await fill('old-pass-123', 'quiet-harbor-42', 'quiet-harbor-43');
    await waitFor(() => expect(described(screen.getByLabelText(/^새 비밀번호 확인/))).toContain('일치하지 않습니다'));
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('비밀번호 관리자가 계정을 알아보게 아이디 칸을 숨겨 둔다', () => {
    render(<PasswordForm email="kim@plain.test" />);
    const username = document.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    expect(username?.value).toBe('kim@plain.test');
    expect(screen.getByLabelText(/^새 비밀번호\*/).getAttribute('autocomplete')).toBe('new-password');
  });
});
