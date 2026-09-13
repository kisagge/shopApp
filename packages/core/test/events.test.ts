import { describe, it, expect, vi } from 'vitest';
import {
  COMMERCE_EVENT, isCommerceEvent, isServerOnlyEvent, requiresConsent,
  FUNNEL_STEP, FUNNEL_STEP_LABEL, computeFunnel, fanOut, AllSinksFailedError,
  funnelFromCounts, MERCHANT_FUNNEL_STEP,
  type EventSink, type EventName, type SessionEventNames, type TrackedEvent,
} from '../src/events';

describe('이벤트 분류', () => {
  it('알 수 없는 이름을 걸러낸다', () => {
    expect(isCommerceEvent('view_item')).toBe(true);
    expect(isCommerceEvent('veiw_item')).toBe(false);
    expect(isCommerceEvent('')).toBe(false);
  });

  it('purchase 와 refund 는 서버 전용이다 — 브라우저가 보내면 버린다', () => {
    expect(isServerOnlyEvent('purchase')).toBe(true);
    expect(isServerOnlyEvent('refund')).toBe(true);
    expect(isServerOnlyEvent('add_to_cart')).toBe(false);
  });

  it('필수 이벤트는 동의 없이도 기록한다', () => {
    expect(requiresConsent('purchase')).toBe(false);
    expect(requiresConsent('login')).toBe(false);
    expect(requiresConsent('view_item')).toBe(true);
    expect(requiresConsent('page_view')).toBe(true);
  });

  it('퍼널 단계는 모두 실제 이벤트 이름이다', () => {
    for (const s of FUNNEL_STEP) expect(COMMERCE_EVENT).toContain(s);
  });

  it('퍼널 단계에 한글 라벨이 있다', () => {
    for (const s of FUNNEL_STEP) expect(FUNNEL_STEP_LABEL[s]).toBeTruthy();
  });
});

