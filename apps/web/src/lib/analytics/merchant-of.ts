import 'server-only';
import { prisma } from '@shop/db';

/**
 * 상품 id → 그 상품을 파는 가맹점 id.
 *
 * **한 번에 묶어 묻는다.** 이벤트는 최대 스무 개씩 오는데 하나씩 물으면
 * 수집 창구가 화면보다 느려진다 — 이 창구는 사람이 기다리는 자리는 아니지만,
 * 느려지면 브라우저가 떠날 때 보내는 것부터 잘린다.
 *
 * 못 찾은 상품은 지도에 없다 — 부르는 쪽이 null 로 둔다. 지워진 상품이나
 * 가맹점 없는 자체 상품이 그렇다.
 */
export async function merchantOfProducts(
  productIds: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const rows = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { id: true, brand: { select: { merchantId: true } } },
  });

  return new Map(rows.map((r) => [r.id, r.brand.merchantId]));
}
