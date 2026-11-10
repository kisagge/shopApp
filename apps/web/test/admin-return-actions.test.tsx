// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { CARRIERS, won } from '@shop/core';

const router = vi.hoisted(() => ({
  refresh: vi.fn<(...a: any[]) => any>(),
  replace: vi.fn<(...a: any[]) => any>(),
  push: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const {
  WithdrawReturnButton,
  ReturnActions,
  CompleteReturnButton,
  ReceiveReturnButton,
  ShipExchangeForm,
} = await import('~/app/admin/orders/[orderNo]/return-actions');

/**
 * 반품·교환 창구 여섯. **단위 검사가 한 줄도 없었다** — 커버리지가 122개 문장 중
 * 101개를 "안 돈다" 고 찍었고, 이 저장소에서 가장 큰 빈 자리였다.
 *
 * 여섯이 같은 창구(`action` 만 다름)를 두드리는데 **실패했을 때 하는 일이 저마다
 * 다르다.** 어떤 것은 적어 둔 사유를 지키려고 폼을 열어 두고, 어떤 것은 앞서 띄운
 * 성공 문구를 지우고, 어떤 것은 두 번 눌리는 것을 ref 로 막는다. 그 차이가 전부
 * 까닭이 있어서(주석에 적혀 있다) 여기서 못 박는다.
 */

const ORDER_NO = '20260914-0000001';
const ENDPOINT = `/api/admin/orders/${ORDER_NO}/return`;

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** 보낸 몸통을 읽는다 — 어느 `action` 으로, 무엇을 실어 보냈나 */
const sent = (call = 0) =>
  JSON.parse(fetchMock.mock.calls[call]![1].body as string) as Record<string, unknown>;

/** 응답을 손에 쥐고 있다가 늦게 준다 — 보내는 중의 모습과 두 번 누름을 보려면 필요하다 */
function held() {
  let give!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    give = resolve;
  });
  return { promise, give };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(200, { orderNo: ORDER_NO, refunded: 48_000 }));
});

const alert = () => screen.getByRole('alert').textContent;

describe('승인 철회 — 승인한 신청을 무른다', () => {
  it('처음에는 단추와 설명만 있고, 교환이면 재고가 풀린다고 말한다', () => {
    render(<WithdrawReturnButton orderNo={ORDER_NO} exchange />);

    expect(screen.getByRole('button', { name: '승인 철회' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByText(/바꿀 옵션으로 잡아 둔 재고가 풀립니다/)).toBeInTheDocument();
  });

  it('반품이면 주문이 신청 전 상태로 돌아간다고 말한다 — 교환과 다른 말이다', () => {
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    expect(screen.getByText(/주문은 신청 전 상태로 돌아갑니다/)).toBeInTheDocument();
  });

  it('열면 이름 붙은 폼이 되고 사유는 필수다', async () => {
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    expect(screen.getByRole('form', { name: '승인 철회' })).toBeInTheDocument();
    const reason = screen.getByLabelText(/철회 사유/);
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('maxLength', '300');
  });

  it('보내는 사유는 다듬어진다 — 앞뒤 공백이 고객에게 그대로 보이지 않게', async () => {
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '  기한 안에 물건이 오지 않았습니다.  ');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(ENDPOINT);
    expect(sent()).toEqual({ action: 'WITHDRAW', rejectReason: '기한 안에 물건이 오지 않았습니다.' });
  });

  it('성공하면 폼이 닫히고 화면을 다시 그린다', async () => {
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '안 왔습니다');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('실패하면 창구의 말을 띄우고 폼은 열어 둔다 — 적어 둔 사유를 다시 안 적게', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 끝난 신청입니다.' }));
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '안 왔습니다');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(alert()).toBe('이미 끝난 신청입니다.'));
    expect(screen.getByRole('form', { name: '승인 철회' })).toBeInTheDocument();
    expect(screen.getByLabelText(/철회 사유/)).toHaveValue('안 왔습니다');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('창구가 까닭을 안 적어 보내면 우리 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '안 왔습니다');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(alert()).toBe('처리하지 못했습니다.'));
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '안 왔습니다');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(alert()).toBe('네트워크 오류로 처리하지 못했습니다.'));
  });

  it('보내는 중에는 두 단추가 다 잠긴다 — 그만두기도 같이', async () => {
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    render(<WithdrawReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));
    await userEvent.type(screen.getByLabelText(/철회 사유/), '안 왔습니다');
    await userEvent.click(screen.getByRole('button', { name: '승인 철회' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '무르는 중…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: '그만두기' })).toBeDisabled();

    await act(async () => {
      wait.give(json(200, {}));
    });
  });
});

