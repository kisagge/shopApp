import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  eventLog: {
    groupBy: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
  },
  eventDaily: {
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
  },
  funnelDaily: {
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
  },
  eventRollup: {
    findMany: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { runEventRollup } = await import('~/lib/analytics/rollup');

const NOW = new Date('2026-09-03T04:00:00+09:00');
const asDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** 롤업된 날 목록을 세운다 (오름차순) */
const rolledUpDays = (...days: string[]) =>
  db.eventRollup.findMany.mockResolvedValue(days.map((d) => ({ day: asDate(d) })));

/** from 부터 to 까지 하루도 빠짐없이 */
function everyDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = asDate(from).getTime(); t <= asDate(to).getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * groupBy 는 호출마다 다른 모양을 돌려준다.
 * by 배열을 보고 무엇을 물어본 것인지 구분한다.
 */
function stubGroupBy(rows: {
  totals?: unknown[];
  sessions?: unknown[];
  users?: unknown[];
  funnel?: unknown[];
}) {
  db.eventLog.groupBy.mockImplementation((args: { by: string[]; where?: any }) => {
    const by = args.by.join(',');
    if (by === 'name') return Promise.resolve(rows.totals ?? []);
    if (by === 'name,sessionId') return Promise.resolve(rows.sessions ?? []);
    if (by === 'name,userId') return Promise.resolve(rows.users ?? []);
    if (by === 'sessionId,name') return Promise.resolve(rows.funnel ?? []);
    throw new Error(`예상하지 못한 groupBy: ${by}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockResolvedValue([]);
  db.eventLog.deleteMany.mockResolvedValue({ count: 0 });
  db.eventRollup.findMany.mockResolvedValue([]);
  stubGroupBy({});
});

describe('접을 날 고르기', () => {
  it('마지막 롤업 다음부터 어제까지 접는다', async () => {
    rolledUpDays(...everyDay('2026-08-01', '2026-08-31'));
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-08-01T00:00:00Z') });

    const result = await runEventRollup(NOW);

    expect(result.rolledUp).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('오늘은 접지 않는다 — 남은 시간의 이벤트가 사라진다', async () => {
    rolledUpDays('2026-09-02');
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-08-01T00:00:00Z') });

    const result = await runEventRollup(NOW);

    expect(result.rolledUp).toEqual([]);
  });

  it('롤업 날짜는 KST 로 9시간 밀리지 않는다', async () => {
    // DATE 컬럼은 UTC 자정으로 읽힌다. 이것을 KST 로 다시 해석하면
    // 8/31 이 8/30 이 되어 하루를 두 번 접는다.
    rolledUpDays('2026-09-01');
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-08-01T00:00:00Z') });

    const result = await runEventRollup(NOW);

    expect(result.rolledUp).toEqual(['2026-09-02']);
  });
});

describe('하루치 집계', () => {
  beforeEach(() => {
    rolledUpDays('2026-09-01');
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-09-01T00:00:00Z') });
  });

  it('KST 하루 창으로 원본을 읽는다 — UTC 로 자르면 오전 9시간이 어제로 간다', async () => {
    await runEventRollup(NOW);

    const where = db.eventLog.groupBy.mock.calls[0]?.[0].where;
    expect(where.receivedAt.gte.toISOString()).toBe('2026-09-01T15:00:00.000Z');
    expect(where.receivedAt.lt.toISOString()).toBe('2026-09-02T15:00:00.000Z');
  });

  it('이벤트 수·금액·고유 세션 수를 이름별로 접는다', async () => {
    stubGroupBy({
      totals: [
        { name: 'view_item', _count: { _all: 40 }, _sum: { value: null, quantity: null } },
        { name: 'purchase', _count: { _all: 3 }, _sum: { value: 870000, quantity: 5 } },
      ],
      sessions: [
        { name: 'view_item', sessionId: 's1' },
        { name: 'view_item', sessionId: 's2' },
        { name: 'purchase', sessionId: 's1' },
      ],
      users: [{ name: 'purchase', userId: 'u1' }],
    });

    await runEventRollup(NOW);

    const rows = db.eventDaily.createMany.mock.calls[0]?.[0].data;
    expect(rows).toContainEqual({
      day: asDate('2026-09-02'), name: 'view_item',
      events: 40, sessions: 2, users: 0, value: 0, quantity: 0,
    });
    expect(rows).toContainEqual({
      day: asDate('2026-09-02'), name: 'purchase',
      events: 3, sessions: 1, users: 1, value: 870000, quantity: 5,
    });
  });

  it('퍼널은 strict 로 접는다 — 앞 단계를 건너뛴 세션은 세지 않는다', async () => {
    stubGroupBy({
      funnel: [
        // s1: 전 단계를 다 거쳤다
        { sessionId: 's1', name: 'view_item' },
        { sessionId: 's1', name: 'add_to_cart' },
        { sessionId: 's1', name: 'begin_checkout' },
        { sessionId: 's1', name: 'purchase' },
        // s2: 상세를 안 보고 바로 담았다 — 첫 단계가 없으므로 어디에도 안 센다
        { sessionId: 's2', name: 'add_to_cart' },
        { sessionId: 's2', name: 'begin_checkout' },
        // s3: 보기만 했다
        { sessionId: 's3', name: 'view_item' },
      ],
    });

    await runEventRollup(NOW);

    const steps = db.funnelDaily.createMany.mock.calls[0]?.[0].data as {
      step: string; sessions: number;
    }[];
    const by = Object.fromEntries(steps.map((s) => [s.step, s.sessions]));
    expect(by).toEqual({
      view_item: 2, add_to_cart: 1, begin_checkout: 1, purchase: 1,
    });
    // 느슨하게 셌다면 add_to_cart 가 2 가 되어 전환율이 100% 를 넘는 표가 나온다
    expect(by['add_to_cart']).toBeLessThanOrEqual(by['view_item']!);
  });

  it('다시 돌려도 결과가 같다 — 지우고 다시 넣는다', async () => {
    stubGroupBy({
      totals: [{ name: 'view_item', _count: { _all: 10 }, _sum: { value: null, quantity: null } }],
    });

    await runEventRollup(NOW);

    // 트랜잭션 안에서 그날 행을 먼저 지운다. upsert 로만 하면 이번에
    // 사라진 이름의 행이 옛 값으로 남는다.
    expect(db.eventDaily.deleteMany).toHaveBeenCalledWith({ where: { day: asDate('2026-09-02') } });
    expect(db.funnelDaily.deleteMany).toHaveBeenCalledWith({ where: { day: asDate('2026-09-02') } });
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
});

describe('원본 삭제 — 접힌 날만 지운다', () => {
  it('접힌 적이 없으면 아무것도 지우지 않는다', async () => {
    rolledUpDays();
    db.eventLog.findFirst.mockResolvedValue(null);

    const result = await runEventRollup(NOW);

    expect(db.eventLog.deleteMany).not.toHaveBeenCalled();
    expect(result.deletedRows).toBe(0);
    expect(result.deleteSkipped).toBe('접힌 날이 없습니다');
  });

  it('보존 기간이 지난 것만 지운다', async () => {
    rolledUpDays(...everyDay('2026-01-01', '2026-09-02'));
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-01-01T00:00:00Z') });
    db.eventLog.deleteMany.mockResolvedValue({ count: 4210 });

    const result = await runEventRollup(NOW, { retentionDays: 90 });

    expect(result.deletedThrough).toBe('2026-06-05');
    // 6/5 까지 포함해서 지우므로 경계는 6/6 KST 자정 = 6/5 UTC 15:00
    const where = db.eventLog.deleteMany.mock.calls[0]?.[0].where;
    expect(where.receivedAt.lt.toISOString()).toBe('2026-06-05T15:00:00.000Z');
    expect(result.deletedRows).toBe(4210);
  });

  it('보존 기간을 다 채웠어도 접힌 선을 넘어 지우지 않는다', async () => {
    // 롤업이 6/1 까지만 돼 있다. 이번 배치가 14일을 따라잡아 6/15 까지 접는다.
    // 보존 0일이면 오늘까지 지울 수 있지만, **접힌 6/15 에서 멈춰야 한다.**
    rolledUpDays(...everyDay('2026-01-01', '2026-06-01'));
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-01-01T00:00:00Z') });
    db.eventLog.deleteMany.mockResolvedValue({ count: 100 });

    const result = await runEventRollup(NOW, { retentionDays: 0 });

    expect(result.rolledUp.at(-1)).toBe('2026-06-15');
    expect(result.deletedThrough).toBe('2026-06-15');
    // 보존만 봤다면 오늘까지 지웠을 것이다
    expect(result.deletedThrough! < '2026-09-03').toBe(true);
  });

  it('한 번에 따라잡는 날 수에 상한이 있다 — 서버리스는 중간에 끊긴다', async () => {
    rolledUpDays('2026-01-01');
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-01-01T00:00:00Z') });

    const result = await runEventRollup(NOW);

    expect(result.rolledUp).toHaveLength(14);
    expect(result.rolledUp[0]).toBe('2026-01-02');
  });

  it('롤업 기록에 구멍이 있으면 구멍부터 다시 접고, 구멍 너머는 지우지 않는다', async () => {
    // 6/20 이 빠져 있다. 최댓값(9/2)을 진행선으로 삼으면 6/20 원본을
    // 접힌 적도 없이 지우게 된다.
    const withHole = everyDay('2026-01-01', '2026-09-02').filter((d) => d !== '2026-06-20');
    rolledUpDays(...withHole);
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-01-01T00:00:00Z') });
    db.eventLog.deleteMany.mockResolvedValue({ count: 1 });

    const result = await runEventRollup(NOW, { retentionDays: 0 });

    // 진행선은 6/19 에서 멈추므로 6/20 부터 다시 접는다 — 스스로 낫는다
    expect(result.rolledUp[0]).toBe('2026-06-20');
    // 한 배치가 따라잡을 수 있는 만큼만 접었으므로 삭제도 거기서 멈춘다.
    // 최댓값을 봤다면 9/2 까지 밀고 나가 6/20 원본을 접기도 전에 지웠을 것이다.
    expect(result.deletedThrough).toBe(result.rolledUp.at(-1));
    expect(result.deletedThrough).toBe('2026-07-03');
  });

  it('구멍이 없으면 진행선이 마지막 날까지 간다', async () => {
    rolledUpDays(...everyDay('2026-08-01', '2026-09-02'));
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-08-01T00:00:00Z') });
    db.eventLog.deleteMany.mockResolvedValue({ count: 1 });

    const result = await runEventRollup(NOW, { retentionDays: 0 });

    expect(result.rolledUp).toEqual([]); // 접을 것이 없다
    expect(result.deletedThrough).toBe('2026-09-02');
  });

  it('접은 다음에 지운다 — 순서가 반대면 지운 것을 접게 된다', async () => {
    const order: string[] = [];
    rolledUpDays(...everyDay('2026-01-01', '2026-09-01'));
    db.eventLog.findFirst.mockResolvedValue({ receivedAt: new Date('2026-01-01T00:00:00Z') });
    db.$transaction.mockImplementation(() => {
      order.push('rollup');
      return Promise.resolve([]);
    });
    db.eventLog.deleteMany.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve({ count: 1 });
    });

    await runEventRollup(NOW, { retentionDays: 90 });

    expect(order).toEqual(['rollup', 'delete']);
  });
});
