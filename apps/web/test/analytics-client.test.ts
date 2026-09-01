// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalyticsTracker, type Transport } from '~/lib/analytics/client';
import { getSessionId, getAnonymousId, resetIdentity, SESSION_TIMEOUT_MS } from '~/lib/analytics/session';

const makeTransport = () => {
  const posted: string[] = [];
  const beaconed: string[] = [];
  let beaconOk = true;
  const transport: Transport = {
    post: (_url, body) => void posted.push(body),
    beacon: (_url, body) => {
      if (!beaconOk) return false;
      beaconed.push(body);
      return true;
    },
  };
  return {
    transport, posted, beaconed,
    failBeacon: () => { beaconOk = false; },
  };
};

const parse = (body: string) => JSON.parse(body) as { events: { name: string }[] };

beforeEach(() => {
  resetIdentity();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('식별자', () => {
  it('anonymousId 는 재호출해도 같다', () => {
    expect(getAnonymousId()).toBe(getAnonymousId());
  });

  it('계약이 요구하는 식별자 형식을 만족한다', () => {
    expect(getAnonymousId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getSessionId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('30분 안에 다시 오면 같은 세션이다', () => {
    const t0 = 1_000_000;
    const first = getSessionId(t0);
    expect(getSessionId(t0 + SESSION_TIMEOUT_MS - 1)).toBe(first);
  });

  it('30분 무활동이면 새 세션으로 잡는다', () => {
    const t0 = 1_000_000;
    const first = getSessionId(t0);
    expect(getSessionId(t0 + SESSION_TIMEOUT_MS + 1)).not.toBe(first);
  });

  it('저장소 접근이 막혀도 던지지 않는다 — 시크릿 모드에서 페이지가 죽으면 안 된다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('접근 거부');
    });
    expect(() => getAnonymousId()).not.toThrow();
    expect(getAnonymousId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    spy.mockRestore();
  });
});

describe('배치', () => {
  it('임계값이 차면 즉시 보낸다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 3 });
    tracker.track('page_view');
    tracker.track('page_view');
    expect(t.posted).toHaveLength(0);
    tracker.track('page_view');
    expect(t.posted).toHaveLength(1);
    expect(parse(t.posted[0]!).events).toHaveLength(3);
  });

  it('임계값에 못 미쳐도 시간이 지나면 보낸다', () => {
    vi.useFakeTimers();
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10, flushIntervalMs: 5000 });
    tracker.track('page_view');
    expect(t.posted).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(t.posted).toHaveLength(1);
    expect(tracker.pending).toBe(0);
  });

  it('큐가 배치 크기를 넘으면 나눠 보낸다 — 계약이 개수를 제한한다', () => {
    vi.useFakeTimers();
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 2, flushIntervalMs: 999_999 });
    // batchSize 마다 자동 전송되므로 3개면 1회 전송 + 큐에 1개
    tracker.track('page_view');
    tracker.track('page_view');
    tracker.track('page_view');
    tracker.flush();
    expect(t.posted).toHaveLength(2);
    expect(t.posted.every((b) => parse(b).events.length <= 2)).toBe(true);
  });

  it('보낼 게 없으면 아무것도 하지 않는다', () => {
    const t = makeTransport();
    new AnalyticsTracker({ transport: t.transport }).flush();
    expect(t.posted).toHaveLength(0);
    expect(t.beaconed).toHaveLength(0);
  });
});

describe('페이지 이탈', () => {
  it('flush(true) 는 sendBeacon 을 쓴다 — fetch 는 언로드되면 취소된다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10 });
    tracker.track('page_view');
    tracker.flush(true);
    expect(t.beaconed).toHaveLength(1);
    expect(t.posted).toHaveLength(0);
  });

  it('beacon 이 거절되면 fetch 로 한 번 더 시도한다', () => {
    const t = makeTransport();
    t.failBeacon();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10 });
    tracker.track('page_view');
    tracker.flush(true);
    expect(t.beaconed).toHaveLength(0);
    expect(t.posted).toHaveLength(1);
  });
});

describe('게이트', () => {
  it('purchase 는 큐에 담지도 않는다 — 서버만 기록한다', () => {
    const t = makeTransport();
    const onDropped = vi.fn<(...a: any[]) => any>();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 1, onDropped });
    tracker.track('purchase');
    expect(t.posted).toHaveLength(0);
    expect(onDropped).toHaveBeenCalledWith('purchase', 'server-only');
  });

  it('동의가 없으면 분석 이벤트를 보내지 않는다', () => {
    const t = makeTransport();
    const onDropped = vi.fn<(...a: any[]) => any>();
    const tracker = new AnalyticsTracker({
      transport: t.transport, batchSize: 1, hasConsent: () => false, onDropped,
    });
    tracker.track('view_item', { productId: 'p-1' });
    expect(t.posted).toHaveLength(0);
    expect(onDropped).toHaveBeenCalledWith('view_item', 'no-consent');
  });

  it('동의가 없어도 필수 이벤트는 보낸다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({
      transport: t.transport, batchSize: 1, hasConsent: () => false,
    });
    tracker.track('login');
    expect(t.posted).toHaveLength(1);
  });

  it('dispose 후에는 더 받지 않는다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 1 });
    tracker.dispose();
    tracker.track('page_view');
    expect(t.posted).toHaveLength(0);
  });
});

describe('봉투', () => {
  it('시각·식별자·경로를 붙여 보낸다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({
      transport: t.transport, batchSize: 1, now: () => Date.parse('2026-08-31T05:00:00.000Z'),
    });
    tracker.track('view_item', { productId: 'p-1' });
    const [event] = parse(t.posted[0]!).events as unknown as Record<string, unknown>[];
    expect(event).toMatchObject({
      name: 'view_item',
      productId: 'p-1',
      occurredAt: '2026-08-31T05:00:00.000Z',
      path: '/',
    });
    expect(event!['sessionId']).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
