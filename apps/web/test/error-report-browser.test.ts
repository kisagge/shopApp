import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_ERROR_MESSAGE, MAX_ERROR_STACK, type ErrorReport } from '@shop/core';

const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'test', send }) }));

/**
 * DB 싱크는 출처를 받아 만들어진다. **무엇을 받았는지**를 보려고 갈아 끼운다 —
 * 진짜 싱크를 쓰면 프리즈마가 필요하고, 여기서 보려는 것은 그쪽이 아니다.
 */
const db = vi.hoisted(() => ({
  made: [] as string[],
  reports: [] as unknown[],
}));
vi.mock('~/lib/errors/db-sink', () => ({
  dbSink: (source: string) => {
    db.made.push(source);
    return {
      name: 'db',
      report: (report: unknown) => {
        db.reports.push(report);
        return Promise.resolve();
      },
    };
  },
}));

const { reportError, reportBrowserError, setErrorSinksForTest } = await import('~/lib/errors');

/**
 * 브라우저에서 난 오류.
 *
 * **서버 오류와 같은 길을 쓰되 출처만 가른다.** 지문·심각도·가림 규칙이 갈라지면
 * 같은 오류가 두 벌로 쌓이고, 고칠 때 어느 쪽을 봐야 하는지 알 수 없다 — 그
 * 약속이 주석에만 있었다(문장 열하나가 안 돌았다).
 *
 * 서버 쪽 길은 `error-report` 가 본다. 여기서는 **브라우저 쪽만** 본다.
 */

const captured: ErrorReport[] = [];
const spy = {
  name: 'spy',
  report: (report: ErrorReport) => {
    captured.push(report);
    return Promise.resolve();
  },
};

const NOW = new Date('2026-11-16T03:00:00Z');

const browser = (over: Record<string, unknown> = {}) =>
  reportBrowserError({
    name: 'TypeError',
    message: '장바구니를 못 읽었습니다',
    stack: 'TypeError: …\n  at Cart (/cart:12:3)',
    routePath: '/cart',
    now: NOW,
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  db.made.length = 0;
  db.reports.length = 0;
  setErrorSinksForTest([spy]);
});

afterEach(() => {
  setErrorSinksForTest(null);
  vi.unstubAllEnvs();
});

describe('서버 오류와 같은 길을 쓴다', () => {
  it('같은 이름·문구·경로면 지문이 같다 — 두 벌로 쌓이지 않는다', async () => {
    /*
     * 지문이 갈리면 운영 화면의 오류함에 같은 고장이 "서버에서 한 줄, 브라우저에서
     * 한 줄" 로 쌓인다. 고칠 때 어느 쪽을 봐야 하는지 알 수 없다.
     */
    await browser({ name: 'TypeError', message: '같은 고장', routePath: '/cart' });
    await reportError({
      error: Object.assign(new TypeError('같은 고장'), { name: 'TypeError' }),
      path: '/cart',
      method: 'GET',
      headers: {},
      routePath: '/cart',
      routeType: 'browser',
      now: NOW,
    });

    expect(captured).toHaveLength(2);
    expect(captured[0]!.fingerprint).toBe(captured[1]!.fingerprint);
  });

  it('출처는 브라우저로 적고 digest 는 없다 — Next 가 준 번호가 아니다', async () => {
    await browser();

    expect(captured[0]).toMatchObject({
      routeType: 'browser',
      method: 'GET',
      digest: null,
      occurredAt: NOW,
    });
  });

  it('무게는 늘 fatal 이다 — 그 화면을 못 쓰는 상태다', async () => {
    await browser();

    expect(captured[0]!.severity).toBe('fatal');
  });

  it('때를 안 주면 지금으로 적는다', async () => {
    const before = Date.now();
    await browser({ now: undefined });

    expect(captured[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('브라우저가 보낸 것을 그대로 믿지 않는다', () => {
  it('문구는 상한까지만 남긴다', async () => {
    await browser({ message: 'ㄱ'.repeat(MAX_ERROR_MESSAGE + 50) });

    expect(captured[0]!.message).toHaveLength(MAX_ERROR_MESSAGE);
  });

  it('스택은 잘라서 남긴다 — 끝이 잘렸다고 적어 둔다', async () => {
    await browser({ stack: 'x'.repeat(MAX_ERROR_STACK + 10) });

    expect(captured[0]!.stack!.length).toBeLessThan(MAX_ERROR_STACK + 10);
    expect(captured[0]!.stack).toContain('잘림');
  });

  it('빈 스택은 없는 것으로 둔다', async () => {
    await browser({ stack: '   ' });

    expect(captured[0]!.stack).toBeNull();
  });

  it('주소의 쿼리 값은 버리고 열쇠만 남긴다 — 값에 개인정보가 섞인다', async () => {
    await browser({ routePath: '/search?q=코트&page=2' });

    expect(captured[0]!.path).toBe('/search?page,q');
    // 어느 화면이었는지는 그대로 남는다
    expect(captured[0]!.routePath).toBe('/search?q=코트&page=2');
  });
});

describe('싱크가 넘어져도', () => {
  const broken = {
    name: 'broken',
    report: () => Promise.reject(new Error('싱크가 터졌다')),
  };

  it('던지지 않고 나머지 싱크는 받는다 — 보고하다 깨지면 원래 문제를 더 찾기 어렵다', async () => {
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorSinksForTest([broken, spy]);

    await expect(browser()).resolves.toMatchObject({ severity: 'fatal' });
    expect(captured).toHaveLength(1);
    expect(spyConsole).toHaveBeenCalled();
    spyConsole.mockRestore();
  });
});

describe('어디로 흘려보내는가', () => {
  /*
   * **남기는 것은 늘 한다.** 콘솔은 배포 로그, DB 는 운영 화면(오류함)이 읽는다.
   * 알림은 주소가 있을 때만 — 메일만 있으면 같은 지문이 한 시간에 한 통이라
   * 몰려 난 오류의 규모를 알 수 없다.
   */
  beforeEach(() => {
    setErrorSinksForTest(null);
  });

  it('주소가 없으면 콘솔과 DB 뿐이다', async () => {
    vi.stubEnv('ERROR_ALERT_EMAIL', '');
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    await browser();

    expect(db.reports).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    spyConsole.mockRestore();
  });

  it('주소가 있으면 메일도 보낸다', async () => {
    vi.stubEnv('ERROR_ALERT_EMAIL', 'ops@plain.test');
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    await browser();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].to).toBe('ops@plain.test');
    spyConsole.mockRestore();
  });

  it('DB 싱크에 브라우저라고 알려 준다 — 서버 것과 섞이면 어디서 난 고장인지 모른다', async () => {
    vi.stubEnv('ERROR_ALERT_EMAIL', '');
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    await browser();

    expect(db.made).toEqual(['browser']);
    spyConsole.mockRestore();
  });

  it('검사에서 갈아 끼운 목록이 있으면 그것만 쓴다', async () => {
    vi.stubEnv('ERROR_ALERT_EMAIL', 'ops@plain.test');
    setErrorSinksForTest([spy]);

    await browser();

    expect(captured).toHaveLength(1);
    expect(db.made).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
