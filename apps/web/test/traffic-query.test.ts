import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WEB_VITAL, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  eventDaily: { findMany: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getTrafficHistory, getWebVitals } = await import('~/lib/queries/admin/traffic');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const NOW = new Date('2026-09-09T00:00:00.000Z');

/** 접힌 값 한 줄. day 는 UTC 자정이고 그 값이 곧 KST 날짜다. */
const daily = (day: string, name: string, events: number) => ({
  day: new Date(`${day}T00:00:00.000Z`),
  name,
  events,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.eventDaily.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe('권한', () => {
  it.each([
    ['가맹점', merchant],
    ['고객', customer],
  ])('%s 은 전체 트래픽을 볼 수 없다', async (_label, actor) => {
    await expect(getTrafficHistory(actor, 12, NOW)).rejects.toThrow();
    await expect(getWebVitals(actor, 28, NOW)).rejects.toThrow();
    expect(db.eventDaily.findMany).not.toHaveBeenCalled();
  });
});

describe('월별 트래픽', () => {
  /**
   * 원본 이벤트는 90일이 지나면 지워진다. 원본에서 세면 지워진 달이 조용히
   * 0 으로 잡혀 트래픽이 줄어든 것처럼 보인다 — 롤업이 존재하는 이유다.
   */
  it('접힌 값에서 읽는다 — 원본을 세지 않는다', async () => {
    await getTrafficHistory(admin, 12, NOW);

    expect(db.eventDaily.findMany).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('요청한 개수만큼 달을 돌려준다', async () => {
    const { months } = await getTrafficHistory(admin, 6, NOW);
    expect(months).toHaveLength(6);
  });

  /** 빈 달이 빠지면 차트에 구멍이 나고, 그 구멍이 "트래픽 없음" 처럼 보인다. */
  it('자료가 없는 달도 0 으로 채운다', async () => {
    db.eventDaily.findMany.mockResolvedValue([daily('2026-09-01', 'view_item', 10)]);

    const { months } = await getTrafficHistory(admin, 3, NOW);

    expect(months).toHaveLength(3);
    expect(months.every((m) => typeof m.viewItems === 'number')).toBe(true);
    expect(months.filter((m) => m.viewItems === 0)).toHaveLength(2);
  });

  it('같은 달의 여러 날을 더한다', async () => {
    db.eventDaily.findMany.mockResolvedValue([
      daily('2026-09-01', 'view_item', 10),
      daily('2026-09-02', 'view_item', 5),
      daily('2026-09-02', 'add_to_cart', 3),
      daily('2026-09-03', 'purchase', 2),
    ]);

    const { months } = await getTrafficHistory(admin, 1, NOW);

    expect(months[0]).toMatchObject({ month: '2026-09', viewItems: 15, addToCarts: 3, purchases: 2 });
  });

  it('요청 구간 밖의 달은 섞이지 않는다', async () => {
    db.eventDaily.findMany.mockResolvedValue([
      daily('2026-09-01', 'view_item', 10),
      daily('2025-01-01', 'view_item', 999),
    ]);

    const { months } = await getTrafficHistory(admin, 2, NOW);

    expect(months.reduce((s, m) => s + m.viewItems, 0)).toBe(10);
  });

  it('전환율은 조회 대비 결제, 소수 첫째 자리', async () => {
    db.eventDaily.findMany.mockResolvedValue([
      daily('2026-09-01', 'view_item', 300),
      daily('2026-09-01', 'purchase', 7),
    ]);

    const { months } = await getTrafficHistory(admin, 1, NOW);

    // 7/300 = 2.333…%
    expect(months[0]?.conversionRate).toBe(2.3);
  });

  it('조회가 없으면 전환율은 0 이다 — 0 으로 나누지 않는다', async () => {
    db.eventDaily.findMany.mockResolvedValue([daily('2026-09-01', 'purchase', 3)]);

    const { months } = await getTrafficHistory(admin, 1, NOW);

    expect(months[0]?.conversionRate).toBe(0);
    expect(Number.isFinite(months[0]!.conversionRate)).toBe(true);
  });

  it('원본이 남아 있는 시작일을 함께 알려 준다 — 그 앞은 접힌 값뿐이다', async () => {
    const { rawSince } = await getTrafficHistory(admin, 12, NOW);
    expect(rawSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(rawSince).getTime()).toBeLessThan(NOW.getTime());
  });
});

describe('실사용자 성능', () => {
  it('표본이 없으면 null 이다 — 0 은 "아주 빠름" 으로 읽힌다', async () => {
    const { vitals } = await getWebVitals(admin, 28, NOW);

    expect(vitals.every((v) => v.p75 === null && v.rating === null && v.samples === 0)).toBe(true);
  });

  it('지표를 하나도 빠뜨리지 않는다 — 없는 것도 자리를 지킨다', async () => {
    db.$queryRaw.mockResolvedValue([{ metric: 'LCP', p75: 2100, samples: 42n }]);

    const { vitals } = await getWebVitals(admin, 28, NOW);

    expect(vitals.map((v) => v.metric)).toEqual([...WEB_VITAL]);
  });

  it('값이 있으면 등급을 함께 매긴다', async () => {
    db.$queryRaw.mockResolvedValue([{ metric: 'LCP', p75: 2100, samples: 42n }]);

    const { vitals } = await getWebVitals(admin, 28, NOW);
    const lcp = vitals.find((v) => v.metric === 'LCP')!;

    expect(lcp.p75).toBe(2100);
    expect(lcp.samples).toBe(42);
    expect(lcp.rating).not.toBeNull();
  });

  /** bigint 를 그대로 두면 JSON 으로 못 나가고 화면이 통째로 죽는다. */
  it('표본 수를 숫자로 바꿔 준다', async () => {
    db.$queryRaw.mockResolvedValue([{ metric: 'LCP', p75: 2100, samples: 9_007n }]);

    const { vitals } = await getWebVitals(admin, 28, NOW);

    expect(typeof vitals.find((v) => v.metric === 'LCP')!.samples).toBe('number');
    expect(JSON.stringify(vitals)).toContain('9007');
  });


  it('전체 줄과 플랫폼 줄을 한 질의에서 받는다', async () => {
    /*
     * 전체와 플랫폼 셋을 따로 물으면 같은 표를 네 번 훑는다.
     * grouping sets 로 한 번에 받는다 — 전체 줄은 platform 이 null 로 온다.
     */
    await getWebVitals(admin, 28, NOW);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = db.$queryRaw.mock.calls[0]![0].join('?');
    expect(sql).toContain('grouping sets');
  });

  it('앱과 웹을 갈라 놓는다', async () => {
    /*
     * **섞여 있으면 앱이 느린지 아닌지를 말할 수 없다.** 앱은 켤 때마다
     * 웹뷰를 차게 띄우는 값이 더 붙는데, 그것이 모바일 웹 숫자에 묻힌다.
     */
    db.$queryRaw.mockResolvedValue([
      { metric: 'LCP', platform: null, p75: 2400, samples: 100n },
      { metric: 'LCP', platform: 'web', p75: 1900, samples: 70n },
      { metric: 'LCP', platform: 'android', p75: 4600, samples: 30n },
    ]);

    const { vitals } = await getWebVitals(admin, 28, NOW);
    const lcp = vitals.find((v) => v.metric === 'LCP')!;

    expect(lcp.p75, '전체는 platform 이 null 인 줄이다').toBe(2400);
    expect(lcp.byPlatform.web.p75).toBe(1900);
    expect(lcp.byPlatform.android.p75).toBe(4600);
    // LCP 는 4000ms 를 넘어야 나쁨이다(VITAL_THRESHOLD)
    expect(lcp.byPlatform.android.rating).toBe('poor');
    expect(lcp.byPlatform.web.rating).toBe('good');
  });

  it('표본이 없는 플랫폼도 자리를 지킨다 — 0 이 아니라 없음이다', async () => {
    // 0 을 돌려주면 "아주 빠름" 으로 읽힌다
    db.$queryRaw.mockResolvedValue([
      { metric: 'LCP', platform: 'web', p75: 1900, samples: 70n },
    ]);

    const { vitals } = await getWebVitals(admin, 28, NOW);
    const lcp = vitals.find((v) => v.metric === 'LCP')!;

    expect(lcp.byPlatform.ios).toEqual({ p75: null, rating: null, samples: 0 });
  });

  it('어디서 왔는지 모르는 방문은 전체에만 든다', async () => {
    /*
     * 이 구분이 생기기 전에 쌓인 행과 서버가 직접 적은 이벤트는 platform 이
     * 없다. 어느 칸에 넣어도 거짓이 되므로 전체에만 둔다.
     */
    db.$queryRaw.mockResolvedValue([
      { metric: 'TTFB', platform: null, p75: 500, samples: 50n },
    ]);

    const { vitals } = await getWebVitals(admin, 28, NOW);
    const ttfb = vitals.find((v) => v.metric === 'TTFB')!;

    expect(ttfb.samples).toBe(50);
    expect(ttfb.byPlatform.web.samples + ttfb.byPlatform.ios.samples + ttfb.byPlatform.android.samples).toBe(0);
  });

  it('구간 시작을 함께 돌려준다', async () => {
    const { since } = await getWebVitals(admin, 7, NOW);
    expect(NOW.getTime() - since.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
