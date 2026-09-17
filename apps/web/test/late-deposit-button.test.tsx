// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { LateDepositButton } = await import('~/app/admin/orders/[orderNo]/late-deposit-button');

/**
 * 취소한 주문에 들어온 입금을 **돌려준 뒤** 닫는 단추.
 *
 * 누르는 것이 곧 환불이 아니다 — 가상계좌 입금은 손님 계좌로 사람이 따로 보낸다. 잘못 누르면 받은 돈이
 * 목록에서 빠지고 아무도 돌려주지 않으므로 한 번 더 묻는다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ orderNo: 'O-1', amount: 289000 }));
});

describe('환불 처리함', () => {
  it('한 번 누르면 묻기만 하고 보내지 않는다', async () => {
    const user = userEvent.setup();
    render(<LateDepositButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '환불 처리함' }));

    const group = screen.getByRole('group', { name: '환불 처리 확인' });
    expect(group.textContent).toContain('손님에게 돌려주었습니까?');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('돌려주었다고 하면 닫으라고 보내고 화면을 다시 읽는다', async () => {
    const user = userEvent.setup();
    render(<LateDepositButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '환불 처리함' }));
    await user.click(screen.getByRole('button', { name: '돌려주었음' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/orders/O-1/late-deposit', { method: 'POST' });
  });

  it('취소하면 아무것도 보내지 않고 원래 단추로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<LateDepositButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '환불 처리함' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '환불 처리함' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('실패하면 서버가 준 까닭을 말하고 화면을 그대로 둔다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ code: 'ALREADY_RESOLVED', message: '이미 환불 처리한 입금입니다.' }, { status: 409 }));
    render(<LateDepositButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '환불 처리함' }));
    await user.click(screen.getByRole('button', { name: '돌려주었음' }));

    expect((await screen.findByRole('alert')).textContent).toBe('이미 환불 처리한 입금입니다.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
