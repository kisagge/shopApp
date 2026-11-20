import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeReturnAddress, type Actor } from '@shop/core';

/**
 * 반품지를 등록하거나 고친 뒤에 **누구에게 알리는가.**
 *
 * 창구(`return-address-api`)와 폼은 검사가 있는데, 저장 뒤에 걸린 **알림 두 줄이
 * 비어 있었다.** 둘 다 지워도 주소는 멀쩡히 저장되고 모든 검사가 초록이다 —
 * 사라지는 것은 알림뿐이고, 그것을 사람이 알아차리는 경로는 없다.
 *
 * **바뀜 알림**은 아직 안 보낸 사람을 구한다. 승인받고 상자를 싸는 중인
 * 사람에게 주소가 달라졌다는 사실이 가지 않으면, 그 상자는 옛 주소로 떠난다.
 *
 * **미등록 알림 닫기**는 끝난 일을 치운다. 등록하러 온 사람이 바로 그 사람인데
 * 알림이 안 읽음으로 남으면 뱃지가 할 일의 수를 말하지 않는다.
 */

const order: string[] = [];
const db = vi.hoisted(() => ({
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>() },
  returnRequest: { findMany: vi.fn<(...a: any[]) => any>() },
  merchant: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const notify = vi.hoisted(() => ({
  notifyReturnAddressChanged: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
  clearReturnAddressMissing: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
}));
vi.mock('~/lib/notifications/console-work', () => notify);

const { updateReturnAddress } = await import('~/lib/orders/return-address');

const admin: Actor = { id: 'u-adm', role: 'ADMIN', merchantId: null };
const merchantActor: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

/* 저장된 값은 정규화를 지난 꼴이다 — 그렇지 않으면 "같은 값" 이 늘 달라 보인다 */
const ADDRESS = normalizeReturnAddress({
  recipient: '무어 반품센터', phone: '02-1234-5678',
  postalCode: '04524', address1: '서울 중구 세종대로 110', address2: '3층',
});

/* 입력은 계약의 꼴이다 — 정규화는 `address2` 를 null 로 두지만 들어오는 쪽은 선택 칸이다 */
const input = (over: Partial<Record<keyof typeof ADDRESS, string>> = {}) => ({
  ...ADDRESS,
  address2: ADDRESS.address2 ?? undefined,
  ...over,
});

/** 승인받고 아직 안 보낸 신청 하나 — 이 반품지로 보내라고 안내받은 사람이다 */
const awaiting = (merchantId: string | null) => [{
  itemIds: ['oi-1'],
  order: {
    orderNo: '20261120-0000001',
    userId: 'u-buyer',
    items: [{ id: 'oi-1', status: 'RETURN_REQUESTED', canceledAt: null, merchantId }],
  },
}];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  db.merchant.findUnique.mockResolvedValue({ id: 'm-a' });
  db.returnAddress.findUnique.mockImplementation(() => {
    order.push('read');
    return Promise.resolve({ merchantId: 'm-a', ...ADDRESS });
  });
  db.returnRequest.findMany.mockImplementation(() => {
    order.push('awaiting');
    return Promise.resolve([]);
  });
  db.returnAddress.upsert.mockImplementation((args: { update: Record<string, unknown> }) => {
    order.push('write');
    return Promise.resolve({ merchantId: 'm-a', ...ADDRESS, ...args.update });
  });
});

describe('주소가 바뀌었다고 알리는 때', () => {
  it('한 칸만 달라져도 알린다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));

    await updateReturnAddress(merchantActor, 'm-a', input({ address2: '4층' }));

    expect(notify.notifyReturnAddressChanged).toHaveBeenCalledExactlyOnceWith([
      { orderNo: '20261120-0000001', userId: 'u-buyer' },
    ]);
  });

  it('같은 값으로 저장만 누르면 알리지 않는다 — 안 바뀐 것을 바뀌었다고 하지 않는다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));

    await updateReturnAddress(merchantActor, 'm-a', input());

    expect(notify.notifyReturnAddressChanged).not.toHaveBeenCalled();
  });

  it('처음 등록할 때는 알리지 않는다 — 옛 주소를 받은 사람이 없다', async () => {
    db.returnAddress.findUnique.mockResolvedValue(null);
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));

    await updateReturnAddress(merchantActor, 'm-a', input());

    expect(notify.notifyReturnAddressChanged).not.toHaveBeenCalled();
  });

  it('구할 사람이 없으면 빈 명단으로 부른다 — 그 판단은 알림 쪽이 한다', async () => {
    await updateReturnAddress(merchantActor, 'm-a', input({ recipient: '새 반품센터' }));

    expect(notify.notifyReturnAddressChanged).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('다른 판매처로 가는 신청은 명단에 없다 — 남의 손님에게 알리지 않는다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-other'));

    await updateReturnAddress(merchantActor, 'm-a', input({ phone: '02-9999-0000' }));

    expect(notify.notifyReturnAddressChanged).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('명단은 쓰기 전에 잡는다 — 잡는 시점이 뜻을 갖는 자리다', async () => {
    await updateReturnAddress(merchantActor, 'm-a', input({ address1: '서울 중구 다른길 1' }));

    expect(order.indexOf('awaiting')).toBeLessThan(order.indexOf('write'));
  });
});

describe('미등록 알림을 닫는 때', () => {
  it('처음 등록하면 닫는다', async () => {
    db.returnAddress.findUnique.mockResolvedValue(null);

    await updateReturnAddress(merchantActor, 'm-a', input());

    expect(notify.clearReturnAddressMissing).toHaveBeenCalledExactlyOnceWith('m-a');
  });

  it('고칠 때도 닫는다 — 미등록 알림이 남아 있는데 주소가 멀쩡한 경우가 그쪽이다', async () => {
    await updateReturnAddress(merchantActor, 'm-a', input({ address2: '5층' }));

    expect(notify.clearReturnAddressMissing).toHaveBeenCalledExactlyOnceWith('m-a');
  });

  it('값이 그대로여도 닫는다', async () => {
    await updateReturnAddress(merchantActor, 'm-a', input());

    expect(notify.clearReturnAddressMissing).toHaveBeenCalledOnce();
  });

  it('자사 반품지는 null 로 닫는다 — 플랫폼도 한 판매처로 센다', async () => {
    db.returnAddress.findUnique.mockResolvedValue({ merchantId: null, ...ADDRESS });

    await updateReturnAddress(admin, null, input());

    expect(notify.clearReturnAddressMissing).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe('고칠 수 없는 사람', () => {
  it('남의 반품지는 못 고친다 — 알림도 나가지 않는다', async () => {
    await expect(updateReturnAddress(merchantActor, 'm-other', input())).rejects.toThrow();

    expect(db.returnAddress.upsert).not.toHaveBeenCalled();
    expect(notify.notifyReturnAddressChanged).not.toHaveBeenCalled();
    expect(notify.clearReturnAddressMissing).not.toHaveBeenCalled();
  });

  it('없는 가맹점이면 거절한다', async () => {
    db.merchant.findUnique.mockResolvedValue(null);

    await expect(updateReturnAddress(admin, 'm-없음', input())).rejects.toMatchObject({
      code: 'MERCHANT_NOT_FOUND',
      status: 404,
    });
    expect(notify.clearReturnAddressMissing).not.toHaveBeenCalled();
  });
});