describe('computeFunnel', () => {
  const s = (sessionId: string, ...names: string[]): SessionEventNames => ({ sessionId, names });

  it('앞 단계를 거친 세션만 다음 단계로 센다', () => {
    const r = computeFunnel([
      s('a', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'),
      s('b', 'view_item', 'add_to_cart', 'begin_checkout'),
      s('c', 'view_item', 'add_to_cart'),
      s('d', 'view_item'),
    ]);
    expect(r.map((x) => x.sessions)).toEqual([4, 3, 2, 1]);
  });

  it('앞 단계를 건너뛴 세션은 뒤 단계에서도 세지 않는다 — 전환율이 100%를 넘으면 안 된다', () => {
    // 상세를 안 거치고 바로 담은 세션. 느슨하게 세면 2단계가 1단계보다 커진다.
    const r = computeFunnel([
      s('a', 'view_item', 'add_to_cart'),
      s('b', 'add_to_cart', 'begin_checkout', 'purchase'),
    ]);
    expect(r[0]?.sessions).toBe(1);
    expect(r[1]?.sessions).toBe(1);
    expect(r[3]?.sessions).toBe(0);
    for (const step of r) expect(step.rateFromStart).toBeLessThanOrEqual(100);
  });

  it('첫 단계 대비 / 직전 대비 비율을 함께 준다', () => {
    const r = computeFunnel([
      s('a', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'),
      s('b', 'view_item', 'add_to_cart'),
      s('c', 'view_item'),
      s('d', 'view_item'),
    ]);
    expect(r[0]).toMatchObject({ sessions: 4, rateFromStart: 100, rateFromPrevious: 100 });
    expect(r[1]).toMatchObject({ sessions: 2, rateFromStart: 50, rateFromPrevious: 50 });
    expect(r[2]).toMatchObject({ sessions: 1, rateFromStart: 25, rateFromPrevious: 50 });
  });

  it('이탈 수를 알려준다 — 어느 구간에서 빠지는지가 핵심이다', () => {
    const r = computeFunnel([
      s('a', 'view_item', 'add_to_cart'),
      s('b', 'view_item'),
      s('c', 'view_item'),
    ]);
    expect(r[1]?.droppedFromPrevious).toBe(2);
  });

  it('세션이 없으면 0으로 나누지 않는다', () => {
    const r = computeFunnel([]);
    expect(r).toHaveLength(FUNNEL_STEP.length);
    for (const step of r) {
      expect(step.sessions).toBe(0);
      expect(step.rateFromStart).toBe(0);
      expect(Number.isNaN(step.rateFromPrevious)).toBe(false);
    }
  });

  it('같은 이벤트가 여러 번 있어도 세션은 한 번만 센다', () => {
    const r = computeFunnel([s('a', 'view_item', 'view_item', 'view_item')]);
    expect(r[0]?.sessions).toBe(1);
  });
});

describe('fanOut', () => {
  const event = { name: 'view_item' } as unknown as TrackedEvent;
  const sink = (name: string, fail = false): EventSink => ({
    name,
    send: vi.fn(() => (fail ? Promise.reject(new Error('망함')) : Promise.resolve())),
  });

  it('모든 싱크에 보낸다', async () => {
    const a = sink('a');
    const b = sink('b');
    await fanOut([a, b]).send([event]);
    expect(a.send).toHaveBeenCalledOnce();
    expect(b.send).toHaveBeenCalledOnce();
  });

  it('일부만 실패하면 삼킨다 — 나머지 싱크에 남았으므로 유실이 아니다', async () => {
    const bad = sink('bad', true);
    const good = sink('good');
    const onError = vi.fn();
    await expect(fanOut([bad, good], onError).send([event])).resolves.toBeUndefined();
    expect(good.send).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
  });

  it('전부 실패하면 던진다 — 아무 데도 안 남았는데 성공했다고 답하면 안 된다', async () => {
    const onError = vi.fn();
    await expect(
      fanOut([sink('a', true), sink('b', true)], onError).send([event]),
    ).rejects.toBeInstanceOf(AllSinksFailedError);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('실패한 싱크 이름을 에러에 담는다', async () => {
    try {
      await fanOut([sink('db', true)]).send([event]);
      expect.unreachable('던졌어야 한다');
    } catch (e) {
      expect(e).toBeInstanceOf(AllSinksFailedError);
      expect((e as AllSinksFailedError).failures.map((f) => f.sink)).toEqual(['db']);
      expect((e as Error).message).toContain('db');
    }
  });

  it('싱크가 하나도 없으면 조용히 끝낸다', async () => {
    await expect(fanOut([]).send([event])).resolves.toBeUndefined();
  });

  it('보낼 게 없으면 싱크를 건드리지 않는다', async () => {
    const a = sink('a');
    await fanOut([a]).send([]);
    expect(a.send).not.toHaveBeenCalled();
  });
});

describe('누적 수에서 퍼널 만들기', () => {
  it('세션 목록으로 센 것과 같은 결과를 낸다', () => {
    /*
     * 대시보드는 SQL 로 세고 그 수를 이 함수에 넘긴다. 두 경로가 다른
     * 수를 말하면 같은 화면이 기간에 따라 다른 이야기를 하게 된다.
     */
    const sessions = [
      { sessionId: 's1', names: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] },
      { sessionId: 's2', names: ['view_item', 'add_to_cart'] },
      { sessionId: 's3', names: ['view_item'] },
      { sessionId: 's4', names: ['add_to_cart'] },
    ];

    expect(funnelFromCounts([3, 2, 1, 1])).toEqual(computeFunnel(sessions));
  });

  it('아무 일도 없으면 비율이 0 이다 — 0으로 나누지 않는다', () => {
    const result = funnelFromCounts([0, 0, 0, 0]);
    expect(result.map((r) => r.rateFromStart)).toEqual([0, 0, 0, 0]);
    expect(result.map((r) => r.sessions)).toEqual([0, 0, 0, 0]);
  });

  it('모자란 값은 0 으로 본다', () => {
    // SQL 이 행을 하나도 안 돌려주는 경우가 있다
    expect(funnelFromCounts([]).map((r) => r.sessions)).toEqual([0, 0, 0, 0]);
  });

  it('이탈 수는 앞 단계와의 차이다', () => {
    const result = funnelFromCounts([100, 40, 10, 3]);
    expect(result.map((r) => r.droppedFromPrevious)).toEqual([0, 60, 30, 7]);
    expect(result.map((r) => r.rateFromPrevious)).toEqual([100, 40, 25, 30]);
  });
});

/**
 * 가맹점이 보는 퍼널.
 *
 * **주문서 진입이 빠져 있다.** 그 단계는 장바구니 전체의 일이라 한 가맹점에
 * 귀속되지 않는다 — 남의 상품만 담고 주문서에 들어간 세션을 우리 전환으로
 * 세면 비율이 부풀고, 반대로 세지 않으면 남의 전환을 우리 것으로 읽는다.
 */
describe('가맹점 퍼널', () => {
  it('주문서 진입을 빼고 센다', () => {
    expect([...MERCHANT_FUNNEL_STEP]).toEqual(['view_item', 'add_to_cart', 'purchase']);
    expect([...MERCHANT_FUNNEL_STEP]).not.toContain('begin_checkout');
  });

  it('주문서를 안 거쳐도 결제까지 이어진다', () => {
    /*
     * **여기가 이 검사의 요점이다.** 운영진 퍼널은 주문서 진입을 거쳐야
     * 결제로 세는데, 가맹점 퍼널이 그 규칙을 그대로 쓰면 **결제가 늘 0**
     * 이 된다 — 그 단계를 아예 안 세기 때문이다.
     */
    const sessions = [
      { sessionId: 's1', names: ['view_item', 'add_to_cart', 'purchase'] as const },
    ];

    const merchant = computeFunnel(
      sessions.map((s) => ({ ...s, names: [...s.names] })),
      [...MERCHANT_FUNNEL_STEP],
    );
    expect(merchant.at(-1)?.sessions, '결제가 0 으로 떨어졌다').toBe(1);

    // 같은 세션을 네 단계로 세면 주문서를 안 거쳤으므로 결제가 0 이다
    const staff = computeFunnel(sessions.map((s) => ({ ...s, names: [...s.names] })));
    expect(staff.at(-1)?.sessions).toBe(0);
  });

  it('비율 규칙은 운영진 퍼널과 같다', () => {
    /*
     * 세는 곳은 둘이어도(메모리·SQL, 전체·가맹점) 규칙은 하나여야 한다.
     * 두 벌로 두면 두 화면이 다른 수를 말한다.
     */
    const sessions = [
      ['view_item', 'add_to_cart', 'purchase'],
      ['view_item', 'add_to_cart'],
      ['view_item'],
      ['view_item'],
    ].map((names, i) => ({ sessionId: `s${i}`, names: names as EventName[] }));

    const funnel = computeFunnel(sessions, [...MERCHANT_FUNNEL_STEP]);

    expect(funnel.map((f) => f.sessions)).toEqual([4, 2, 1]);
    expect(funnel[1]?.rateFromStart).toBe(50);
    expect(funnel[1]?.rateFromPrevious).toBe(50);
    expect(funnel[2]?.rateFromPrevious).toBe(50);
    expect(funnel[1]?.droppedFromPrevious).toBe(2);
  });

  it('이름표는 한 곳에서 온다', () => {
    // 가맹점 화면이 따로 적으면 운영진 화면과 다른 말을 하게 된다
    const funnel = computeFunnel([], [...MERCHANT_FUNNEL_STEP]);
    expect(funnel.map((f) => f.label)).toEqual(
      MERCHANT_FUNNEL_STEP.map((s) => FUNNEL_STEP_LABEL[s]),
    );
  });
});
