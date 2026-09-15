import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  productVariant: { findUnique: vi.fn<(...a: any[]) => any>() },
  restockNotification: {
    count: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { subscribeRestock, unsubscribeRestock, notifyRestocked, setRestockNotifiers } =
  await import('~/lib/restock/notify');

const variant = (over: Record<string, unknown> = {}) => ({
  stock: 0,
  isActive: true,
  product: {
    status: 'ACTIVE', deletedAt: null, publishedAt: new Date('2026-01-01'),
    brand: { merchant: { status: 'APPROVED' } },
  },
  ...over,
});

const sent: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  db.productVariant.findUnique.mockResolvedValue(variant());
  db.restockNotification.count.mockResolvedValue(0);
  db.restockNotification.updateMany.mockResolvedValue({ count: 1 });
  setRestockNotifiers([
    { name: 'test', send: (n) => { sent.push([...n]); return Promise.resolve(); } },
  ]);
});

describe('신청 조건', () => {
  it('품절이면 걸 수 있다', async () => {
    await subscribeRestock('u-1', 'v-1');

    expect(db.restockNotification.upsert).toHaveBeenCalled();
  });

  it('재고가 있으면 걸 수 없다 — 영원히 안 울리는 알림이 쌓인다', async () => {
    db.productVariant.findUnique.mockResolvedValue(variant({ stock: 5 }));

    await expect(subscribeRestock('u-1', 'v-1')).rejects.toMatchObject({ code: 'IN_STOCK' });
    expect(db.restockNotification.upsert).not.toHaveBeenCalled();
  });

  it('내려간 상품에는 걸 수 없다 — 다시 올릴지 알 수 없다', async () => {
    db.productVariant.findUnique.mockResolvedValue(
      variant({ product: { ...variant().product, publishedAt: null } }),
    );

    await expect(subscribeRestock('u-1', 'v-1')).rejects.toMatchObject({ code: 'NOT_SELLABLE' });
  });

  it('정지된 가맹점 상품에도 걸 수 없다', async () => {
    db.productVariant.findUnique.mockResolvedValue(
      variant({ product: { ...variant().product, brand: { merchant: { status: 'SUSPENDED' } } } }),
    );

    await expect(subscribeRestock('u-1', 'v-1')).rejects.toMatchObject({ code: 'NOT_SELLABLE' });
  });

  it('개수 제한을 넘기지 않는다', async () => {
    db.restockNotification.count.mockResolvedValue(30);

    await expect(subscribeRestock('u-1', 'v-1')).rejects.toMatchObject({ code: 'TOO_MANY' });
  });

  it('제한은 기다리는 것만 센다 — 이미 받은 건은 자리를 차지하지 않는다', async () => {
    await subscribeRestock('u-1', 'v-1');

    expect(db.restockNotification.count.mock.calls[0]?.[0].where).toMatchObject({
      notifiedAt: null,
    });
  });

  it('한 번 받은 뒤 다시 걸면 기다리는 상태로 되돌린다', async () => {
    await subscribeRestock('u-1', 'v-1');

    expect(db.restockNotification.upsert.mock.calls[0]?.[0].update).toEqual({ notifiedAt: null });
  });
});

describe('해제', () => {
  it('없어도 오류가 아니다 — 지우려는 상태가 이미 그 상태다', async () => {
    db.restockNotification.deleteMany.mockResolvedValue({ count: 0 });

    await expect(unsubscribeRestock('u-1', 'v-1')).resolves.toBeUndefined();
  });
});

describe('발송', () => {
  const pending = [
    {
      id: 'r-1', userId: 'u-1', variantId: 'v-1',
      user: { email: 'a@plain.test' },
      variant: { label: '블랙 / M', product: { name: '울 코트', slug: 'wool-coat' } },
    },
  ];

  it('기다리는 사람에게만 보낸다', async () => {
    db.restockNotification.findMany.mockResolvedValue(pending);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(1);
    expect(db.restockNotification.findMany.mock.calls[0]?.[0].where).toMatchObject({
      notifiedAt: null,
      // 보관한 상품의 대기자는 부르지 않는다 — 눌러 들어가면 없는 상품이다
      variant: { product: { deletedAt: null } },
    });
  });

  it('보내기 전에 먼저 표시한다 — 반대면 같은 사람에게 두 번 간다', async () => {
    const order: string[] = [];
    db.restockNotification.findMany.mockResolvedValue(pending);
    db.restockNotification.updateMany.mockImplementation(() => {
      order.push('mark');
      return Promise.resolve({ count: 1 });
    });
    setRestockNotifiers([
      { name: 'test', send: () => { order.push('send'); return Promise.resolve(); } },
    ]);

    await notifyRestocked(['v-1']);

    expect(order).toEqual(['mark', 'send']);
  });

  it('기다리는 사람이 없으면 아무 일도 없다', async () => {
    db.restockNotification.findMany.mockResolvedValue([]);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(0);
    expect(db.restockNotification.updateMany).not.toHaveBeenCalled();
  });

  it('빈 목록이면 조회조차 하지 않는다', async () => {
    const r = await notifyRestocked([]);

    expect(r.notified).toBe(0);
    expect(db.restockNotification.findMany).not.toHaveBeenCalled();
  });

  it('보낼 내용에 상품·옵션·주소가 담긴다', async () => {
    db.restockNotification.findMany.mockResolvedValue(pending);

    await notifyRestocked(['v-1']);

    expect(sent[0]?.[0]).toMatchObject({
      email: 'a@plain.test', productName: '울 코트', optionLabel: '블랙 / M',
      productSlug: 'wool-coat',
    });
  });

  it('발송이 실패해도 표시는 남는다', async () => {
    db.restockNotification.findMany.mockResolvedValue(pending);
    setRestockNotifiers([
      { name: 'broken', send: () => Promise.reject(new Error('메일 서버 장애')) },
    ]);

    const r = await notifyRestocked(['v-1']);

    // allSettled 로 감싸 두어 한 경로의 실패가 전체를 깨지 않는다
    expect(r.notified).toBe(1);
  });
});
