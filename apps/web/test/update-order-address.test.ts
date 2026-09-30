import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 배송지 수정 — 서버 쪽.
 *
 * **주소와 금액이 한 번에 움직여야 한다.** 따로 쓰면 주소는 제주인데 배송비는 육지인 주문이 생기고,
 * 그 어긋남은 정산에서야 드러난다.
 */

/**
 * 고친 것과 그 기록은 한 트랜잭션에 묶여 있다 — 잠근 뒤 다시 읽어도 같은 값을 보게 둔다.
 */
const tx = vi.hoisted(() => ({
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    updateMany: tx.order.updateMany,
  },
  orderStatusLog: tx.orderStatusLog,
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const policy = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/shipping-policy', () => ({ getShippingPolicy: policy }));

const notifyAddressChanged = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/console-work', () => ({ notifyAddressChanged }));

const { updateOrderAddress, AddressEditError } = await import('~/lib/orders/update-address');

/** 제주는 도서산간이다 — 우편번호로 정해진다 */
const JEJU = '63000';
const SEOUL = '04524';

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1',
  orderNo: '20260901-0000001',
  status: 'PAID',
  shippingFee: 3_000,
  payable: 103_000,
  isRemoteArea: false,
  recipient: '장보영',
  recipientPhone: '010-0000-0000',
  postalCode: SEOUL,
  address1: '서울 성동구 왕십리로 1',
  address2: '3층',
  deliveryMemo: null,
  payment: { method: 'CARD', status: 'DONE' },
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  recipient: '장부장',
  phone: '010-1234-5678',
  postalCode: SEOUL,
  address1: '서울 중구 세종대로 110',
  address2: '3층',
  ...over,
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((run: (t: typeof tx) => unknown) => run(tx));
  db.order.findFirst.mockResolvedValue(order());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  // clearAllMocks 는 부른 횟수만 지운다 — 앞 검사가 심어 둔 거절이 남아 뒤엣것을 넘어뜨린다
  db.orderStatusLog.create.mockResolvedValue({});
  policy.mockResolvedValue({ baseFee: 3_000, freeThreshold: 50_000, remoteSurcharge: 3_000 });
});

describe('같은 권역 안에서 고치기', () => {
  it('주소를 쓰고 금액은 건드리지 않는다', async () => {
    const result = await updateOrderAddress('20260901-0000001', input({ address2: '4층' }), { userId: 'u-1' });

    expect(result).toMatchObject({ shippingDelta: 0, shippingFee: 3_000, payable: 103_000, isRemoteArea: false });
    const { data } = db.order.updateMany.mock.calls[0]![0];
    expect(data).toMatchObject({ recipient: '장부장', address2: '4층', isRemoteArea: false });
    expect(data.shippingFee, '금액이 움직일 이유가 없다').toBeUndefined();
    expect(data.payable).toBeUndefined();
  });

  it('전화번호는 한 모양으로 정리해 둔다', async () => {
    await updateOrderAddress('20260901-0000001', input({ phone: '010 1234 5678' }), { userId: 'u-1' });

    expect(db.order.updateMany.mock.calls[0]![0].data.recipientPhone).toBe('010-1234-5678');
  });

  it('상세주소와 요청사항은 비울 수 있다 — 빈 칸은 null 로 남는다', async () => {
    await updateOrderAddress('20260901-0000001', input({ address2: undefined }), { userId: 'u-1' });

    const { data } = db.order.updateMany.mock.calls[0]![0];
    expect(data.address2).toBeNull();
    expect(data.deliveryMemo).toBeNull();
  });

  /** 주문번호만으로 고칠 수 있으면 남의 주문 주소를 바꿀 수 있다 */
  it('손님이 부르면 자기 주문인지 함께 본다', async () => {
    await updateOrderAddress('20260901-0000001', input(), { userId: 'u-1' });

    expect(db.order.findFirst.mock.calls[0]![0].where).toMatchObject({
      orderNo: '20260901-0000001',
      userId: 'u-1',
    });
  });

  /** 송장 등록과 같은 범위다 — 남의 가맹점 주문 주소를 바꿀 수 없다 */
  it('가맹점이 부르면 자기 상품이 담긴 주문인지 함께 본다', async () => {
    await updateOrderAddress('20260901-0000001', input(), { merchantId: 'm-1' });

    expect(db.order.findFirst.mock.calls[0]![0].where).toMatchObject({
      items: { some: { merchantId: 'm-1' } },
    });
  });

  it('운영진이 부르면 아무도 묶지 않는다 — 누구의 주문이든 연다', async () => {
    await updateOrderAddress('20260901-0000001', input(), {});

    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({ orderNo: '20260901-0000001' });
  });

  /** 주소만 남기면 "누가 여기로 보내라고 했는지" 를 물을 때 답할 수 없다 */
  it('바꾸기 전과 뒤의 주소를 함께 돌려준다 — 감사 로그가 이 둘을 남긴다', async () => {
    const result = await updateOrderAddress('20260901-0000001', input({ recipient: '장부장' }), { userId: 'u-1' });

    expect(result.before).toMatchObject({ recipient: '장보영', address2: '3층', isRemoteArea: false });
    expect(result.after).toMatchObject({ recipient: '장부장', phone: '010-1234-5678', isRemoteArea: false });
  });

  it('없는 주문이면 404 로 거절한다', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(updateOrderAddress('20260901-0000001', input(), { userId: 'u-1' }))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });
});

