// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { CancelReturnButton } = await import('~/components/cancel-return-button');

/**
 * 손님이 자기 반품·교환 신청을 무르는 단추.
 *
 * **들어가면 나올 문이 없었다.** 무르는 자리가 운영진 쪽에만 있어서, 잘못 신청하면 주문이 반품접수에
 * 갇혀 구매확정도 자동 확정도 안 됐다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'CANCELLED' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const draw = (type: 'RETURN' | 'EXCHANGE' = 'RETURN') =>
  render(<CancelReturnButton orderNo="20260901-0000001" type={type} />);

describe('무르기', () => {
  it('한 번 더 묻는다 — 누르자마자 보내지 않는다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));

    expect(screen.getByText('반품 신청을 취소할까요?')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('무엇을 무르는지 말한다 — 교환과 반품이 같은 화면에 온다', async () => {
    draw('EXCHANGE');

    expect(screen.getByRole('button', { name: '교환 신청 취소' })).toBeTruthy();
  });

  it('확인하면 그 주문의 신청을 지운다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));
    await user.click(screen.getByRole('button', { name: '신청 취소' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/orders/20260901-0000001/return', { method: 'DELETE' });
    expect(refresh, '무른 뒤 화면을 다시 그려야 단추가 사라진다').toHaveBeenCalled();
  });

  it('돌아가기를 누르면 아무것도 안 보낸다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));
    await user.click(screen.getByRole('button', { name: '돌아가기' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '반품 신청 취소' })).toBeTruthy();
  });

  /**
   * **실패는 눈에도 보이게 적는다.** 낭독기에만 들리면, 보고 있는 사람에게는 눌렀는데 아무 일도 안 일어난
   * 것이 된다 — 그 상태에서 할 수 있는 일이 새로고침뿐이다.
   */
  it('실패하면 서버가 말한 까닭을 그 자리에 보여 준다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'ALREADY_RESOLVED', message: '이미 처리된 신청입니다.' }), { status: 409 }),
    );
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));
    await user.click(screen.getByRole('button', { name: '신청 취소' }));

    expect(screen.getByRole('alert').textContent).toContain('이미 처리된 신청입니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('망이 끊겨도 그 자리에서 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error('offline'));
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));
    await user.click(screen.getByRole('button', { name: '신청 취소' }));

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  /**
   * 단추는 `disabled` 대신 `aria-disabled` 를 쓴다(초점을 받아야 왜 못 누르는지 들린다). 그래서 **눌리기는
   * 하므로** 두 번 보내는 것을 핸들러가 막아야 한다 — 체크아웃이 같은 이유로 그렇게 한다.
   */
  it('보내는 중에 다시 눌러도 한 번만 보낸다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async () => {
      await held;
      return new Response('{}', { status: 200 });
    });
    draw();

    await user.click(screen.getByRole('button', { name: '반품 신청 취소' }));
    const yes = screen.getByRole('button', { name: '신청 취소' });
    await user.click(yes);
    await user.click(screen.getByRole('button', { name: '취소하는 중…' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
  });
});
