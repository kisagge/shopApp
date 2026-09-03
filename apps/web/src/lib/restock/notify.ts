import 'server-only';
import { prisma } from '@shop/db';
import { checkRestockEligibility, MAX_RESTOCK_SUBSCRIPTIONS } from '@shop/core';

/**
 * 재입고 알림.
 *
 * **바깥으로 보내는 경로는 아직 없다.** 메일·문자 연동이 저장소에 없고,
 * 그걸 지어내는 대신 자리만 만들어 뒀다. 지금은 알림이 생기면 원장에
 * 시각을 찍고 마이페이지에서 보여 준다 — 사용자가 다시 들어왔을 때는
 * 확실히 알 수 있다.
 *
 * 밖으로 보낼 때는 RestockNotifier 를 하나 더 구현해 sinks 에 넣으면 된다.
 * 이벤트 싱크와 같은 구조다.
 */

export class RestockError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'RestockError';
  }
}

/** 알림 한 건이 실제로 나갈 곳 */
export interface RestockNotice {
  readonly userId: string;
  readonly email: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly productSlug: string;
}

export interface RestockNotifier {
  readonly name: string;
  send(notices: readonly RestockNotice[]): Promise<void>;
}

/**
 * 개발용. 무엇이 나갔어야 하는지 로그로 남긴다.
 *
 * 조용히 아무것도 안 하면 "보냈다" 고 착각하게 된다. 밖으로 나가는 경로가
 * 없다는 사실이 로그에 남아야 한다.
 */
const consoleNotifier: RestockNotifier = {
  name: 'console',
  send(notices) {
    for (const n of notices) {
      console.info(
        `[restock] ${n.email} 에게 알림 (미발송 — 발송 연동 없음): ${n.productName} ${n.optionLabel}`,
      );
    }
    return Promise.resolve();
  },
};

let notifiers: RestockNotifier[] = [consoleNotifier];

/** 테스트나 실제 연동에서 갈아 끼운다 */
export function setRestockNotifiers(list: RestockNotifier[]): void {
  notifiers = list;
}

// ── 구독 ──────────────────────────────────────────────────────

export async function subscribeRestock(userId: string, variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      stock: true, isActive: true,
      product: {
        select: {
          status: true, deletedAt: true, publishedAt: true,
          brand: { select: { merchant: { select: { status: true } } } },
        },
      },
    },
  });
  if (!variant) throw new RestockError('NOT_FOUND', '옵션을 찾을 수 없습니다.', 404);

  const p = variant.product;
  const productSellable =
    p.deletedAt === null &&
    p.publishedAt !== null &&
    p.status !== 'DRAFT' &&
    p.status !== 'HIDDEN' &&
    (p.brand.merchant?.status ?? 'APPROVED') === 'APPROVED';

  const eligibility = checkRestockEligibility({
    stock: variant.stock,
    isActive: variant.isActive,
    productSellable,
  });
  if (!eligibility.ok) throw new RestockError(eligibility.code, eligibility.message);

  const count = await prisma.restockNotification.count({
    where: { userId, notifiedAt: null },
  });
  if (count >= MAX_RESTOCK_SUBSCRIPTIONS) {
    throw new RestockError(
      'TOO_MANY',
      `재입고 알림은 ${MAX_RESTOCK_SUBSCRIPTIONS}개까지 신청할 수 있습니다.`,
    );
  }

  /**
   * 이미 있으면 시각만 되돌린다.
   *
   * 한 번 알림을 받은 뒤 다시 품절된 옵션에 또 걸 수 있어야 한다.
   * 유니크가 (userId, variantId) 라 새로 만들 수는 없고, notifiedAt 을
   * 비워 다시 기다리는 상태로 만든다.
   */
  await prisma.restockNotification.upsert({
    where: { userId_variantId: { userId, variantId } },
    update: { notifiedAt: null },
    create: { userId, variantId },
  });
}

export async function unsubscribeRestock(userId: string, variantId: string): Promise<void> {
  // 없어도 오류가 아니다. 지우려는 상태가 이미 그 상태다.
  await prisma.restockNotification.deleteMany({ where: { userId, variantId } });
}

// ── 발송 ──────────────────────────────────────────────────────

export interface NotifyResult {
  readonly notified: number;
  readonly variantIds: readonly string[];
}

/**
 * 재입고된 옵션들의 대기자에게 알린다.
 *
 * **재고를 바꾸는 트랜잭션 밖에서 부른다.** 알림이 실패했다고 재고 수정이
 * 되돌아가면 안 된다 — 재고는 팔기 위한 값이고 알림은 곁다리다.
 *
 * 한 번 알리면 끝이다. 다시 품절됐을 때 또 받으려면 다시 신청해야 한다.
 * 계속 걸어 두면 재고가 들락날락할 때마다 같은 사람에게 반복해서 간다.
 */
export async function notifyRestocked(variantIds: readonly string[]): Promise<NotifyResult> {
  if (variantIds.length === 0) return { notified: 0, variantIds: [] };

  const pending = await prisma.restockNotification.findMany({
    where: { variantId: { in: [...variantIds] }, notifiedAt: null },
    select: {
      id: true,
      userId: true,
      variantId: true,
      user: { select: { email: true } },
      variant: {
        select: { label: true, product: { select: { name: true, slug: true } } },
      },
    },
  });
  if (pending.length === 0) return { notified: 0, variantIds: [] };

  const now = new Date();

  /**
   * 먼저 표시하고 나중에 보낸다.
   *
   * 반대로 하면 보내고 나서 표시가 실패했을 때 다음 실행이 같은 사람에게
   * 또 보낸다. 표시가 먼저면 최악의 경우 알림 하나를 못 받는데,
   * 같은 알림을 여러 번 받는 것보다 낫다.
   */
  await prisma.restockNotification.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { notifiedAt: now },
  });

  const notices: RestockNotice[] = pending.map((p) => ({
    userId: p.userId,
    email: p.user.email,
    productName: p.variant.product.name,
    optionLabel: p.variant.label,
    productSlug: p.variant.product.slug,
  }));

  await Promise.allSettled(notifiers.map((n) => n.send(notices)));

  return {
    notified: pending.length,
    variantIds: [...new Set(pending.map((p) => p.variantId))],
  };
}
