import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@shop/ui';
import { format, formatWithUnit, hasPermission, won, ORDER_STATUS_LABEL, USER_ROLE_LABEL } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { actionLabel } from '~/lib/admin/audit-labels';
import { getAdminUserDetail } from '~/lib/queries/admin/users';
import { GRADE_KEY } from '~/lib/i18n/enum-labels';
import { getT } from '~/lib/i18n/server';
import { SuspendForm } from '../suspend-form';
import { suspendBlocked } from '../suspend-blocked';

export const metadata: Metadata = { title: '회원 상세' };
export const dynamic = 'force-dynamic';

const dayFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
});

/** 가입 방식의 이름. better-auth 의 providerId 를 사람이 읽는 말로 */
const SIGN_IN_LABEL: Readonly<Record<string, string>> = { credential: '이메일·비밀번호', google: '구글' };

/**
 * 회원 상세.
 *
 * 문의를 받은 운영자가 한 사람을 맞춰 보는 자리다 — 누구인지, 막혀 있는지, 무엇을 샀는지, 포인트가 어떤지, 운영진이 이
 * 사람에게 무엇을 했는지. 긴 목록은 각자의 화면(주문·포인트)이 갖고, 여기는 요약과 거기로 가는 길을 둔다.
 *
 * **막힌 상태를 맨 위에 둔다.** 정지·탈퇴를 모르고 주문을 들여다보면 "왜 결제가 안 되냐" 에 엉뚱한 답을 한다.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin('user:read');
  const { id } = await params;
  const [user, t] = await Promise.all([getAdminUserDetail(actor, id), getT()]);
  if (!user) notFound();

  const canSuspend = hasPermission(actor, 'user:write');
  const canAdjust = hasPermission(actor, 'point:adjust') && user.closedAt === null;

  const profile: [string, React.ReactNode][] = [
    ['이메일', <>{user.email}{!user.emailVerified && <span className="ml-1.5 text-[11px] text-warning">미인증</span>}</>],
    ['연락처', user.phone ?? '—'],
    ['권한', USER_ROLE_LABEL[user.role]],
    ['소속 가맹점', user.merchantName ?? '—'],
    ['로그인 방식', user.signInMethods.length ? user.signInMethods.map((m) => SIGN_IN_LABEL[m] ?? m).join(', ') : '—'],
    ['가입', <time key="joined" dateTime={user.createdAt.toISOString()}>{dayFormat.format(user.createdAt)}</time>],
  ];

  const activity: [string, number, string | undefined][] = [
    ['주문', user.counts.orders, undefined],
    ['리뷰', user.counts.reviews, undefined],
    ['문의', user.counts.inquiries, user.counts.inquiriesWaiting > 0 ? `답변 대기 ${user.counts.inquiriesWaiting}` : undefined],
    ['쓸 수 있는 쿠폰', user.counts.coupons, undefined],
    ['찜', user.counts.wishlist, undefined],
  ];

  const card = 'flex h-fit flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-7';

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <nav aria-label="현재 위치">
          <ol className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--fg-muted)]">
            <li>
              <Link href="/admin/users" className="no-underline hover:underline">회원</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">{user.name}</h1>
            </li>
          </ol>
        </nav>
        <Badge tone="neutral">{USER_ROLE_LABEL[user.role]}</Badge>
        {user.suspendedAt && <Badge tone="danger">정지됨</Badge>}
        {user.closedAt && <Badge tone="neutral">탈퇴</Badge>}
      </header>

      <div className="flex flex-col gap-6 p-4 sm:p-8">
        {(user.suspendedAt || user.closedAt) && (
          <p className="rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-hover">
            {user.closedAt ? (
              <>
                <time dateTime={user.closedAt.toISOString()}>{dayFormat.format(user.closedAt)}</time>에 탈퇴한
                계정입니다. 주문 기록만 남아 있습니다.
              </>
            ) : (
              <>
                <time dateTime={user.suspendedAt!.toISOString()}>{dayFormat.format(user.suspendedAt!)}</time>부터 이용이
                정지된 계정입니다 — 로그인과 주문이 막혀 있습니다. 사유: {user.suspendedReason ?? '—'}
              </>
            )}
          </p>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div className="flex flex-col gap-6">
            <section aria-labelledby="user-profile" className={card}>
              <h2 id="user-profile" className="text-[15px] font-semibold tracking-tight">기본 정보</h2>
              <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13px]">
                {profile.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-[var(--fg-muted)]">{label}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="user-orders" className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="user-orders" className="text-[15px] font-semibold tracking-tight">최근 주문</h2>
                <p className="text-[13px] text-[var(--fg-secondary)]">
                  구매확정 누적 <span className="tnum font-semibold text-[var(--fg)]">{formatWithUnit(won(user.totalSpent))}</span>
                  {' · '}등급 <span className="font-semibold text-[var(--fg)]">{t(GRADE_KEY[user.grade])}</span>
                </p>
              </div>
              {user.recentOrders.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--fg-muted)]">주문이 없습니다.</p>
              ) : (
                <div className="table-scroll" tabIndex={0} role="region" aria-label="최근 주문 목록">
                  <table>
                    <caption className="sr-only">최근 주문 {user.recentOrders.length}건, 최신순</caption>
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th scope="col" className="px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">주문번호</th>
                        <th scope="col" className="w-28 px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">주문일</th>
                        <th scope="col" className="w-24 px-3 py-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                        <th scope="col" className="w-28 px-3 py-2.5 text-right text-xs text-[var(--fg-secondary)]">결제액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.recentOrders.map((o) => (
                        <tr key={o.orderNo} className="border-b border-[var(--surface-2)] last:border-0">
                          <th scope="row" className="px-3 py-2.5 text-left font-normal">
                            <Link href={`/admin/orders/${o.orderNo}`} className="tnum text-[13px] text-[var(--fg)] underline-offset-2 hover:underline">
                              {o.orderNo}
                            </Link>
                            <span className="block text-[11px] text-[var(--fg-muted)]">상품 {o.itemCount}줄</span>
                          </th>
                          <td className="tnum px-3 py-2.5 text-[12px] text-[var(--fg-secondary)]">
                            <time dateTime={o.placedAt.toISOString()}>{dayFormat.format(o.placedAt)}</time>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge tone="neutral">{ORDER_STATUS_LABEL[o.status]}</Badge>
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-[13px]">{format(won(o.payable))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {user.counts.orders > user.recentOrders.length && (
                <p className="text-[12px] text-[var(--fg-muted)]">
                  전체 {user.counts.orders}건 중 최근 {user.recentOrders.length}건입니다.
                </p>
              )}
            </section>

            <section aria-labelledby="user-audit" className={card}>
              <h2 id="user-audit" className="text-[15px] font-semibold tracking-tight">운영 기록</h2>
              <p className="-mt-2 text-[12px] text-[var(--fg-muted)]">운영진이 이 회원에게 한 일 — 정지·권한·포인트 조정</p>
              {user.audit.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--fg-muted)]">기록이 없습니다.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-[var(--surface-2)] text-[13px]">
                  {user.audit.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                      <span>
                        {actionLabel(a.action)}
                        <span className="ml-2 text-[12px] text-[var(--fg-muted)]">{a.actorName}</span>
                      </span>
                      <time dateTime={a.createdAt.toISOString()} className="tnum text-[12px] text-[var(--fg-muted)]">
                        {timeFormat.format(a.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="user-points" className={card}>
              <h2 id="user-points" className="text-[15px] font-semibold tracking-tight">포인트</h2>
              <p className="tnum text-2xl font-semibold">{user.pointBalance.toLocaleString('ko-KR')}P</p>
              <Link
                href={`/admin/users/${user.id}/points`}
                className="text-[13px] text-[var(--fg)] underline underline-offset-2"
              >
                {canAdjust ? '포인트 내역 · 지급 · 차감' : '포인트 내역'}
              </Link>
            </section>

            <section aria-labelledby="user-activity" className={card}>
              <h2 id="user-activity" className="text-[15px] font-semibold tracking-tight">활동</h2>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[13px]">
                {activity.map(([label, count, note]) => (
                  <div key={label} className="contents">
                    <dt className="text-[var(--fg-muted)]">{label}</dt>
                    <dd className="tnum text-right">
                      {count}
                      {note && <span className="ml-1.5 text-[11px] text-accent">{note}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {canSuspend && (
              <section aria-labelledby="user-suspension" className={card}>
                <h2 id="user-suspension" className="text-[15px] font-semibold tracking-tight">이용 정지</h2>
                <SuspendForm
                  userId={user.id}
                  userName={user.name}
                  suspendedAt={user.suspendedAt?.toISOString() ?? null}
                  suspendedReason={user.suspendedReason}
                  disabledReason={suspendBlocked(actor, { id: user.id, role: user.role, closedAt: user.closedAt })}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
