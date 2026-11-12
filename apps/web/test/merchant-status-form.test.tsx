// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MERCHANT_STATUS_LABEL } from '@shop/core';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

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

describe('적용할 때', () => {
  /*
   * **보내는 자리가 한 줄도 안 돌았다.** 고를 수 있는 것만 보여 주는 쪽은 보고
   * 있었는데(위), 고른 뒤 무엇을 보내고 실패하면 무엇을 하는지는 비어 있었다.
   * 입점 상태는 가맹점의 매대를 열고 닫는 값이고, 정지와 해지에는 **가맹점이 보는
   * 사유**가 함께 간다.
   */
  const fetchMock = vi.fn<(...a: any[]) => any>();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(json(200, { ok: true }));
  });

  const choose = async (value: string) => {
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, value);
  };

  const apply = async () => userEvent.click(screen.getByRole('button', { name: '적용' }));

  const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;

  it('바꿀 것이 없으면 단추가 잠긴다 — 같은 상태를 다시 보내지 않는다', () => {
    form('PENDING');

    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  });

  it('고른 상태를 그 가맹점으로 보낸다', async () => {
    form('PENDING');
    await choose('APPROVED');
    await apply();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/merchants/m-1/status');
    expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
    expect(sent()).toEqual({ status: 'APPROVED', reason: '' });
  });

  it('사유가 필요한 상태면 적은 사유를 함께 보낸다 — 가맹점이 그 말을 본다', async () => {
    form('APPROVED');
    await choose('SUSPENDED');
    await userEvent.type(screen.getByLabelText('사유 (필수)'), '배송 지연이 반복됩니다');
    await apply();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ status: 'SUSPENDED', reason: '배송 지연이 반복됩니다' });
  });

  it('끝나면 사유 칸을 비운다 — 다음 가맹점에 지난 말이 남지 않게', async () => {
    form('APPROVED');
    await choose('SUSPENDED');
    await userEvent.type(screen.getByLabelText('사유 (필수)'), '배송 지연');
    await apply();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByLabelText('사유 (필수)')).toHaveValue('');
  });

  it('실패하면 창구의 말을 띄우고 화면을 다시 그리지 않는다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '정산이 남아 있어 해지할 수 없습니다.' }));
    form('APPROVED');
    await choose('TERMINATED');
    await userEvent.type(screen.getByLabelText('사유 (필수)'), '계약 종료');
    await apply();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('정산이 남아 있어 해지할 수 없습니다.'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('적은 사유는 실패해도 남는다 — 다시 적게 하지 않는다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    form('APPROVED');
    await choose('SUSPENDED');
    await userEvent.type(screen.getByLabelText('사유 (필수)'), '배송 지연');
    await apply();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('상태를 바꾸지 못했습니다.'));
    expect(screen.getByLabelText('사유 (필수)')).toHaveValue('배송 지연');
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    form('PENDING');
    await choose('APPROVED');
    await apply();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('네트워크 오류로 저장하지 못했습니다.'),
    );
  });

  it('보내는 중에는 단추가 잠기고 이름을 바꾼다', async () => {
    let give!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { give = resolve; }));
    form('PENDING');
    await choose('APPROVED');
    await apply();

    await waitFor(() => expect(screen.getByRole('button', { name: '적용 중…' })).toBeDisabled());
    await act(async () => {
      give(json(200, {}));
    });
  });
});