describe('도서산간 여부가 바뀔 때', () => {
  /** 아직 결제 전(가상계좌 발급 전)이라 금액이 굳지 않았다 */
  const pending = { status: 'PENDING', payment: null };

  it('제주로 바꾸면 추가 배송비만큼 는다', async () => {
    db.order.findFirst.mockResolvedValue(order(pending));

    const result = await updateOrderAddress('20260901-0000001', input({ postalCode: JEJU }), { userId: 'u-1' });

    expect(result).toMatchObject({ shippingDelta: 3_000, shippingFee: 6_000, payable: 106_000, isRemoteArea: true });
    expect(db.order.updateMany.mock.calls[0]![0].data).toMatchObject({
      isRemoteArea: true,
      shippingFee: { increment: 3_000 },
      payable: { increment: 3_000 },
    });
  });

  it('제주에서 육지로 나오면 그만큼 준다', async () => {
    db.order.findFirst.mockResolvedValue(order({ ...pending, isRemoteArea: true, shippingFee: 6_000, payable: 106_000 }));

    const result = await updateOrderAddress('20260901-0000001', input({ postalCode: SEOUL }), { userId: 'u-1' });

    expect(result).toMatchObject({ shippingDelta: -3_000, shippingFee: 3_000, payable: 103_000, isRemoteArea: false });
    expect(db.order.updateMany.mock.calls[0]![0].data.payable).toEqual({ increment: -3_000 });
  });

  /**
   * **도서산간 여부는 요청이 아니라 우편번호에서 정한다.** 받아 쓰면 제주 주소를 적고 `isRemoteArea:false`
   * 를 실어 추가 배송비를 피할 수 있다.
   */
  it('요청이 뭐라고 하든 우편번호로 정한다', async () => {
    db.order.findFirst.mockResolvedValue(order(pending));

    await updateOrderAddress('20260901-0000001', input({ postalCode: JEJU, isRemoteArea: false }), { userId: 'u-1' });

    expect(db.order.updateMany.mock.calls[0]![0].data.isRemoteArea).toBe(true);
  });

  it('결제가 끝난 주문은 막는다 — 차액을 주고받을 길이 없다', async () => {
    await expect(updateOrderAddress('20260901-0000001', input({ postalCode: JEJU }), { userId: 'u-1' }))
      .rejects.toMatchObject({ code: 'ZONE_CHANGE_AFTER_PAYMENT', status: 409 });

    expect(db.order.updateMany, '막았으면 아무것도 쓰지 않는다').not.toHaveBeenCalled();
  });

  it('입금 기다리는 주문은 계좌 금액이 정해져 있어 막는다', async () => {
    db.order.findFirst.mockResolvedValue(order({
      status: 'PENDING',
      payment: { method: 'VIRTUAL_ACCOUNT', status: 'WAITING_FOR_DEPOSIT' },
    }));

    await expect(updateOrderAddress('20260901-0000001', input({ postalCode: JEJU }), { userId: 'u-1' }))
      .rejects.toMatchObject({ code: 'ZONE_CHANGE_ON_DEPOSIT' });
  });

  it('배송비가 바뀌어도 기본료와 무료 기준은 그대로다 — 움직이는 것은 추가 배송비뿐이다', async () => {
    db.order.findFirst.mockResolvedValue(order({ ...pending, shippingFee: 0, payable: 100_000 }));

    const result = await updateOrderAddress('20260901-0000001', input({ postalCode: JEJU }), { userId: 'u-1' });

    // 무료배송이던 주문이라도 도서산간 추가분만 붙는다 — 기본료 3,000 이 되살아나지 않는다
    expect(result.shippingFee).toBe(3_000);
  });
});

