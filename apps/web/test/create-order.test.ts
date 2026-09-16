import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartQuoteResponse } from '@shop/contract';

const quoteCart = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
/*
 * 주문은 몫과 배송비 정책까지 받는 쪽(quoteCartDetailed)을 부른다. 견적만 바꿔 끼우는
 * 기존 검사들이 그대로 돌도록, 견적 흉내에서 몫을 만들어 붙인다 — 살 수 있는 줄마다 하나.
 */
vi.mock('~/lib/queries/cart', () => ({
  quoteCart,
  quoteCartDetailed: async (...args: unknown[]) => {
    const quote = (await quoteCart(...args)) as CartQuoteResponse;
    const buyable = quote.lines.filter((l) => l.quantity > 0);
    return {
      quote,
      // 줄마다 다른 값이라야 엉뚱한 줄에 박히는 것을 잡는다
      allocations: buyable.map((_, i) => ({ couponShare: 100 * (i + 1), pointsShare: 10 * (i + 1), rewardShare: i + 1 })),
      shippingPolicy: { baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000 },
    };
  },
}));

const tx = vi.hoisted(() => ({
  productVariant: {
    updateMany: vi.fn<(...a: any[]) => any>(),
    /** 깎은 직후의 재고. 기준을 넘겼는지 트랜잭션 안에서 본다 */
    findUnique: vi.fn<(...a: any[]) => any>(),
  },
  user: { updateMany: vi.fn<(...a: any[]) => any>() },
  userCoupon: { updateMany: vi.fn<(...a: any[]) => any>() },
  order: { create: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  address: { findFirst: vi.fn<(...a: any[]) => any>() },
  order: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    // 품절에 막히면 버려진 주문을 찾아본다 — 그 조회가 여기로 온다
    findMany: vi.fn<(...a: any[]) => any>(),
  },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
  userCoupon: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

/*
 * 버려진 주문을 푸는 길은 사용자가 쓰는 그 길(cancelOrder)이다. 여기서는
 * 그것이 성공했다고 두고, **품절 판정이 그 결과를 실제로 반영하는지**만 본다.
 */
const cancelOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/cancel-order', () => ({ cancelOrder }));

/*
 * 재고 부족 알림. **응답 뒤에 도는 일**이라 여기서는 곧바로 돌려 누가
 * 불렸는지만 본다.
 */
const notifyLowStock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/low-stock', () => ({ notifyLowStock }));
vi.mock('~/lib/api/after-response', () => ({
  afterResponse: (fn: () => unknown) => Promise.resolve(fn()),
}));

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
  imageUrl: null, imageAlt: null, blurDataUrl: null,
    listPrice: 413_000, unitPrice: 289_000, discountPercent: 30,
    quantity: 1, requestedQuantity: 1, subtotal: 289_000, stock: 12, issue: null,
  }],
  listTotal: 413_000, productDiscount: 124_000, merchandiseTotal: 289_000,
  couponDiscount: 0, couponName: null, couponCode: null, coupons: [], pointsUsed: 0, pointsAvailable: 3_240,
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
  db.order.findFirst.mockResolvedValue(null);
  // 기본은 "풀 것이 없다" — 품절은 품절이다
  db.order.findMany.mockResolvedValue([]);
  cancelOrder.mockResolvedValue(undefined);
  tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
  // 기본은 넉넉하다 — 기준을 안 넘는다
  tx.productVariant.findUnique.mockResolvedValue({ stock: 50 });
  notifyLowStock.mockResolvedValue(undefined);
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

  it('줄마다 쿠폰·포인트·적립 몫과 그날의 배송비 정책을 박는다 — 일부 취소가 쓴다', async () => {
    /*
     * 취소하는 날 나누면 어느 줄이 쿠폰 대상이었는지 알 수 없고(분류가 바뀐다), 배송비 기준도
     * 오늘 것이 된다. 주문한 순간의 값으로 박는다.
     */
    await createOrder(request(), user);
    const data = tx.order.create.mock.calls[0]![0].data;
    expect(data.items.create[0]).toMatchObject({ couponShare: 100, pointsShare: 10, rewardShare: 1 });
    expect(data.shippingPolicy).toEqual({ baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000 });
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

  it('한 줄짜리 주문이 품절되면 품절이라고 말한다 — 빈 주문이 아니다', async () => {
    /*
     * **이 검사가 거꾸로 적혀 있었다.** 품절이면 수량이 0 으로 깎이면서 issue 도
     * 함께 서는데, 빈 주문 검사가 앞에 있어서 "주문할 수 있는 상품이 없습니다" 가
     * 나갔다 — 손님 눈앞에는 상품이 있는데.
     *
     * 마지막 한 개를 두 사람이 동시에 사는 e2e 가 잡았다. 여기서는 못 잡았는데,
     * 잡을 수가 없었다: 이 검사는 견적을 통째로 흉내 내므로 **내가 적어 넣은 값**을
     * 확인할 뿐이다. 그때 적어 넣은 기대값이 곧 버그였다.
     */
    quoteCart.mockResolvedValue(quote({
      lines: [{ ...quote().lines[0]!, quantity: 0, issue: 'SOLD_OUT' }],
    }));
    await expect(createOrder(request(), user)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('탈이 없는데 살 것도 없으면 EMPTY_ORDER 다 — 위에서 안 걸린 경우의 그물', async () => {
    quoteCart.mockResolvedValue(quote({
      lines: [{ ...quote().lines[0]!, quantity: 0, issue: null }],
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

describe('같은 주문을 두 번 만들지 않는다', () => {
  const withKey = () => request({ idempotencyKey: 'abcdefgh-1234-5678-9012-abcdefabcdef' });

  it('열쇠가 없으면 예전처럼 그냥 만든다 — 옛 화면도 계속 주문할 수 있어야 한다', async () => {
    await createOrder(request(), user);
    expect(db.order.findFirst).not.toHaveBeenCalled();
    expect(tx.order.create).toHaveBeenCalledTimes(1);
  });

  it('같은 열쇠로 다시 오면 만들지 않고 먼저 만든 주문을 준다', async () => {
    db.order.findFirst.mockResolvedValue({
      orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING',
    });

    const r = await createOrder(withKey(), user);

    expect(r).toEqual({ orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING' });
    // 재고를 다시 깎지 않았다는 것이 여기서 지킬 것이다
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('남의 주문을 돌려주지 않는다 — 소유자까지 보고 찾는다', async () => {
    await createOrder(withKey(), user);
    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({
      idempotencyKey: 'abcdefgh-1234-5678-9012-abcdefabcdef',
      userId: 'u-1',
    });
  });

  it('열쇠를 주문에 함께 남긴다', async () => {
    await createOrder(withKey(), user);
    expect(tx.order.create.mock.calls[0]![0].data.idempotencyKey).toBe(
      'abcdefgh-1234-5678-9012-abcdefabcdef',
    );
  });

  it('동시에 두 번 들어오면 유니크 제약이 잡고, 먼저 만든 주문을 준다', async () => {
    // 조회는 둘 다 빈손으로 지나간다 — 그 뒤에 두 번째가 제약에 걸린다
    db.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING' });
    tx.order.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['idempotencyKey'] } }),
    );

    const r = await createOrder(withKey(), user);

    expect(r.orderNo).toBe('20260831-1234567');
  });

  it('주문번호 충돌은 그대로 다시 뽑는다 — 열쇠 충돌과 섞이지 않는다', async () => {
    tx.order.create
      .mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['orderNo'] } }),
      )
      .mockResolvedValue({
        id: 'o-1', orderNo: '20260831-7654321', payable: 289_000, status: 'PENDING',
      });

    const r = await createOrder(withKey(), user);

    expect(r.orderNo).toBe('20260831-7654321');
    expect(db.order.findFirst).toHaveBeenCalledTimes(1);
  });
});

/**
 * 품절이라고 말하기 전에 한 번 더 보는 것.
 *
 * 주문을 만드는 순간 재고가 깎이고, 결제하지 않고 떠난 주문은 회수 배치가
 * 돌 때까지 그 재고를 물고 있다. 배치는 하루에 한 번 돈다 — 기한은 30분인데
 * 회수는 24시간마다라, **그 사이에는 아무도 안 산 물건이 품절로 보인다.**
 *
 * 사는 사람에게는 그냥 품절이다. 왜 없는지도, 기다릴 이유가 있는지도 알 수
 * 없다.
 */
describe('품절 — 버려진 주문이 물고 있던 것', () => {
  /** 첫 시도만 재고가 없고, 두 번째는 있다 */
  function outOfStockOnce(): void {
    let first = true;
    tx.productVariant.updateMany.mockImplementation(() => {
      if (first) {
        first = false;
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve({ count: 1 });
    });
  }

  it('풀 것이 있으면 풀고 한 번 다시 해 본다', async () => {
    outOfStockOnce();
    db.order.findMany.mockResolvedValue([
      {
        orderNo: '20260901-0000001',
        status: 'PENDING',
        placedAt: new Date('2026-01-01'),
        /*
         * **READY 여야 풀 수 있다.** 결제 키가 붙었다는 것은 승인 절차가
         * 시작됐다는 뜻이고, 그 뒤는 사람이 대사할 자리다.
         * 처음 이 검사를 쓸 때 payment: null 로 뒀더니 안 풀렸는데,
         * 틀린 것은 정책이 아니라 내 고정물이었다.
         */
        payment: { status: 'READY', pgPaymentKey: null },
      },
    ]);

    const r = await createOrder(request(), user);
    expect(r.orderNo).toBe('20260831-1234567');
  });

  it('막힌 변형만 찾는다 — 남의 주문까지 건드리지 않는다', async () => {
    outOfStockOnce();
    db.order.findMany.mockResolvedValue([
      {
        orderNo: '20260901-0000001',
        status: 'PENDING',
        placedAt: new Date('2026-01-01'),
        payment: { status: 'READY', pgPaymentKey: null },
      },
    ]);

    await createOrder(request(), user);

    // 사는 사람이 기다리는 자리다. 밀린 것을 다 따라잡는 것은 배치의 몫이다.
    const where = db.order.findMany.mock.calls[0]?.[0].where;
    expect(where.items.some.variantId.in).toEqual(['v-coat-m']);
    expect(db.order.findMany.mock.calls[0]?.[0].take).toBeLessThanOrEqual(5);
  });

  it('풀 것이 없으면 품절이다 — 같은 실패를 두 번 겪게 하지 않는다', async () => {
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    db.order.findMany.mockResolvedValue([]);
  cancelOrder.mockResolvedValue(undefined);

    await expect(createOrder(request(), user)).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      variantIds: ['v-coat-m'],
    });
    // 다시 시도하지 않는다. 두 번째도 같은 결과다.
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
  });

  it('성공하는 주문에는 아무 값도 붙지 않는다', async () => {
    // 여기까지 오는 것은 이미 실패한 요청뿐이어야 한다
    await createOrder(request(), user);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

/**
 * 서로 모르는 조회를 **함께** 보내는가.
 *
 * 이 배포는 DB 왕복 하나가 141ms 다 — 질의 내용과 무관하게 고정이었으니
 * 값이 아니라 거리에 묶인 값이다. 그러면 줄을 세운 횟수가 그대로 시간이
 * 된다. 예전에는 멱등 확인 · 배송지 · 쿠폰 · 스냅샷 넷이 하나씩 줄을 서
 * 4×141ms 였다.
 *
 * **시간을 재지 않는다.** 느린 기계에서 흔들리는 검사가 된다. 대신
 * **아직 아무것도 답하지 않았을 때 넷이 다 나갔는지**를 본다. 줄을 세우면
 * 첫 번째가 답하기 전에는 두 번째가 나갈 수 없으므로 이 검사가 진다.
 */
describe('서로 모르는 조회는 함께 나간다', () => {
  it('첫 응답이 오기 전에 네 조회가 모두 나가 있다', async () => {
    const started: string[] = [];
    /** 아무도 풀어 주기 전에는 답하지 않는 조회 */
    const held = <T,>(name: string, value: T) => {
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const fn = vi.fn(() => { started.push(name); return gate.then(() => value); });
      return { fn, release };
    };

    const idem = held('멱등확인', null);
    const addr = held('배송지', { ...address, id: 'a-1' });
    const coup = held('쿠폰', null);
    const snap = held('스냅샷', [
      { id: 'v-coat-m', product: { brand: { merchantId: 'm-1' }, images: [{ url: '/coat.jpg' }] } },
    ]);
    // 쿠폰 조회가 실제로 나가려면 쿠폰이 붙은 요청이어야 한다
    quoteCart.mockResolvedValue(quote({ couponDiscount: 10_000, couponCode: 'WELCOME' }));
    db.order.findFirst.mockImplementation(idem.fn);
    db.address.findFirst.mockImplementation(addr.fn);
    db.userCoupon.findFirst.mockImplementation(coup.fn);
    db.productVariant.findMany.mockImplementation(snap.fn);

    const running = createOrder(
      request({ idempotencyKey: 'idem-1', addressId: 'a-1', address: undefined, couponCode: 'WELCOME' }),
      user,
    );
    // 아무도 답하지 않은 채로 이벤트 루프를 몇 바퀴 돌린다
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(new Set(started)).toEqual(new Set(['멱등확인', '배송지', '쿠폰', '스냅샷']));

    idem.release(); addr.release(); coup.release(); snap.release();
    await running;
  });

  /**
   * 함께 보내면서 **보는 순서**까지 잃으면 안 된다.
   *
   * `Promise.all` 은 먼저 깨진 것을 던진다. 그러면 이미 만든 주문이 있는데
   * 배송지가 지워진 경우, 예전에는 그 주문을 그대로 돌려주던 것이
   * ADDRESS_NOT_FOUND 로 바뀐다 — 두 번 눌러 놓고 주문을 못 찾는 셈이다.
   */
  it('이미 만든 주문이 있으면 배송지가 없어도 그 주문을 돌려준다', async () => {
    const made = { orderNo: '20260831-1234567', payable: 289_000, status: 'PENDING' };
    db.order.findFirst.mockResolvedValue(made);
    db.address.findFirst.mockResolvedValue(null);   // 지워진 배송지

    await expect(
      createOrder(request({ idempotencyKey: 'idem-1', addressId: 'a-1', address: undefined }), user),
    ).resolves.toEqual(made);
  });
});

/**
 * 재고가 기준을 넘어 내려가면 가맹점에게 알린다.
 *
 * **넘는 순간 한 번만.** 기준 이하일 때마다 알리면 품절까지 주문마다 쌓인다.
 * 그리고 **트랜잭션 안에서 본다** — 커밋 뒤에 읽으면 그 사이 다른 주문이 깎은
 * 것까지 섞여서, 넘긴 주문이 아니라 엉뚱한 주문이 알림을 보낸다.
 */
describe('재고 부족 알림', () => {
  it('이 주문이 기준을 넘기면 알린다', async () => {
    // 1 개를 사서 6 → 5
    tx.productVariant.findUnique.mockResolvedValue({ stock: 5 });

    await createOrder(request(), user);

    expect(notifyLowStock).toHaveBeenCalledWith(['v-coat-m']);
  });

  it('이미 기준 아래였으면 또 알리지 않는다', async () => {
    /*
     * **여기가 이 묶음의 요점이다.** 5 → 4 에서 또 보내면 가맹점 알림함이
     * 같은 소식으로 찬다. 다섯 통째에는 아무도 안 읽는다.
     */
    tx.productVariant.findUnique.mockResolvedValue({ stock: 4 });

    await createOrder(request(), user);

    expect(notifyLowStock, '이미 알린 옵션에 또 보냈다').not.toHaveBeenCalled();
  });

  it('기준 위면 조용하다', async () => {
    tx.productVariant.findUnique.mockResolvedValue({ stock: 30 });
    await createOrder(request(), user);
    expect(notifyLowStock).not.toHaveBeenCalled();
  });

  it('깎기 전 값은 이번 주문이 깎은 만큼 더해 되짚는다', async () => {
    // 세 개를 사서 7 → 4. 되묻지 않고 더하면 된다 — 조건부 UPDATE 가 정확히 그만큼 깎았다
    quoteCart.mockResolvedValue(
      quote({
        lines: [{ ...quote().lines[0]!, quantity: 3, requestedQuantity: 3, subtotal: 867_000 }],
      }),
    );
    tx.productVariant.findUnique.mockResolvedValue({ stock: 4 });

    await createOrder(request({ lines: [{ variantId: 'v-coat-m', quantity: 3 }] }), user);

    expect(notifyLowStock).toHaveBeenCalledWith(['v-coat-m']);
  });

  it('주문이 실패하면 알리지 않는다', async () => {
    /*
     * 트랜잭션이 되돌아가면 재고 차감도 없던 일이 된다. 그때 모은 것을 들고
     * 가면 **일어나지 않은 일로** 알림이 간다.
     */
    tx.productVariant.findUnique.mockResolvedValue({ stock: 5 });
    tx.order.create.mockRejectedValue(new Error('DB 가 흔들렸다'));

    await expect(createOrder(request(), user)).rejects.toThrow();
    expect(notifyLowStock, '만들어지지 않은 주문으로 알림이 갔다').not.toHaveBeenCalled();
  });

  it('알림이 실패해도 주문은 성립한다', async () => {
    // 알림을 못 보냈다고 주문을 무를 수는 없고, 무르는 편이 더 나쁘다
    tx.productVariant.findUnique.mockResolvedValue({ stock: 5 });
    notifyLowStock.mockRejectedValue(new Error('알림 저장 실패'));

    await expect(createOrder(request(), user)).resolves.toMatchObject({
      orderNo: '20260831-1234567',
    });
  });
});
