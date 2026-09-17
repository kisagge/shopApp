import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('../src/index', () => ({ auth: { api: { getSession } } }));
const findMerchant = vi.hoisted(() => vi.fn());
vi.mock('@shop/db', () => ({ prisma: { merchant: { findUnique: findMerchant } } }));

const { getSessionUser, getActor, normalizeRole } = await import('../src/session-user');

beforeEach(() => {
  getSession.mockReset();
  findMerchant.mockReset();
});

describe('역할 정규화', () => {
  it('알려진 역할은 그대로 둔다', () => {
    expect(normalizeRole('SUPER_ADMIN')).toBe('SUPER_ADMIN');
    expect(normalizeRole('MERCHANT')).toBe('MERCHANT');
  });

  it.each([
    ['알 수 없는 문자열', 'GOD_MODE'],
    ['소문자', 'admin'],
    ['숫자', 3],
    ['객체', { role: 'ADMIN' }],
    ['null', null],
    ['undefined', undefined],
  ])('%s 는 CUSTOMER 로 떨어뜨린다 — 권한은 올라가는 쪽으로 기울면 안 된다', (_l, v) => {
    expect(normalizeRole(v)).toBe('CUSTOMER');
  });
});

describe('getSessionUser', () => {
  it('세션이 없으면 null 이다', async () => {
    getSession.mockResolvedValue(null);
    expect(await getSessionUser(new Headers())).toBeNull();
  });

  it('세션에서 우리가 쓰는 값만 뽑는다', async () => {
    getSession.mockResolvedValue({
      user: {
        id: 'u-1', email: 'a@b.test', name: '홍길동',
        role: 'MERCHANT', merchantId: 'm-1',
        image: null, someInternalField: 'x',
      },
    });
    const u = await getSessionUser(new Headers());
    expect(u).toEqual({
      id: 'u-1', email: 'a@b.test', name: '홍길동',
      role: 'MERCHANT', merchantId: 'm-1',
    });
  });

  it('merchantId 가 문자열이 아니면 null 로 둔다', async () => {
    getSession.mockResolvedValue({
      user: { id: 'u', email: 'a@b', name: 'n', role: 'MERCHANT', merchantId: 123 },
    });
    expect((await getSessionUser(new Headers()))?.merchantId).toBeNull();
  });

});

describe('getActor', () => {
  it('권한 판정에 필요한 세 값만 넘긴다 — 이메일·이름이 정책에 새면 안 된다', async () => {
    getSession.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.test', name: '홍길동', role: 'ADMIN', merchantId: null },
    });
    expect(await getActor(new Headers())).toEqual({
      id: 'u-1', role: 'ADMIN', merchantId: null,
    });
  });

  it('비로그인은 null — 호출부가 익명을 명시적으로 다루게 한다', async () => {
    getSession.mockResolvedValue(null);
    expect(await getActor(new Headers())).toBeNull();
  });

  it('역할이 손상돼 있어도 CUSTOMER 로 내려간다', async () => {
    getSession.mockResolvedValue({ user: { id: 'u', email: 'a@b', name: 'n', role: 'ROOT' } });
    expect((await getActor(new Headers()))?.role).toBe('CUSTOMER');
  });
});

/**
 * **정지된 가맹점도 콘솔을 그대로 썼다.** 역할이 세션에 실린 채 그대로였다. 지금 상태를 DB 에서 읽는다.
 */
describe('getActor — 가맹점 상태', () => {
  const merchantSession = {
    user: { id: 'u-m', email: 'm@b.test', name: '가맹점', role: 'MERCHANT', merchantId: 'm-1' },
  };

  it('승인된 가맹점의 계정은 가맹점이다', async () => {
    getSession.mockResolvedValue(merchantSession);
    findMerchant.mockResolvedValue({ status: 'APPROVED' });

    expect(await getActor(new Headers())).toEqual({ id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' });
    expect(findMerchant).toHaveBeenCalledWith({ where: { id: 'm-1' }, select: { status: true } });
  });

  it('정지된 가맹점의 계정은 손님이다 — 세션 캐시를 기다리지 않는다', async () => {
    getSession.mockResolvedValue(merchantSession);
    findMerchant.mockResolvedValue({ status: 'SUSPENDED' });

    expect(await getActor(new Headers())).toEqual({ id: 'u-m', role: 'CUSTOMER', merchantId: null });
  });

  it('가맹점 행이 없으면 손님이다', async () => {
    getSession.mockResolvedValue(merchantSession);
    findMerchant.mockResolvedValue(null);

    expect((await getActor(new Headers()))?.role).toBe('CUSTOMER');
  });

  it('운영진·손님에게는 가맹점을 묻지 않는다 — 왕복을 하나 더 얹지 않는다', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-a', email: 'a@b', name: 'n', role: 'ADMIN', merchantId: null } });
    await getActor(new Headers());
    expect(findMerchant).not.toHaveBeenCalled();
  });
});
