import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartQuoteResponse } from '@shop/contract';

const quoteCart = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/cart', () => ({ quoteCart }));

const tx = vi.hoisted(() => ({
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { updateMany: vi.fn<(...a: any[]) => any>() },
  userCoupon: { updateMany: vi.fn<(...a: any[]) => any>() },
  order: { create: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  address: { findFirst: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
  userCoupon: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { createOrder, OrderError } = await import('~/lib/orders/create-order');

const user = { id: 'u-1', pointBalance: 3_240 };

const address = {
  recipient: '장병윤', phone: '010-2345-6789', postalCode: '04766',
  address1: '서울 성동구 왕십리로 000', address2: '101동 1102호', isRemoteArea: false,
};

const request = (over: Record<string, unknown> = {}) => ({
  lines: [{ variantId: 'v-coat-m', quantity: 1 }],
  address,
  paymentMethod: 'CARD' as const,
  agreedToTerms: true as const,
  ...over,
});

const quote = (over: Partial<CartQuoteResponse> = {}): CartQuoteResponse => ({
  lines: [{
    variantId: 'v-coat-m', productSlug: 'oversized-wool-coat',
    productName: '오버사이즈 울 블렌드 코트', brandName: 'STUDIO NOON', optionLabel: '오트밀 / M',
    listPrice: 413_000, unitPrice: 289_000, discountPercent: 30,
    quantity: 1, requestedQuantity: 1, subtotal: 289_000, stock: 12, issue: null,
  }],
  listTotal: 413_000, productDiscount: 124_000, merchandiseTotal: 289_000,
  couponDiscount: 0, couponName: null, pointsUsed: 0, pointsAvailable: 3_240,
  shippingFee: 0, isFreeShipping: true, remainingForFreeShipping: 0,
  payable: 289_000, rewardPoints: 2_890,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  quoteCart.mockResolvedValue(quote());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  db.productVariant.findMany.mockResolvedValue([
    { id: 'v-coat-m', product: { brand: { merchantId: 'm-1' }, images: [{ url: '/coat.jpg' }] } },
  ]);
  db.userCoupon.findFirst.mockResolvedValue(null);
  tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
  tx.user.updateMany.mockResolvedValue({ count: 1 });
  tx.userCoupon.updateMany.mockResolvedValue({ count: 1 });
  tx.order.create.mockResolvedValue({
    id: 'o-1', orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING',
  });
});

describe('주문 생성', () => {
  it('주문번호와 결제 금액을 돌려준다', async () => {
    const r = await createOrder(request(), user);
    expect(r).toEqual({ orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING' });
  });

  it('PENDING 으로 시작한다 — 결제 승인 전에 결제된 것처럼 보이면 안 된다', async () => {
    await createOrder(request(), user);
    expect(tx.order.create.mock.calls[0]![0].data.status).toBe('PENDING');
  });

  it('금액은 요청이 아니라 견적에서 가져온다', async () => {
    await createOrder(request(), user);
    expect(tx.order.create.mock.calls[0]![0].data).toMatchObject({
      listTotal: 413_000, productDiscount: 124_000, payable: 289_000, rewardPoints: 2_890,
    });
  });

  it('상품 정보를 스냅샷으로 박는다 — 나중에 상품이 바뀌어도 주문은 그대로여야 한다', async () => {
    await createOrder(request(), user);
    const item = tx.order.create.mock.calls[0]![0].data.items.create[0];
    expect(item).toMatchObject({
      productName: '오버사이즈 울 블렌드 코트',
      brandName: 'STUDIO NOON',
      optionLabel: '오트밀 / M',
      listPrice: 413_000,
      unitPrice: 289_000,
      subtotal: 289_000,
      merchantId: 'm-1',
      imageUrl: '/coat.jpg',
    });
  });

  it('배송지도 스냅샷으로 박는다 — 주소를 고쳐도 과거 주문은 그대로여야 한다', async () => {
    await createOrder(request(), user);
    expect(tx.order.create.mock.calls[0]![0].data).toMatchObject({
      recipient: '장병윤', recipientPhone: '010-2345-6789',
      postalCode: '04766', address1: '서울 성동구 왕십리로 000',
    });
  });

  it('상태 변경 이력을 함께 남긴다', async () => {
    await createOrder(request(), user);
    expect(tx.order.create.mock.calls[0]![0].data.statusLogs.create).toMatchObject({
      from: null, to: 'PENDING', actor: 'system',
    });
  });

  it('결제 레코드를 READY 로 함께 만든다', async () => {
    await createOrder(request({ paymentMethod: 'VIRTUAL_ACCOUNT' }), user);
    expect(tx.order.create.mock.calls[0]![0].data.payment.create).toMatchObject({
      method: 'VIRTUAL_ACCOUNT', status: 'READY', amount: 289_000,
    });
  });
});

describe('재고 — 동시 주문에서 음수로 내려가면 안 된다', () => {
  it('조건부 UPDATE 로 깎는다 — 읽고 나서 쓰면 둘 다 성공한다', async () => {
    await createOrder(request(), user);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-coat-m', stock: { gte: 1 }, isActive: true },
      data: { stock: { decrement: 1 } },
    });
  });

  it('한 건도 안 걸리면(=경쟁에서 졌으면) 주문 전체를 되돌린다', async () => {
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(createOrder(request(), user)).rejects.toMatchObject({
      code: 'OUT_OF_STOCK', variantIds: ['v-coat-m'],
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('여러 줄 중 하나만 실패해도 주문을 만들지 않는다', async () => {
    quoteCart.mockResolvedValue(quote({
      lines: [
        { ...quote().lines[0]! },
        { ...quote().lines[0]!, variantId: 'v-knit', optionLabel: '차콜 / L' },
      ],
    }));
    db.productVariant.findMany.mockResolvedValue([
      { id: 'v-coat-m', product: { brand: { merchantId: 'm-1' }, images: [] } },
      { id: 'v-knit', product: { brand: { merchantId: 'm-2' }, images: [] } },
    ]);
    tx.productVariant.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(createOrder(request(), user)).rejects.toBeInstanceOf(OrderError);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});

describe('견적에 문제가 있으면 주문을 만들지 않는다', () => {
  it('품절 줄이 섞여 있으면 나머지만 처리하지 않고 전체를 거절한다', async () => {
    quoteCart.mockResolvedValue(quote({
      lines: [
        { ...quote().lines[0]! },
        { ...quote().lines[0]!, variantId: 'v-gone', quantity: 0, issue: 'SOLD_OUT' },
      ],
    }));
    // 나머지만 조용히 사면 사용자가 무엇을 샀는지 모른다
    await expect(createOrder(request(), user)).rejects.toMatchObject({
      code: 'OUT_OF_STOCK', variantIds: ['v-gone'],
    });
  });

  it('수량이 줄어든 줄이 있어도 거절한다 — 금액이 달라지기 때문이다', async () => {
    quoteCart.mockResolvedValue(quote({
      lines: [{ ...quote().lines[0]!, quantity: 1, requestedQuantity: 3, issue: 'STOCK_REDUCED' }],
    }));
    await expect(createOrder(request(), user)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('살 수 있는 게 하나도 없으면 EMPTY_ORDER 다', async () => {
    quoteCart.mockResolvedValue(quote({
      lines: [{ ...quote().lines[0]!, quantity: 0, issue: 'SOLD_OUT' }],
    }));
    await expect(createOrder(request(), user)).rejects.toMatchObject({ code: 'EMPTY_ORDER' });
  });
});

describe('포인트', () => {
  it('조건부 UPDATE 로 차감하고 원장을 남긴다', async () => {
    quoteCart.mockResolvedValue(quote({ pointsUsed: 3_000, payable: 286_000 }));
    await createOrder(request({ pointsToUse: 3_000 }), user);

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-1', pointBalance: { gte: 3_000 } },
      data: { pointBalance: { decrement: 3_000 } },
    });
    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u-1', amount: -3_000, reason: 'USE_PURCHASE',
    });
  });

  it('잔액이 모자라면 주문을 되돌린다', async () => {
    quoteCart.mockResolvedValue(quote({ pointsUsed: 3_000, payable: 286_000 }));
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(createOrder(request({ pointsToUse: 3_000 }), user)).rejects.toMatchObject({
      code: 'INSUFFICIENT_POINTS',
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('요청한 만큼 못 쓰면 조용히 줄이지 않고 거절한다', async () => {
    quoteCart.mockResolvedValue(quote({ pointsUsed: 1_000 }));
    await expect(createOrder(request({ pointsToUse: 3_000 }), user)).rejects.toMatchObject({
      code: 'INSUFFICIENT_POINTS',
    });
  });

  it('포인트를 안 쓰면 원장도 남기지 않는다', async () => {
    await createOrder(request(), user);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });
});

describe('쿠폰', () => {
  it('사용 처리는 아직 안 쓴 것만 잡히도록 조건을 건다', async () => {
    quoteCart.mockResolvedValue(quote({ couponDiscount: 10_000, payable: 279_000 }));
    db.userCoupon.findFirst.mockResolvedValue({ id: 'uc-1' });
    await createOrder(request({ couponCode: 'WELCOME10000' }), user);

    expect(tx.userCoupon.updateMany).toHaveBeenCalledWith({
      where: { id: 'uc-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('이미 쓴 쿠폰이면 주문을 되돌린다 — 같은 쿠폰을 두 번 못 쓴다', async () => {
    quoteCart.mockResolvedValue(quote({ couponDiscount: 10_000 }));
    db.userCoupon.findFirst.mockResolvedValue({ id: 'uc-1' });
    tx.userCoupon.updateMany.mockResolvedValue({ count: 0 });
    await expect(createOrder(request({ couponCode: 'WELCOME10000' }), user)).rejects.toMatchObject({
      code: 'COUPON_INVALID',
    });
  });

  it('코드를 보냈는데 할인이 0이면 거절한다', async () => {
    quoteCart.mockResolvedValue(quote({ couponDiscount: 0 }));
    await expect(createOrder(request({ couponCode: 'BOGUS' }), user)).rejects.toMatchObject({
      code: 'COUPON_INVALID',
    });
  });
});

describe('배송지', () => {
  it('저장된 배송지는 소유자까지 확인한다 — 남의 주소를 훔쳐볼 수 없다', async () => {
    db.address.findFirst.mockResolvedValue({ ...address, phone: '010-1111-2222' });
    await createOrder(request({ addressId: 'a-1', address: undefined }), user);
    expect(db.address.findFirst).toHaveBeenCalledWith({ where: { id: 'a-1', userId: 'u-1' } });
  });

  it('남의 배송지 id 를 넣으면 거절한다', async () => {
    db.address.findFirst.mockResolvedValue(null);
    await expect(
      createOrder(request({ addressId: 'a-someone-else', address: undefined }), user),
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
  });

  it('도서산간은 우편번호가 정한다', async () => {
    await createOrder(request({ address: { ...address, postalCode: '63309' } }), user);
    expect(quoteCart.mock.calls[0]![0]).toMatchObject({ isRemoteArea: true });
  });

  it('요청이 도서산간을 정하지 못한다 — 정하게 두면 추가 배송비를 피할 수 있다', async () => {
    // 제주 주소인데 isRemoteArea: false 를 끼워 보낸다. 예전에는 이 값을
    // 그대로 써서 3,000원을 아낄 수 있었다.
    await createOrder(
      request({ address: { ...address, postalCode: '63309', isRemoteArea: false } }),
      user,
    );
    expect(quoteCart.mock.calls[0]![0]).toMatchObject({ isRemoteArea: true });
  });

  it('육지 주소는 추가 배송비가 붙지 않는다', async () => {
    await createOrder(request({ address: { ...address, postalCode: '04766' } }), user);
    expect(quoteCart.mock.calls[0]![0]).toMatchObject({ isRemoteArea: false });
  });
});

describe('주문번호 충돌', () => {
  it('unique 위반이면 다시 뽑는다', async () => {
    const conflict = Object.assign(new Error('unique'), {
      code: 'P2002', meta: { target: ['orderNo'] },
    });
    tx.order.create
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: 'o-1', orderNo: '20260831-7654321', payable: 289_000, status: 'PENDING' });

    const r = await createOrder(request(), user);
    expect(r.orderNo).toBe('20260831-7654321');
    expect(tx.order.create).toHaveBeenCalledTimes(2);
  });

  it('다른 unique 위반은 그대로 던진다 — 조용히 재시도하면 원인을 놓친다', async () => {
    const other = Object.assign(new Error('unique'), {
      code: 'P2002', meta: { target: ['sku'] },
    });
    tx.order.create.mockRejectedValue(other);
    await expect(createOrder(request(), user)).rejects.toThrow('unique');
    expect(tx.order.create).toHaveBeenCalledTimes(1);
  });
});

describe('퍼널 연결', () => {
  it('브라우저 세션을 주문에 남긴다', async () => {
    await createOrder(request({ browserSessionId: 'sess_browser01' }), user);
    expect(tx.order.create.mock.calls[0]![0].data.browserSessionId).toBe('sess_browser01');
  });

  it('세션이 없어도 주문은 성립한다 — 분석용 필드가 주문을 막으면 안 된다', async () => {
    const r = await createOrder(request(), user);
    expect(r.orderNo).toBeTruthy();
    expect(tx.order.create.mock.calls[0]![0].data.browserSessionId).toBeNull();
  });
});
