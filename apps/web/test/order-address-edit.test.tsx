// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/postcode', () => ({ openPostcodeSearch: vi.fn(() => Promise.resolve()) }));

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { OrderAddressEdit } = await import('~/components/order-address-edit');

/**
 * 주문의 배송지 고치기.
 *
 * **조용히 바뀌면 안 된다.** 도서산간으로 들어가거나 나오면 배송비가 따라 움직이는데, 화면이 아무 말도
 * 안 하면 손님은 결제 금액이 왜 달라졌는지 모른다.
 */

const CURRENT = {
  recipient: '장보영',
  phone: '010-1234-5678',
  postalCode: '04766',
  address1: '서울 성동구 왕십리로 1',
  address2: '101호',
  memo: '문 앞에 놔 주세요',
};

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const setup = () => {
  const user = userEvent.setup();
  render(<OrderAddressEdit orderNo="20260901-0000001" remoteSurcharge={3000} current={CURRENT} />);
  return user;
};

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '배송지 수정' }));
  return screen.getByRole('region', { name: '20260901-0000001 배송지 수정' });
};

describe('폼 열기', () => {
  it('처음에는 단추만 있다 — 주문 상세가 폼으로 뒤덮이지 않는다', () => {
    render(<OrderAddressEdit orderNo="20260901-0000001" remoteSurcharge={3000} current={CURRENT} />);

    expect(screen.getByRole('button', { name: '배송지 수정' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/받는 분/)).toBeNull();
  });

  it('누르면 지금 배송지가 채워진 폼이 된다', async () => {
    const form = await openForm(setup());

    expect(within(form).getByLabelText(/받는 분/)).toHaveValue('장보영');
    expect(within(form).getByLabelText(/우편번호/)).toHaveValue('04766');
    expect(within(form).getByLabelText(/상세 주소/)).toHaveValue('101호');
    expect(within(form).getByLabelText('배송 요청사항')).toHaveValue('문 앞에 놔 주세요');
  });

  it('언제까지 고칠 수 있는지와 배송비가 따라 움직인다는 것을 미리 적는다', async () => {
    expect(await openForm(setup())).toHaveTextContent('출고 전까지');
  });

  /**
   * **주소록의 칸이 따라오면 안 된다.** 이름표("집"·"회사")는 주소록의 것이고, "이미 주문한 건의 배송지는
   * 바뀌지 않습니다" 는 지금 고치는 것이 바로 그 주문인데 정반대로 적힌 안내다.
   */
  it('주소록의 칸과 안내는 그리지 않는다', async () => {
    const form = await openForm(setup());

    expect(within(form).queryByLabelText(/배송지 이름/)).toBeNull();
    expect(form).not.toHaveTextContent('이미 주문한 건');
  });

  it('취소하면 아무것도 보내지 않고 닫힌다', async () => {
    const user = setup();
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '배송지 수정' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('저장', () => {
  it('PATCH 로 보내고, 요청사항도 함께 싣는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ orderNo: '20260901-0000001', shippingDelta: 0 }));
    const user = setup();
    const form = await openForm(user);

    await user.clear(within(form).getByLabelText(/받는 분/));
    await user.type(within(form).getByLabelText(/받는 분/), '장부장');
    await user.click(within(form).getByRole('button', { name: '배송지 저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/orders/20260901-0000001/address');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({
      recipient: '장부장',
      postalCode: '04766',
      deliveryMemo: '문 앞에 놔 주세요',
    });
  });

  /**
   * 운영 화면도 같은 폼을 쓴다 — 규칙이 한 벌이라 화면도 한 벌이어야 두 쪽이 다른 말을 하지 않는다.
   * 다른 것은 보내는 곳뿐이고, 그쪽 창구가 감사 로그를 남긴다.
   */
  it('보낼 창구를 주면 그쪽으로 보낸다 — 운영 화면이 쓰는 길이다', async () => {
    fetchMock.mockResolvedValue(Response.json({ shippingDelta: 0 }));
    const user = userEvent.setup();
    render(
      <OrderAddressEdit
        orderNo="20260901-0000001"
        remoteSurcharge={3000}
        current={CURRENT}
        endpoint="/api/admin/orders/20260901-0000001/address"
      />,
    );
    await user.click(screen.getByRole('button', { name: '배송지 수정' }));
    await user.click(
      within(screen.getByRole('region', { name: '20260901-0000001 배송지 수정' }))
        .getByRole('button', { name: '배송지 저장' }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/orders/20260901-0000001/address');
  });

  it('저장하면 닫히고, 바뀐 주소를 다시 읽는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ shippingDelta: 0 }));
    const user = setup();
    await user.click(within(await openForm(user)).getByRole('button', { name: '배송지 저장' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '배송지 수정' })).toBeInTheDocument());
    expect(refresh, '주문 상세의 주소는 서버가 그린다 — 다시 읽지 않으면 옛 주소가 남는다').toHaveBeenCalled();
  });

  /** 닫으면서 알림까지 사라지면, 저장됐는지 눈으로 확인할 자리가 없다 */
  it('결과를 폼이 닫힌 뒤에도 남겨 소리로 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ shippingDelta: 0 }));
    const user = setup();
    await user.click(within(await openForm(user)).getByRole('button', { name: '배송지 저장' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('배송지를 바꿨습니다.');
  });

  it('배송비가 늘면 얼마나 늘었는지 함께 말한다', async () => {
    fetchMock.mockResolvedValue(Response.json({ shippingDelta: 3000 }));
    const user = setup();
    await user.click(within(await openForm(user)).getByRole('button', { name: '배송지 저장' }));

    expect(await screen.findByRole('status')).toHaveTextContent('+3,000원');
  });

  it('줄어든 쪽은 부호로 구분된다', async () => {
    fetchMock.mockResolvedValue(Response.json({ shippingDelta: -3000 }));
    const user = setup();
    await user.click(within(await openForm(user)).getByRole('button', { name: '배송지 저장' }));

    expect(await screen.findByRole('status')).toHaveTextContent('−3,000원');
  });
});

describe('거절', () => {
  /** 왜 안 되는지 그 자리에 적어야 손님이 다음 수(취소 후 재주문)를 안다 */
  it('막힌 이유를 폼 안에 소리로 알리고, 폼은 닫지 않는다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: 'ZONE_CHANGE_AFTER_PAYMENT', message: '결제가 끝난 뒤에는 …' }, { status: 409 }),
    );
    const user = setup();
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: '배송지 저장' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('결제가 끝난 뒤에는');
    expect(within(form).getByLabelText(/받는 분/), '고치던 값이 사라지지 않는다').toHaveValue('장보영');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('어느 칸이 틀렸는지 오면 그 칸에 적는다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: '입력을 확인해 주세요', fields: { phone: '휴대폰 번호 형식이 아닙니다' } }, { status: 400 }),
    );
    const user = setup();
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: '배송지 저장' }));

    await waitFor(() => expect(form).toHaveTextContent('휴대폰 번호 형식이 아닙니다'));
  });
});
