import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@shop/db';
import { getSessionUser } from '@shop/auth/session';
import { CouponWallet } from '~/components/coupon-wallet';

export const metadata: Metadata = { title: '쿠폰함' };
export const dynamic = 'force-dynamic';

/**
 * 쿠폰함을 읽는다.
 *
 * **만료 판정을 여기서 한다.** 클라이언트가 렌더 중에 시각을 재면 서버와
 * 다른 값을 봐서 만료 표시가 깜빡이며 바뀐다. 컴포넌트 밖으로 뺀 이유는
 * 그것 말고도 하나 더 있다 — 렌더 함수 안에서 Date.now() 를 부르는 것은
 * 서버 컴포넌트라도 규칙상 순수하지 않은 호출이라, 자리를 옮기는 편이
 * 규칙을 끄는 것보다 낫다.
 */
async function loadWallet(userId: string) {
  const rows = await prisma.userCoupon.findMany({
    where: { userId },
    // 쓸 수 있는 것이 먼저, 그다음 곧 만료되는 순서
    orderBy: [{ usedAt: 'asc' }, { expiresAt: 'asc' }],
    select: {
      id: true, usedAt: true, expiresAt: true,
      coupon: {
        select: {
          code: true, name: true, kind: true, value: true,
          percent: true, maxDiscount: true, minimumOrder: true,
        },
      },
    },
  });

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    usedAt: r.usedAt,
    expiresAt: r.expiresAt,
    expired: r.usedAt === null && r.expiresAt.getTime() < now,
    ...r.coupon,
  }));
}

export default async function CouponsPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/coupons');

  const coupons = await loadWallet(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-1 text-xl font-semibold tracking-tight md:text-2xl">쿠폰함</h1>
      <p className="pb-6 text-[13px] text-[var(--fg-secondary)]">
        주문서에서 쓸 쿠폰을 고를 수 있습니다.
      </p>
      <CouponWallet initial={coupons} />
    </div>
  );
}
