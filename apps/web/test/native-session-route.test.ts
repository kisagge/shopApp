import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 네이티브 토큰을 세션 쿠키로 되돌리는 창구.
 *
 * **왜 있는가.** 웹뷰가 쿠키를 잃으면 토큰은 남아 있어도 서버가 그리는
 * 화면 쉰한 장이 전부 로그인 화면으로 넘어간다. 실기기에서 재 보니 헤더만
 * 되살아나고 `/mypage` 는 `/login` 이었다 — 로그인한 것처럼 보이지만 갈 수
 * 있는 곳이 없었다.
 *
 * **새 권한을 주지 않는다.** 저장된 토큰은 서명된 쿠키 값 그 자체이고,
 * 이 창구는 그것을 브라우저가 쓸 수 있는 모양으로 옮길 뿐이다. 그러니
 * **검증을 통과했을 때만** 심어야 한다 — 그러지 않으면 아무 문자열이나
 * 로그인한 것처럼 보이게 만든다.
 */

const user = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock('@shop/auth/session', () => ({ getSessionUser: async () => user.value }));
vi.mock('@shop/auth', () => ({
  sessionCookie: {
    name: '__Secure-better-auth.session_token',
    attributes: { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 604800 },
  },
}));

const { POST } = await import('~/app/api/native/session/route');

const call = (auth?: string) =>
  POST(new Request('https://x/api/native/session', {
    method: 'POST',
    ...(auth === undefined ? {} : { headers: { authorization: auth } }),
  }));

beforeEach(() => { user.value = null; });

describe('네이티브 세션 되돌리기', () => {
  it('토큰이 없으면 심지 않는다', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.cookies.get('__Secure-better-auth.session_token')).toBeUndefined();
  });

  it('Bearer 가 아니면 심지 않는다', async () => {
    const res = await call('Basic abc');
    expect(res.status).toBe(401);
  });

  it('빈 토큰도 거절한다', async () => {
    const res = await call('Bearer   ');
    expect(res.status).toBe(401);
  });

  it('세션이 안 나오면 심지 않는다 — 낡거나 위조된 토큰', async () => {
    user.value = null;
    const res = await call('Bearer stale.sig');
    expect(res.status).toBe(401);
    expect(res.cookies.get('__Secure-better-auth.session_token')).toBeUndefined();
  });

  it('검증을 통과하면 그 값 그대로 쿠키에 심는다', async () => {
    user.value = { id: 'u-1' };
    const res = await call('Bearer t.sig');
    expect(res.status).toBe(204);

    const cookie = res.cookies.get('__Secure-better-auth.session_token');
    expect(cookie?.value).toBe('t.sig');
    // 속성은 손으로 적지 않고 라이브러리 것을 그대로 쓴다
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });
});