describe('이미 나간 주문', () => {
  it.each(['SHIPPED', 'DELIVERED', 'CONFIRMED'])('%s 는 막는다', async (status) => {
    db.order.findFirst.mockResolvedValue(order({ status }));

    await expect(updateOrderAddress('20260901-0000001', input(), { userId: 'u-1' }))
      .rejects.toBeInstanceOf(AddressEditError);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  /**
   * **읽고 쓰는 사이에 송장이 붙을 수 있다.** 운영자가 그 틈에 출고 처리를 하면 위의 판단은 이미 낡았다 —
   * 읽은 상태를 조건에 실어, 달라져 있으면 한 줄도 바꾸지 않는다.
   */
  it('쓰는 순간 상태가 달라져 있으면 거절한다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateOrderAddress('20260901-0000001', input(), { userId: 'u-1' }))
      .rejects.toMatchObject({ code: 'ALREADY_SHIPPED' });

    expect(db.order.updateMany.mock.calls[0]![0].where).toMatchObject({ id: 'o-1', status: 'PAID' });
  });
});

/**
 * 처리 이력에 남는 한 줄.
 *
 * **출고 직전에 주소가 바뀌면 운영자는 알 길이 없었다.** 화면에는 새 주소가 보이지만, 피킹 목록을
 * 이미 뽑았거나 송장을 붙이려던 사람에게는 그 사실이 어디에도 나타나지 않는다.
 */
describe('처리 이력', () => {
  const noteOf = () => db.orderStatusLog.create.mock.calls[0]![0].data.note as string;

  /** 주문에 지금 적힌 그대로. 여기서 한 칸만 바꿔 넣으면 그 칸만 이력에 남아야 한다 */
  const same = {
    recipient: '장보영',
    phone: '010-0000-0000',
    postalCode: SEOUL,
    address1: '서울 성동구 왕십리로 1',
    address2: '3층',
  };

  it('누가 고쳤고 무엇이 바뀌었는지 남는다', async () => {
    await updateOrderAddress('20260901-0000001', input({ ...same, address2: '102호' }), { userId: 'u-1' });

    expect(noteOf()).toBe('배송지 변경 (손님) — 상세주소');
    expect(db.orderStatusLog.create.mock.calls[0]![0].data).toMatchObject({
      orderId: 'o-1',
      // 상태가 바뀌는 일이 아니다 — 그래서 from 과 to 가 같다(반품 회수 확인과 같은 방식)
      from: 'PAID',
      to: 'PAID',
      actor: 'u-1',
    });
  });

  it('운영이 고치면 그 사람으로 남는다', async () => {
    await updateOrderAddress('20260901-0000001', input({ ...same, recipient: '장부장' }), { actorId: 'u-admin' });

    expect(noteOf()).toBe('배송지 변경 (운영) — 받는 분');
    expect(db.orderStatusLog.create.mock.calls[0]![0].data.actor).toBe('u-admin');
  });

  it('가맹점이 고친 것도 구분한다 — 그다음 할 일이 다르다', async () => {
    await updateOrderAddress('20260901-0000001', input({ ...same, recipient: '장부장' }), { actorId: 'u-m', merchantId: 'm-1' });

    expect(noteOf()).toBe('배송지 변경 (가맹점) — 받는 분');
  });

  it('배송비가 움직였으면 그 금액까지 적는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PENDING', payment: null }));

    await updateOrderAddress('20260901-0000001', input({ ...same, postalCode: JEJU, address1: '제주 제주시 첨단로 242' }), { userId: 'u-1' });

    expect(noteOf()).toBe('배송지 변경 (손님) — 우편번호·주소 · 배송비 +3,000원');
  });

  it('줄어든 쪽도 부호로 적는다', async () => {
    db.order.findFirst.mockResolvedValue(order({
      status: 'PENDING', payment: null, isRemoteArea: true, postalCode: JEJU,
      shippingFee: 6_000, payable: 106_000,
    }));

    await updateOrderAddress('20260901-0000001', input(same), { userId: 'u-1' });

    expect(noteOf()).toContain('배송비 -3,000원');
  });

  /** 이력이 길어지면 정작 달라진 줄을 못 찾는다 */
  it('같은 값을 다시 저장한 것은 남기지 않는다', async () => {
    await updateOrderAddress('20260901-0000001', input(same), { userId: 'u-1' });

    expect(db.order.updateMany, '쓰기는 그대로 한다').toHaveBeenCalled();
    expect(db.orderStatusLog.create).not.toHaveBeenCalled();
  });

  /**
   * **바뀐 주소는 남았는데 바뀌었다는 사실은 없는 주문**이 생기면, 출고 직전에는 그것이 가장 위험한
   * 조합이다. 한 트랜잭션에 묶여 있으므로 기록이 실패하면 주소도 되돌아간다.
   */
  it('기록이 실패하면 주소도 되돌아간다', async () => {
    db.orderStatusLog.create.mockRejectedValue(new Error('로그를 못 썼다'));

    await expect(updateOrderAddress('20260901-0000001', input({ ...same, address2: '102호' }), { userId: 'u-1' }))
      .rejects.toThrow('로그를 못 썼다');
  });
});

