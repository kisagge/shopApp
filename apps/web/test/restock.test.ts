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
  // 표시는 조건부 UPDATE … RETURNING 로 한다 — 누가 이겼는지 알아야 그 사람에게만 보낸다
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: (parts: unknown[]) => parts } }));

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
/** 이번에 읽힌 대기자 — 표시가 그중 누구를 이겼는지 흉내 내는 데 쓴다 */
let lastPending: { id: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  db.productVariant.findUnique.mockResolvedValue(variant());
  db.restockNotification.count.mockResolvedValue(0);
  db.restockNotification.updateMany.mockResolvedValue({ count: 1 });
  // 기본값: 부른 줄을 전부 이긴다
  db.$queryRaw.mockImplementation(() => Promise.resolve(lastPending.map((p) => ({ id: p.id }))));
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

  /**
   * **검수 대기 상품에는 걸 수 없다.**
   *
   * 조건을 여기서 손으로 적던 때에는 상태를 DRAFT·HIDDEN 만 뺐다. 그래서 아직 매대에
   * 서지도 않은 상품에 "들어오면 알려 드립니다" 를 약속할 수 있었다 — 그 상품은
   * 심사에서 떨어지면 영영 안 들어온다. 판단은 이제 core 의 isOnDisplay 하나가 한다.
   */
  it('검수 대기 상품에는 걸 수 없다 — 매대에 서지도 않았다', async () => {
    db.productVariant.findUnique.mockResolvedValue(
      variant({ product: { ...variant().product, status: 'PENDING_REVIEW' } }),
    );

    await expect(subscribeRestock('u-1', 'v-1')).rejects.toMatchObject({ code: 'NOT_SELLABLE' });
    expect(db.restockNotification.upsert).not.toHaveBeenCalled();
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
  /** 매대에 서 있는 상품의 대기자 한 줄 — 보내는 쪽도 신청과 같은 것을 본다(isOnDisplay) */
  const onDisplay = {
    name: '울 코트', slug: 'wool-coat', status: 'ACTIVE', deletedAt: null,
    publishedAt: new Date('2026-07-01'), brand: { merchant: { status: 'APPROVED' } },
  };
  const pendingRow = (product: Record<string, unknown> = {}) => ({
    id: 'r-1', userId: 'u-1', variantId: 'v-1',
    user: { email: 'a@plain.test' },
    variant: { label: '블랙 / M', product: { ...onDisplay, ...product } },
  });
  const pending = [pendingRow()];

  const readsPending = (rows: { id: string }[]) => {
    lastPending = rows;
    db.restockNotification.findMany.mockResolvedValue(rows);
  };

  it('기다리는 사람에게만 보낸다', async () => {
    readsPending(pending);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(1);
    expect(db.restockNotification.findMany.mock.calls[0]?.[0].where).toMatchObject({
      notifiedAt: null,
      // 보관한 상품의 대기자는 부르지 않는다 — 눌러 들어가면 없는 상품이다
      variant: { product: { deletedAt: null } },
    });
  });

  /**
   * **매대에 없는 상품의 알림은 보내지 않는다.**
   *
   * 신청은 매대에 서 있을 때만 받는데(subscribeRestock) 보내는 쪽은 보관만 걸러 더 느슨했다 —
   * 신청한 뒤 숨겨지거나 검수 대기로 내려가거나 가맹점이 멈춘 상품에도 "다시 들어왔습니다" 가
   * 나갔고, 누르면 매대 조회가 걸러 404 다. 기다리던 사람에게 가장 나쁜 모양이다.
   */
  it.each([
    ['숨겼다', { status: 'HIDDEN' }],
    ['검수를 기다린다', { status: 'PENDING_REVIEW' }],
    ['게시된 적이 없다', { publishedAt: null }],
    ['가맹점이 멈췄다', { brand: { merchant: { status: 'SUSPENDED' } } }],
  ])('%s — 보내지 않는다', async (_label, product) => {
    readsPending([pendingRow(product)]);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(0);
    // **표시도 걸지 않는다.** 표시부터 하면 받지도 못한 알림을 받은 것이 된다
    expect(db.$queryRaw, '표시부터 하면 받지도 못한 알림을 받은 것이 된다').not.toHaveBeenCalled();
    expect(sent, '메일이 나갔다').toHaveLength(0);
  });

  it('신청은 지우지 않는다 — 되돌아오면 그때 간다', async () => {
    readsPending([pendingRow({ status: 'HIDDEN' })]);

    await notifyRestocked(['v-1']);

    expect(db.restockNotification.deleteMany).not.toHaveBeenCalled();
    expect(db.restockNotification.updateMany).not.toHaveBeenCalled();
  });

  it('보내기 전에 먼저 표시한다 — 반대면 같은 사람에게 두 번 간다', async () => {
    const order: string[] = [];
    readsPending(pending);
    db.$queryRaw.mockImplementation(() => {
      order.push('mark');
      return Promise.resolve([{ id: 'r-1' }]);
    });
    setRestockNotifiers([
      { name: 'test', send: () => { order.push('send'); return Promise.resolve(); } },
    ]);

    await notifyRestocked(['v-1']);

    expect(order).toEqual(['mark', 'send']);
  });

  it('기다리는 사람이 없으면 아무 일도 없다', async () => {
    readsPending([]);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  /**
   * **겹쳐 돌 때 같은 메일이 두 번 갔다.**
   *
   * 이 함수는 트랜잭션 밖에서 불린다(재고 수정·일괄 재고 업로드). 표시에 "아직 표시되지 않은 줄" 조건이 없으면
   * 두 실행이 같은 목록을 읽고 둘 다 표시하고 둘 다 보낸다 — 바로 위에 적어 둔 "여러 번 받는 것보다 낫다" 는
   * 판단이 지켜지지 않는다.
   */
  it('아직 표시되지 않은 줄에만 표시한다', async () => {
    readsPending(pending);

    await notifyRestocked(['v-1']);

    // 태그드 템플릿이라 첫 인자가 글자 조각 배열이다
    const [parts] = db.$queryRaw.mock.calls[0]! as [readonly string[]];
    const sql = parts.join('?');
    expect(sql, '조건이 없으면 겹쳐 돈 실행이 같은 사람에게 또 보낸다').toMatch(/notifiedAt" IS NULL/);
  });

  it('다른 실행이 먼저 가져간 사람에게는 보내지 않는다', async () => {
    readsPending([
      pending[0]!,
      { ...pendingRow(), id: 'r-2', userId: 'u-2', user: { email: 'b@plain.test' } },
    ]);
    // 첫 줄은 다른 실행이 이미 표시했다 — 이긴 줄만 돌아온다
    db.$queryRaw.mockResolvedValue([{ id: 'r-2' }]);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(1);
    expect(sent[0]).toHaveLength(1);
    expect((sent[0] as { userId: string }[])[0]!.userId).toBe('u-2');
  });

  it('전부 다른 실행이 가져갔으면 아무에게도 안 보낸다', async () => {
    readsPending(pending);
    db.$queryRaw.mockResolvedValue([]);

    const r = await notifyRestocked(['v-1']);

    expect(r.notified).toBe(0);
    expect(sent).toHaveLength(0);
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
