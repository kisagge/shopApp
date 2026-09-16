import 'server-only';
import { prisma } from '@shop/db';
import { planReorder, won, type ReorderVariant } from '@shop/core';
import type { ReorderResponse } from '@shop/contract';
import { variantStateOf } from '~/lib/queries/cart';

/**
 * 지난 주문을 다시 담을 줄을 만든다. **쓰지 않는다** — 장바구니는 브라우저가 들고
 * 있어서, 여기서는 무엇을 몇 개 담을지만 정해 돌려주고 담는 것은 화면이 한다.
 *
 * 무엇을 담는지는 core 의 planReorder 가 정한다(취소한 줄·판매 중지·품절은 빼고,
 * 재고만큼만, 줄 수 상한 안에서). 여기서는 주문과 지금 옵션의 형편을 읽어 넘길 뿐이다.
 *
 * **자기 주문만.** 남의 주문번호를 넣으면 없는 주문과 똑같이 답한다(null) — 있는데
 * 못 본다고 말하면 주문번호가 있는지 없는지를 밖에서 세어 볼 수 있다.
 *
 * 담는 줄의 이름·옵션은 **지금 값**이다(장바구니는 지금 파는 것을 보여 준다). 못 담은
 * 줄은 **주문 때 적어 둔 값**으로 말한다 — 상품이 지워졌으면 지금 값이 없다.
 */
export async function planReorderFor(
  userId: string,
  orderNo: string,
  cartVariantIds: readonly string[],
): Promise<ReorderResponse | null> {
  const order = await prisma.order.findFirst({
    where: { orderNo, userId },
    select: {
      items: {
        orderBy: { id: 'asc' },
        select: {
          variantId: true, quantity: true, canceledAt: true,
          productName: true, optionLabel: true,
        },
      },
    },
  });
  if (!order) return null;

  const ids = [...new Set(order.items.map((i) => i.variantId))];
  const rows = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, label: true, stock: true, isActive: true, priceOverride: true,
      product: {
        select: {
          id: true, name: true, listPrice: true, salePrice: true, status: true, deletedAt: true,
          brand: { select: { name: true, merchant: { select: { status: true } } } },
          images: { select: { url: true, blurDataUrl: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const plan = planReorder(
    order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, canceled: i.canceledAt !== null })),
    new Map<string, ReorderVariant>(
      ids.map((id) => {
        const r = byId.get(id);
        return [id, r ? { ...variantStateOf(r), stock: r.stock } : null];
      }),
    ),
    new Set(cartVariantIds),
  );

  const snapshot = new Map(order.items.map((i) => [i.variantId, i]));

  return {
    add: plan.add.flatMap((line) => {
      const r = byId.get(line.variantId);
      if (!r) return [];
      const listPrice = won(r.product.listPrice);
      const base = r.product.salePrice === null ? listPrice : won(r.product.salePrice);
      return [{
        variantId: r.id,
        productId: r.product.id,
        productName: r.product.name,
        brand: r.product.brand.name,
        optionLabel: r.label,
        listPrice,
        salePrice: r.priceOverride === null ? base : won(r.priceOverride),
        imageUrl: r.product.images[0]?.url ?? null,
        blurDataUrl: r.product.images[0]?.blurDataUrl ?? null,
        quantity: line.quantity,
        reduced: line.reduced,
      }];
    }),
    skipped: plan.skipped.map((s) => ({
      productName: snapshot.get(s.variantId)?.productName ?? '',
      optionLabel: snapshot.get(s.variantId)?.optionLabel ?? '',
      reason: s.reason,
    })),
  };
}
