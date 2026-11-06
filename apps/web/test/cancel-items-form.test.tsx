// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CancelItemsForm } = await import('~/components/cancel-items-form');

/**
 * 일부 상품 취소 폼.
 *
 * **돌려받을 금액은 서버에게 묻는다.** 판매가를 더해 보여 주면 쿠폰 몫·포인트·배송비 차감이
 * 빠진 숫자가 되고, 누르고 나서 금액이 달라진다.
 */

const ITEMS = [
  { id: 'i-coat', productName: '울 코트', optionLabel: '오트 / M', quantity: 1, subtotal: 60_000 },
  { id: 'i-knit', productName: '라운드 니트', optionLabel: '블랙 / L', quantity: 2, subtotal: 30_000 },
];

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { preview?: boolean; itemIds: string[] };
    if (body.preview) {
      return json(200, body.itemIds.includes('i-coat')
        ? { kind: 'partial', cash: 48_000, points: 3_000, shippingDeducted: 3_000 }
        : { kind: 'partial', cash: 25_500, points: 1_500, shippingDeducted: 0 });
    }
    return json(200, { kind: 'partial', refunded: 25_500 });
  });
});

const open = async () => {
  render(<CancelItemsForm orderNo="20260914-0000001" items={ITEMS} />);
  await userEvent.click(screen.getByRole('button', { name: '일부 상품만 취소' }));
};

describe('구조', () => {
  it('열면 이름 붙은 폼으로 초점이 가고, 상품은 한 묶음의 체크박스다', async () => {
    await open();
    const form = screen.getByRole('form', { name: '취소할 상품' });
    expect(document.activeElement).toBe(form);
    expect(screen.getByRole('group', { name: '취소할 상품' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('고른 것이 없으면 취소 단추가 잠기고 왜인지 말한다', async () => {
    await open();
    const submit = screen.getByRole('button', { name: '고른 상품 취소' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAccessibleDescription('취소할 상품을 골라 주세요.');
  });
});

describe('돌려받을 금액', () => {
  it('고르면 서버에게 묻고, 배송비 차감까지 보여 준다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect(await screen.findByText('48,000원')).toBeInTheDocument();
    expect(screen.getByText('3,000P')).toBeInTheDocument();
    expect(screen.getByText('-3,000원')).toBeInTheDocument();
    expect(screen.getByText(/무료배송 기준보다 적어져/)).toBeInTheDocument();

    const asked = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as { preview: boolean; itemIds: string[] };
    expect(asked).toMatchObject({ preview: true, itemIds: ['i-coat'] });
  });

  it('늦게 온 옛 답이 새로 고른 것의 금액을 덮지 않는다', async () => {
    let releaseSlow!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseSlow = () => resolve(json(200, { kind: 'partial', cash: 48_000, points: 3_000, shippingDeducted: 3_000 }));
    }));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    expect(await screen.findByText('25,500원')).toBeInTheDocument();

    await act(async () => releaseSlow());
    expect(screen.queryByText('48,000원')).toBeNull();
  });

  it('남는 상품이 없으면 주문 전체가 취소된다고 알린다', async () => {
    fetchMock.mockImplementation(async () => json(200, { kind: 'full', cash: 85_000, points: 5_000, shippingDeducted: 0 }));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    expect(await screen.findByText(/주문 전체가 취소됩니다/)).toBeInTheDocument();
  });
});

describe('취소', () => {
  it('고른 줄과 사유를 보내고, 끝나면 닫고 새로 그린다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as Record<string, unknown>;
    expect(sent).toEqual({ itemIds: ['i-knit'], reason: '단순 변심' });
    expect(screen.getByText('상품 1개를 취소했습니다.')).toBeInTheDocument();
    // 닫히면 여는 단추로 초점이 돌아온다
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '일부 상품만 취소' }));
  });

  it('거절되면 서버의 말을 보여 주고 열어 둔다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    fetchMock.mockResolvedValueOnce(json(409, { message: '주문 전체를 취소해 주세요.' }));

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문 전체를 취소해 주세요.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('취소 뒤 남은 상품이 하나일 때', () => {
  it('여는 단추는 감추되, 방금 끝난 취소의 안내는 남는다', async () => {
    /*
     * 두 줄 중 하나를 취소하면 화면이 새로 그려져 남은 줄이 하나가 된다. 부품이 통째로 사라지면
     * "취소했습니다" 도 함께 사라진다 — 문지기의 e2e 가 그렇게 졌다.
     */
    const view = render(<CancelItemsForm orderNo="20260914-0000001" items={ITEMS} />);
    await userEvent.click(screen.getByRole('button', { name: '일부 상품만 취소' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));
    await screen.findByText('상품 1개를 취소했습니다.');

    // 새로 그려져 남은 줄이 하나로 내려온다
    view.rerender(<CancelItemsForm orderNo="20260914-0000001" items={[ITEMS[0]!]} />);

    expect(screen.queryByRole('button', { name: '일부 상품만 취소' })).toBeNull();
    expect(screen.getByText('상품 1개를 취소했습니다.')).toBeInTheDocument();
  });
});

/**
 * **금액을 못 받았을 때.**
 *
 * 금액은 서버에게 묻는다. 그 물음이 거절되거나 터지면 **금액 자리가 비는데**, 아무 말도
 * 안 하면 사람은 계산이 늦는 줄 알고 기다린다. 그러고는 금액을 모르는 채로 누른다.
 */
describe('금액을 못 받으면', () => {
  it('서버가 한 말을 보여 준다', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: '이 주문은 줄 단위로 취소할 수 없습니다.' }));
    await open();

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('이 주문은 줄 단위로');
  });

  /**
   * **본문이 JSON 이 아닐 수도 있다.** 앞단이 502 HTML 을 주거나 본문이 비면 `res.json()`
   * 이 던진다 — 그걸 잡지 않으면 서버가 한 말 대신 그 던짐이 올라가 `.catch` 로 떨어지고,
   * 같은 문구가 뜨기는 하지만 **왜 그런지 모르는 채로** 그렇게 된다. 여기서는 잡아서
   * 빈 객체로 두고 기본 문구를 쓴다.
   */
  it('본문이 JSON 이 아니어도 무엇이 안 됐는지 말한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    await open();

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문을 취소하지 못했습니다');
  });

  /**
   * **200 인데 본문이 깨진 경우가 가장 나쁘다.** 거절이면 적어도 거절이라고 아는데, 이쪽은
   * 성공으로 보인다 — 예전에는 빈 금액이 **오류도 없이** 서고 사람은 계산이 끝난 줄 알았다.
   */
  it('200 인데 본문이 깨져 있으면 금액을 믿지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>프록시가 끼어들었다</html>', { status: 200 }));
    await open();

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문을 취소하지 못했습니다');
  });

  it('물음 자체가 터지면 무엇이 안 됐는지 말한다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('네트워크가 끊겼다'));
    await open();

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문을 취소하지 못했습니다');
  });

  /** 다시 고르면 옛 오류는 거둔다 — 안 거두면 방금 고른 것이 먹혔는지 알 수 없다 */
  it('다시 골라 금액이 오면 오류를 거둔다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('네트워크가 끊겼다'));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await screen.findByRole('alert');

    // 코트를 끄고 니트를 켠다 — 고른 것이 바뀌면 다시 묻는다
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));

    expect(await screen.findByText('25,500원')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * **보내기가 터졌을 때.**
 *
 * 거절은 이미 본다(위의 '거절되면'). 여기서 보는 것은 **요청이 아예 못 간 경우**다 —
 * 지하철이나 기내다. 말하지 않으면 사람은 취소가 된 줄 알고 나가고, 주문은 그대로 있다.
 */
describe('보내기가 터지면', () => {
  it('말하고, 폼을 열어 둔 채 다시 누를 수 있다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    fetchMock.mockRejectedValueOnce(new Error('네트워크가 끊겼다'));

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문을 취소하지 못했습니다');
    expect(refresh).not.toHaveBeenCalled();
    // 보내는 중에서 멈추지 않았다 — 같은 단추가 그대로 있다
    expect(screen.getByRole('button', { name: '고른 상품 취소' })).toBeInTheDocument();
  });
});

