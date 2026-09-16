// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import { MERCHANT_STATUS_LABEL } from '@shop/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { MerchantStatusForm } = await import('~/app/admin/merchants/status-form');

/**
 * 입점 상태를 바꾸는 자리.
 *
 * **갈 수 없는 곳은 아예 안 보여 준다.** 장사하던 가맹점을 "반려" 하는 것은 말이
 * 안 되고(그건 해지다), 끝난 줄은 되살리지 않는다. 고를 수 있게 두고 서버가
 * 튕기면, 누른 사람은 자기가 무엇을 잘못했는지 모른다.
 */

const form = (status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED' | 'TERMINATED') =>
  render(<MerchantStatusForm merchantId="m-1" merchantName="무어" status={status} />);

const options = () =>
  within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent);

describe('고를 수 있는 것', () => {
  it('심사 중인 신청은 승인하거나 반려한다', () => {
    form('PENDING');
    expect(options()).toEqual(['승인 대기', '정상', '반려']);
  });

  it('장사하던 가맹점에는 반려가 없다 — 그건 해지다', () => {
    form('APPROVED');
    expect(options()).not.toContain(MERCHANT_STATUS_LABEL.REJECTED);
  });

  it('같은 이름이 두 번 뜨지 않는다', () => {
    /*
     * 지금 상태가 갈 수 있는 곳에도 들어 있다 — 정지에서 정상으로 돌아가는 길
     * 때문에 정상이 목록에 있다. 그냥 이었더니 승인된 가맹점에 "정상" 이 두 번 떴다.
     */
    for (const s of ['PENDING', 'APPROVED', 'SUSPENDED'] as const) {
      form(s);
      const names = options();
      expect(new Set(names).size, s).toBe(names.length);
      screen.getByRole('combobox').remove();
    }
  });

  it('끝난 줄은 지금 상태 하나뿐이다 — 다시 들어오려면 새로 신청한다', () => {
    form('REJECTED');
    expect(options()).toEqual(['반려']);
  });
});

describe('사유', () => {
  it('승인에는 사유 칸이 없다', () => {
    form('PENDING');
    expect(screen.queryByLabelText('사유 (필수)')).toBeNull();
  });

  it('반려를 고르면 사유 칸이 나온다 — 제출하고 나서 튕기지 않게', () => {
    /*
     * 계약에서도 막지만(merchantStatusNeedsReason), 화면이 미리 알려 줘야
     * 적어 넣고 나서 거절당하지 않는다.
     */
    const { container } = form('PENDING');
    const select = container.querySelector('select')!;
    select.value = 'REJECTED';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(screen.getByLabelText('사유 (필수)')).toBeInTheDocument();
  });
});
