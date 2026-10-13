// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ORDER_STATUS, ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';
import { OrderStatusActions } from '~/components/admin/order-status-actions';

/**
 * 주문 상태 전이 — **운영 화면에서 가장 되돌리기 어려운 단추들.**
 *
 * 검사가 한 줄도 없었다. 그리고 손님 쪽에서 오늘 고친 것과 **똑같은 자리 셋**이 비어 있었다.
 *
 * **하나, 눌리는 것을 아무도 막지 않았다.** `Button` 은 disabled 대신 aria-disabled 를 쓰므로
 * 눌리기는 한다 — 조건은 핸들러가 지켜야 한다. 보내는 동안 화면에는 '처리 중…' 만 뜨니,
 * 안 눌린 줄 안 운영자가 바로 옆의 **'취소됨(으)로 변경'** 을 누르면 두 전이가 동시에 날아간다.
 *
 * **둘, try 가 없어 길이 끊기면 버튼 전부가 영영 잠겼다.** 아무 말도 없이.
 *
 * **셋, 502 가 HTML 을 주면 `json()` 이 던져 아무 문구도 안 떴다.** 버튼은 풀리는데 화면에는
 * 성공도 실패도 없다 — 운영자는 됐는지 안 됐는지 알 길이 없다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ORDER_NO = '20261013-7565428';
const OPTIONS = ['SHIPPED', 'CANCELLED'] as const satisfies readonly OrderStatus[];

const open = (options: readonly OrderStatus[] = OPTIONS) =>
  render(<OrderStatusActions orderNo={ORDER_NO} options={options} />);

const button = (to: OrderStatus) =>
  screen.getByRole('button', { name: `${ORDER_STATUS_LABEL[to]}(으)로 변경` });

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

/**
 * **어떤 전이가 가능한지는 서버가 상태머신으로 계산해 내려 준다.** 화면이 자기 나름의 규칙을
 * 가지면 서버와 어긋나고, 그 어긋남은 버튼을 눌러야 드러난다.
 */
