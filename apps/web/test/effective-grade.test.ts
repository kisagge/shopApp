import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GRADE_REWARD_PERCENT, MEMBER_GRADE, GRADE_THRESHOLD } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn<(...a: any[]) => any>() },
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getEffectiveGrade, getQuoteViewer } = await import('~/lib/grade/effective');

const spent = (amount: number) => db.order.aggregate.mockResolvedValue({ _sum: { payable: amount } });

beforeEach(() => {
  vi.clearAllMocks();
  spent(0);
  db.user.findUnique.mockResolvedValue({ id: 'u-1', pointBalance: 5000, grade: 'BASIC' });
});

describe('등급 산정', () => {
  it('구매확정된 금액만 센다', async () => {
    // 주문하고 취소하기를 반복해 등급을 올리는 것을 막는다
    await getEffectiveGrade('u-1', 'BASIC');

    expect(db.order.aggregate.mock.calls[0]![0].where).toEqual({
      userId: 'u-1', status: 'CONFIRMED',
    });
  });

  it('구매액이 기준을 넘으면 등급이 올라간다', async () => {
    spent(GRADE_THRESHOLD.GOLD);

    const result = await getEffectiveGrade('u-1', 'BASIC');

    expect(result.grade).toBe('GOLD');
  });

  it('운영진이 올려 준 등급은 구매액 때문에 내려가지 않는다', async () => {
    spent(0);

    const result = await getEffectiveGrade('u-1', 'VIP');

    expect(result.grade).toBe('VIP');
  });

  it('저장된 등급을 넘기면 사용자 행을 다시 읽지 않는다', async () => {
    await getEffectiveGrade('u-1', 'SILVER');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('안 넘기면 읽어 온다', async () => {
    await getEffectiveGrade('u-1');
    expect(db.user.findUnique).toHaveBeenCalled();
  });
});

describe('적립률', () => {
  it('등급 표와 정확히 같은 값을 낸다', async () => {
    /*
     * 마이페이지는 이 표로 "현재 적립률 N%" 를 적는다. 계산이 다른 값을
     * 쓰면 화면이 약속한 것과 실제로 주는 것이 달라진다 — 실제로 그랬다.
     */
    for (const grade of MEMBER_GRADE) {
      spent(0);
      const result = await getEffectiveGrade('u-1', grade);
      expect(result.rewardPercent, grade).toBe(GRADE_REWARD_PERCENT[grade]);
    }
  });

  it('등급이 오르면 적립률도 오른다', async () => {
    spent(GRADE_THRESHOLD.VIP);

    const result = await getEffectiveGrade('u-1', 'BASIC');

    expect(result.grade).toBe('VIP');
    expect(result.rewardPercent).toBe(GRADE_REWARD_PERCENT.VIP);
    expect(result.rewardPercent).toBeGreaterThan(GRADE_REWARD_PERCENT.BASIC);
  });
});

describe('견적에 넘길 사람', () => {
  it('잔액과 적립률을 함께 낸다', async () => {
    spent(GRADE_THRESHOLD.SILVER);

    const viewer = await getQuoteViewer('u-1');

    expect(viewer).toEqual({
      id: 'u-1',
      pointBalance: 5000,
      rewardPercent: GRADE_REWARD_PERCENT.SILVER,
    });
  });

  it('포인트 잔액은 DB 에서 다시 읽는다', async () => {
    // 세션 캐시가 5분이라 그동안 다른 주문에서 쓴 포인트가 빠져 있을 수 있다
    await getQuoteViewer('u-1');

    expect(db.user.findUnique.mock.calls[0]![0].select).toMatchObject({ pointBalance: true });
  });

  it('없는 사람이면 null', async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await getQuoteViewer('u-x')).toBeNull();
  });

  /**
   * **등급을 손에 쥔 뒤에 집계를 시작하지 않는다.**
   *
   * 견적은 담고 빼고 쿠폰을 누를 때마다 지나는 창구인데, 사용자 행을 기다렸다가
   * 누적 구매액을 물으면 왕복 두 번이 직렬로 쌓인다 — DB 가 바다 건너에 있으면
   * 그대로 지연이다. 등급은 값 대신 약속으로 넘겨 둘이 나란히 나가야 한다.
   */
  it('사용자 행을 기다리지 않고 집계를 함께 보낸다', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    db.user.findUnique.mockImplementation(async () => {
      await held;
      return { id: 'u-1', pointBalance: 5000, grade: 'BASIC' };
    });

    const pending = getQuoteViewer('u-1');

    expect(db.order.aggregate, '사용자 행이 아직 안 왔는데 집계가 나가 있어야 한다').toHaveBeenCalled();
    release();
    expect(await pending).toMatchObject({ id: 'u-1' });
  });
});
