import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 브라우저 오류를 받는 창구.
 *
 * **이 창구가 없으면 그쪽 오류는 영영 모른다.** 서버 오류는 instrumentation 이 받지만, 브라우저에서 터진 것은 그
 * 기기에서만 일어난 일이다 — 앱(웹뷰)에서는 개발자 도구도 배포 로그도 없다.
 *
 * 열려 있는 창구라 아무나 두드릴 수 있다. 길이·모양을 보고 조용히 버린다.
 */

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const reportBrowserError = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/errors', () => ({ reportBrowserError }));

const { POST } = await import('~/app/api/errors/route');

const body = {
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'id')",
  stack: 'TypeError: ...\n  at Cart (/cart:1:1)',
  routePath: '/cart',
};

const call = (input: unknown = body) =>
  POST(
    new Request('http://localhost/api/errors', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  enforceRateLimit.mockResolvedValue(null);
  reportBrowserError.mockResolvedValue({});
});

describe('POST /api/errors', () => {
  it('받아서 보고로 넘기고 204 로 답한다', async () => {
    const response = await call();

    expect(response.status).toBe(204);
    expect(reportBrowserError.mock.calls[0]![0]).toMatchObject({
      name: 'TypeError', routePath: '/cart',
    });
  });

  it('로그인 여부를 묻지 않는다 — 고칠 때 필요한 것은 누구인지가 아니다', async () => {
    // 세션을 아예 읽지 않는다. 사용자 id 도 넘기지 않는다
    await call();
    expect(JSON.stringify(reportBrowserError.mock.calls[0]![0])).not.toContain('userId');
  });

  it('제한을 일을 시작하기 전에 건다', async () => {
    // 한 화면이 무너지면 같은 오류가 리렌더마다 또 난다
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it('형식이 이상하면 조용히 버린다 — 브라우저에게 돌려줄 말이 없다', async () => {
    const response = await call({ name: '', message: '', routePath: 'https://남의주소/path' });
    expect(response.status).toBe(204);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it('바깥 주소는 받지 않는다 — 오류함이 남의 글을 싣는 게시판이 되면 안 된다', async () => {
    const response = await call({ ...body, routePath: 'https://evil.test/x' });
    expect(response.status).toBe(204);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it('우리 오류가 아닌 것은 걸러 낸다 — 프리페치 취소는 서버 쪽과 같은 목록으로 본다', async () => {
    const response = await call({ ...body, name: 'AbortError', message: 'The user aborted a request' });
    expect(response.status).toBe(204);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it('JSON 이 아니어도 답은 204 다', async () => {
    const response = await POST(
      new Request('http://localhost/api/errors', { method: 'POST', body: '{{{' }),
    );
    expect(response.status).toBe(204);
  });
});
