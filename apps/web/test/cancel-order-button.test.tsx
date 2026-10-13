// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CancelOrderButton } from '~/components/cancel-order-button';

/**
 * 주문 취소 — **되돌릴 수 없는 단추.**
 *
 * 검사가 한 줄도 없었다. 그리고 두 자리가 비어 있었다.
 *
 * **하나, 눌리는 것을 아무도 막지 않았다.** `Button` 은 disabled 대신 aria-disabled 를 쓴다
 * (못 누르는 버튼은 초점을 못 받아 왜 못 누르는지 들리지 않는다). 대신 눌리기는 하므로 조건을
 * 핸들러가 지켜야 하는데 — 주문 만들기는 같은 까닭으로 같은 처방을 쓴다 — 여기는 안 지켰다.
 * 보내는 동안 세 번 누르면 취소가 세 번 나갔고, 뒤의 둘이 "이미 취소된 주문" 으로 거절돼
 * **방금 성공한 사람 화면에 빨간 실패 문구**가 떴다.
 *
 * **둘, 길이 끊기면 영영 '취소 중…' 이었다.** try 가 없어 아무 말도 없이 멈췄다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ORDER_NO = '20261013-7565428';

const open = () => render(<CancelOrderButton orderNo={ORDER_NO} />);

/** 확인 자리를 연다. 확인 자리의 '주문 취소' 는 둘 중 뒤엣것이다. */
const openConfirm = async () => {
  await userEvent.click(screen.getByRole('button', { name: '주문 취소' }));
};
const confirmButton = () => screen.getAllByRole('button', { name: '주문 취소' }).at(-1)!;

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

/**
 * **되돌릴 수 없는 동작이라 한 번 더 묻는다.** 주문 화면에서 스치듯 눌리는 자리고, 눌리면
 * 결제가 풀리고 재고가 돌아간다.
 */
describe('한 번 더 묻는다', () => {
  it('첫 누름으로는 아무것도 보내지 않는다', async () => {
    open();

    await openConfirm();

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText('주문을 취소할까요?')).toBeDefined();
  });

  /** 무엇이 돌아오고 무엇이 되돌릴 수 없는지 누르기 전에 말한다 */
  it('무슨 일이 일어나는지 묻는 자리에서 말한다', async () => {
    open();

    await openConfirm();

    expect(screen.getByText(/환불되고, 사용한 포인트와 쿠폰은 돌려받습니다/)).toBeDefined();
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeDefined();
  });

  it('돌아가면 아무 일도 없다', async () => {
    open();

    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

    expect(screen.queryByText('주문을 취소할까요?')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * 사유를 받는 까닭은 **감사 로그**다 — 나중에 "왜 취소됐지" 를 답할 수 있어야 한다.
 */
describe('취소 사유', () => {
  it('미리 적어 둔 사유로 시작한다 — 빈 칸을 두면 아무도 안 적는다', async () => {
    open();

    await openConfirm();

    expect(screen.getByLabelText('취소 사유')).toHaveValue('단순 변심');
  });

  it('적은 사유를 그대로 보낸다', async () => {
    open();

    await openConfirm();
    const field = screen.getByLabelText('취소 사유');
    await userEvent.clear(field);
    await userEvent.type(field, '색이 생각과 달라서');
    await userEvent.click(confirmButton());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(`/api/orders/${ORDER_NO}/cancel`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: '색이 생각과 달라서' });
  });

  /** 사유 없이 남은 감사 로그는 "왜" 에 답하지 못한다 — 빈 칸이면 기본 사유로 적는다 */
  it.each([
    ['비우면', ''],
    ['공백만 남기면', '   '],
  ])('%s 기본 사유로 보낸다', async (_why, text) => {
    open();

    await openConfirm();
    const field = screen.getByLabelText('취소 사유');
    await userEvent.clear(field);
    if (text) await userEvent.type(field, text);
    await userEvent.click(confirmButton());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: '단순 변심' });
  });
});

describe('취소했을 때', () => {
  it('화면을 다시 받아 온다 — 상태와 환불 금액이 거기서 바뀐다', async () => {
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('묻는 자리를 닫는다', async () => {
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    await waitFor(() => expect(screen.queryByText('주문을 취소할까요?')).toBeNull());
  });

  it('성공했으면 실패를 적지 않는다', async () => {
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('취소하지 못했을 때', () => {
  it('서버가 말한 까닭을 그대로 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '배송이 시작된 주문은 취소할 수 없습니다.' }, 409));
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('배송이 시작된 주문은 취소할 수 없습니다.');
  });

  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('주문을 취소하지 못했습니다.');
  });

  /** 502 가 HTML 을 돌려주면 json() 이 터진다. 그것까지 "네트워크 오류" 로 뭉뚱그리지 않는다 */
  it('응답이 JSON 이 아니어도 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('주문을 취소하지 못했습니다.');
  });

  /*
   * try 가 없어서, 길이 끊기면 버튼이 '취소 중…' 인 채로 **영영** 남았다 — 아무 말도 없이.
   * 다시 눌러 볼 수도 없다.
   */
  it('길이 끊기면 말하고, 다시 누를 수 있게 돌려놓는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
    expect(screen.queryByRole('button', { name: '취소 중…' })).toBeNull();
    expect(confirmButton()).toHaveAccessibleName('주문 취소');
  });

  it('못 취소했으면 묻는 자리를 닫지 않는다 — 적은 사유도 남는다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 취소된 주문입니다.' }, 409));
    open();

    await openConfirm();
    const field = screen.getByLabelText('취소 사유');
    await userEvent.clear(field);
    await userEvent.type(field, '색이 생각과 달라서');
    await userEvent.click(confirmButton());

    await screen.findByRole('alert');
    expect(screen.getByLabelText('취소 사유')).toHaveValue('색이 생각과 달라서');
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * **눌리는 것을 막지 않으므로 핸들러가 막는다.**
 *
 * aria-disabled 는 눌림을 막지 않는다 — 그것이 이 저장소가 고른 값이고(초점을 받아야 왜 못
 * 누르는지 들린다), 그래서 조건을 핸들러가 지켜야 한다.
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

  it('단추가 이름을 바꿔 스스로 설명한다', async () => {
    hold();
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    expect(screen.getByRole('button', { name: '취소 중…' })).toBeDefined();
  });

  it('세 번 눌러도 취소는 한 번만 나간다', async () => {
    const { fetchMock, release } = hold();
    open();

    await openConfirm();
    const button = confirmButton();
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /** 끝난 뒤에는 다시 열어 누를 수 있어야 한다 — 거절당한 뒤 사유를 고쳐 다시 보내는 길이다 */
  it('끝나면 다시 누를 수 있다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 취소된 주문입니다.' }, 409));
    open();

    await openConfirm();
    await userEvent.click(confirmButton());
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', reply({ ok: true }));
    await userEvent.click(confirmButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /** 돌아가기도 함께 잠기는데, 이름은 '돌아가기' 그대로라 왜 안 되는지 어디에도 없었다 */
  it('함께 잠기는 돌아가기는 왜 못 누르는지 말한다', async () => {
    hold();
    open();

    await openConfirm();
    await userEvent.click(confirmButton());

    const back = screen.getByRole('button', { name: '돌아가기' });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    expect(back).toHaveAccessibleDescription('처리가 끝난 뒤에 누를 수 있습니다');
  });
});
