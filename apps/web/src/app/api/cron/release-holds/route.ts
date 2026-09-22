import { cronRoute } from '~/lib/cron';
import { releaseAbandonedHolds } from '~/lib/orders/release-holds';
import { revalidateCatalog } from '~/lib/cache';

/**
 * 결제 대기 주문의 재고를 푸는 배치. 매일 KST 06:00 (UTC 21:00 전날) 에 돈다.
 *
 * 없으면 결제하지 않고 떠난 주문이 **재고를 영영 물고 있는다.** 실제로
 * 그랬다 — 닷새 된 주문 셋이 코트 둘과 니트 하나를 잡고 있었다.
 *
 * **하루에 한 번은 사실 느리다.** 기한은 30분인데 배치가 하루 한 번이면
 * 최악의 경우 재고가 하루 가까이 묶인다. Vercel 무료 요금제가 크론을 하루
 * 한 번으로 제한해서 나머지와 맞춘 것이고, 요금제가 허락하면
 * vercel.json 의 schedule 만 `0 * * * *` 로 바꾸면 된다 — 배치 자체는 몇
 * 번을 돌려도 안전하다.
 */
export const GET = cronRoute('order.releaseHold', async () => {
  const result = await releaseAbandonedHolds();

  // 재고가 늘었다 — 품절로 보이던 것이 다시 보여야 한다
  if (result.released > 0) revalidateCatalog();

  return {
    body: result,
    audits: result.released > 0
      ? [{
          action: 'order.releaseHold',
          targetType: 'order' as const,
          targetId: `${result.released}건`,
          after: { released: result.released, orderNos: result.orderNos },
        }]
      : [],
  };
});
