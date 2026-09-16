import 'server-only';
import { prisma } from '@shop/db';
import { shortenReason } from '@shop/core';
import { recordNotifications, type NoticeInput } from './record';

/**
 * 검수 결과를 상품을 올린 쪽에 알린다.
 *
 * **사유는 이미 받고 있었는데 닿지 않았다.** reviewProduct 는 사유 없는 반려를
 * 막고(REJECT_REASON_REQUIRED) 그 글을 상품 행에 적어 둔다. 적어 두기만 했다 —
 * 가맹점은 자기 상품을 다시 열어 봐야 그것을 본다. 검수는 며칠 걸리는 일이라
 * 다시 열어 볼 이유가 없고, 그래서 사유를 쓰게 한 뜻("무엇을 고쳐야 할지
 * 알려 준다")이 그대로 서랍에 남았다.
 *
 * **승인도 알린다.** 올린 사람이 기다리는 것은 "되는가 안 되는가" 이지 반려만이
 * 아니다. 승인을 안 알리면 며칠째 대기줄에 있는 줄 알고 다시 들어와 확인한다.
 *
 * 재고 부족 알림과 같은 규칙으로 던지지 않는다 — 부르는 자리에서는 검수가 이미
 * 끝나 있고, 알림을 못 남겼다고 그것을 무를 수는 없다.
 */
export async function notifyProductReviewed(input: {
  readonly productId: string;
  readonly productName: string;
  readonly approved: boolean;
  /** 반려 사유. 승인일 때는 빈 문자열 */
  readonly reason: string;
}): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { brand: { select: { merchantId: true } } },
    });

    /*
     * 가맹점 없는 상품(자사 상품)은 알릴 곳이 없다. 운영진이 올리고 운영진이
     * 검수한 것이라, 스스로에게 보내는 알림이 된다.
     */
    const merchantId = product?.brand.merchantId;
    if (!merchantId) return;

    const staff = await prisma.user.findMany({
      where: { merchantId, role: 'MERCHANT' },
      select: { id: true },
    });
    if (staff.length === 0) return;

    // 눌렀을 때 곧바로 고칠 수 있는 자리로 간다 — 사유 전문도 거기 있다
    const linkPath = `/admin/products/${input.productId}`;

    /*
     * **두 갈래를 각각 또렷이 적는다.** `kind` 만 삼항으로 고르고 `params` 를
     * 바깥에서 갈랐더니, 종류마다 싣는 값이 맞는지 보는 검사가 이 자리를 아예
     * 읽지 못했다(그 검사는 `kind:` 줄 뒤의 `params: {` 를 찾는다). 검사를
     * 늘리는 대신 읽히게 쓴다 — 어느 종류에 무엇이 실리는지도 이쪽이 낫다.
     *
     * 돌려주는 타입을 적는 이유는 따로 있다: 안 적으면 오타 난 칸이 조용히
     * 통과한다(쿠폰 알림이 그렇게 갈 곳을 잃었다).
     */
    await recordNotifications(
      staff.map((person): NoticeInput =>
        input.approved
          ? {
              userId: person.id,
              kind: 'PRODUCT_APPROVED',
              params: { productName: input.productName },
              linkPath,
            }
          : {
              userId: person.id,
              kind: 'PRODUCT_REJECTED',
              params: { productName: input.productName, reason: shortenReason(input.reason) },
              linkPath,
            },
      ),
    );
  } catch (error) {
    console.error('[notification] 검수 결과 알림을 못 만들었다', input.productId, error);
  }
}
