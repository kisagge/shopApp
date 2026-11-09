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

  /**
   * **서버가 거절했을 때.**
   *
   * 화면 검증을 통과한 값도 서버가 거절할 수 있다 — 길이 상한이 다를 수도, 그사이 정책이
   * 바뀔 수도 있다. 그때 **어느 칸이 문제인지 서버가 알려 주면 그 칸에 잇고**(사람이 고칠
   * 자리를 바로 안다), 말이 없으면 무엇이 안 됐는지 말한다.
   *
   * 셋 다 안 돈 줄이었다 — 거절도, 기본 문구도, 요청이 못 간 경우도.
   */
  const saveWith = async (answer: () => Promise<Response>) => {
    fetchMock.mockImplementation(answer);
    const user = userEvent.setup();
    render(<ProfileForm name="홍길동" phone={null} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
  };

  it('서버가 어느 칸인지 알려 주면 그 칸에 잇는다', async () => {
    await saveWith(async () => Response.json({ fields: { name: '이름이 너무 깁니다' } }, { status: 400 }));

    await waitFor(() => expect(described(screen.getByLabelText(/^이름/))).toContain('이름이 너무 깁니다'));
    /*
     * 칸에 붙였으면 **폼 전체 문구는 세우지 않는다** — 두 군데서 말하면 어디를 고칠지
     * 흐려진다. (칸의 오류 자체는 role="alert" 로 나가므로, 없는 것을 확인할 것은
     * "저장하지 못했습니다" 쪽이다.)
     */
    expect(screen.queryByText(/저장하지 못했습니다/)).toBeNull();
  });

  it('서버가 한 말이 있으면 그것을 보여 준다', async () => {
    await saveWith(async () => Response.json({ message: '잠시 뒤에 다시 시도해 주세요.' }, { status: 503 }));

    expect((await screen.findByRole('alert')).textContent).toContain('잠시 뒤에 다시 시도해 주세요.');
  });

  it.each([
    ['아무 말도 안 하면', async () => Response.json({}, { status: 500 }), '회원정보를 저장하지 못했습니다'],
    ['본문이 JSON 이 아니면', async () => new Response('<html>502</html>', { status: 502 }), '회원정보를 저장하지 못했습니다'],
  ])('%s 무엇이 안 됐는지 말한다', async (_label, answer, says) => {
    await saveWith(answer);

    expect((await screen.findByRole('alert')).textContent).toContain(says);
  });

  it('요청이 못 가면 네트워크 오류라고 말한다 — 거절과 다른 일이다', async () => {
    await saveWith(() => Promise.reject(new Error('네트워크가 끊겼다')));

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류');
  });

  it('실패해도 적은 값은 남는다 — 다시 적게 하지 않는다', async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 500 }));
    const user = userEvent.setup();
    render(<ProfileForm name="홍길동" phone={null} />);
    await user.type(screen.getByLabelText(/^연락처/), '01012345678');

    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('alert');

    expect(screen.getByLabelText<HTMLInputElement>(/^연락처/).value).toBe('01012345678');
    // 저장되지 않았으니 "저장했다" 고 말하지 않는다
    expect(screen.getByRole('status').textContent).toBe('');
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

/**
 * **비밀번호를 바꾸지 못했을 때 — 셋을 가른다.**
 *
 * 지금 비밀번호가 틀린 것은 **그 칸**의 문제이고(이미 본다), 나머지 둘은 폼 전체의 문제다:
 * 너무 자주 눌러 막힌 것과, 그 밖의 거절. 잠시 기다리면 되는 일과 다시 해 봐야 하는 일을
 * 같은 말로 묶으면 사람은 같은 것을 되풀이한다.
 */
describe('비밀번호를 바꾸지 못하면', () => {
  const fill = async () => {
    const user = userEvent.setup();
    render(<PasswordForm email="kim@plain.test" />);
    await user.type(screen.getByLabelText(/^지금 비밀번호/), 'old-pass-123');
    await user.type(screen.getByLabelText(/^새 비밀번호\*/), 'quiet-harbor-42');
    await user.type(screen.getByLabelText(/^새 비밀번호 확인/), 'quiet-harbor-42');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  };

  it('너무 자주 누르면 잠시 기다리라고 한다', async () => {
    changePassword.mockResolvedValue({ error: { status: 429 } });
    await fill();

    expect((await screen.findByRole('alert')).textContent).toContain('요청이 너무 잦습니다');
  });

  it('그 밖의 거절은 바꾸지 못했다고 말한다', async () => {
    changePassword.mockResolvedValue({ error: { status: 500, code: 'UNKNOWN' } });
    await fill();

    expect((await screen.findByRole('alert')).textContent).toContain('비밀번호를 바꾸지 못했습니다');
  });

  /** 실패했으면 "바꿨다" 고 말하지 않고, 칸도 비우지 않는다 */
  it('실패하면 알리지 않고 칸도 비우지 않는다', async () => {
    changePassword.mockResolvedValue({ error: { status: 500 } });
    await fill();
    await screen.findByRole('alert');

    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>(/^지금 비밀번호/).value).toBe('old-pass-123');
  });
});
