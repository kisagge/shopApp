import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPermission } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminPointAccount } from '~/lib/queries/admin/points';
import { POINT_REASON_KEY } from '~/lib/i18n/enum-labels';
import { getT } from '~/lib/i18n/server';
import { PointAdjustForm } from '~/components/admin/point-adjust-form';
import { adminDate, adminTimestamp } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '회원 포인트' };
export const dynamic = 'force-dynamic';

const points = (n: number) => `${n.toLocaleString('ko-KR')}P`;

/**
 * 한 회원의 적립금 — 잔액, 최근 원장, 수동 지급·차감.
 *
 * 원장을 조정 폼 **곁에** 둔다. 이미 보상을 받았는지, 반품으로 회수됐는지 보지 않고 주면 두 번 준다.
 */
export default async function AdminUserPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin('user:read');
  const { id } = await params;
  const [account, t] = await Promise.all([getAdminPointAccount(actor, id), getT()]);
  if (!account) notFound();

  const canAdjust = hasPermission(actor, 'point:adjust') && account.closedAt === null;

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
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">{account.name} 포인트</h1>
            </li>
          </ol>
        </nav>
      </header>

      <div className="grid gap-6 p-4 sm:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section aria-labelledby="point-ledger" className="flex h-fit flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="point-ledger" className="text-[15px] font-semibold tracking-tight">최근 내역</h2>
            <p className="text-[13px] text-[var(--fg-secondary)]">
              {account.email}
              {account.closedAt && <span className="ml-2 text-[var(--fg-muted)]">· 탈퇴한 계정</span>}
            </p>
          </div>
          <p className="text-[13px]">
            잔액 <span className="tnum text-2xl font-semibold">{points(account.balance)}</span>
          </p>

          {account.ledger.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[var(--fg-muted)]">오간 포인트가 없습니다.</p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="포인트 내역">
              <table>
                <caption className="sr-only">최근 포인트 내역, 최신순</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="w-40 px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">때</th>
                    <th scope="col" className="px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">내용</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-right text-xs text-[var(--fg-secondary)]">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {account.ledger.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--surface-2)] align-top last:border-0">
                      <td className="tnum px-3 py-2.5 text-[12px] text-[var(--fg-muted)]">
                        <time dateTime={row.createdAt.toISOString()}>{adminTimestamp.format(row.createdAt)}</time>
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">
                        {t(POINT_REASON_KEY[row.reason])}
                        {row.note && <span className="block text-[11px] text-[var(--fg-muted)]">{row.note}</span>}
                        {row.amount > 0 && row.expiresAt && (
                          <span className="block text-[11px] text-[var(--fg-muted)]">
                            <time dateTime={row.expiresAt.toISOString()}>{adminDate.format(row.expiresAt)}</time> 소멸 예정
                          </span>
                        )}
                      </td>
                      {/* 색으로만 방향을 말하지 않는다 — 부호를 붙인다 */}
                      <td className={`tnum px-3 py-2.5 text-right text-[13px] font-semibold ${row.amount < 0 ? 'text-accent' : ''}`}>
                        {row.amount > 0 ? '+' : '−'}{points(Math.abs(row.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="포인트 조정" className="h-fit rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-7">
          {canAdjust ? (
            <PointAdjustForm userId={account.id} userName={account.name} balance={account.balance} />
          ) : (
            <p className="text-[13px] text-[var(--fg-muted)]">
              {account.closedAt ? '탈퇴한 계정의 포인트는 조정할 수 없습니다.' : '포인트를 조정할 권한이 없습니다.'}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
