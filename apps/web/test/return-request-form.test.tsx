// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from './render';
import { ReturnRequestForm } from '~/components/return-request-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/**
 * 반품 신청 폼.
 *
 * **고를 수 있는 것만 내민다.** 구매확정한 주문에서 단순 변심이 기본값으로
 * 선택돼 있으면, 사람은 그것을 골라 제출하고 나서야 안 된다는 말을 듣는다.
 */
const open = async (status: 'DELIVERED' | 'CONFIRMED') => {
  render(<ReturnRequestForm orderNo="20260909-0000001" status={status} />);
  const { default: userEvent } = await import('@testing-library/user-event');
  await userEvent.click(screen.getByRole('button', { name: /반품|교환/ }));
};

describe('고를 수 있는 사유만 보인다', () => {
  it('배송완료 뒤에는 단순 변심도 고를 수 있다', async () => {
    await open('DELIVERED');

    expect(screen.getByRole('radio', { name: /단순 변심/ })).toBeInTheDocument();
  });

  it('구매확정 뒤에는 단순 변심이 아예 없다', async () => {
    await open('CONFIRMED');

    expect(screen.queryByRole('radio', { name: /단순 변심/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /불량/ })).toBeInTheDocument();
  });

  /** 고를 수 없는 것이 기본값이면 아무것도 안 바꾼 사람이 거절당한다 */
  it('구매확정 뒤에는 판매자 귀책이 처음부터 골라져 있다', async () => {
    await open('CONFIRMED');

    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(2); // 종류(반품/교환) 하나, 사유 하나
    expect(checked.some((r) => /단순 변심/.test(r.getAttribute('aria-label') ?? ''))).toBe(false);
  });

  /** 누가 반송비를 내는지는 사유가 정한다. 확정 뒤에는 전부 판매자 귀책이다. */
  it('반송비를 우리가 낸다고 말해 준다', async () => {
    await open('CONFIRMED');

    expect(screen.getByText(/반송비는 저희가 부담합니다/)).toBeInTheDocument();
  });
});
