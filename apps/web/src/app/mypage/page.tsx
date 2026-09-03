import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, ORDER_STATUS_LABEL, MEMBER_GRADE_LABEL, GRADE_REWARD_PERCENT,
} from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { getMyPageSummary, getMyOrders, TRACKED_STATUSES } from '~/lib/queries/mypage';

export const metadata: Metadata = { title: '마이페이지' };
export const dynamic = 'force-dynamic';

export default async function MyPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage');

  const [summary, recent] = await Promise.all([
    getMyPageSummary(session.id),
    getMyOrders(session.id, undefined, 1),
  ]);
  if (!summary) redirect('/login');

  const { gradeProgress: gp } = summary;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-5 text-xl font-semibold tracking-tight md:text-2xl">마이페이지</h1>

      <section aria-labelledby="profile-title" className="flex flex-col gap-4">
        <h2 id="profile-title" className="sr-only">내 정보</h2>
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-lg"
          >
            {summary.name.slice(0, 1)}
          </span>
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="flex items-center gap-2">
              <span className="text-[17px] font-semibold">{summary.name}</span>
              <Badge tone="new">{MEMBER_GRADE_LABEL[summary.grade]}</Badge>
            </p>
            <p className="text-xs text-[var(--fg-muted)]">{summary.email}</p>
          </div>
        </div>

        <div className="rounded-sm border border-[var(--border)] p-4">
          {gp.next ? (
            <>
              <p className="mb-2 flex items-baseline justify-between text-[13px]">
                <span className="text-[var(--fg-secondary)]">
                  {MEMBER_GRADE_LABEL[gp.next]}까지{' '}
                  <strong className="tnum font-semibold text-[var(--fg)]">
                    {format(gp.remaining)}원
                  </strong>
                </span>
                <span className="tnum text-[11px] text-[var(--fg-muted)]">{gp.percent}%</span>
              </p>
              <div
                role="progressbar"
                aria-valuenow={gp.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${MEMBER_GRADE_LABEL[gp.next]} 등급까지 진행률`}
                className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
              >
                <span className="block h-full bg-n-900" style={{ width: `${gp.percent}%` }} />
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[var(--fg-secondary)]">최고 등급입니다.</p>
          )}
          <p className="mt-2.5 text-[11px] text-[var(--fg-muted)]">
            구매확정 금액 기준 · 현재 적립률 <span className="tnum">{GRADE_REWARD_PERCENT[summary.grade]}%</span>
          </p>
        </div>

        <ul className="grid grid-cols-3 rounded-sm border border-[var(--border)]">
          <li>
            <Link href="/mypage/points" className="flex h-[68px] flex-col items-center justify-center gap-1 no-underline">
              <span className="tnum text-[17px] font-semibold text-[var(--fg)]">{format(summary.pointBalance)}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">포인트</span>
            </Link>
          </li>
          <li className="border-l border-[var(--border)]">
            <span className="flex h-[68px] flex-col items-center justify-center gap-1">
              <span className="tnum text-[17px] font-semibold">{summary.couponCount}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">쿠폰</span>
            </span>
          </li>
          <li className="border-l border-[var(--border)]">
            {/* 숫자만 보여 주고 갈 곳이 없으면 막다른 길이 된다 */}
            <Link
              href="/mypage/wishlist"
              className="flex h-[68px] flex-col items-center justify-center gap-1 text-[var(--fg)] no-underline"
            >
              <span className="tnum text-[17px] font-semibold">{summary.wishlistCount}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">찜</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="status-title" className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="status-title" className="text-[15px] font-semibold">주문 처리 현황</h2>
          <Link href="/mypage/orders" className="text-xs text-[var(--fg-secondary)]">전체 주문내역</Link>
        </div>
        <ol className="grid grid-cols-5">
          {TRACKED_STATUSES.map((s) => {
            const count = summary.statusCounts[s];
            return (
              <li key={s}>
                <Link
                  href={`/mypage/orders?status=${s}`}
                  className="flex flex-col items-center gap-1.5 py-1 no-underline"
                >
                  <span
                    className={`tnum text-[19px] font-semibold ${count === 0 ? 'text-n-300' : 'text-[var(--fg)]'}`}
                  >
                    {count}
                  </span>
                  <span className="text-center text-[10px] text-[var(--fg-muted)]">
                    {ORDER_STATUS_LABEL[s]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {recent[0] && (
        <section aria-labelledby="recent-title" className="mt-10">
          <h2 id="recent-title" className="mb-4 text-[15px] font-semibold">최근 주문</h2>
          <article className="rounded-sm border border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2">
                <Badge tone={recent[0].status === 'CANCELLED' || recent[0].status === 'REFUNDED' ? 'neutral' : 'info'}>
                  {ORDER_STATUS_LABEL[recent[0].status]}
                </Badge>
                <span className="tnum text-[11px] text-[var(--fg-muted)]">
                  {recent[0].placedAt.toLocaleDateString('ko-KR')}
                </span>
              </p>
              <Link href={`/order/${recent[0].orderNo}`} className="text-xs text-[var(--fg-secondary)]">
                상세 보기
              </Link>
            </div>
            <p className="text-[13px]">
              {recent[0].firstItemName}
              {recent[0].itemCount > 1 && (
                <span className="text-[var(--fg-muted)]"> 외 <span className="tnum">{recent[0].itemCount - 1}</span>건</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-[var(--fg-muted)]">{recent[0].firstItemOption}</p>
            <p className="tnum mt-2 text-sm font-semibold">{format(recent[0].payable)}원</p>
          </article>
        </section>
      )}

      <nav aria-label="마이페이지 메뉴" className="mt-10 border-t border-[var(--border)]">
        <ul>
          {(
            [
              { href: '/mypage/orders', label: '주문 내역' },
              { href: '/mypage/wishlist', label: '찜한 상품' },
              { href: '/mypage/points', label: '포인트 내역' },
            ] as const
          ).map((m) => (
            <li key={m.href} className="border-b border-[var(--border)]">
              <Link
                href={m.href}
                className="flex min-h-13 items-center justify-between px-1 text-sm no-underline"
              >
                <span>{m.label}</span>
                <span aria-hidden="true" className="text-[var(--fg-muted)]">›</span>
              </Link>
            </li>
          ))}
          <li className="border-b border-[var(--border)]">
            <Link
              href="/mypage/reviews"
              className="flex min-h-13 items-center justify-between px-1 text-sm text-[var(--fg)] no-underline"
            >
              <span>리뷰 쓰기</span>
              <span className="flex items-center gap-2">
                {summary.reviewableCount > 0 && (
                  <span className="tnum text-xs font-semibold text-accent">
                    작성 가능 {summary.reviewableCount}
                  </span>
                )}
                <span aria-hidden="true" className="text-[var(--fg-muted)]">›</span>
              </span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
