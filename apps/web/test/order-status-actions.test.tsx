// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 주문 상태를 바꾸는 동안 잠기는 **나머지 버튼들**.
 *
 * 하나를 보내면 다른 것도 함께 잠긴다 — 두 전이를 동시에 보내면 서버의
 * 상태머신과 어긋나기 때문이다. 그런데 보내는 중인 버튼만 이름이
 * '처리 중…' 으로 바뀌고 나머지는 그대로라, 낭독기에는 "배송중(으)로 변경,
 * 사용 불가" 만 들리고 왜인지는 어디에도 없었다.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { OrderStatusActions } = await import('~/components/admin/order-status-actions');

/** 버튼이 지금 알리는 말 — 이름과 설명을 합친 것 */
function announced(button: HTMLElement): string {
  const described = (button.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  return `${button.textContent ?? ''} ${described}`.trim();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

describe('상태를 바꾸는 동안', () => {
  const options = ['SHIPPED', 'CANCELLED'] as const;

  it('보내는 중인 버튼은 이름이 스스로 말한다', async () => {
    const user = userEvent.setup();
    render(<OrderStatusActions orderNo="A-1" options={options} />);

    await user.click(screen.getByRole('button', { name: /배송중/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '처리 중…' })).toBeInTheDocument());
  });

  it('나머지 버튼은 왜 잠겼는지 설명으로 말한다', async () => {
    const user = userEvent.setup();
    render(<OrderStatusActions orderNo="A-1" options={options} />);

    await user.click(screen.getByRole('button', { name: /배송중/ }));

    const other = await screen.findByRole('button', { name: /취소/ });
    await waitFor(() => expect(other).toHaveAttribute('aria-disabled', 'true'));
    expect(announced(other)).toContain('처리가 끝난 뒤에 누를 수 있습니다');
  });

  it('보내는 중인 버튼에는 그 설명을 붙이지 않는다 — 이름이 이미 말한다', async () => {
    const user = userEvent.setup();
    render(<OrderStatusActions orderNo="A-1" options={options} />);

    await user.click(screen.getByRole('button', { name: /배송중/ }));
    const busy = await screen.findByRole('button', { name: '처리 중…' });
    expect(busy).not.toHaveAttribute('aria-describedby');
  });

  it('가만히 있을 때는 아무 설명도 없다 — 늘 붙어 있으면 뜻이 없다', () => {
    render(<OrderStatusActions orderNo="A-1" options={options} />);
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAttribute('aria-disabled', 'false');
      expect(b).not.toHaveAttribute('aria-describedby');
    }
  });
});
