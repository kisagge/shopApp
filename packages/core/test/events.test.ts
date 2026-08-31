import { describe, it, expect, vi } from 'vitest';
import {
  COMMERCE_EVENT, isCommerceEvent, isServerOnlyEvent, requiresConsent,
  FUNNEL_STEP, FUNNEL_STEP_LABEL, computeFunnel, fanOut, AllSinksFailedError,
  type EventSink, type SessionEventNames, type TrackedEvent,
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
