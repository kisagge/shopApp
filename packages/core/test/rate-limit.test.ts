import { describe, it, expect } from 'vitest';
import { consume, isExpired, RATE_LIMIT } from '../src/rate-limit';

const policy = { limit: 3, windowMs: 60_000 };

describe('세기', () => {
  it('처음 요청은 새 창을 연다', () => {
    const r = consume(undefined, 1_000, policy);
    expect(r.allowed).toBe(true);
    expect(r.next).toEqual({ count: 1, windowStart: 1_000 });
    expect(r.remaining).toBe(2);
  });

  it('한도까지는 통과한다', () => {
    let state = consume(undefined, 0, policy).next;
    state = consume(state, 10, policy).next;
    const third = consume(state, 20, policy);

    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('한도를 넘으면 막는다', () => {
    const state = { count: 3, windowStart: 0 };
    const r = consume(state, 100, policy);

    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('막힌 요청도 센다 — 계속 두드리면 창이 끝날 때까지 계속 막힌다', () => {
    const r = consume({ count: 5, windowStart: 0 }, 100, policy);
    expect(r.next.count).toBe(6);
  });

  it('창이 지나면 새로 시작한다', () => {
    const r = consume({ count: 99, windowStart: 0 }, 60_000, policy);

    expect(r.allowed).toBe(true);
    expect(r.next).toEqual({ count: 1, windowStart: 60_000 });
  });

  it('창 경계 직전에는 아직 이어진다', () => {
    const r = consume({ count: 3, windowStart: 0 }, 59_999, policy);
    expect(r.allowed).toBe(false);
  });
});

describe('다시 시도까지', () => {
  it('허용됐으면 0 이다', () => {
    expect(consume(undefined, 0, policy).retryAfterSeconds).toBe(0);
  });

  it('남은 시간을 올림한다 — 0.2초 남았는데 0 을 주면 곧바로 다시 두드린다', () => {
    const r = consume({ count: 3, windowStart: 0 }, 59_800, policy);
    expect(r.retryAfterSeconds).toBe(1);
  });

  it('창 시작 직후에 막히면 창 길이만큼 기다린다', () => {
    const r = consume({ count: 3, windowStart: 0 }, 0, policy);
    expect(r.retryAfterSeconds).toBe(60);
  });
});

describe('만료 판정', () => {
  it('창 안이면 살아 있다', () => {
    expect(isExpired({ count: 1, windowStart: 0 }, 59_999, policy)).toBe(false);
  });

  it('창을 벗어나면 지운다', () => {
    expect(isExpired({ count: 1, windowStart: 0 }, 60_000, policy)).toBe(true);
  });
});

describe('창구별 값', () => {
  it('쿠폰이 이벤트보다 촘촘하다', () => {
    // 이벤트는 화면 한 번에도 여러 번 오지만 쿠폰은 사람이 한 번 누르는 동작이다
    expect(RATE_LIMIT.coupon.limit).toBeLessThan(RATE_LIMIT.events.limit);
  });

  it('리뷰가 가장 촘촘하다 — 글을 쓰는 동작이다', () => {
    const limits = Object.values(RATE_LIMIT).map((p) => p.limit);
    expect(RATE_LIMIT.review.limit).toBe(Math.min(...limits));
  });

  it('모든 창구가 양수 한도와 창을 갖는다', () => {
    for (const [name, p] of Object.entries(RATE_LIMIT)) {
      expect(p.limit, name).toBeGreaterThan(0);
      expect(p.windowMs, name).toBeGreaterThan(0);
    }
  });
});
