// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const signUp = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { signUp: { email: signUp } } }));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn(), getTracker: () => ({ discard: vi.fn() }) }));

const { SignUpForm } = await import('~/components/signup-form');

/** 가입 동의 — 필수 둘을 받아야 보내고, 선택 하나는 따로 적는다 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  signUp.mockResolvedValue({ error: null });
});

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  /*
   * Field 가 필수 칸 이름 뒤에 별표와 "(필수)" 를 붙인다. 비밀번호와 비밀번호 확인이 서로 걸리지 않게 이름 바로 뒤의
   * 별표까지 묶어 찾는다.
   */
  await user.type(screen.getByLabelText(/^이메일\*/), 'new@plain.test');
  await user.type(screen.getByLabelText(/^이름\*/), '김손님');
  await user.type(screen.getByLabelText(/^비밀번호\*/), 'plain1234!');
  await user.type(screen.getByLabelText(/^비밀번호 확인\*/), 'plain1234!');
};

describe('가입 동의', () => {
  it('필수와 선택을 칸마다 적고, 읽을 문서로 가는 길을 둔다', () => {
    render(<SignUpForm />);

    expect(screen.getByLabelText(/이용약관에 동의합니다/)).toBeInTheDocument();

    // 읽을 문서로 가는 길이 둘 — 순서는 동의 칸의 순서(약관, 개인정보)다
    const read = screen.getAllByRole('link', { name: '읽기' });
    expect(read.map((a) => a.getAttribute('href'))).toEqual(['/terms', '/privacy']);
    // 새 탭으로 연다 — 읽으러 갔다가 적던 것이 날아가면 안 읽는다
    expect(read[0]).toHaveAttribute('target', '_blank');
  });

  it('체크박스 이름에 링크 문구가 섞이지 않는다', () => {
    /*
     * 처음에는 `<label>` 이 체크박스와 "읽기" 링크를 함께 감쌌다. label 은 대화형 콘텐츠를 담을 수
     * 없고(HTML 콘텐츠 모델), 그렇게 두면 체크박스 이름이 "이용약관에 동의합니다 읽기" 가 되어
     * 낭독기가 동의 항목마다 링크 문구를 덧붙여 읽는다. 이름표 안에 탭 정지점도 둘 생긴다.
     */
    render(<SignUpForm />);

    const terms = screen.getByLabelText(/이용약관에 동의합니다/);
    expect(terms.getAttribute('type')).toBe('checkbox');
    // 이름은 동의 문구까지다 — 읽기는 곁에 선 별개의 링크다
    expect(terms.closest('label')?.textContent ?? '').not.toContain('읽기');
  });

  it('필수 동의가 없으면 가입을 보내지 않고 그 이유를 말한다', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('필수 항목에 동의해야');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('전체 동의는 선택까지 켜고, 다시 누르면 전부 끈다', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByLabelText('전체 동의'));
    expect(screen.getByLabelText(/혜택 소식/)).toBeChecked();

    await user.click(screen.getByLabelText('전체 동의'));
    expect(screen.getByLabelText(/이용약관에 동의합니다/)).not.toBeChecked();
  });

  it('필수만 동의해도 가입된다 — 선택을 필수로 묶지 않는다', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user);
    await user.click(screen.getByLabelText(/이용약관에 동의합니다/));
    await user.click(screen.getByLabelText(/개인정보 수집/));
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(signUp).toHaveBeenCalled());
    // 고르지 않은 선택 동의를 참으로 적지 않는다
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('마케팅 수신을 고르면 가입 뒤 그 사실만 따로 보낸다', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user);
    await user.click(screen.getByLabelText('전체 동의'));
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/account/consent');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ marketing: true });
  });

  it('선택 동의를 못 적어도 가입은 그대로 끝난다 — 그것 때문에 가입이 실패하면 안 된다', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error('network'));
    render(<SignUpForm />);
    await fill(user);
    await user.click(screen.getByLabelText('전체 동의'));
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });
});