describe('승인·반려', () => {
  it('승인은 사유 없이 바로 간다', async () => {
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반품 승인' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ action: 'APPROVE' });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('교환이면 승인 단추가 교환 승인이라고 적는다', () => {
    render(<ReturnActions orderNo={ORDER_NO} exchange />);
    expect(screen.getByRole('button', { name: '교환 승인' })).toBeInTheDocument();
  });

  it('승인 중에는 단추가 잠긴다 — 두 번 누르면 두 번 간다', async () => {
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반품 승인' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled());
    await act(async () => {
      wait.give(json(200, {}));
    });
  });

  it('반려를 누르면 사유 폼이 열리고, 취소하면 단추로 돌아온다', async () => {
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    const reason = screen.getByLabelText(/반려 사유/);
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('maxLength', '300');
    expect(screen.queryByRole('button', { name: '반품 승인' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '반품 승인' })).toBeInTheDocument();
  });

  it('반려 사유도 다듬어 보내고, 성공하면 폼이 닫힌다', async () => {
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.type(screen.getByLabelText(/반려 사유/), '  사용한 흔적이 있습니다  ');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ action: 'REJECT', rejectReason: '사용한 흔적이 있습니다' });
    expect(screen.getByRole('button', { name: '반품 승인' })).toBeInTheDocument();
  });

  it('공백만 적으면 빈 사유로 가고, 계약이 막은 말을 그대로 보여 준다', async () => {
    /*
     * 칸은 `required` 라서 아예 비우면 브라우저가 막는데, **공백은 통과한다.**
     * 다듬으면 빈 문자열이고 계약(`resolveReturnSchema`)이 거절한다 — 화면이
     * 그 말을 보여 주지 않으면 누른 사람은 아무 일도 안 일어난 줄로 안다.
     */
    fetchMock.mockResolvedValue(json(400, { code: 'VALIDATION_FAILED', message: '반려 사유를 적어 주세요.' }));
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.type(screen.getByLabelText(/반려 사유/), '   ');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    await waitFor(() => expect(alert()).toBe('반려 사유를 적어 주세요.'));
    expect(sent()).toEqual({ action: 'REJECT', rejectReason: '' });
    expect(screen.getByLabelText(/반려 사유/)).toBeInTheDocument();
  });

  it('승인이 실패하면 말이 뜨고 반려 길은 그대로 있다', async () => {
    fetchMock.mockResolvedValue(json(403, { message: '권한이 없습니다.' }));
    render(<ReturnActions orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '반품 승인' }));

    await waitFor(() => expect(alert()).toBe('권한이 없습니다.'));
    expect(screen.getByRole('button', { name: '반려' })).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('회수 확인 · 환불 — 누르기 전에 얼마가 나가는지 보인다', () => {
  const preview = {
    kind: 'partial',
    cash: won(48_000),
    points: won(3_000),
    shippingDeducted: won(3_000),
  } as const;
  const complete = (props: Partial<Parameters<typeof CompleteReturnButton>[0]> = {}) =>
    render(<CompleteReturnButton orderNo={ORDER_NO} preview={preview} {...props} />);

  it('일부 반품이면 결제 수단·포인트·배송비 차감을 따로 적는다', () => {
    complete();
    const rows = within(screen.getByRole('group', { name: '돌려줄 금액' }));

    expect(rows.getByText('결제 수단으로').nextElementSibling).toHaveTextContent('48,000원');
    expect(rows.getByText('포인트로').nextElementSibling).toHaveTextContent('3,000P');
    expect(rows.getByText('배송비 차감 (단순 변심)').nextElementSibling).toHaveTextContent('-3,000원');
  });

  it('포인트와 배송비 차감이 0이면 그 줄을 안 적는다 — 0원이라고 적으면 묻게 된다', () => {
    complete({ preview: { kind: 'partial', cash: won(25_500), points: won(0), shippingDeducted: won(0) } });

    expect(screen.queryByText('포인트로')).toBeNull();
    expect(screen.queryByText('배송비 차감 (단순 변심)')).toBeNull();
    expect(screen.getByText('결제 수단으로').nextElementSibling).toHaveTextContent('25,500원');
  });

  it('주문째 돌려받으면 금액 표 대신 남은 결제 금액 전부라고 말한다', () => {
    complete({ preview: { kind: 'full' } });

    expect(screen.queryByRole('group', { name: '돌려줄 금액' })).toBeNull();
    expect(screen.getByText(/남은 결제 금액 전부를 환불합니다/)).toBeInTheDocument();
  });

  it('미리 셈한 것이 없으면 아무 금액도 적지 않는다', () => {
    complete({ preview: null });

    expect(screen.queryByRole('group', { name: '돌려줄 금액' })).toBeNull();
    expect(screen.queryByText(/남은 결제 금액 전부/)).toBeNull();
  });

  it('가맹점이 이미 도착을 확인했으면 운영진은 환불만 한다', () => {
    complete({ received: true });

    expect(screen.getByRole('button', { name: '환불' })).toBeInTheDocument();
    expect(screen.getByText(/가맹점이 물건 도착을 확인했습니다/)).toBeInTheDocument();
  });

  it('돌려준 금액을 천 단위로 끊어 알린다 — 창구가 센 수를 그대로', async () => {
    fetchMock.mockResolvedValue(json(200, { refunded: 1_234_500 }));
    complete();
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 환불' }));

    await waitFor(() => expect(screen.getByText('1,234,500원을 돌려줬습니다.')).toBeInTheDocument());
    expect(sent()).toEqual({ action: 'COMPLETE' });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('빨리 두 번 눌러도 한 번만 간다 — 단추가 눌리는 것을 막지 않는다', async () => {
    /*
     * `Button` 은 `disabled` 대신 `aria-disabled` 를 쓴다(못 누르는 단추는 초점을 못
     * 받아 왜 못 누르는지 들리지 않는다). 그래서 **눌리기는 한다** — 두 번 누름을
     * 막는 것은 ref 하나뿐이고, 그게 없으면 환불이 두 번 간다.
     */
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    complete();
    const button = screen.getByRole('button', { name: '회수 확인 · 환불' });

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '환불하는 중…' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      wait.give(json(200, { refunded: 1_000 }));
    });
  });

  it('실패하면 환불 문구가 아니라 까닭이 뜨고, 다시 누를 수 있다', async () => {
    fetchMock.mockResolvedValue(json(502, { message: '결제사가 응답하지 않습니다.' }));
    complete();
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 환불' }));

    await waitFor(() => expect(alert()).toBe('결제사가 응답하지 않습니다.'));
    expect(screen.queryByText(/돌려줬습니다/)).toBeNull();

    const button = screen.getByRole('button', { name: '회수 확인 · 환불' });
    expect(button).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('창구가 까닭을 안 적어 보내면 환불 쪽 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    complete();
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 환불' }));

    await waitFor(() => expect(alert()).toBe('환불하지 못했습니다.'));
  });
});

describe('물건 도착 확인 — 가맹점이 누른다', () => {
  it('끝났다는 말을 이 자리에 담지 않고 주소에 싣는다 — 단추가 통째로 사라진다', async () => {
    /*
     * 확인이 기록되면 화면을 다시 그리면서 이 단추 자리가 없어진다. 여기 담아 둔
     * 말도 함께 사라져 누른 사람에게는 아무 일도 안 일어난 것처럼 보인다.
     */
    render(<ReceiveReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith(
      `/admin/orders/${ORDER_NO}?done=received`,
      { scroll: false },
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual({ action: 'RECEIVE' });
  });

  it('주문번호는 주소에 넣을 수 있게 감싼다', async () => {
    render(<ReceiveReturnButton orderNo="20260914/0000001" />);
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/admin/orders/20260914%2F0000001?done=received',
        { scroll: false },
      ),
    );
  });

  it('실패하면 확인 쪽 문구를 쓰고 주소를 바꾸지 않는다', async () => {
    fetchMock.mockResolvedValue(json(409, {}));
    render(<ReceiveReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() => expect(alert()).toBe('확인하지 못했습니다.'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('빨리 두 번 눌러도 한 번만 간다', async () => {
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    render(<ReceiveReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));
    await userEvent.click(screen.getByRole('button', { name: '확인하는 중…' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      wait.give(json(200, {}));
    });
  });

  it('네트워크 오류도 이 자리에 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<ReceiveReturnButton orderNo={ORDER_NO} />);
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() => expect(alert()).toBe('네트워크 오류로 처리하지 못했습니다.'));
  });
});

describe('교환 상품 발송', () => {
  it('택배사는 코드 표에서 끌어오고 CJ 가 기본이다', () => {
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    const select = screen.getByLabelText('택배사');

    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(
      CARRIERS.map((c) => c.name),
    );
    expect(select).toHaveValue('CJ');
  });

  it('송장번호는 필수고 40자까지다', () => {
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    const tracking = screen.getByLabelText(/교환 송장번호/);

    expect(tracking).toBeRequired();
    expect(tracking).toHaveAttribute('maxLength', '40');
  });

  it('택배사와 송장번호를 다듬어 보내고 끝난 것을 알린다', async () => {
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    await userEvent.selectOptions(screen.getByLabelText('택배사'), 'EPOST');
    await userEvent.type(screen.getByLabelText(/교환 송장번호/), ' 123456789012 ');
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 교환 상품 발송' }));

    await waitFor(() =>
      expect(screen.getByText('회수를 확인하고 교환 상품 송장을 등록했습니다.')).toBeInTheDocument(),
    );
    expect(sent()).toEqual({
      action: 'SHIP_EXCHANGE',
      carrier: 'EPOST',
      trackingNumber: '123456789012',
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('두 번째가 실패하면 첫 번째의 성공 문구를 지운다 — 보냈다는 말이 남으면 안 된다', async () => {
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    const tracking = screen.getByLabelText(/교환 송장번호/);
    const submit = screen.getByRole('button', { name: '회수 확인 · 교환 상품 발송' });

    await userEvent.type(tracking, '123456789012');
    await userEvent.click(submit);
    await waitFor(() => expect(screen.getByText(/송장을 등록했습니다/)).toBeInTheDocument());

    fetchMock.mockResolvedValue(json(409, { message: '이미 보낸 교환입니다.' }));
    await userEvent.click(submit);

    await waitFor(() => expect(alert()).toBe('이미 보낸 교환입니다.'));
    expect(screen.queryByText(/송장을 등록했습니다/)).toBeNull();
  });

  it('창구가 까닭을 안 적어 보내면 교환 쪽 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    await userEvent.type(screen.getByLabelText(/교환 송장번호/), '123456789012');
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 교환 상품 발송' }));

    await waitFor(() => expect(alert()).toBe('교환 상품을 보내지 못했습니다.'));
  });

  it('보내는 중에는 단추가 잠긴다', async () => {
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    render(<ShipExchangeForm orderNo={ORDER_NO} />);
    await userEvent.type(screen.getByLabelText(/교환 송장번호/), '123456789012');
    await userEvent.click(screen.getByRole('button', { name: '회수 확인 · 교환 상품 발송' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled());
    await act(async () => {
      wait.give(json(200, {}));
    });
  });
});
