import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  product: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { getAdminOrders } = await import('~/lib/queries/admin/orders');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

/** findMany 에 실제로 넘어간 where */
const whereOf = () => db.order.findMany.mock.calls[0]?.[0].where as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
});

describe('주문번호 검색', () => {
  it('완전한 번호는 정확히 일치로 던진다', async () => {
    await getAdminOrders(admin, { q: '20260831-8842713' });

    // 유니크 인덱스를 쓰려면 contains 가 아니라 값이어야 한다
    expect(whereOf()['orderNo']).toBe('20260831-8842713');
  });

  it('조각은 부분 일치로 던진다', async () => {
    await getAdminOrders(admin, { q: '8842713' });
    expect(whereOf()['orderNo']).toEqual({ contains: '8842713' });
  });

  /**
   * **이름은 둘일 수 있다.** 주문한 사람과 받는 사람이 다른 주문이 흔하다(선물·가족·회사).
   * 운영자가 문의를 받아 쥔 이름이 어느 쪽인지는 모른다 — 한쪽만 보면 "그런 주문 없습니다" 가 된다.
   */
  it('이름은 주문자와 받는 사람을 함께 보고, 대소문자를 가리지 않는다', async () => {
    await getAdminOrders(admin, { q: 'Demo' });

    expect(whereOf()['OR']).toEqual([
      { user: { name: { contains: 'Demo', mode: 'insensitive' } } },
      { recipient: { contains: 'Demo', mode: 'insensitive' } },
    ]);
  });

  it('검색어가 없으면 조건을 붙이지 않는다', async () => {
    await getAdminOrders(admin, {});
    expect(whereOf()['orderNo']).toBeUndefined();
    expect(whereOf()['OR']).toBeUndefined();
    expect(whereOf()['recipientPhone']).toBeUndefined();
  });
});

/**
 * **전화번호가 주문번호 조각으로 빨려 들어가고 있었다.**
 *
 * 숫자와 하이픈이면 전부 번호의 일부로 읽었는데 "010-1234-5678" 이 바로 그 모양이다 — 주문번호에
 * 그런 조각이 있을 리 없으니 언제나 0건이 나왔고, 운영자는 "그런 주문이 없습니다" 라고 답하게 된다.
 * 택배사와 고객센터가 쥐고 오는 것이 바로 전화번호다.
 */
describe('전화번호 검색', () => {
  it('받는 사람의 번호로 찾는다', async () => {
    await getAdminOrders(admin, { q: '010-1234-5678' });

    expect(whereOf()['recipientPhone']).toBe('010-1234-5678');
    // 번호로 읽었으니 주문번호 조각으로는 안 던진다 — 그게 0건의 원인이었다
    expect(whereOf()['orderNo']).toBeUndefined();
  });

  it('하이픈 없이 쳐도 같은 주문을 찾는다 — 저장할 때 쓴 함수로 맞춘다', async () => {
    await getAdminOrders(admin, { q: '01012345678' });

    expect(whereOf()['recipientPhone']).toBe('010-1234-5678');
  });

  it('가맹점이 전화로 찾아도 자기 주문 제한이 풀리지 않는다', async () => {
    await getAdminOrders(merchant, { q: '010-1234-5678' });

    const where = whereOf();
    expect(where['items']).toEqual({ some: { merchantId: 'm-a' } });
    expect(where['recipientPhone']).toBe('010-1234-5678');
  });
});

describe('기간 검색', () => {
  it('시작만 주면 하한만 건다', async () => {
    await getAdminOrders(admin, { from: '2026-09-01' });
    expect(whereOf()['placedAt']).toEqual({ gte: new Date('2026-08-31T15:00:00.000Z') });
  });

  it('끝날을 포함한다', async () => {
    // 그날 00:00 으로 자르면 하루치가 조용히 사라진다
    await getAdminOrders(admin, { to: '2026-09-04' });
    expect(whereOf()['placedAt']).toEqual({ lt: new Date('2026-09-04T15:00:00.000Z') });
  });

  it('잘못된 날짜는 던진다 — 조용히 무시하면 다른 결과를 보고도 모른다', async () => {
    await expect(getAdminOrders(admin, { from: '2026-02-31' })).rejects.toThrow();
  });
});

