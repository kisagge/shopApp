import 'server-only';
import { Prisma, prisma } from '@shop/db';
import { checkRestockEligibility, isOnDisplay, MAX_RESTOCK_SUBSCRIPTIONS } from '@shop/core';
import type { Locale } from '@shop/i18n';
import { restockMail } from '~/lib/mail/notices';
import { getMailWording, type MailWording } from '~/lib/mail/templates';
import { localeOf } from '~/lib/mail/recipient';
import { getMailer } from '@shop/mail';
import { absoluteUrl } from '~/lib/urls';
import { recordNotifications, type NoticeInput } from '~/lib/notifications/record';

/**
 * 재입고 알림.
 *
 * 두 곳으로 나간다 — 원장에 시각을 찍어 마이페이지에서 보여 주고, 메일을
 * 보낸다. 화면에만 남기면 사용자가 다시 들어와야 알 수 있는데, 재입고는
 * 늦게 알면 의미가 없는 종류의 소식이다.
 *
 * 다른 경로를 더할 때는 RestockNotifier 를 하나 더 구현해 넣으면 된다.
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
  /** 받는 사람이 고른 말. 고른 적 없으면 기본 말이 들어온다. */
  readonly locale: Locale;
  readonly productName: string;
  readonly optionLabel: string;
  readonly productSlug: string;
}

export interface RestockNotifier {
  readonly name: string;
  send(notices: readonly RestockNotice[]): Promise<void>;
}

/**
 * 메일로 보낸다.
 *
 * 한 사람이 실패해도 나머지는 보낸다 — 한 통이 반송된다고 같은 배치의
 * 다른 사람들까지 못 받을 이유가 없다. 실패는 로그로만 남긴다. 이 함수를
 * 부르는 자리에서는 이미 알림 발송 표시가 끝나 있어 되돌릴 수도 없다.
 */
const mailNotifier: RestockNotifier = {
  name: 'mail',
  async send(notices) {
    const mailer = getMailer();
    // 말마다 한 번씩 읽는다 — 받는 사람마다 물으면 한 번의 재입고에 수백 번 조회가 나간다
    const wordings = new Map<Locale, MailWording>();
    for (const locale of new Set(notices.map((n) => n.locale))) {
      wordings.set(locale, await getMailWording('RESTOCK', locale));
    }
    const results = await Promise.allSettled(
      notices.map((n) =>
        mailer.send(
          restockMail({
            to: n.email,
            productName: n.productName,
            optionLabel: n.optionLabel,
            url: absoluteUrl(`/product/${n.productSlug}`),
            locale: n.locale,
          }, wordings.get(n.locale)),
        ),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.error(`[restock] 재입고 메일 ${failed}/${notices.length}건 실패`);
    }
  },
};

let notifiers: RestockNotifier[] = [mailNotifier];

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

  /*
   * 매대에 서 있는 상품인지는 core 가 정한다. 여기서 손으로 적어 두었더니
   * 상태를 DRAFT·HIDDEN 만 빼는 모양이 되어 **검수 대기 상품에도 알림을 걸 수 있었다** —
   * 매대에 없는 상품을 두고 "들어오면 알려 드립니다" 를 약속한 셈이다.
   */
  const p = variant.product;
  const productSellable = isOnDisplay({
    deletedAt: p.deletedAt,
    publishedAt: p.publishedAt,
    status: p.status,
    merchantStatus: p.brand.merchant?.status ?? null,
  });

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
    /*
     * 보관한 상품은 부르지 않는다 — 들어가 봐야 없는 상품이다. 알림을 걸어 둔 채 남겨 두므로(표시하지 않는다) 되돌린 뒤
     * 재고가 다시 생기면 그때 간다.
     */
    where: { variantId: { in: [...variantIds] }, notifiedAt: null, variant: { product: { deletedAt: null } } },
    select: {
      id: true,
      userId: true,
      variantId: true,
      user: { select: { email: true, locale: true } },
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
   *
   * **표시는 아직 표시되지 않은 줄에만 건다.** 조건이 없으면 이 함수가 겹쳐 돌 때(두 운영자가 같은 옵션의 재고를
   * 동시에 올리거나, 일괄 재고 업로드와 개별 수정이 엇갈릴 때) 두 실행이 같은 목록을 읽고 **둘 다** 보낸다 —
   * 위에 적은 "여러 번 받는 것보다 낫다" 는 판단이 실제로는 지켜지지 않았다. 소멸 예고 알림은 같은 자리에
   * 진작 조건을 걸고 있다(notifications/expiry-notice).
   *
   * 이긴 줄만 돌려받아 그 사람들에게만 보낸다 — updateMany 는 몇 줄인지만 알려 주므로 **누가** 이겼는지 알 수 없다.
   */
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE restock_notifications
       SET "notifiedAt" = ${now}
     WHERE id IN (${Prisma.join(pending.map((p) => p.id))})
       AND "notifiedAt" IS NULL
    RETURNING id
  `;
  const won = new Set(claimed.map((row) => row.id));
  const mine = pending.filter((p) => won.has(p.id));
  // 다른 실행이 전부 먼저 가져갔다
  if (mine.length === 0) return { notified: 0, variantIds: [] };

  const notices: RestockNotice[] = mine.map((p) => ({
    userId: p.userId,
    email: p.user.email,
    locale: localeOf(p.user.locale),
    productName: p.variant.product.name,
    optionLabel: p.variant.label,
    productSlug: p.variant.product.slug,
  }));

  await Promise.allSettled(notifiers.map((n) => n.send(notices)));

  /*
   * 메일과 **함께** 남긴다. 메일은 놓치기 쉽고 스팸함으로 가기도 한다 —
   * 다시 들어온 사람이 무슨 일이 있었는지 볼 자리가 있어야 한다.
   */
  await recordNotifications(
    // 돌려주는 타입을 적는다 — 안 적으면 오타 난 칸이 조용히 통과한다(쿠폰에서 겪었다)
    notices.map((n): NoticeInput => ({
      userId: n.userId,
      kind: 'RESTOCKED',
      params: { productName: n.productName, optionLabel: n.optionLabel },
      linkPath: `/product/${n.productSlug}`,
    })),
  );

  return {
    notified: mine.length,
    variantIds: [...new Set(mine.map((p) => p.variantId))],
  };
}
