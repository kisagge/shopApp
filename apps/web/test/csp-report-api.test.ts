import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setRateLimiterForTest, type RateLimiter } from '~/lib/rate-limit';

/**
 * CSP 위반 신고를 받는 자리.
 *
 * 이 창구의 성질이 특이하다 — **브라우저는 답을 기다리지 않고, 본문은 아무나
 * 보낼 수 있다.** 그래서 검사할 것도 둘이다. 무슨 일이 있어도 조용히 204 로
 * 끝나야 하고(오류를 내면 브라우저 콘솔에 우리 오류가 하나 더 쌓인다),
 * 바깥에서 온 값이 로그를 부풀리거나 어지럽히지 못해야 한다.
 */

const { POST } = await import('~/app/api/csp-report/route');

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const report = (over: Record<string, unknown> = {}) => ({
  'csp-report': {
    'violated-directive': "script-src 'self'",
    'blocked-uri': 'https://cdn.example.test/x.js',
    'document-uri': 'https://plain.test/product/coat',
    ...over,
  },
});

function allowAll(): RateLimiter {
  return { name: 'allow', take: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }) };
}
function blockAll(): RateLimiter {
  return { name: 'block', take: async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 30 }) };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setRateLimiterForTest(allowAll());
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setRateLimiterForTest(null);
  warn.mockRestore();
});

/** 마지막으로 남긴 로그의 필드들 */
const logged = () => warn.mock.calls.at(-1)?.[1] as Record<string, string> | undefined;

describe('언제나 조용히 끝난다', () => {
  it.each([
    ['정상 신고', report()],
    ['JSON 이 아님', '<<not json>>'],
    ['빈 본문', ''],
    ['csp-report 키가 없음', { something: 'else' }],
    ['csp-report 가 null', { 'csp-report': null }],
    ['csp-report 가 배열', { 'csp-report': [1, 2, 3] }],
    ['본문이 그냥 문자열', '"hello"'],
    ['본문이 숫자', '42'],
  ])('%s 도 204 이고 본문이 없다', async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(204);
    // 브라우저는 답을 읽지 않는다. 본문을 만들면 그만큼이 그냥 버려진다.
    expect(await res.text()).toBe('');
  });
});

describe('요청 제한', () => {
  it('걸리면 429 이고 로그를 남기지 않는다 — 일을 시작하기 전에 건다', async () => {
    setRateLimiterForTest(blockAll());

    const res = await post(report());

    expect(res.status).toBe(429);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('로그에 남기는 값', () => {
  it('막힌 지시어 · 막힌 주소 · 화면 주소를 남긴다', async () => {
    await post(report());

    expect(logged()).toEqual({
      directive: "script-src 'self'",
      blocked: 'https://cdn.example.test/x.js',
      document: 'https://plain.test/product/coat',
    });
  });

  /** 브라우저마다 이름이 다르다. 하나가 없으면 다른 하나를 본다. */
  it('violated-directive 가 없으면 effective-directive 를 본다', async () => {
    await post(
      report({ 'violated-directive': undefined, 'effective-directive': 'connect-src' }),
    );

    expect(logged()?.['directive']).toBe('connect-src');
  });

  /**
   * 아무나 보낼 수 있는 본문이다. 길이를 자르지 않으면 신고 한 번으로 로그를
   * 원하는 만큼 부풀릴 수 있고, 그러면 진짜 신고가 그 사이에 묻힌다.
   */
  it('긴 값은 잘라 낸다', async () => {
    await post(report({ 'blocked-uri': 'x'.repeat(5_000) }));

    expect(logged()?.['blocked']).toHaveLength(300);
  });

  /**
   * 문자열이 아닌 값은 버린다. 그대로 넘기면 로그에 `[object Object]` 가
   * 찍히거나, 배열·객체가 통째로 펼쳐져 길이 제한을 우회한다.
   */
  it.each([
    ['객체', { a: 'x'.repeat(1_000) }],
    ['배열', ['x'.repeat(1_000)]],
    ['숫자', 12345],
    ['null', null],
    ['참거짓', true],
  ])('%s 은 빈 문자열로 남긴다', async (_label, value) => {
    await post(report({ 'blocked-uri': value }));

    expect(logged()?.['blocked']).toBe('');
  });

  it('필드가 하나도 없어도 남기기는 한다 — 신고가 왔다는 사실은 사실이다', async () => {
    await post({ 'csp-report': {} });

    expect(logged()).toEqual({ directive: '', blocked: '', document: '' });
  });
});

describe('저장하지 않는다', () => {
  /**
   * 바깥에서 아무나 보낼 수 있는 값이다. 저장하면 그 표가 곧 남의 쓰레기로
   * 채워지고, 지우는 일이 우리 몫이 된다. 로그로만 남기는 것이 이 창구의
   * 설계 결정이라 코드에 못 박아 둔다.
   */
  it('DB 를 부르지 않는다', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../src/app/api/csp-report/route.ts', import.meta.url),
        'utf8',
      ),
    );

    expect(source).not.toContain('prisma');
    expect(source).not.toContain('@shop/db');
  });
});
