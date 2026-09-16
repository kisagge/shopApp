import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTICE_REASON_MAX } from '@shop/core';

const db = vi.hoisted(() => ({
  product: { findUnique: vi.fn<(...a: any[]) => any>() },
  user: { findMany: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>(() => Promise.resolve({ count: 0 })) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { notifyProductReviewed } = await import('~/lib/notifications/product-review');

/**
 * 검수 결과 알림 — 누구에게, 무엇을 실어.
 *
 * **사유는 진작 받고 있었는데 닿지 않았다.** 상품 행에 적어 두기만 해서,
 * 가맹점은 자기 상품을 다시 열어 봐야 그것을 봤다.
 */

const rows = () => db.notification.createMany.mock.calls[0]?.[0]?.data as
  | { userId: string; kind: string; params: Record<string, string>; linkPath: string | null }[]
  | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findUnique.mockResolvedValue({ brand: { merchantId: 'm-1' } });
  db.user.findMany.mockResolvedValue([{ id: 'u-staff' }]);
});

describe('누구에게 가는가', () => {
  it('그 상품을 올린 가맹점의 사람들에게 간다', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);

    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: true, reason: '',
    });

    expect(db.user.findMany.mock.calls[0]![0].where).toMatchObject({
      merchantId: 'm-1', role: 'MERCHANT',
    });
    expect(rows()?.map((r) => r.userId)).toEqual(['u-1', 'u-2']);
  });

  it('가맹점 없는 상품은 알리지 않는다 — 스스로에게 보내는 알림이 된다', async () => {
    // 자사 상품은 운영진이 올리고 운영진이 검수한다
    db.product.findUnique.mockResolvedValue({ brand: { merchantId: null } });

    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: false, reason: '사진이 흐립니다',
    });

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('받을 사람이 없으면 아무것도 적지 않는다', async () => {
    db.user.findMany.mockResolvedValue([]);

    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: true, reason: '',
    });

    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('무엇이 실리는가', () => {
  it('반려에는 사유가 실린다', async () => {
    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: false, reason: '대표 이미지에 로고가 보입니다',
    });

    expect(rows()?.[0]).toMatchObject({
      kind: 'PRODUCT_REJECTED',
      params: { productName: '울 코트', reason: '대표 이미지에 로고가 보입니다' },
    });
  });

  it('긴 사유는 줄여서 싣는다 — 목록 한 줄이 한 건으로 차면 안 된다', async () => {
    // 계약은 500자까지 받는다. 전문은 상품 화면에 있고, 알림은 스치며 알리는 것이다.
    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: false, reason: '가'.repeat(500),
    });

    const reason = rows()?.[0]?.params['reason'] ?? '';
    expect(reason.length).toBe(NOTICE_REASON_MAX);
    expect(reason.endsWith('…')).toBe(true);
  });

  it('승인에는 사유를 싣지 않는다', async () => {
    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: true, reason: '',
    });

    expect(rows()?.[0]?.kind).toBe('PRODUCT_APPROVED');
    expect(rows()?.[0]?.params).toEqual({ productName: '울 코트' });
  });

  it('누르면 고칠 수 있는 자리로 간다 — 사유 전문도 거기 있다', async () => {
    await notifyProductReviewed({
      productId: 'p-1', productName: '울 코트', approved: false, reason: '사진이 흐립니다',
    });

    expect(rows()?.[0]?.linkPath).toBe('/admin/products/p-1');
  });
});

describe('실패해도 검수를 무르지 않는다', () => {
  it('조회가 터져도 던지지 않는다', async () => {
    /*
     * 부르는 자리에서는 검수가 이미 끝나 있다. 알림을 못 남겼다고 그것을
     * 되돌릴 수는 없고, 되돌리는 편이 더 나쁘다.
     */
    db.product.findUnique.mockRejectedValue(new Error('DB 가 죽었다'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      notifyProductReviewed({
        productId: 'p-1', productName: '울 코트', approved: true, reason: '',
      }),
    ).resolves.toBeUndefined();

    // 조용히 삼키지는 않는다 — 로그에는 남는다
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
