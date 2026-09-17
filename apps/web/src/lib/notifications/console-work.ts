import 'server-only';
import { prisma } from '@shop/db';
import { inquiryAudience, operatorRolesWith, returnAudience, type Permission, type ReturnAudience } from '@shop/core';
import { recordNotifications, type NoticeInput } from './record';

/**
 * 처리할 일을 운영 알림함에 알린다 — 반품·교환 신청, 상품 문의, 고객센터 문의, 입점 신청.
 *
 * **운영 알림함에 처리할 일이 오지 않았다.** 가맹점에게 가는 소식(재고·검수·정산)뿐이라, 손님이 반품을 신청하거나
 * 문의를 남기거나 새 가맹점이 신청해도 누군가 목록을 열어 보기 전까지 아무도 몰랐다.
 *
 * 받는 사람은 **그 일을 처리할 수 있는 사람**이다(core console-audience). 가맹점은 승인된 가맹점의 계정만, 운영진은
 * 그 권한을 가진 역할만(core operatorRolesWith). 정지된 계정에는 보내지 않는다 — 볼 수 없는 알림함이다.
 *
 * **실패해도 던지지 않는다.** 신청·문의는 이미 들어왔다. 알림을 못 남겼다고 그것을 무를 수는 없다(record 와 같은 규칙).
 */

async function recipients(audience: ReturnAudience, permission: Permission): Promise<string[]> {
  const people = await prisma.user.findMany({
    where: {
      suspendedAt: null,
      OR: [
        ...(audience.merchantIds.length > 0
          ? [{ role: 'MERCHANT' as const, merchantId: { in: [...audience.merchantIds] }, merchant: { status: 'APPROVED' as const } }]
          : []),
        ...(audience.operators ? [{ role: { in: operatorRolesWith(permission) } }] : []),
      ],
    },
    select: { id: true },
  });
  return people.map((p) => p.id);
}

/** 반품·교환 신청이 들어왔다. 신청한 줄의 판매처로 받는 사람을 가른다 */
export async function notifyReturnRequested(input: { orderNo: string; itemIds: readonly string[] }): Promise<void> {
  try {
    const lines = await prisma.orderItem.findMany({
      where: { order: { orderNo: input.orderNo }, id: { in: [...input.itemIds] } },
      select: { merchantId: true },
    });
    const audience = returnAudience(lines.map((l) => l.merchantId));
    const userIds = await recipients(audience, 'return:resolve');
    await recordNotifications(userIds.map((userId): NoticeInput => ({
      userId,
      kind: 'RETURN_REQUESTED',
      params: { orderNo: input.orderNo },
      // 누르면 곧바로 승인·반려할 수 있는 자리로 간다
      linkPath: `/admin/orders/${encodeURIComponent(input.orderNo)}`,
    })));
  } catch (error) {
    console.error('[notification] 반품 신청 알림을 못 만들었다', { orderNo: input.orderNo }, error);
  }
}

/** 문의가 들어왔다. 상품 문의는 그 판매처(자사 상품이면 운영진), 고객센터 문의는 운영진이 듣는다 */
export async function notifyInquiryReceived(inquiryId: string): Promise<void> {
  try {
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { product: { select: { name: true, brand: { select: { merchantId: true } } } } },
    });
    if (!inquiry) return;

    if (inquiry.product) {
      const product = inquiry.product;
      const userIds = await recipients(inquiryAudience(product.brand.merchantId), 'inquiry:answer');
      await recordNotifications(userIds.map((userId): NoticeInput => ({
        userId,
        kind: 'INQUIRY_RECEIVED',
        params: { productName: product.name },
        // 답변 대기 줄이 가장 오래된 것부터 뜨는 자리다
        linkPath: '/admin/inquiries',
      })));
      return;
    }

    const userIds = await recipients({ merchantIds: [], operators: true }, 'inquiry:answer');
    await recordNotifications(userIds.map((userId): NoticeInput => ({
      userId,
      kind: 'SUPPORT_INQUIRY_RECEIVED',
      params: {},
      linkPath: '/admin/inquiries',
    })));
  } catch (error) {
    console.error('[notification] 문의 알림을 못 만들었다', { inquiryId }, error);
  }
}

/** 입점 신청이 들어왔다. 승인할 수 있는 사람(merchant:approve)만 듣는다 */
export async function notifyMerchantApplied(input: { merchantName: string }): Promise<void> {
  try {
    const userIds = await recipients({ merchantIds: [], operators: true }, 'merchant:approve');
    await recordNotifications(userIds.map((userId): NoticeInput => ({
      userId,
      kind: 'MERCHANT_APPLIED',
      params: { merchantName: input.merchantName },
      linkPath: '/admin/merchants',
    })));
  } catch (error) {
    console.error('[notification] 입점 신청 알림을 못 만들었다', error);
  }
}