describe('무엇을 내놓나', () => {
  it('서버가 준 전이만 세운다 — 화면이 보태지 않는다', () => {
    open();

    const names = screen.getAllByRole('button').map((b) => b.textContent);
    // 이름을 손으로 적지 않는다 — 이름표가 바뀌면 화면이 아니라 이 줄이 늦는다
    expect(names).toEqual(OPTIONS.map((to) => `${ORDER_STATUS_LABEL[to]}(으)로 변경`));
  });

  it('갈 곳이 없으면 그렇다고 말한다 — 빈 자리를 두면 고장으로 읽힌다', () => {
    open([]);

    expect(screen.getByText('더 이상 변경할 수 있는 상태가 없습니다.')).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  /** 코드가 새어 나오면 운영자는 'SHIPPED' 을 읽게 된다 */
  it.each(ORDER_STATUS)('%s 에 사람이 읽을 이름표가 있다', (status: OrderStatus) => {
    open([status]);

    const name = screen.getAllByRole('button')[0]!.textContent ?? '';
    expect(name).not.toContain(status);
    expect(name).toContain(ORDER_STATUS_LABEL[status]);
  });

  /** 되돌리기 가장 어려운 것은 생김새로도 갈라 둔다 */
  it('취소는 다른 전이와 다르게 보인다', () => {
    open();

    expect(button('CANCELLED').className).not.toBe(button('SHIPPED').className);
  });
});

describe('전이를 보낼 때', () => {
  it('고른 상태를 그 주문으로 보낸다', async () => {
    open();

    await userEvent.click(button('SHIPPED'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(`/api/admin/orders/${ORDER_NO}/status`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ to: 'SHIPPED' });
  });

  it('됐으면 무엇이 됐는지 말하고 화면을 다시 받아 온다', async () => {
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('status')).toHaveTextContent(`${ORDER_STATUS_LABEL.SHIPPED}(으)로 변경했습니다.`);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /*
   * **가맹점이 여럿인 주문은 자기 상품만 움직인다.** 그때 "배송중으로 변경했습니다" 라고만
   * 하면 운영자는 주문 전체가 움직인 줄 안다.
   */
  it('남의 상품이 남았으면 주문 전체는 그대로라고 말한다', async () => {
    vi.stubGlobal('fetch', reply({ waitingForOthers: true, itemsMoved: 2 }));
    open();

    await userEvent.click(button('SHIPPED'));

    const said = (await screen.findByRole('status')).textContent ?? '';
    expect(said).toContain('내 상품 2건');
    expect(said).toContain('주문 전체 상태는 아직 그대로');
  });
});

describe('못 보냈을 때', () => {
  it('서버가 말한 까닭을 그대로 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '배송중에서 결제완료로는 되돌릴 수 없습니다.' }, 409));
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('배송중에서 결제완료로는 되돌릴 수 없습니다.');
  });

  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('alert')).toHaveTextContent('상태를 변경하지 못했습니다.');
  });

  /*
   * 앞단이 502 HTML 을 주면 `json()` 이 던진다. 안 잡으면 **성공도 실패도 안 뜨고** 버튼만
   * 풀렸다 — 운영자는 됐는지 안 됐는지 알 길이 없다.
   */
  it('응답이 JSON 이 아니어도 반드시 무슨 말이든 한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('alert')).toHaveTextContent('상태를 변경하지 못했습니다.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('성공 응답이 JSON 이 아니어도 됐다고는 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('status')).toHaveTextContent(`${ORDER_STATUS_LABEL.SHIPPED}(으)로 변경했습니다.`);
  });

  it('못 보냈으면 됐다고 말하지 않고 화면도 다시 받지 않는다', async () => {
    vi.stubGlobal('fetch', reply({ message: '안 됩니다.' }, 409));
    open();

    await userEvent.click(button('SHIPPED'));

    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  /** try 가 없어 끊기면 버튼 전부가 영영 잠겼다 — 운영 화면에서는 죽은 화면이다 */
  it('길이 끊기면 말하고, 다시 누를 수 있게 돌려놓는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(button('SHIPPED'));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
    expect(screen.queryByRole('button', { name: '처리 중…' })).toBeNull();
    expect(button('SHIPPED')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('다시 누르면 지난 오류는 치운다', async () => {
    vi.stubGlobal('fetch', reply({ message: '안 됩니다.' }, 409));
    open();
    await userEvent.click(button('SHIPPED'));
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', reply({ ok: true }));
    await userEvent.click(button('SHIPPED'));

    await screen.findByRole('status');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * **눌리는 것을 막지 않으므로 핸들러가 막는다.** 여기가 특히 위험한 것은, 잠긴 것처럼 보이는
 * 동안 **바로 옆에 '취소됨(으)로 변경'** 이 있기 때문이다.
 */
describe('보내는 동안', () => {
  const hold = () => {
    let release!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    }));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, release: () => release() };
  };

  it('보내는 중인 단추가 이름을 바꿔 스스로 설명한다', async () => {
    hold();
    open();

    await userEvent.click(button('SHIPPED'));

    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDefined();
  });

  it('같은 단추를 세 번 눌러도 한 번만 나간다', async () => {
    const { fetchMock, release } = hold();
    open();

    const shipping = button('SHIPPED');
    await userEvent.click(shipping);
    await userEvent.click(shipping);
    await userEvent.click(shipping);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /*
   * 여기가 가장 나쁜 자리다. '처리 중…' 을 보고 안 눌린 줄 안 운영자가 옆의 취소를 누르면,
   * 예전에는 배송중과 주문취소가 **동시에** 날아갔다.
   */
  it('보내는 동안 옆의 취소를 눌러도 나가지 않는다', async () => {
    const { fetchMock, release } = hold();
    open();

    await userEvent.click(button('SHIPPED'));
    await userEvent.click(button('CANCELLED'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ to: 'SHIPPED' });
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  /** 함께 잠기는 다른 단추들은 이름이 그대로라, 왜 안 되는지 어디에도 없었다 */
  it('함께 잠기는 단추는 왜 못 누르는지 말한다', async () => {
    hold();
    open();

    await userEvent.click(button('SHIPPED'));

    const other = button('CANCELLED');
    expect(other).toHaveAttribute('aria-disabled', 'true');
    expect(other).toHaveAccessibleDescription('처리가 끝난 뒤에 누를 수 있습니다');
  });

  it('끝나면 다시 누를 수 있다', async () => {
    vi.stubGlobal('fetch', reply({ message: '안 됩니다.' }, 409));
    open();
    await userEvent.click(button('SHIPPED'));
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', reply({ ok: true }));
    await userEvent.click(button('CANCELLED'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
