import 'server-only';
import { prisma } from '@shop/db';
import { markNoticesDone, recordNotifications, type NoticeInput } from './record';
import { stockAttentionWhere } from '~/lib/queries/admin/products';

/**
 * 재고가 기준 아래로 내려간 옵션을 **그 상품을 파는 가맹점에게** 알린다.
 *
 * 받는 사람은 그 가맹점에 소속된 계정 전부다. 한 가맹점에 담당자가 여럿일 수
 * 있고, 누가 재고를 챙기는지는 우리가 모른다.
 *
 * **가맹점 없는 상품은 아무에게도 안 보낸다.** 플랫폼이 직접 파는 상품이라
 * 운영진이 대시보드로 본다. 거기까지 알림을 쏟으면 운영 알림함이 재고 소식으로
 * 덮여 정작 봐야 할 것이 묻힌다.
 *
 * **실패해도 던지지 않는다** — 주문은 이미 성립했다. recordNotifications 가
 * 같은 규칙을 지키고, 여기서 읽는 조회도 같은 이유로 삼킨다.
 */
export async function notifyLowStock(variantIds: readonly string[]): Promise<void> {
  if (variantIds.length === 0) return;

  try {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...variantIds] } },
      select: {
        id: true,
        label: true,
        stock: true,
        product: {
          select: { id: true, name: true, brand: { select: { merchantId: true } } },
        },
      },
    });

    const merchantIds = [
      ...new Set(variants.map((v) => v.product.brand.merchantId).filter((m): m is string => !!m)),
    ];
    if (merchantIds.length === 0) return;

    const staff = await prisma.user.findMany({
      where: { merchantId: { in: merchantIds }, role: 'MERCHANT' },
      select: { id: true, merchantId: true },
    });

    const notices: NoticeInput[] = [];
    for (const variant of variants) {
      const owner = variant.product.brand.merchantId;
      if (!owner) continue;

      for (const person of staff.filter((s) => s.merchantId === owner)) {
        notices.push({
          userId: person.id,
          kind: 'STOCK_LOW',
          params: {
            productName: variant.product.name,
            optionLabel: variant.label,
            stock: String(variant.stock),
          },
          // 눌렀을 때 곧바로 재고를 고칠 수 있는 자리로 간다
          linkPath: `/admin/products/${variant.product.id}`,
        });
      }
    }

    await recordNotifications(notices);
  } catch (error) {
    console.error('[notification] 재고 부족 알림을 못 만들었다', { variantIds }, error);
  }
}

/**
 * 재고를 채웠으니 **"재고가 부족하다" 는 끝난 일이다.**
 *
 * 채운 뒤에도 안 읽음으로 남으면 뱃지의 숫자가 "할 일이 몇 개" 가 아니라 "그동안 몇 번 일이 있었나" 가
 * 된다. 알림에는 상품 이름과 옵션이 실려 있지만 그것으로 좁히지 않는다 — 그 가게의 재고 할 일이
 * **하나도 남지 않았을 때만** 닫는다(한 옵션을 채워도 다른 옵션이 임박이면 여전히 할 일이다).
 *
 * **품절도 할 일로 센다.** 기준을 넘어 내려갈 때 한 번 알리므로 6→0 처럼 품절까지 떨어진 옵션의 알림도
 * 그 한 통이다 — 임박만 세면 정작 지금 팔 수 없는 옵션을 두고 알림이 닫힌다.
 *
 * **대시보드와 같은 경계를 쓴다**(stockAttentionWhere). 따로 적으면 뱃지는 비었는데 "처리가 필요한 일" 에는
 * 숫자가 남는 날이 온다.
 *
 * **실패해도 던지지 않는다**(record 와 같은 규칙) — 재고는 이미 고쳐졌다.
 */
export async function clearLowStockDone(merchantId: string | null): Promise<void> {
  // 가맹점 없는 상품은 애초에 아무에게도 안 보낸다 — 닫을 알림도 없다
  if (merchantId === null) return;

  try {
    const waiting = await prisma.product.count({
      where: { OR: [stockAttentionWhere('OUT', merchantId), stockAttentionWhere('LOW', merchantId)] },
    });
    if (waiting > 0) return;

    const staff = await prisma.user.findMany({
      where: { merchantId, role: 'MERCHANT' },
      select: { id: true },
    });
    await markNoticesDone({ kinds: ['STOCK_LOW'], userIds: staff.map((s) => s.id) });
  } catch (error) {
    console.error('[notification] 재고 부족 알림을 닫지 못했다', { merchantId }, error);
  }
}
