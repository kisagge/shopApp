import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 회원정보 수정 창구.
 *
 * 저장은 인증 라이브러리의 사용자 수정을 **서버에서** 부른다 — 새 이름으로 다시 구운 세션 쿠키를 받아 그대로
 * 옮겨야 머리에 옛 이름이 5분 동안 남지 않는다. 계약에서 먼저 막아 칸마다 우리 말 문구를 준다.
 */

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const updateUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth', () => ({ auth: { api: { updateUser } } }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { PATCH } = await import('~/app/api/account/profile/route');

const call = (body: unknown) =>
  PATCH(new Request('http://localhost/api/account/profile', {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: 'session=abc' }, body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  enforceRateLimit.mockResolvedValue(null);
  updateUser.mockResolvedValue(new Response('{}', { status: 200, headers: { 'set-cookie': 'better-auth.session_data=new; Path=/; HttpOnly' } }));
});

describe('회원정보 수정 창구', () => {
  it('이름과 맞춘 연락처로 저장하고, 다시 구운 세션 쿠키를 옮긴다', async () => {
    const response = await call({ name: ' 홍길동 ', phone: '01012345678' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: '홍길동', phone: '010-1234-5678' });
    const args = updateUser.mock.calls[0]![0];
    expect(args.body).toEqual({ name: '홍길동', phone: '010-1234-5678' });
    expect(args.asResponse).toBe(true);
    // 요청의 세션으로 부른다 — 남의 id 를 받지 않는다
    expect(args.headers.get('cookie')).toBe('session=abc');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session_data=new; Path=/; HttpOnly']);
  });

  it('연락처를 비우면 지운다(null)', async () => {
    await call({ name: '홍길동', phone: '' });
    expect(updateUser.mock.calls[0]![0].body.phone).toBeNull();
  });

  it('틀린 칸은 칸 이름과 문구로 돌려주고 저장하지 않는다', async () => {
    const response = await call({ name: '', phone: '02-123-4567' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(['name', 'phone']);
    expect(body.fields['phone']).toContain('휴대폰');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('로그인 안 했으면 401, 요청 제한에 걸리면 저장하지 않는다', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await call({ name: '홍길동' })).status).toBe(401);

    getSessionUser.mockResolvedValue({ id: 'u-1' });
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call({ name: '홍길동' })).status).toBe(429);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('인증 라이브러리가 거절하면(서버 훅) 저장 실패로 알린다', async () => {
    updateUser.mockResolvedValue(new Response('{}', { status: 400 }));
    const response = await call({ name: '홍길동' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'PROFILE_NOT_SAVED' });
  });
});
