import 'server-only';
import { prisma } from '@shop/db';
import { recordNotifications, type NoticeInput } from './record';

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
