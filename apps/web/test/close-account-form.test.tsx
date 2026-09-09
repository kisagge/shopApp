// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const signOut = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ signOutEverywhere: signOut }));

const { CloseAccountForm } = await import('~/components/close-account-form');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(new Response('{"closed":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const button = () => screen.getByRole('button', { name: /탈퇴하기/ });
const phrase = () => screen.getByRole('textbox');

describe('확인 문구', () => {
  it('문구를 치기 전에는 누를 수 없다', () => {
    // 되돌릴 수 없는 동작이다. 체크박스 하나는 읽지 않고도 눌린다.
    render(<CloseAccountForm />);
    expect(button()).toHaveProperty('disabled', true);
  });

  it('문구가 맞으면 열린다', async () => {
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    expect(button()).toHaveProperty('disabled', false);
  });

  it('비슷하기만 하면 열리지 않는다', async () => {
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴');
    expect(button()).toHaveProperty('disabled', true);
  });
});

describe('리뷰 선택', () => {
  it('기본은 남긴다', async () => {
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).eraseReviews).toBe(false);
  });

  it('고르면 함께 지운다고 보낸다', async () => {
    render(<CloseAccountForm />);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).eraseReviews).toBe(true);
  });
});

describe('성공한 뒤', () => {
  it('로그아웃까지 하고 완료 화면으로 보낸다', async () => {
    /*
     * 세션 행을 지워도 Better Auth 의 쿠키 캐시(5분)는 DB 를 다시 보지
     * 않는다. 로그아웃을 해야 지금 바로 끊긴다.
     */
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    expect(signOut).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/account/closed');
  });
});

describe('실패한 뒤', () => {
  it('막는 이유를 하나하나 보여 준다', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: '지금은 탈퇴할 수 없습니다.', blocks: ['IN_FLIGHT_ORDER'] }),
        { status: 409 },
      ),
    );
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/배송이 끝나지 않은 주문/)).toBeDefined();
  });

  it('로그아웃하지 않는다 — 계정이 남아 있는데 끊으면 안 된다', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"안 됩니다"}', { status: 409 }));
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    await screen.findByRole('alert');
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('네트워크가 끊겨도 버튼이 잠기지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('오프라인'));
    render(<CloseAccountForm />);
    await userEvent.type(phrase(), '탈퇴합니다');
    await userEvent.click(button());

    await screen.findByRole('alert');
    expect(button()).toHaveProperty('disabled', false);
  });
});
