import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const updateOrderAddress = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/update-address', async () => {
  const actual = await vi.importActual<typeof import('~/lib/orders/update-address')>(
    '~/lib/orders/update-address',
  );
  return { ...actual, updateOrderAddress };
});

const db = vi.hoisted(() => ({
  shippingPolicy: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { updateOrderAddressAsAdmin } = await import('~/lib/admin/manage-order-address');
const { updateShippingPolicy } = await import('~/lib/admin/manage-shipping');

/**
 * 운영진·가맹점이 **남의 것을 대신 고치는** 두 자리.
 *
 * 둘 다 검사가 없었다. 고칠 것은 없었고, 못 박는 것은 **누가 어디까지 손댈 수 있는가**다 —
 * 범위가 한 칸 어긋나면 가맹점이 남의 주문을 열거나, 아무나 배송비를 바꾼다.
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const superAdmin: Actor = { id: 'u-super', role: 'SUPER_ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const looseMerchant: Actor = { id: 'u-m2', role: 'MERCHANT', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const input = {
  recipient: '장보영', phone: '01012345678', postalCode: '04766',
  address1: '서울 성동구 왕십리로 1', address2: '101호',
} as Parameters<typeof updateOrderAddressAsAdmin>[2];

beforeEach(() => {
  vi.clearAllMocks();
  updateOrderAddress.mockResolvedValue({ ok: true });
  db.shippingPolicy.findUnique.mockResolvedValue(null);
  db.shippingPolicy.upsert.mockResolvedValue({
    id: 'default', baseFee: 3000, freeThreshold: 50000, remoteSurcharge: 3000,
  });
});

/**
 * **주소를 보고 송장을 붙이는 사람이 고치는 사람이다** — 출고 권한과 같은 자리에 둔다.
 * 운영자라고 이미 나간 주문의 주소를 바꿀 수 있으면, 화면에는 새 주소가 보이는데 물건은 옛
 * 주소로 간다 — 언제까지 되는지는 손님 쪽과 같은 규칙이 본다.
 */
describe('주문 배송지 고치기', () => {
  it.each([
    ['운영진', admin],
    ['슈퍼관리자', superAdmin],
  ])('%s 는 고칠 수 있다', async (_who, actor) => {
    await updateOrderAddressAsAdmin(actor, '20261016-1', input);

    expect(updateOrderAddress).toHaveBeenCalled();
  });

  it.each([
    ['손님', customer],
    ['소속 없는 가맹점', looseMerchant],
  ])('%s 는 열지 못한다', async (_who, actor) => {
    await expect(updateOrderAddressAsAdmin(actor, '20261016-1', input)).rejects.toThrow();
    expect(updateOrderAddress).not.toHaveBeenCalled();
  });

  /** 가맹점은 자기 상품이 담긴 주문만 연다 — 송장 등록과 같은 범위다 */
  it('가맹점은 자기 범위를 달고 간다', async () => {
    await updateOrderAddressAsAdmin(merchant, '20261016-1', input);

    expect(updateOrderAddress).toHaveBeenCalledWith(
      '20261016-1', input,
      expect.objectContaining({ actorId: 'u-m', merchantId: 'm-1' }),
    );
  });

  /*
   * **운영진에게는 범위를 달지 않는다.** 빈 값이라도 실어 보내면 아무 주문에도 안 맞아,
   * 운영진이 어느 주문도 못 고치게 된다.
   */
  it('운영진에게는 범위를 달지 않는다', async () => {
    await updateOrderAddressAsAdmin(admin, '20261016-1', input);

    const [, , options] = updateOrderAddress.mock.calls[0]!;
    expect(options).not.toHaveProperty('merchantId');
    expect(options).toMatchObject({ actorId: 'u-admin' });
  });

  /** 남의 주소를 대신 바꾸는 일이다 — 누가 고쳤는지 처리 이력에 남아야 한다 */
  it('누가 고쳤는지 함께 넘긴다', async () => {
    await updateOrderAddressAsAdmin(merchant, '20261016-1', input);

    const [, , options] = updateOrderAddress.mock.calls[0]!;
    expect(options.actorId).toBe('u-m');
  });

  it('언제까지 되는지는 이 자리가 정하지 않는다 — 손님 쪽과 같은 규칙에 맡긴다', async () => {
    updateOrderAddress.mockRejectedValue(new Error('TOO_LATE'));

    await expect(updateOrderAddressAsAdmin(admin, '20261016-1', input)).rejects.toThrow('TOO_LATE');
  });
});

/**
 * **한 줄짜리 표라 upsert 로 쓴다.** "먼저 있는지 보고 나서 쓴다" 로 하면 두 사람이 동시에
 * 저장할 때 하나가 유니크 제약에 걸린다.
 */
describe('배송비 정책 고치기', () => {
  const input = { baseFee: 2500, freeThreshold: 40000, remoteSurcharge: 3500 };

  it.each([
    ['손님', customer],
    ['가맹점', merchant],
  ])('%s 는 바꾸지 못한다', async (_who, actor) => {
    await expect(updateShippingPolicy(actor, input)).rejects.toThrow();
    expect(db.shippingPolicy.upsert).not.toHaveBeenCalled();
  });

  it('운영진은 바꿀 수 있다', async () => {
    await updateShippingPolicy(admin, input);

    expect(db.shippingPolicy.upsert).toHaveBeenCalled();
  });

  /** 줄이 없으면 만들고 있으면 고친다 — 한 줄짜리 표의 id 는 하나다 */
  it('같은 한 줄에 만들거나 고친다', async () => {
    await updateShippingPolicy(admin, input);

    const args = db.shippingPolicy.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ id: 'default' });
    expect(args.update).toMatchObject(input);
    expect(args.create).toMatchObject({ id: 'default', ...input });
  });

  /** 누가 마지막으로 만졌는지 줄에 남는다 */
  it('고친 사람을 함께 적는다', async () => {
    await updateShippingPolicy(admin, input);

    const args = db.shippingPolicy.upsert.mock.calls[0]![0];
    expect(args.update.updatedById).toBe('u-admin');
    expect(args.create.updatedById).toBe('u-admin');
  });

  /*
   * **전후 값을 함께 돌려준다.** 감사 로그에 무엇이 무엇으로 바뀌었는지 남겨야 하고, 그건
   * 부르는 쪽의 일이다 — 여기서 기록하면 이 함수가 요청을 알아야 한다.
   */
  it('바뀌기 전과 뒤를 함께 돌려준다', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue({
      id: 'default', baseFee: 3000, freeThreshold: 50000, remoteSurcharge: 3000,
    });

    const { before, after } = await updateShippingPolicy(admin, input);

    expect(before).toMatchObject({ baseFee: 3000 });
    expect(after).toMatchObject({ baseFee: 3000 });
  });

  /** 처음 저장하는 가게에는 "바뀌기 전" 이 없다 — 0 으로 적으면 안 바뀐 것처럼 읽힌다 */
  it('처음 저장이면 바뀌기 전은 없다', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue(null);

    expect((await updateShippingPolicy(admin, input)).before).toBeNull();
  });

  /** 읽기를 쓰기보다 먼저 해야 "바뀌기 전" 이 진짜 전 값이다 */
  it('바뀌기 전 값을 쓰기보다 먼저 읽는다', async () => {
    const order: string[] = [];
    db.shippingPolicy.findUnique.mockImplementation(async () => { order.push('read'); return null; });
    db.shippingPolicy.upsert.mockImplementation(async () => {
      order.push('write');
      return { id: 'default', ...input };
    });

    await updateShippingPolicy(admin, input);

    expect(order).toEqual(['read', 'write']);
  });
});
