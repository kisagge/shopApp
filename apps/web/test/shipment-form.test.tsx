// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { ShipmentForm } = await import('~/app/admin/orders/[orderNo]/shipment-form');

/**
 * 송장 등록 — 마지막 문.
 *
 * **누르면 물건이 그 주소로 떠난다.** 배송지가 바뀐 주문이라면 목록의 표시와 상세의 안내를 지나쳐 왔을
 * 수 있고, 잘못 붙이면 되돌릴 수 없다(오배송). 그래서 그 주문에서만 한 번 더 세운다 — 평소에는 누르면
 * 바로 등록된다. 안 그러면 하루에 수십 건을 붙이는 사람이 확인 단추를 눈으로 읽지 않고 누르게 된다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ waitingForOthers: false }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const draw = (props: Record<string, unknown> = {}) =>
  render(<ShipmentForm orderNo="20260930-0000001" current={null} {...props} />);

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/송장번호/), '123456789012');
};

describe('평범한 주문', () => {
  it('누르면 바로 등록한다 — 한 번 더 묻지 않는다', async () => {
    const user = userEvent.setup();
    draw();
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/orders/20260930-0000001/shipment');
    expect(JSON.parse(init.body)).toEqual({ carrier: 'CJ', trackingNumber: '123456789012' });
    expect(await screen.findByText(/배송중으로 옮겼습니다/)).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe('배송지가 바뀐 주문', () => {
  const changed = { addressChangedAt: '2026. 9. 30. 13:05' };

  it('누르면 보내지 않고 먼저 묻는다', async () => {
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));

    const ask = screen.getByRole('group', { name: '배송지가 바뀐 주문입니다' });
    expect(ask).toBeInTheDocument();
    expect(fetchMock, '묻기만 하고 아직 보내지 않았다').not.toHaveBeenCalled();
  });

  /** 언제 바뀌었는지와 무엇을 붙이려는지 — 확인할 것을 그 자리에 적어 준다 */
  it('언제 바뀌었고 무엇으로 보낼지 되읽어 준다', async () => {
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));

    const ask = screen.getByRole('group', { name: '배송지가 바뀐 주문입니다' });
    expect(ask).toHaveTextContent('2026. 9. 30. 13:05');
    expect(ask).toHaveTextContent('CJ대한통운');
    expect(ask).toHaveTextContent('1234-5678-9012');
  });

  /** 설명이 단추에 묶여 있어야 낭독기가 누르기 전에 그것을 읽는다 */
  it('확인 단추가 그 설명을 안고 있다', async () => {
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));

    expect(screen.getByRole('button', { name: '주소를 확인했습니다 — 등록' }))
      .toHaveAccessibleDescription(/배송지는 .* 에 바뀌었습니다/);
  });

  it('확인하면 적어 둔 그대로 등록한다', async () => {
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));
    await user.click(screen.getByRole('button', { name: '주소를 확인했습니다 — 등록' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body))
      .toEqual({ carrier: 'CJ', trackingNumber: '123456789012' });
  });

  it('취소하면 아무것도 보내지 않고 폼으로 돌아온다 — 적어 둔 값은 남는다', async () => {
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));
    await user.click(within(screen.getByRole('group', { name: '배송지가 바뀐 주문입니다' })).getByRole('button', { name: '취소' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '송장 등록하고 배송 시작' })).toBeInTheDocument();
    expect(screen.getByLabelText(/송장번호/)).toHaveValue('123456789012');
  });

  it('막히면 이유를 말하고 화면을 다시 그리지 않는다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: '취소 주문에는 송장을 등록할 수 없습니다.' }), { status: 409 }),
    );
    const user = userEvent.setup();
    draw(changed);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '송장 등록하고 배송 시작' }));
    await user.click(screen.getByRole('button', { name: '주소를 확인했습니다 — 등록' }));

    expect((await screen.findByRole('alert')).textContent).toContain('취소 주문');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
