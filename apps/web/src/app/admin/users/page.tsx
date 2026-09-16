import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@shop/ui';
import { hasPermission, USER_ROLE_LABEL, type UserRole } from '@shop/core';
import type { UserRoleInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminUsers, getApprovedMerchants } from '~/lib/queries/admin/merchants';
import { RoleForm } from './role-form';
import { SuspendForm } from './suspend-form';
import { suspendBlocked } from './suspend-blocked';
import { PageNav } from '~/components/page-nav';

/** 회원 목록의 한 쪽 크기. 조회 기본값과 같아야 쪽 수가 맞는다 */
const USER_PAGE_SIZE = 25;
import { adminDate } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '회원' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'success' | 'info' | 'neutral'> = {
  SUPER_ADMIN: 'info', ADMIN: 'info', MERCHANT: 'success', CUSTOMER: 'neutral',
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireAdmin('user:read');
  const params = await searchParams;

  const canAssign = hasPermission(actor, 'user:assignRole');
  const canSuspend = hasPermission(actor, 'user:write');
  const asked = Math.max(Number.parseInt(params.page ?? '1', 10) || 1, 1);
  const [page, merchants] = await Promise.all([
    getAdminUsers(actor, { q: params.q, page: asked }),
    canAssign ? getApprovedMerchants(actor) : Promise.resolve([]),
  ]);

  // 검색어를 유지한 채 쪽을 넘긴다
  const hrefOf = (n: number) => ({
    pathname: '/admin/users' as const,
    query: { ...(params.q ? { q: params.q } : {}), ...(n > 1 ? { page: String(n) } : {}) },
  });

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">회원</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {canAssign ? '권한 부여는 슈퍼관리자 전용입니다' : '조회만 할 수 있습니다'}
          </p>
        </div>

        <form method="get" action="/admin/users" role="search" className="flex items-center gap-2">
          <label htmlFor="user-search" className="sr-only">이름 또는 이메일로 검색</label>
          <input
            id="user-search"
            type="search"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="이름 · 이메일"
            className="h-10 w-56 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
          />
          <button
            type="submit"
            className="h-10 rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)]"
          >
            검색
          </button>
        </form>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {page.rows.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              조건에 맞는 회원이 없습니다.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="회원 목록">
              <table>
                <caption className="sr-only">회원 목록</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">회원</th>
                    <th scope="col" className="w-28 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">권한</th>
                    <th scope="col" className="w-36 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">소속</th>
                    <th scope="col" className="w-20 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">주문</th>
                    <th scope="col" className="w-24 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">포인트</th>
                    <th scope="col" className="w-24 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">가입</th>
                    {canSuspend && (
                      <th scope="col" className="w-64 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">
                        이용 정지
                      </th>
                    )}
                    {canAssign && (
                      <th scope="col" className="w-80 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">
                        권한 변경
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--surface-2)] align-top last:border-0">
                      <td className="px-4 py-3">
                        <span className="block text-[13px]">
                          <Link href={`/admin/users/${u.id}`} className="text-[var(--fg)] underline-offset-2 hover:underline">
                            {u.name}
                          </Link>
                          {u.closedAt && (
                            // 행은 남으므로 목록에서 구분되지 않으면 살아 있는
                            // 계정으로 읽힌다
                            <span className="ml-1.5 text-[11px] text-[var(--fg-muted)]">
                              · 탈퇴 {adminDate.format(u.closedAt)}
                            </span>
                          )}
                          {u.suspendedAt && (
                            <Badge tone="danger" className="ml-1.5">정지됨</Badge>
                          )}
                        </span>
                        <span className="block text-[11px] text-[var(--fg-muted)]">{u.email}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={TONE[u.role] ?? 'neutral'}>
                          {USER_ROLE_LABEL[u.role as UserRole] ?? u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                        {u.merchantName ?? '—'}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-[13px]">{u.orderCount}</td>
                      <td className="tnum px-4 py-3 text-right text-[13px]">
                        {/* 숫자만 읽히면 어디로 가는지 모른다 — 누구의 포인트 내역인지 이름으로 말한다 */}
                        <Link
                          href={`/admin/users/${u.id}/points`}
                          aria-label={`${u.name} 포인트 ${u.pointBalance.toLocaleString('ko-KR')}P`}
                          className="text-[var(--fg)] underline-offset-2 hover:underline"
                        >
                          {u.pointBalance.toLocaleString('ko-KR')}P
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--fg-muted)]">
                        <time dateTime={u.createdAt.toISOString()}>{adminDate.format(u.createdAt)}</time>
                      </td>
                      {canSuspend && (
                        <td className="px-4 py-3">
                          <SuspendForm
                            userId={u.id}
                            userName={u.name}
                            suspendedAt={u.suspendedAt?.toISOString() ?? null}
                            suspendedReason={u.suspendedReason}
                            disabledReason={suspendBlocked(actor, u)}
                          />
                        </td>
                      )}
                      {canAssign && (
                        <td className="px-4 py-3">
                          <RoleForm
                            userId={u.id}
                            userName={u.name}
                            role={u.role as UserRoleInput}
                            merchantId={u.merchantId}
                            merchants={merchants}
                            // 자기 권한은 바꿀 수 없다. 서버에서도 막지만
                            // 누를 수 있게 두면 왜 안 되는지 알 수 없다.
                            disabledReason={
                              u.id === actor.id
                                ? '본인 계정'
                                : u.closedAt
                                  ? '탈퇴한 계정'
                                  : undefined
                            }
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PageNav page={asked} total={page.total} pageSize={USER_PAGE_SIZE} hrefOf={hrefOf} />
      </div>
    </>
  );
}
