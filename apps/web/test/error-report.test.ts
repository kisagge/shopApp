import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ErrorReport } from '@shop/core';

const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'test', send }) }));

const { reportError, setErrorSinksForTest, consoleSink, mailSink } =
  await import('~/lib/errors');

const captured: { report: ErrorReport; headers: Record<string, string> }[] = [];
const spy = {
  name: 'spy',
  report: (report: ErrorReport, ctx: { headers: Readonly<Record<string, string>> }) => {
    captured.push({ report, headers: { ...ctx.headers } });
    return Promise.resolve();
  },
};

const input = (over: Record<string, unknown> = {}) => ({
  error: new Error('주문 clv8x2k9a0001qw3f7h2n5p8z 없음'),
  path: '/api/orders?q=코트',
  method: 'POST',
  headers: { authorization: 'Bearer secret', 'user-agent': 'test' },
  routePath: '/api/orders',
  routeType: 'route',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  setErrorSinksForTest([spy]);
  send.mockResolvedValue(undefined);
});
afterEach(() => setErrorSinksForTest(null));

describe('보고 만들기', () => {
  it('오류를 지문·경로와 함께 넘긴다', async () => {
    await reportError(input());

    expect(captured).toHaveLength(1);
    const r = captured[0]!.report;
    expect(r.name).toBe('Error');
    expect(r.routePath).toBe('/api/orders');
    expect(r.severity).toBe('error');
    expect(r.fingerprint).toContain('/api/orders');
  });

  it('주소의 쿼리 값을 버린다', async () => {
    await reportError(input());
    expect(captured[0]!.report.path).toBe('/api/orders?q');
  });

  it('헤더의 자격증명을 가린 뒤 넘긴다', async () => {
    await reportError(input());

    expect(captured[0]!.headers['authorization']).toBe('[가림]');
    expect(captured[0]!.headers['user-agent']).toBe('test');
  });

  it('Next 의 digest 를 함께 남긴다 — 사용자 화면의 번호와 이어 붙는다', async () => {
    const err = Object.assign(new Error('실패'), { digest: 'dg-123' });
    await reportError(input({ error: err }));

    expect(captured[0]!.report.digest).toBe('dg-123');
  });

  it('Error 가 아닌 것도 받는다', async () => {
    await reportError(input({ error: '문자열 오류' }));

    expect(captured[0]!.report.message).toBe('문자열 오류');
    expect(captured[0]!.report.stack).toBeNull();
  });

  it('렌더 실패는 fatal 로 올린다', async () => {
    await reportError(input({ routeType: 'render' }));
    expect(captured[0]!.report.severity).toBe('fatal');
  });
});

describe('싱크가 실패해도', () => {
  it('던지지 않는다 — 보고하다 깨지면 원래 문제를 더 찾기 어렵다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorSinksForTest([{ name: 'dead', report: () => Promise.reject(new Error('싱크 오류')) }]);

    await expect(reportError(input())).resolves.toBeDefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('한 싱크가 실패해도 나머지는 받는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorSinksForTest([
      { name: 'dead', report: () => Promise.reject(new Error('싱크 오류')) },
      spy,
    ]);

    await reportError(input());

    expect(captured).toHaveLength(1);
    error.mockRestore();
  });
});

describe('콘솔 싱크', () => {
  it('한 줄 JSON 으로 남긴다 — 로그는 검색으로 읽는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorSinksForTest([consoleSink]);

    await reportError(input());

    const line = error.mock.calls[0]?.[0] as string;
    expect(line.split('\n')).toHaveLength(1);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed['tag']).toBe('error-report');
    expect((parsed['headers'] as Record<string, string>)['authorization']).toBe('[가림]');
    error.mockRestore();
  });
});

describe('메일 싱크', () => {
  beforeEach(() => setErrorSinksForTest([mailSink('ops@plain.test')]));

  it('오류 하나에 메일 한 통', async () => {
    await reportError(input());

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].to).toBe('ops@plain.test');
    expect(send.mock.calls[0]?.[0].subject).toContain('/api/orders');
  });

  it('같은 오류가 몰려도 한 번만 보낸다', async () => {
    // 한 건마다 보내면 받는 쪽이 곧 알림을 무시하게 된다
    await reportError(input());
    await reportError(input());
    await reportError(input());

    expect(send).toHaveBeenCalledOnce();
  });

  it('다른 오류는 따로 보낸다', async () => {
    await reportError(input());
    await reportError(input({ error: new Error('다른 문제'), routePath: '/api/cart' }));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('본문에 사용자 입력이 마크업으로 들어가지 않는다', async () => {
    await reportError(input({ error: new Error('<script>alert(1)</script>') }));

    const html = send.mock.calls[0]?.[0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('스택과 지문을 함께 실어 로그와 이어 준다', async () => {
    await reportError(input());

    const text = send.mock.calls[0]?.[0].text as string;
    expect(text).toContain('POST /api/orders');
    expect(text).toContain(captured.length === 0 ? 'Error' : 'Error');
    expect(text).toMatch(/로그에서 .+ 로 찾을 수 있습니다/);
  });
});

describe('거를 오류', () => {
  it('싱크까지 가지 않는다', async () => {
    await reportError(input({ error: new Error('The destination stream closed early.') }));
    expect(captured).toHaveLength(0);
  });

  it('null 을 돌려준다 — 부르는 쪽이 보고 여부를 알 수 있다', async () => {
    const skipped = await reportError(input({ error: new Error('The destination stream closed early.') }));
    const kept = await reportError(input());

    expect(skipped).toBeNull();
    expect(kept).not.toBeNull();
  });
});
