// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const { ConfirmPurchaseButton } = await import('~/components/confirm-purchase-button');

/** 구매확정 단추 — 되돌릴 수 없어 한 번 더 묻고, 무엇이 달라지는지 그 자리에서 말한다 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('구매확정 단추', () => {
  it('처음 누르면 보내지 않고, 적립과 반품 제한을 설명에 이은 확인 단추를 연다', async () => {
    const user = userEvent.setup();
    render(<ConfirmPurchaseButton orderNo="20260915-0000001" points="1,190" />);
    await user.click(screen.getByRole('button', { name: '구매확정' }));
    expect(fetchMock).not.toHaveBeenCalled();

    const group = screen.getByRole('group', { name: '구매확정' });
    const confirm = screen.getByRole('button', { name: '구매확정하기' });
    expect(group).toContainElement(confirm);
    const note = document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent ?? '';
    expect(note).toContain('1,190P');
    expect(note).toContain('단순 변심으로 반품할 수 없습니다');
    expect(note).toContain('불량·오배송은 신청할 수 있습니다');
  });

  it('확정되면 결과를 주소에 싣고 화면을 다시 받는다 — 단추는 사라지므로 화면이 결과를 남긴다', async () => {
    fetchMock.mockResolvedValue(Response.json({ rewarded: 1_190 }));
    const user = userEvent.setup();
    render(<ConfirmPurchaseButton orderNo="20260915-0000001" points="1,190" />);
    await user.click(screen.getByRole('button', { name: '구매확정' }));
    await user.click(screen.getByRole('button', { name: '구매확정하기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/order/20260915-0000001?confirmed=1', { scroll: false }));
    expect(fetchMock.mock.calls[0]).toEqual(['/api/orders/20260915-0000001/purchase-confirm', { method: 'POST' }]);
  });

  it('거절되면 이유를 알림으로, 취소하면 처음으로 돌아간다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '배송완료된 주문만 구매확정할 수 있습니다.' }, { status: 409 }));
    const user = userEvent.setup();
    render(<ConfirmPurchaseButton orderNo="20260915-0000001" points="0" />);
    await user.click(screen.getByRole('button', { name: '구매확정' }));
    await user.click(screen.getByRole('button', { name: '구매확정하기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('배송완료된 주문만'));
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '구매확정' })).toBeTruthy();
  });
});
