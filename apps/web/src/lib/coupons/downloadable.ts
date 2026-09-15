import 'server-only';
import { prisma } from '@shop/db';
import { couponCoversProduct, isDownloadable } from '@shop/core';
import { CouponError, issueCouponToUser, type IssueResult } from '~/lib/admin/manage-coupon';

export interface DownloadableCoupon {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly value: number;
  readonly percent: number;
  readonly maxDiscount: number | null;
  readonly minimumOrder: number;
  readonly endsAt: Date;
  /** 대상이 정해져 있는가 — 목록에 "일부 상품" 으로 적는다 */
  readonly limited: boolean;
  /** 남은 수량. 무제한이면 null */
  readonly remaining: number | null;
  /** 이 사람이 이미 받았는가. 로그인하지 않았으면 false */
  readonly claimed: boolean;
}

/**
 * 받아 갈 수 있는 쿠폰 — 공개했고 지금 발급할 수 있는 것(core isDownloadable).
 *
 * `product` 를 주면 **그 상품에 쓰이는 것만** — 상품 화면의 받기 단추가 이 상품에 못 쓰는 쿠폰을 내밀면 받고 나서 헛걸음한다.
 * 기한이 가까운 것부터 보인다(곧 끝나는 것을 먼저 받게).
 */
export async function listDownloadableCoupons(
  input: { readonly userId?: string | null; readonly product?: { id: string; brandId: string; categoryId: string } } = {},
  now: Date = new Date(),
): Promise<DownloadableCoupon[]> {
  const rows = await prisma.coupon.findMany({
    // 조건의 큰 틀은 조회에서, 수량(발급 수 < 한도)은 같은 행의 두 칸 비교라 아래 판정이 한다
    where: { downloadable: true, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    take: 50,
    select: {
      id: true, name: true, kind: true, value: true, percent: true, maxDiscount: true, minimumOrder: true,
      startsAt: true, endsAt: true, isActive: true, downloadable: true, issueLimit: true, issuedCount: true,
      targets: { select: { targetType: true, targetId: true } },
      ...(input.userId ? { issued: { where: { userId: input.userId }, select: { id: true } } } : {}),
    },
  });

  return rows
    .filter((c) => isDownloadable(c, now))
    .filter((c) => !input.product || couponCoversProduct(c.targets, input.product))
    .map((c) => ({
      id: c.id, name: c.name, kind: c.kind, value: c.value, percent: c.percent, maxDiscount: c.maxDiscount,
      minimumOrder: c.minimumOrder, endsAt: c.endsAt,
      limited: c.targets.length > 0,
      remaining: c.issueLimit === null ? null : Math.max(0, c.issueLimit - c.issuedCount),
      claimed: 'issued' in c && Array.isArray(c.issued) && c.issued.length > 0,
    }));
}

/**
 * 받기 단추로 받는다.
 *
 * **공개한 쿠폰만.** 쿠폰 id 는 화면에 드러나 있어, 이 창구가 공개 여부를 안 보면 코드 입력용·보상용 쿠폰을 id 만 알면
 * 받아 갈 수 있다. 공개 안 한 쿠폰은 없는 쿠폰으로 답한다(있다는 것도 알려 주지 않는다). 수량·중복·기간은 코드 입력과
 * 같은 발급 함수가 조건부로 막는다.
 */
export async function downloadCoupon(couponId: string, userId: string, now: Date = new Date()): Promise<IssueResult> {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId }, select: { downloadable: true } });
  if (!coupon?.downloadable) throw new CouponError('NOT_FOUND', '받을 수 없는 쿠폰입니다.', 404);
  return issueCouponToUser(couponId, userId, now);
}
