import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  review: {
    findMany: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    aggregate: vi.fn<(...a: any[]) => any>(),
  },
  product: { update: vi.fn<(...a: any[]) => any>() },
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  address: { deleteMany: vi.fn<(...a: any[]) => any>() },
  cartItem: { deleteMany: vi.fn<(...a: any[]) => any>() },
  wishlistItem: { deleteMany: vi.fn<(...a: any[]) => any>() },
  restockNotification: { deleteMany: vi.fn<(...a: any[]) => any>() },
  userCoupon: { deleteMany: vi.fn<(...a: any[]) => any>() },
  session: { deleteMany: vi.fn<(...a: any[]) => any>() },
  account: { deleteMany: vi.fn<(...a: any[]) => any>() },
  eventLog: { updateMany: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
}));

const db = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
  },
  order: { findMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { closeAccount, inspectClosure, ClosureError } =
  await import('~/lib/account/close-account');

const USER = 'u-1';
const ok = { phrase: '탈퇴합니다', eraseReviews: false };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findFirst.mockResolvedValue({ id: USER, role: 'CUSTOMER' });
  db.user.findUniqueOrThrow.mockResolvedValue({ id: USER, pointBalance: 0 });
  db.order.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.updateMany.mockResolvedValue({ count: 2 });
  tx.review.findMany.mockResolvedValue([]);
  tx.review.aggregate.mockResolvedValue({ _sum: { rating: 0 }, _count: { _all: 0 } });
});

