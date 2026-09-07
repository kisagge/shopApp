import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 가맹점에게 나가는 응답에 손님의 개인정보가 없어야 한다.
 *
 * 범위 제한(where 절)은 **남의 것을 빼고 읽는 일**이지, 읽어 온 것 중 무엇을
 * 보여 줄지를 정하는 일이 아니다. 둘을 같은 것으로 보면 "내 주문이니까 다
 * 봐도 된다" 가 된다 — 가맹점은 배송하려고 그 주문을 보는 것이지 손님을
 * 알려고 보는 것이 아니다.
 *
 * 조회 코드는 이미 이름을 가리고 이메일을 비운다. 그런데 **그것을 지키는
 * 것이 아무것도 없었다.** 가리는 줄을 지워도 모든 검사가 통과했다.
 *
 * 그래서 필드 이름을 하나씩 확인하지 않는다. 응답을 통째로 문자열로 만들어
 * **손님의 값이 어디에든 남아 있으면 진다** — 새 필드를 더해도 자동으로
 * 걸린다.
 */

/** 손님의 값. 응답 어디에서도 이 글자가 보이면 안 된다. */
const CUSTOMER = {
  name: '홍길동',
  email: 'customer@plain.test',
  grade: 'VIP',
};

const db = vi.hoisted(() => {
  const fn = () => vi.fn<(...a: any[]) => any>();
  return {
    order: { findMany: fn(), findFirst: fn(), count: fn(), aggregate: fn(), groupBy: fn() },
    merchant: { findMany: fn() },
    $queryRaw: fn(),
  };
});
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));

const { getAdminOrder, getAdminOrders } = await import('~/lib/queries/admin/orders');

const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const ITEM = {
  productName: '오트 코트', brandName: '무어', optionLabel: '오트 / M',
  listPrice: 413_000, unitPrice: 289_000, quantity: 1, subtotal: 289_000, status: 'PAID',
  merchantId: 'm-a',
};

const ORDER = {
  id: 'o-1', orderNo: '20260907-1234567', status: 'PAID',
  placedAt: new Date('2026-09-07'), paidAt: new Date('2026-09-07'),
  listTotal: 413_000, productDiscount: 124_000, couponDiscount: 0,
  pointsUsed: 0, shippingFee: 0, payable: 289_000, rewardPoints: 2_890,
  // 배송에 필요한 값. 이건 가맹점이 봐야 한다.
  recipient: '김수령', recipientPhone: '010-0000-0000', postalCode: '04766',
  address1: '서울 성동구 왕십리로 000', address2: '101동', deliveryMemo: '문 앞',
  user: { name: CUSTOMER.name, email: CUSTOMER.email, grade: CUSTOMER.grade },
  payment: null, shipment: null, deliveredAt: null, returnRequests: [],
  items: [ITEM], statusLogs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(ORDER);
  db.order.findMany.mockResolvedValue([{ ...ORDER, user: { name: CUSTOMER.name } }]);
  db.order.count.mockResolvedValue(1);
});

/** 응답 어디에 그 글자가 있는가 — 필드 이름을 몰라도 걸린다 */
const leaks = (value: unknown, needle: string): boolean =>
  JSON.stringify(value ?? null).includes(needle);

describe('가맹점이 보는 주문 — 손님의 값이 새지 않는다', () => {
  it('주문 상세에 손님 이름이 그대로 남지 않는다', async () => {
    const order = await getAdminOrder(merchant, '20260907-1234567');
    expect(leaks(order, CUSTOMER.name)).toBe(false);
  });

  it('주문 상세에 손님 이메일이 없다', async () => {
    // 배송에 필요한 것은 받는 사람의 연락처지 계정 이메일이 아니다
    const order = await getAdminOrder(merchant, '20260907-1234567');
    expect(leaks(order, CUSTOMER.email)).toBe(false);
  });

  it('주문 목록에도 손님 이름이 그대로 남지 않는다', async () => {
    const page = await getAdminOrders(merchant, {});
    expect(leaks(page, CUSTOMER.name)).toBe(false);
  });

  it('배송에 필요한 값은 그대로 준다 — 가려서 못 보내면 안 된다', async () => {
    /*
     * 가리는 것이 목적이 아니다. 가맹점은 물건을 보내야 하고, 받는 사람의
     * 이름과 연락처와 주소가 없으면 그 일을 할 수 없다.
     */
    const order = await getAdminOrder(merchant, '20260907-1234567');
    expect(leaks(order, '김수령')).toBe(true);
    expect(leaks(order, '010-0000-0000')).toBe(true);
    expect(leaks(order, '서울 성동구 왕십리로 000')).toBe(true);
  });

  it('주문 상세에 손님 등급이 없다', async () => {
    // 우리 적립·할인 제도의 값이다. 알면 손님을 등급으로 다르게 대할 여지만 생긴다.
    const order = await getAdminOrder(merchant, '20260907-1234567');
    expect(leaks(order, CUSTOMER.grade)).toBe(false);
  });

  it('운영진에게는 그대로 준다 — 가리는 것은 범위가 있는 계정에만', async () => {
    const order = await getAdminOrder(admin, '20260907-1234567');
    expect(leaks(order, CUSTOMER.name)).toBe(true);
    expect(leaks(order, CUSTOMER.email)).toBe(true);
  });
});
