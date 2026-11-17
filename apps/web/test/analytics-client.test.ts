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

describe('앱이 쓰는 트래커', () => {
  it('브라우저에서 거부하면 실제로 보내지 않는다', async () => {
    /*
     * 동의를 읽는 모듈은 진작 있었는데 **아무도 부르지 않았다** — 트래커가
     * 기본값 `() => true` 로 돌아서, 거부해도 그대로 보냈다. 문서에는
     * "거부는 즉시 존중한다" 고 적혀 있었다.
     */
    window.localStorage.setItem('shop.consent.analytics', 'false');
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => {
      sent.push(init.body);
      return Promise.resolve(new Response(null, { status: 204 }));
    }));

    const { getTracker } = await import('~/lib/analytics/client');
    const tracker = getTracker();
    tracker.track('view_item', { productId: 'p-1' });
    tracker.flush();

    expect(sent).toEqual([]);
  });
});

describe('어디서 들어왔는지를 함께 보낸다', () => {
  /*
   * **이것 없이는 앱이 느린지 아닌지를 말할 수 없다.** 이벤트에 붙던 구분은
   * UA 에서 뽑은 기기 종류뿐이라 앱 웹뷰가 모바일 브라우저와 같은 칸에
   * 들어갔다. 앱은 켤 때마다 웹뷰를 차게 띄우는 값이 더 붙는데, 섞이면
   * 그게 앱 탓인지 화면 탓인지 가릴 수 없다.
   */
  const platformOf = (body: string) =>
    (JSON.parse(body) as { events: { platform: unknown }[] }).events.map((e) => e.platform);

  it('셸이 말한 것을 봉투에 싣는다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({
      transport: t.transport, batchSize: 1, platform: () => 'ios',
    });
    tracker.track('page_view');

    expect(platformOf(t.posted[0]!)).toEqual(['ios']);
  });

  it('브라우저에서는 web 이다', () => {
    // 셸 전역이 없으면 @shop/native 가 'web' 을 돌려준다
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 1 });
    tracker.track('page_view');

    expect(platformOf(t.posted[0]!)).toEqual(['web']);
  });

  it('이벤트마다 다시 묻는다 — 만들 때 한 번 읽으면 앱이 통째로 web 이 된다', () => {
    /*
     * 트래커는 모듈이 불릴 때 만들어진다. 그 시점에 셸이 아직 전역을
     * 주입하지 않았으면, 한 번 읽어 둔 값은 영영 'web' 이다.
     */
    let current = 'web';
    const t = makeTransport();
    const tracker = new AnalyticsTracker({
      transport: t.transport, batchSize: 1, platform: () => current as 'web' | 'android',
    });

    tracker.track('page_view');
    current = 'android';
    tracker.track('page_view');

    expect([...platformOf(t.posted[0]!), ...platformOf(t.posted[1]!)]).toEqual(['web', 'android']);
  });

  it('모르는 값은 싣지 않는다 — 없는 칸을 만들지 않는다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 1, platform: () => null });
    tracker.track('page_view');

    expect(platformOf(t.posted[0]!)).toEqual([null]);
  });
});

describe('거부를 존중한다', () => {
  /*
   * **버리는 것과 보내는 것은 다르다.** 수집을 끄는 순간 큐에 남은 것을 flush 로
   * 비우면 방금 거부한 사람의 기록이 마지막으로 한 번 더 나간다 — 그것을 거부를
   * 존중한다고 할 수 없다(`analytics-consent-toggle` 이 이 자리를 부른다).
   */
  it('큐에 남은 것을 보내지 않고 버린다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10 });
    tracker.track('page_view');
    expect(tracker.pending).toBe(1);

    tracker.discard();

    expect(tracker.pending).toBe(0);
    expect(t.posted).toHaveLength(0);
    expect(t.beaconed).toHaveLength(0);
  });

  it('버린 뒤에는 시간이 지나도 나가지 않는다', () => {
    vi.useFakeTimers();
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10, flushIntervalMs: 5000 });
    tracker.track('page_view');

    tracker.discard();
    vi.advanceTimersByTime(10_000);

    expect(t.posted).toHaveLength(0);
  });

  it('걸려 있던 시계도 함께 끊는다 — 다음 이벤트가 옛 시계에 실리지 않게', () => {
    /*
     * 시계를 남겨 두면 큐만 비는데, 버린 뒤 처음 쌓이는 이벤트는 **새 시계를 걸지
     * 못한다**(이미 걸려 있다고 보고 지나간다). 그래서 남은 시간만큼만 기다리다
     * 일찍 나가고, 모아 보내려던 뜻이 그만큼 어긋난다.
     */
    vi.useFakeTimers();
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10, flushIntervalMs: 5000 });
    tracker.track('page_view');
    vi.advanceTimersByTime(4000);

    tracker.discard();
    tracker.track('page_view');

    vi.advanceTimersByTime(1000);
    expect(t.posted, '옛 시계에 실려 일찍 나갔다').toHaveLength(0);
    vi.advanceTimersByTime(4000);
    expect(t.posted).toHaveLength(1);
  });

  it('버린 뒤에도 트래커는 살아 있다 — 다시 동의하면 그때부터 쌓인다', () => {
    const t = makeTransport();
    const tracker = new AnalyticsTracker({ transport: t.transport, batchSize: 10 });
    tracker.track('page_view');
    tracker.discard();

    tracker.track('page_view');

    expect(tracker.pending).toBe(1);
  });
});