describe('가맹점 범위', () => {
  it('검색을 얹어도 자기 주문 제한이 풀리지 않는다', async () => {
    // OR 로 얹으면 남의 주문이 나온다. 조건을 늘릴 때 가장 쉽게 깨지는 자리다.
    await getAdminOrders(merchant, { q: '홍길동' });

    const where = whereOf();
    expect(where['items']).toEqual({ some: { merchantId: 'm-a' } });
    // 이름은 OR 로 두 칸을 보지만, 그 OR 은 범위 제한과 **나란한 키**라 Prisma 가 AND 로 묶는다
    expect(where['OR']).toHaveLength(2);
  });

  it('상태·검색·기간이 함께 걸린다', async () => {
    await getAdminOrders(merchant, {
      status: 'PAID', q: '20260831-8842713', from: '2026-09-01', to: '2026-09-04',
    });

    const where = whereOf();
    expect(where['status']).toBe('PAID');
    expect(where['orderNo']).toBe('20260831-8842713');
    expect(where['items']).toEqual({ some: { merchantId: 'm-a' } });
    expect(where['placedAt']).toEqual({
      gte: new Date('2026-08-31T15:00:00.000Z'),
      lt: new Date('2026-09-04T15:00:00.000Z'),
    });
  });

  it('전체 건수도 같은 조건으로 센다 — 다르면 쪽수가 어긋난다', async () => {
    await getAdminOrders(admin, { q: '8842713' });

    expect(db.order.count).toHaveBeenCalledWith({ where: whereOf() });
  });
});

/**
 * 목록의 "배송지 변경".
 *
 * **처리 이력의 줄은 주문을 열어야 보인다.** 피킹 목록을 이미 뽑았거나 송장을 붙이려던 사람은 열어 볼
 * 이유가 없어서, 주소가 바뀐 줄 모르고 옛 주소로 보낸다. 판단은 core 가 하고(showsAddressChanged)
 * 목록은 그 값을 실어 준다 — 화면이 날짜를 받아 스스로 재면 목록과 상세가 다른 기준으로 표시한다.
 */
describe('배송지가 바뀐 주문', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'o-1', orderNo: '20260930-0000001', status: 'PREPARING', placedAt: new Date(), payable: 100_000,
    addressChangedAt: null, user: { name: '장보영' }, items: [{ productName: '코트', subtotal: 100_000 }],
    ...over,
  });

  /**
   * **올려 보고 나서야 알면 늦다.** 그 주문은 일괄로 등록되지 않는데, 그때는 이미 라벨을 다 찍어 놓았다 —
   * 지금 조건 안에 몇 건인지 함께 세어 올리기 전에 말해 준다.
   */
  it('지금 조건 안에서 배송지가 바뀐 주문을 함께 센다', async () => {
    db.order.count.mockResolvedValueOnce(9).mockResolvedValueOnce(2);

    const result = await getAdminOrders(admin, { status: 'PREPARING' });

    expect(result.total).toBe(9);
    expect(result.addressChanged).toBe(2);

    // 세는 조건은 목록과 같은 조건 + 출고 전 + 바뀐 적 있음
    const counted = db.order.count.mock.calls[1]![0].where;
    expect(counted).toMatchObject({
      status: { in: ['PENDING', 'PAID', 'PREPARING'] },
      addressChangedAt: { not: null },
    });
  });

  /** 목록의 조건을 그대로 물려받아야 한다 — 다른 조건으로 세면 화면의 수와 맞지 않는다 */
  it('목록의 조건을 그대로 쓴다', async () => {
    await getAdminOrders(admin, { q: '8842713' });

    expect(db.order.count.mock.calls[1]![0].where).toMatchObject({ orderNo: { contains: '8842713' } });
  });

  it('바뀐 시각을 함께 읽는다 — 이력을 문구로 뒤지지 않는다', async () => {
    await getAdminOrders(admin, {});

    expect(db.order.findMany.mock.calls[0]![0].select.addressChangedAt).toBe(true);
  });

  it('출고 전에 바뀐 주문은 그렇다고 실어 준다', async () => {
    db.order.findMany.mockResolvedValue([row({ addressChangedAt: new Date('2026-09-30T04:00:00Z') })]);
    db.order.count.mockResolvedValue(1);

    const { rows } = await getAdminOrders(admin, {});
    expect(rows[0]!.addressChanged).toBe(true);
  });

  it('고친 적이 없으면 세우지 않는다', async () => {
    db.order.findMany.mockResolvedValue([row()]);
    db.order.count.mockResolvedValue(1);

    const { rows } = await getAdminOrders(admin, {});
    expect(rows[0]!.addressChanged).toBe(false);
  });

  /** 나간 뒤에는 표시가 남아도 할 일이 없다 — 손을 써야 하는 주문이 그 사이에 묻힌다 */
  it('이미 나간 주문은 바뀌었어도 세우지 않는다', async () => {
    db.order.findMany.mockResolvedValue([
      row({ status: 'SHIPPED', addressChangedAt: new Date('2026-09-30T04:00:00Z') }),
    ]);
    db.order.count.mockResolvedValue(1);

    const { rows } = await getAdminOrders(admin, {});
    expect(rows[0]!.addressChanged).toBe(false);
  });
});
