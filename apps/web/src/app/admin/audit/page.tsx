import type { Metadata } from 'next';
import Link from 'next/link';
import { OrderSearchError, USER_ROLE_LABEL } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAuditLogs, type AuditLogPage } from '~/lib/queries/audit-log';
import { actionLabel as labelOf, targetLabel } from '~/lib/admin/audit-labels';
import { AuditExport } from './audit-export';
import { Pager } from '../pager';
import { adminDateTime } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '감사 로그' };
export const dynamic = 'force-dynamic';

function preview(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value, null, 2);
  return text.length > 2000 ? `${text.slice(0, 2000)}\n…` : text;
}

interface SearchParams {
  readonly action?: string;
  readonly targetType?: string;
  readonly actor?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

const FIELD = 'h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]';
const LABEL = 'text-[11px] font-medium text-[var(--fg-secondary)]';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireAdmin('user:read');
  const params = await searchParams;

  /** 목록·다음 쪽·내려받기가 함께 쓰는 조건. 빈 값은 싣지 않는다 */
  const filter = {
    ...(params.action ? { action: params.action } : {}),
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(params.actor ? { actor: params.actor } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  };

  let page: AuditLogPage;
  let rangeError: string | null = null;
  try {
    page = await getAuditLogs(actor, { ...filter, cursor: params.cursor || undefined });
  } catch (error) {
    if (!(error instanceof OrderSearchError)) throw error;
    // 날짜가 틀리면 기간 없이 보여 주지 않는다 — 조건이 빠진 목록을 조건대로 본 것으로 읽는다
    rangeError = error.message;
    page = await getAuditLogs(actor, { action: filter.action, targetType: filter.targetType, actor: filter.actor, take: 0 });
  }

  // 쿼리는 객체로 넘긴다. 문자열로 붙이면 typedRoutes 가 검사할 수 없고
  // 값에 들어간 특수문자를 인코딩하는 것도 직접 챙겨야 한다.
  const nextHref = page.nextCursor
    ? { pathname: '/admin/audit' as const, query: { ...filter, cursor: page.nextCursor } }
    : null;

  const filtered = Object.keys(filter).length > 0;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">감사 로그</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">운영진의 쓰기 동작 기록</p>
        </div>
        {!rangeError && <AuditExport filter={filter} />}
      </header>

      <div className="flex flex-col gap-5 p-8">
        {/* 필터는 GET 폼이다. 주소에 조건이 남아야 공유하고 뒤로 갈 수 있다. */}
        <form
          method="get"
          action="/admin/audit"
          className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-5 py-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-action" className={LABEL}>
              동작
            </label>
            <select id="filter-action" name="action" defaultValue={params.action ?? ''} className={FIELD}>
              <option value="">전체</option>
              {page.filters.actions.map((a) => (
                <option key={a} value={a}>{labelOf(a)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-target" className={LABEL}>
              대상
            </label>
            <select id="filter-target" name="targetType" defaultValue={params.targetType ?? ''} className={FIELD}>
              <option value="">전체</option>
              {page.filters.targetTypes.map((t) => (
                <option key={t} value={t}>{targetLabel(t)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-actor" className={LABEL}>
              행위자
            </label>
            <select id="filter-actor" name="actor" defaultValue={params.actor ?? ''} className={FIELD}>
              <option value="">전체</option>
              {page.filters.actors.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          {/* 기간은 한 묶음이다 — 두 칸이 무엇의 시작·끝인지 묶어 읽혀야 한다 */}
          <fieldset className="flex items-end gap-2">
            <legend className={`${LABEL} mb-1.5`}>기간 (한국 시각, 끝날 포함)</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filter-from" className="sr-only">시작일</label>
              <input
                id="filter-from" name="from" type="date" defaultValue={params.from ?? ''} className={FIELD}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? 'filter-range-error' : undefined}
              />
            </div>
            <span aria-hidden="true" className="pb-2.5 text-[13px] text-[var(--fg-muted)]">~</span>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filter-to" className="sr-only">종료일</label>
              <input
                id="filter-to" name="to" type="date" defaultValue={params.to ?? ''} className={FIELD}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? 'filter-range-error' : undefined}
              />
            </div>
          </fieldset>

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
          {rangeError && (
            <p id="filter-range-error" role="alert" className="w-full text-[13px] text-accent">
              {rangeError}
            </p>
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
                          {adminDateTime.format(row.createdAt)}
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
                      <td className="px-4 py-3 text-[13px]">{labelOf(row.action)}</td>
                      <td className="px-4 py-3">
                        <span className="block text-[12px]">
                          {targetLabel(row.targetType)}{' '}
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
                                  {/*
                                    제목이 아니라 **표 칸 안의 이름표**다. h3 로 두면 이 화면의
                                    제목 단계가 h1 다음에 h3 로 건너뛰고, 낭독기의 제목 목록에는
                                    줄 수만큼 "변경 전" 이 쌓인다.
                                  */}
                                  <p className="text-[10px] font-semibold text-[var(--fg-muted)]">변경 전</p>
                                  <pre className="mt-1 overflow-x-auto rounded-sm bg-[var(--surface)] p-2 text-[11px]">
                                    {preview(row.before)}
                                  </pre>
                                </div>
                              )}
                              {row.after !== null && (
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold text-[var(--fg-muted)]">변경 후</p>
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
