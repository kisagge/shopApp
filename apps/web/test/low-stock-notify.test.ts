import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 재고 부족 알림을 **누구에게** 보내는가.
 *
 * 그 상품을 파는 가맹점의 계정에게만. 남의 가맹점에 가면 경쟁사의 재고
 * 사정을 떠먹여 주는 셈이고, 운영진에게 가면 운영 알림함이 재고 소식으로 덮여
 * 정작 봐야 할 것이 묻힌다.
 */

const productVariant = vi.hoisted(() => ({ findMany: vi.fn<(...a: any[]) => any>() }));
const user = vi.hoisted(() => ({ findMany: vi.fn<(...a: any[]) => any>() }));
vi.mock('@shop/db', () => ({ prisma: { productVariant, user } }));

const recordNotifications = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotifications }));

const { notifyLowStock } = await import('~/lib/notifications/low-stock');

const variant = (id: string, merchantId: string | null, over: Record<string, unknown> = {}) => ({
  id,
  label: '오트밀 / M',
  stock: 5,
  product: { id: `p-${id}`, name: '울 코트', brand: { merchantId } },
  ...over,
});

beforeEach(() => {
  productVariant.findMany.mockReset();
  user.findMany.mockReset();
  recordNotifications.mockReset().mockResolvedValue(undefined);
});

const recipients = (): string[] =>
  (recordNotifications.mock.calls[0]?.[0] as { userId: string }[]).map((n) => n.userId);

describe('재고 부족 알림 받는 사람', () => {
  it('그 상품을 파는 가맹점의 계정에게만 간다', async () => {
    productVariant.findMany.mockResolvedValue([variant('v-1', 'm-1')]);
    // 조회는 가맹점 계정만 묻는다 — 운영진·손님은 애초에 안 걸린다
    user.findMany.mockResolvedValue([
      { id: 'u-noon-1', merchantId: 'm-1' },
      { id: 'u-moor-1', merchantId: 'm-2' },
    ]);

    await notifyLowStock(['v-1']);

    /*
     * **여기가 이 파일의 요점이다.** 조회가 여러 가맹점을 한 번에 가져오므로,
     * 짝을 안 맞추면 무어 담당자에게 스튜디오눈의 재고 소식이 간다.
     */
    expect(recipients(), '남의 가맹점 계정에 갔다').toEqual(['u-noon-1']);
  });

  it('가맹점에 담당자가 여럿이면 모두에게 간다', async () => {
    // 누가 재고를 챙기는지 우리는 모른다
    productVariant.findMany.mockResolvedValue([variant('v-1', 'm-1')]);
    user.findMany.mockResolvedValue([
      { id: 'u-1', merchantId: 'm-1' },
      { id: 'u-2', merchantId: 'm-1' },
    ]);

    await notifyLowStock(['v-1']);

    expect(recipients()).toEqual(['u-1', 'u-2']);
  });

  it('가맹점 계정만 묻는다 — 운영진에게는 보내지 않는다', async () => {
    productVariant.findMany.mockResolvedValue([variant('v-1', 'm-1')]);
    user.findMany.mockResolvedValue([]);

    await notifyLowStock(['v-1']);

    const where = user.findMany.mock.calls[0]?.[0]?.where as { role?: string };
    expect(where?.role, '역할을 안 가려서 운영진까지 받는다').toBe('MERCHANT');
  });

  it('가맹점 없는 상품은 아무에게도 안 보낸다', async () => {
    // 플랫폼이 직접 파는 상품이다. 운영진은 대시보드로 본다
    productVariant.findMany.mockResolvedValue([variant('v-1', null)]);

    await notifyLowStock(['v-1']);

    expect(user.findMany).not.toHaveBeenCalled();
    expect(recordNotifications).not.toHaveBeenCalled();
  });

  it('누르면 그 상품의 재고를 고치는 자리로 간다', async () => {
    productVariant.findMany.mockResolvedValue([variant('v-1', 'm-1')]);
    user.findMany.mockResolvedValue([{ id: 'u-1', merchantId: 'm-1' }]);

    await notifyLowStock(['v-1']);

    const [notice] = recordNotifications.mock.calls[0]?.[0] as {
      kind: string; linkPath: string; params: Record<string, string>;
    }[];
    expect(notice?.kind).toBe('STOCK_LOW');
    expect(notice?.linkPath).toBe('/admin/products/p-v-1');
    expect(notice?.params).toMatchObject({ productName: '울 코트', optionLabel: '오트밀 / M', stock: '5' });
  });

  it('조회가 실패해도 던지지 않는다 — 주문은 이미 성립했다', async () => {
    productVariant.findMany.mockRejectedValue(new Error('DB 가 흔들렸다'));
    await expect(notifyLowStock(['v-1'])).resolves.toBeUndefined();
  });
});