describe('확인 문구', () => {
  it('틀리면 아무것도 하지 않는다', async () => {
    await expect(closeAccount(USER, { ...ok, phrase: '탈퇴' })).rejects.toMatchObject({
      code: 'PHRASE_MISMATCH',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('앞뒤 공백은 봐준다', async () => {
    await expect(closeAccount(USER, { ...ok, phrase: '  탈퇴합니다 ' })).resolves.toBeDefined();
  });

  it('문구를 먼저 본다 — 막힌 계정에도 헛된 조회를 하지 않는다', async () => {
    await expect(closeAccount(USER, { ...ok, phrase: '' })).rejects.toBeInstanceOf(ClosureError);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('막힌 계정', () => {
  it('배송 중 주문이 있으면 거절한다', async () => {
    db.order.findMany.mockResolvedValue([{ status: 'SHIPPED', deliveredAt: null }]);

    await expect(closeAccount(USER, ok)).rejects.toMatchObject({
      code: 'BLOCKED', status: 409,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('막는 이유를 함께 돌려준다 — 화면이 무엇을 고쳐야 하는지 말해야 한다', async () => {
    db.user.findFirst.mockResolvedValue({ id: USER, role: 'MERCHANT' });

    await expect(closeAccount(USER, ok)).rejects.toMatchObject({
      blocks: ['STAFF_ACCOUNT'],
    });
  });

  it('이미 탈퇴한 계정은 다시 탈퇴하지 않는다', async () => {
    // deletedAt 이 없는 것만 찾는다
    db.user.findFirst.mockResolvedValue(null);

    await expect(inspectClosure(USER)).rejects.toMatchObject({
      code: 'ALREADY_CLOSED', status: 409,
    });
  });
});

describe('무엇을 지우는가', () => {
  it('다시 만들면 그만인 것은 지운다', async () => {
    await closeAccount(USER, ok);

    for (const table of ['address', 'cartItem', 'wishlistItem', 'restockNotification'] as const) {
      expect(tx[table].deleteMany, table).toHaveBeenCalledWith({ where: { userId: USER } });
    }
  });

  it('로그인 수단을 지운다 — 이메일만 바꾸면 이미 로그인해 둔 쪽이 남는다', async () => {
    await closeAccount(USER, ok);

    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
  });

  it('쓴 쿠폰은 지우지 않는다 — 주문이 가리키고 있다', async () => {
    await closeAccount(USER, ok);

    expect(tx.userCoupon.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, usedAt: null },
    });
  });

  it('주문서의 받는 사람·연락처·주소를 지운다', async () => {
    // 금액은 정산 근거라 남기지만, 개인정보까지 남기면 지웠다고 말할 수 없다
    await closeAccount(USER, ok);

    const data = tx.order.updateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      recipient: '탈퇴한 회원', recipientPhone: '',
      postalCode: '', address1: '', address2: null, deliveryMemo: null,
    });
  });

  it('분석 이벤트에서 사람만 뗀다 — 행은 남긴다', async () => {
    // 행까지 지우면 퍼널 집계가 통째로 흔들린다
    await closeAccount(USER, ok);

    expect(tx.eventLog.updateMany).toHaveBeenCalledWith({
      where: { userId: USER }, data: { userId: null },
    });
  });

  it('계정 값을 못 쓰는 것으로 바꾼다', async () => {
    await closeAccount(USER, ok);

    const data = tx.user.update.mock.calls[0]![0].data;
    expect(data.email).toBe('withdrawn-u-1@removed.invalid');
    expect(data.name).toBe('탈퇴한 회원');
    expect(data.phone).toBeNull();
    expect(data.emailVerified).toBe(false);
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('남은 이벤트가 다시 묶이지 않게 수집 동의를 거부로 둔다', async () => {
    await closeAccount(USER, ok);

    expect(tx.user.update.mock.calls[0]![0].data.analyticsConsent).toBe('DENIED');
  });
});

describe('포인트', () => {
  it('남은 포인트를 원장에 적고 소멸시킨다', async () => {
    /*
     * 잔액만 0 으로 만들면 원장 합계와 어긋나고, 그 뒤로 대사 배치가
     * 매번 이 계정을 어긋난 것으로 잡는다.
     */
    db.user.findUniqueOrThrow.mockResolvedValue({ id: USER, pointBalance: 3200 });

    const result = await closeAccount(USER, ok);

    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      userId: USER, amount: -3200, reason: 'EXPIRE',
    });
    expect(tx.user.update.mock.calls[0]![0].data.pointBalance).toBe(0);
    expect(result.forfeitedPoints).toBe(3200);
  });

  it('잔액이 0 이면 원장에 적지 않는다 — 0 짜리 줄이 쌓일 이유가 없다', async () => {
    await closeAccount(USER, ok);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });
});

describe('리뷰', () => {
  it('기본은 남긴다 — 이름은 계정과 함께 지워진다', async () => {
    const result = await closeAccount(USER, ok);

    expect(tx.review.deleteMany).not.toHaveBeenCalled();
    expect(result.erasedReviews).toBe(0);
  });

  it('함께 지우기를 고르면 지운다', async () => {
    tx.review.findMany.mockResolvedValue([
      { id: 'r-1', productId: 'p-1' },
      { id: 'r-2', productId: 'p-1' },
    ]);

    const result = await closeAccount(USER, { ...ok, eraseReviews: true });

    expect(tx.review.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r-1', 'r-2'] } } });
    expect(result.erasedReviews).toBe(2);
  });

  it('지운 상품의 평점을 다시 센다', async () => {
    // 뺀 만큼 빼는 방식은 한 번 어긋나면 스스로 알아채지 못한다
    tx.review.findMany.mockResolvedValue([
      { id: 'r-1', productId: 'p-1' },
      { id: 'r-2', productId: 'p-2' },
      { id: 'r-3', productId: 'p-1' },
    ]);
    tx.review.aggregate.mockResolvedValue({ _sum: { rating: 8 }, _count: { _all: 2 } });

    await closeAccount(USER, { ...ok, eraseReviews: true });

    // 상품마다 한 번씩. 같은 상품을 두 번 세지 않는다.
    expect(tx.product.update).toHaveBeenCalledTimes(2);
    expect(tx.product.update.mock.calls[0]![0].data).toMatchObject({
      ratingSum: 8, reviewCount: 2, ratingScore: 400,
    });
  });

  it('지울 리뷰가 없으면 집계도 건드리지 않는다', async () => {
    await closeAccount(USER, { ...ok, eraseReviews: true });
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});

describe('한 트랜잭션', () => {
  it('전부 같은 트랜잭션 안에서 돈다', async () => {
    /*
     * 중간에 끊겨 이메일만 지워지고 로그인 수단이 남으면 들어갈 수는
     * 없는데 지워지지도 않은 계정이 된다.
     */
    await closeAccount(USER, ok);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
