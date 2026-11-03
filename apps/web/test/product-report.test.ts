import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>() },
  productReport: { create: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { reportProduct, ProductReportError } = await import('~/lib/products/report');

/**
 * 상품 신고 쓰기 경로.
 *
 * 리뷰 신고와 모양이 같지만 막는 자리가 둘 다르다 — **매대에 보이는 상품만** 신고할 수
 * 있고, **자기 가맹점 상품**은 신고할 수 없다.
 */

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const input = { reason: 'COUNTERFEIT' as const, detail: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: 'p-1', brand: { merchantId: 'm-b' } });
  db.productReport.create.mockResolvedValue({ id: 'pr-1' });
});

describe('신고', () => {
  it('사유와 신고자를 함께 남긴다', async () => {
    await reportProduct(customer, 'p-1', { reason: 'UNSAFE', detail: '불이 났어요' });

    expect(db.productReport.create).toHaveBeenCalledWith({
      data: { productId: 'p-1', reporterId: 'u-1', reason: 'UNSAFE', detail: '불이 났어요' },
    });
  });

  it('돌려주는 것은 받았다는 사실 하나다', async () => {
    expect(await reportProduct(customer, 'p-1', input)).toEqual({ reported: true });
  });
});

/**
 * **매대에 보이는 상품만 신고할 수 있다.**
 *
 * 숨긴 상품까지 열어 두면 둘이 생긴다 — 볼 수도 없는 것에 대한 신고가 대기줄에 쌓이고,
 * 아이디를 넣어 보며 **어느 아이디가 있는지 알아내는 창구**가 된다.
 */
describe('안 보이는 상품', () => {
  it('찾지 못하면 404 다', async () => {
    db.product.findFirst.mockResolvedValue(null);

    await expect(reportProduct(customer, 'p-gone', input)).rejects.toMatchObject({
      code: 'REPORT_TARGET_GONE',
      status: 404,
    });
    expect(db.productReport.create).not.toHaveBeenCalled();
  });

  it('매대 조건을 질의에 함께 건다 — 따로 적으면 한쪽에서만 숨는다', async () => {
    await reportProduct(customer, 'p-1', input);

    const where = db.product.findFirst.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where['id']).toBe('p-1');
    // 지워진 것·안 펴진 것·판매 중지는 매대에 없다
    expect(where['deletedAt']).toBeNull();
    expect(where['publishedAt']).toEqual({ not: null });
    expect(where['status']).toBeTruthy();
    // 정지된 가맹점의 상품도 아니다
    expect(where['brand']).toBeTruthy();
  });
});

describe('자기 가맹점 상품', () => {
  /**
   * 파는 쪽이 자기 상품을 운영 대기줄에 올릴 수 있으면 안 된다. 고칠 길은 이미 있다 —
   * 내용을 고치거나 판매를 멈추는 창구가 콘솔에 있고 그쪽이 훨씬 빠르다.
   */
  it('신고할 수 없다', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p-1', brand: { merchantId: 'm-a' } });

    await expect(reportProduct(merchant, 'p-1', input)).rejects.toMatchObject({
      code: 'CANNOT_REPORT_OWN',
      status: 403,
    });
    expect(db.productReport.create).not.toHaveBeenCalled();
  });

  it('다른 가맹점 상품은 신고할 수 있다', async () => {
    await reportProduct(merchant, 'p-1', input);

    expect(db.productReport.create).toHaveBeenCalled();
  });

  /** 손님은 소속이 없다. 가맹점 판정이 손님까지 막으면 아무도 신고할 수 없다. */
  it('소속 없는 사람은 이 검사에 걸리지 않는다', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p-1', brand: { merchantId: null } });

    await reportProduct(customer, 'p-1', input);

    expect(db.productReport.create).toHaveBeenCalled();
  });
});

describe('같은 상품을 두 번', () => {
  /** 유니크 제약이 DB 에서 막는다 — 동시에 두 번 눌리면 앞의 검사만으로는 둘 다 통과한다 */
  it('이미 신고했다고 답한다', async () => {
    db.productReport.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(reportProduct(customer, 'p-1', input)).rejects.toMatchObject({
      code: 'ALREADY_REPORTED',
      status: 409,
    });
  });

  it('유니크가 아닌 고장은 그대로 던진다 — 삼키면 진짜 버그가 "이미 신고" 로 둔갑한다', async () => {
    db.productReport.create.mockRejectedValue(new Error('연결이 끊겼다'));

    await expect(reportProduct(customer, 'p-1', input)).rejects.not.toBeInstanceOf(
      ProductReportError,
    );
  });
});
