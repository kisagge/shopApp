// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ko } from '@shop/i18n/messages/ko';
import { LocaleProvider } from '~/lib/i18n/client';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const payOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/checkout/pay-order', () => ({ payOrder }));

const { RepayButton } = await import('~/components/repay-button');

/**
 * 결제가 걸리지 않은 주문에 다시 거는 단추.
 *
 * **이 단추가 없어서 사람이 갇혔다.** 승인이 실패하면 주문은 결제대기로
 * 남는데, 결제 화면은 "주문 내역에서 다시 시도할 수 있습니다" 라고 말하면서
 * 그 화면에는 취소 단추만 두었다 — 배포에서 주문 20260910-7063897 이
 * 그렇게 갇혔다.
 */
describe('다시 결제하기', () => {
  beforeEach(() => vi.clearAllMocks());

  const draw = (mode: 'mock' | 'window' = 'mock') =>
    render(
      <LocaleProvider locale="ko" dict={ko}>
        <RepayButton
          orderNo="20260910-7063897"
          payable={71_000}
          method="CARD"
          orderName="코튼 트윌 와이드 팬츠"
          paymentMode={mode}
        />
      </LocaleProvider>,
    );

  it('서버가 정한 방식을 그대로 넘긴다 — 브라우저가 다시 정하지 않는다', async () => {
    payOrder.mockResolvedValue({ kind: 'confirmed' });
    draw('window');
    await userEvent.click(screen.getByRole('button', { name: '다시 결제하기' }));

    expect(payOrder).toHaveBeenCalledWith({
      mode: 'window',
      orderNo: '20260910-7063897',
      payable: 71_000,
      method: 'CARD',
      orderName: '코튼 트윌 와이드 팬츠',
    });
  });

  it('승인되면 화면을 다시 받아 온다 — 상태가 바뀌었다', async () => {
    payOrder.mockResolvedValue({ kind: 'confirmed' });
    draw();
    await userEvent.click(screen.getByRole('button', { name: '다시 결제하기' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('거절되면 서버가 준 말을 그대로 보여 준다', async () => {
    payOrder.mockResolvedValue({ kind: 'confirmFailed', message: '카드사에서 거절했습니다' });
    draw();
    await userEvent.click(screen.getByRole('button', { name: '다시 결제하기' }));

    // 스스로 알린다 — 단추를 누른 사람이 화면을 보고 있지 않을 수 있다
    expect(await screen.findByRole('alert')).toHaveTextContent('카드사에서 거절했습니다');
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * 결제창이 열렸으면 브라우저는 곧 토스로 떠난다. 여기서 새로고침하면
   * 떠나기 직전 화면을 흔들 뿐이다.
   */
  it('결제창이 열리면 아무 말도 하지 않는다', async () => {
    payOrder.mockResolvedValue({ kind: 'window' });
    draw('window');
    await userEvent.click(screen.getByRole('button', { name: '다시 결제하기' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('보내는 동안 단추가 잠기고 그 사실을 말한다 — 두 번 눌러 두 번 걸면 안 된다', async () => {
    let release!: () => void;
    payOrder.mockReturnValue(new Promise((r) => { release = () => r({ kind: 'confirmed' }); }));
    draw();
    await userEvent.click(screen.getByRole('button', { name: '다시 결제하기' }));

    const busy = screen.getByRole('button', { name: '결제 중…' });
    expect(busy).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
