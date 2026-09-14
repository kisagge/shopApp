import type { Metadata } from 'next';
import Link from 'next/link';
import { USER_ROLE_LABEL } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAuditLogs } from '~/lib/queries/audit-log';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '감사 로그' };
export const dynamic = 'force-dynamic';

/** 사람이 읽는 이름. 없는 동작은 원래 키를 그대로 보여 준다 — 숨기는 것보다 낫다. */
const ACTION_LABEL: Readonly<Record<string, string>> = {
  'product.create': '상품 등록',
  'product.update': '상품 수정',
  'product.stock': '재고 조정',
  'product.publish.approve': '게시 승인',
  'product.publish.reject': '게시 반려',
  'review.delete': '리뷰 삭제',
  'review.restore': '리뷰 복구',
  'review.reports.dismiss': '리뷰 신고 처리',
  'product.variant.create': '옵션 추가',
  'order.status.preparing': '배송 준비',
  'order.status.shipped': '출고',
  'order.status.delivered': '배송 완료',
  'order.status.cancelled': '주문 취소',
  'order.status.refunded': '환불',
  'order.cancel': '주문 취소',
  'order.cancelItems': '일부 취소',
  'order.ship': '송장 등록',
  'order.export': '주문 내려받기',
  'product.image.add': '이미지 추가',
  'product.image.delete': '이미지 삭제',
  'product.image.reorder': '이미지 순서 변경',
  'product.image.alt': '대체 텍스트 수정',
  'merchant.approved': '입점 승인',
  'merchant.suspended': '가맹점 정지',
  'merchant.terminated': '가맹점 해지',
  'user.assignRole': '권한 부여',
  'settlement.close': '정산 확정',
  'settlement.pay': '정산 지급',
  'points.reconcile': '포인트 대사',
  'points.expire': '포인트 소멸',
  'banner.create': '배너 등록',
  'banner.update': '배너 수정',
  'banner.delete': '배너 삭제',
  'banner.reorder': '배너 순서 변경',
  'banner.image': '배너 이미지 교체',
};

const TARGET_LABEL: Readonly<Record<string, string>> = {
  product: '상품',
  order: '주문',
  user: '회원',
  merchant: '가맹점',
  settlement: '정산',
  banner: '배너',
  review: '리뷰',
};

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

function preview(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value, null, 2);
  return text.length > 2000 ? `${text.slice(0, 2000)}\n…` : text;
}

interface SearchParams {
  readonly action?: string;
  readonly targetType?: string;
  readonly cursor?: string;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireAdmin('user:read');
  const params = await searchParams;

  const page = await getAuditLogs(actor, {
    action: params.action || undefined,
    targetType: params.targetType || undefined,
    cursor: params.cursor || undefined,
  });

  // 쿼리는 객체로 넘긴다. 문자열로 붙이면 typedRoutes 가 검사할 수 없고
  // 값에 들어간 특수문자를 인코딩하는 것도 직접 챙겨야 한다.
  const nextHref = page.nextCursor
    ? {
        pathname: '/admin/audit' as const,
        query: {
          ...(params.action ? { action: params.action } : {}),
          ...(params.targetType ? { targetType: params.targetType } : {}),
          cursor: page.nextCursor,
        },
      }
    : null;

  const filtered = Boolean(params.action || params.targetType);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">감사 로그</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">운영진의 쓰기 동작 기록</p>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-8">
        {/* 필터는 GET 폼이다. 주소에 조건이 남아야 공유하고 뒤로 갈 수 있다. */}
        <form
          method="get"
          action="/admin/audit"
          className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-5 py-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-action" className="text-[11px] font-medium text-[var(--fg-secondary)]">
              동작
            </label>
            <select
              id="filter-action"
              name="action"
              defaultValue={params.action ?? ''}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            >
              <option value="">전체</option>
              {page.filters.actions.map((a) => (
                <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-target" className="text-[11px] font-medium text-[var(--fg-secondary)]">
              대상
            </label>
            <select
              id="filter-target"
              name="targetType"
              defaultValue={params.targetType ?? ''}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            >
              <option value="">전체</option>
              {page.filters.targetTypes.map((t) => (
                <option key={t} value={t}>{TARGET_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
          >
            적용
          </button>
          {filtered && (
            <Link
              href="/admin/audit"
              className="flex h-10 items-center px-2 text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
            >
              필터 해제
            </Link>
          )}
        </form>

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {page.rows.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              {filtered ? '조건에 맞는 기록이 없습니다.' : '아직 기록된 동작이 없습니다.'}
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="관리자 동작 기록">
              <table>
                <caption className="sr-only">
                  관리자 동작 기록 {filtered && '(필터 적용됨)'}
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="w-44 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">시각</th>
                    <th scope="col" className="w-48 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">행위자</th>
                    <th scope="col" className="w-36 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">동작</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">대상</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--surface-2)] align-top last:border-0">
                      <td className="px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                        <time dateTime={row.createdAt.toISOString()}>
                          {dateFormat.format(row.createdAt)}
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-[13px]">{row.actorName}</span>
                        <span className="block text-[11px] text-[var(--fg-muted)]">
                          {/* 역할은 그 시점 스냅샷이다. 지금 역할이 바뀌었어도 그대로 남는다. */}
                          {USER_ROLE_LABEL[row.actorRole] ?? row.actorRole}
                          {row.actorEmail ? ` · ${row.actorEmail}` : ' · 자동 실행'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px]">{ACTION_LABEL[row.action] ?? row.action}</td>
                      <td className="px-4 py-3">
                        <span className="block text-[12px]">
                          {TARGET_LABEL[row.targetType] ?? row.targetType}{' '}
                          <span className="text-[var(--fg-muted)]">{row.targetId}</span>
                        </span>
                        {(row.before !== null || row.after !== null) && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-[11px] text-[var(--fg-secondary)]">
                              변경 내용
                            </summary>
                            <div className="mt-2 flex flex-col gap-2 md:flex-row">
                              {row.before !== null && (
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-[10px] font-semibold text-[var(--fg-muted)]">변경 전</h3>
                                  <pre className="mt-1 overflow-x-auto rounded-sm bg-[var(--surface)] p-2 text-[11px]">
                                    {preview(row.before)}
                                  </pre>
                                </div>
                              )}
                              {row.after !== null && (
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-[10px] font-semibold text-[var(--fg-muted)]">변경 후</h3>
                                  <pre className="mt-1 overflow-x-auto rounded-sm bg-[var(--surface)] p-2 text-[11px]">
                                    {preview(row.after)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pager href={nextHref} label="이전 기록 더 보기" hasRows={page.rows.length > 0} />
      </div>
    </>
  );
}