/**
 * **못 누르는 단추는 `disabled` 가 아니라 `aria-disabled` 다.**
 *
 * 그렇게 두는 까닭은 낭독기가 단추를 건너뛰지 않게 하려는 것인데(왜 못 누르는지 읽을 수
 * 있어야 한다), 그 대가로 **클릭은 그대로 들어온다.** 그래서 보내는 쪽이 한 번 더 막는다.
 *
 * 막지 않으면 아무것도 안 고른 취소가 창구로 나간다.
 */
describe('고른 것이 없으면', () => {
  it('눌러도 보내지 않는다', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * **사유 칸은 기본값을 담고 시작한다**(`단순 변심`). 비워 두고 보내는 사람이 대부분이라
 * 그 값을 미리 넣어 두는데, 그래서 **지우고 적어야** 사람이 적은 말이 간다. 빈 칸으로
 * 보내면 다시 기본값으로 떨어진다 — 그 둘을 함께 본다.
 */
describe('사유', () => {
  it('적으면 그대로 보낸다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    const field = screen.getByLabelText('취소 사유');
    expect(field).toHaveValue('단순 변심');
    await userEvent.clear(field);
    await userEvent.type(field, '색이 달라요');

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({ reason: '색이 달라요' });
  });

  it('비워 두면 기본값으로 보낸다 — 창구가 빈 사유를 거절한다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    await userEvent.clear(screen.getByLabelText('취소 사유'));

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({ reason: '단순 변심' });
  });
});

/**
 * **돌아가면 고른 것과 오류를 거둔다.**
 *
 * 안 거두면 다시 열었을 때 **지난번에 고른 줄이 체크된 채로** 보인다 — 그 상태로 누르면
 * 생각하지 않은 줄이 취소된다. 오류도 그렇다: 지난번 실패가 남아 있으면 지금 무엇이
 * 잘못된 줄 안다.
 */
describe('돌아가기', () => {
  it('고른 것과 오류를 거두고 닫는다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('네트워크가 끊겼다'));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    await userEvent.click(screen.getByRole('button', { name: '일부 상품만 취소' }));

    expect(screen.getByRole('checkbox', { name: /울 코트/ })).not.toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
