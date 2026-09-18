import 'server-only';
import { prisma } from '@shop/db';
import { shortenReason, type MerchantStatus } from '@shop/core';
import { recordNotifications, type NoticeInput } from './record';

/**
 * 입점 심사 결과를 신청한 사람에게 알린다.
 *
 * **사유는 진작 받고 있었는데 감사 로그에만 남았다.** 상태를 바꾸는 계약은 승인이
 * 아닌 처분에 사유를 강제하는데(불이익을 주는 처분에는 이유를 남긴다), 그 글이
 * 신청한 사람에게는 한 번도 가지 않았다. 승인도 마찬가지다 — 계정과 브랜드까지
 * 만들어 놓고 아무 말도 안 해서, 신청자는 로그인해 보고서야 알았다.
 *
 * **매장 알림함으로 간다.** 반려된 사람에게는 운영 화면이 아예 없고, 승인된 사람도
 * 신청은 매장에서 했다 — 결과를 보러 갈 자리가 거기다. 정지·해지도 같다: 그 순간 콘솔이 닫히므로
 * 운영 알림함에 넣으면 아무도 못 읽는다.
 *
 * **정지·해지는 그 가게의 계정들도 함께 듣는다.** 신청한 사람이 아직 그 가게에 있다는 보장이 없고,
 * 운영진이 직접 만든 가맹점에는 신청자가 아예 없다 — 그러면 멈췄다는 말을 들을 사람이 하나도 없다.
 *
 * 재고 부족·검수 결과와 같은 규칙으로 던지지 않는다. 부르는 자리에서는 처분이 이미
 * 끝났고, 알림을 못 남겼다고 그것을 무를 수는 없다.
 */
export async function notifyMerchantDecision(input: {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly status: MerchantStatus;
  /** 처분 사유. 승인일 때는 빈 문자열 */
  readonly reason: string;
}): Promise<void> {
  if (input.status === 'PENDING') return;

  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: { applicantId: true },
    });

    const applicantId = merchant?.applicantId ?? null;

    if (input.status === 'SUSPENDED' || input.status === 'TERMINATED') {
      // 그 가게의 계정들 + 신청한 사람. 정지된 계정에는 보내지 않는다 — 볼 수 없는 알림함이다
      const people = await prisma.user.findMany({
        where: { suspendedAt: null, OR: [{ merchantId: input.merchantId }, ...(applicantId ? [{ id: applicantId }] : [])] },
        select: { id: true },
      });
      const userIds = [...new Set(people.map((p) => p.id))];
      await recordNotifications(userIds.map((userId): NoticeInput => ({
        userId,
        kind: input.status === 'SUSPENDED' ? 'MERCHANT_SUSPENDED' : 'MERCHANT_TERMINATED',
        // 까닭과 다음에 할 일이 적힌 자리로 간다 — 그 사람들에게는 이제 콘솔이 없다
        params: { merchantName: input.merchantName, reason: shortenReason(input.reason) },
        linkPath: '/merchant/suspended',
      })));
      return;
    }

    /*
     * 운영진이 직접 만든 가맹점에는 신청자가 없다. 알릴 사람이 없는 것이지
     * 빠뜨린 것이 아니다 — 승인 시 계정을 만드는 코드도 같은 곳에서 갈린다.
     */
    if (!applicantId) return;

    // 눌렀을 때 신청 상태를 볼 수 있는 자리로 간다
    const linkPath = '/merchant/apply';

    await recordNotifications([
      input.status === 'APPROVED'
        ? {
            userId: applicantId,
            kind: 'MERCHANT_APPROVED',
            params: { merchantName: input.merchantName },
            linkPath,
          }
        : {
            userId: applicantId,
            kind: 'MERCHANT_REJECTED',
            params: { merchantName: input.merchantName, reason: shortenReason(input.reason) },
            linkPath,
          },
    ] satisfies readonly NoticeInput[]);
  } catch (error) {
    console.error('[notification] 입점 심사 결과 알림을 못 만들었다', input.merchantId, error);
  }
}