describe('기본 전송기', () => {
  /*
   * 검사들은 전송기를 끼워 넣지만 **브라우저에서 실제로 도는 것은 이 기본값**이고,
   * 그 자리가 안 돌고 있었다. 여기서 틀리면 이탈 분석에 가장 중요한 이벤트 —
   * 페이지를 떠나는 그 순간의 큐 — 가 조용히 사라진다.
   */
  const fetchMock = vi.fn<(...a: any[]) => any>();
  const beaconMock = vi.fn<(...a: any[]) => any>();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    beaconMock.mockReset().mockReturnValue(true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beaconMock });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('평상시에는 keepalive 로 보낸다 — 그게 없으면 문서가 닫힐 때 요청이 취소된다', () => {
    const tracker = new AnalyticsTracker({ batchSize: 1, endpoint: '/api/events' });

    tracker.track('page_view');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers['content-type']).toBe('application/json');
    expect(parse(init.body as string).events).toHaveLength(1);
  });

  it('전송이 실패해도 아무 데도 번지지 않는다 — 분석이 화면을 죽이면 안 된다', async () => {
    /*
     * **"던지지 않는다" 로는 모자라다.** 전송은 기다리지 않는 약속이라, `.catch` 를
     * 지워도 `track()` 자체는 조용히 돌아온다 — 거절은 그 뒤에 주인 없이 떠돌고,
     * 그것을 오류로 올리는 환경에서는 화면이 거기서 끊긴다. 그 떠도는 거절을
     * 직접 센다.
     */
    /*
     * **맨 함수로 세운다.** `vi.fn().mockRejectedValue()` 는 스파이가 그 약속에
     * 제 손잡이를 붙여(settledResults 를 적으려고) 거절을 이미 처리된 것으로
     * 만든다 — 그 밑에서는 `.catch` 를 지워도 아무 일도 안 일어난다.
     */
    vi.stubGlobal('fetch', () => Promise.reject(new Error('네트워크가 끊겼다')));
    const loose: unknown[] = [];
    const watch = (reason: unknown) => void loose.push(reason);
    process.on('unhandledRejection', watch);
    try {
      const tracker = new AnalyticsTracker({ batchSize: 1 });

      expect(() => tracker.track('page_view')).not.toThrow();
      await new Promise((done) => setTimeout(done, 0));
      await new Promise((done) => setTimeout(done, 0));

      expect(loose).toEqual([]);
    } finally {
      process.off('unhandledRejection', watch);
    }
  });

  it('떠날 때는 sendBeacon 으로 보낸다', () => {
    const tracker = new AnalyticsTracker({ batchSize: 10, endpoint: '/api/events' });
    tracker.track('page_view');

    tracker.flush(true);

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, blob] = beaconMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect((blob as Blob).type).toBe('application/json');
  });

  it('sendBeacon 이 거절하면 fetch 로 한 번 더 — 그 답을 그대로 전한다', () => {
    beaconMock.mockReturnValue(false);
    const tracker = new AnalyticsTracker({ batchSize: 10 });
    tracker.track('page_view');

    tracker.flush(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sendBeacon 이 던져도 fetch 로 떨어진다 — 던지면 떠나는 길이 통째로 막힌다', () => {
    /*
     * 큐가 크면 sendBeacon 이 거절 대신 **던지는** 브라우저가 있다. 그 예외가
     * 그대로 올라가면 되돌릴 fetch 도 못 부르고 언로드 처리기가 거기서 끊긴다.
     */
    beaconMock.mockImplementation(() => { throw new Error('너무 크다'); });
    const tracker = new AnalyticsTracker({ batchSize: 10 });
    tracker.track('page_view');

    expect(() => tracker.flush(true)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