/**
 * 알림까지 미는 때.
 *
 * **목록의 표시·상세의 안내·송장 등록의 확인은 셋 다 열어 봐야 보인다.** 피킹을 시작한 사람은 목록을
 * 다시 열 이유가 없어서 그 셋을 모두 지나친다 — 그 한 번만 알림으로 민다.
 */
describe('알림', () => {
  it('배송 준비 중에 바뀌면 내보내는 사람에게 알린다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PREPARING' }));

    await updateOrderAddress('20260901-0000001', input({ address2: '102호' }), { userId: 'u-1' });

    expect(notifyAddressChanged).toHaveBeenCalledWith({
      orderNo: '20260901-0000001',
      // 고친 사람은 그 목록에서 빠진다 — 방금 자기가 한 일이다
      changedBy: 'u-1',
    });
  });

  it('운영이 고쳤으면 그 사람을 싣는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PREPARING' }));

    await updateOrderAddress('20260901-0000001', input({ address2: '102호' }), { actorId: 'u-admin' });

    expect(notifyAddressChanged.mock.calls[0]![0].changedBy).toBe('u-admin');
  });

  /** 주문한 지 1분 만에 상세주소를 고치는 것이 가장 흔한 수정이다 — 그것마다 울리면 위험한 한 번이 묻힌다 */
  it('결제완료에서는 알리지 않는다 — 아직 아무도 물건을 만지지 않았다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PAID' }));

    await updateOrderAddress('20260901-0000001', input({ address2: '102호' }), { userId: 'u-1' });

    expect(notifyAddressChanged).not.toHaveBeenCalled();
  });

  it('입금대기에서도 알리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PENDING', payment: null }));

    await updateOrderAddress('20260901-0000001', input({ address2: '102호' }), { userId: 'u-1' });

    expect(notifyAddressChanged).not.toHaveBeenCalled();
  });

  it('같은 값을 다시 저장한 것은 알리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PREPARING' }));

    await updateOrderAddress('20260901-0000001', input({
      recipient: '장보영', phone: '010-0000-0000', postalCode: SEOUL,
      address1: '서울 성동구 왕십리로 1', address2: '3층',
    }), { userId: 'u-1' });

    expect(notifyAddressChanged).not.toHaveBeenCalled();
  });

  /** 막힌 요청은 아무것도 바꾸지 않았다 */
  it('막혔으면 알리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));

    await expect(updateOrderAddress('20260901-0000001', input(), { userId: 'u-1' })).rejects.toBeTruthy();
    expect(notifyAddressChanged).not.toHaveBeenCalled();
  });
});
