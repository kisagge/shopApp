import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@shop/ui';
import { requireAdmin } from '~/lib/admin/guard';
import { getErrorGroups } from '~/lib/queries/admin/errors';
import { ResolveButton } from './resolve-button';
import { adminDateTime } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '오류' };
export const dynamic = 'force-dynamic';

/**
 * 오류함.
 *
 * **그 전까지 오류는 콘솔과 메일뿐이었다.** 로그는 누가 열어 봐야 하고, 메일은 같은 지문을 한 시간에 한 번만 보낸다 —
 * 그래서 "이 오류가 몇 번 났는가" 에 답할 곳이 없었다. 여기서는 지문별로 묶어 횟수와 처음·마지막 시각을 본다.
 *
 * **브라우저에서 난 것도 함께 온다.** 서버 오류는 배포 로그에 스택이라도 남지만, 그쪽은 우리가 받지 않으면 영영 모른다.
 */
export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string }>;
}) {
  const actor = await requireAdmin('analytics:all');
  const params = await searchParams;
  const showResolved = params.resolved === '1';

  const { items, openCount } = await getErrorGroups(actor, { resolved: showResolved });

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">오류</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            처리 안 된 <span className="tnum font-semibold text-[var(--fg-secondary)]">{openCount}</span>건
          </p>
        </div>

        {/* 처리한 것도 볼 수 있어야 한다 — 고쳤다고 닫은 것이 또 나는지 보는 자리다 */}
        <nav aria-label="오류 보기">
          <Link
            href={showResolved ? '/admin/errors' : '/admin/errors?resolved=1'}
            className="text-[13px] underline underline-offset-2"
          >
            {showResolved ? '처리 안 된 것 보기' : '처리한 것 보기'}
          </Link>
        </nav>
      </header>

      <div className="p-4 sm:p-8">
        {items.length === 0 ? (
          <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
            {showResolved ? '처리한 오류가 없습니다.' : '처리할 오류가 없습니다. 조용한 것이 좋은 것입니다.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((row, at) => (
              <li
                key={row.fingerprint}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5"
              >
                {/*
                  **지문을 id 로 쓰지 않는다.** 지문에는 공백이 들어 있는데(이름|라우트|메시지),
                  aria-labelledby 는 공백으로 id 를 나누는 목록이라 참조가 통째로 끊긴다 —
                  낭독기에게는 이름 없는 글이 된다.
                */}
                <article aria-labelledby={`err-${at}`}>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <Badge tone={row.severity === 'fatal' ? 'danger' : 'neutral'}>
                      {row.severity === 'fatal' ? '화면 중단' : '오류'}
                    </Badge>
                    {/* 고치는 자리가 다르다 — 서버는 로그가 남고, 브라우저는 이 기록이 전부다 */}
                    <Badge tone={row.source === 'browser' ? 'info' : 'neutral'}>
                      {row.source === 'browser' ? '브라우저' : '서버'}
                    </Badge>
                    <h2 id={`err-${at}`} className="text-[14px] font-semibold">
                      {row.name}
                    </h2>
                    <span className="tnum text-[12px] text-[var(--fg-secondary)]">
                      {row.count}회
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        마지막{' '}
                        <time dateTime={row.lastSeenAt.toISOString()}>
                          {adminDateTime.format(row.lastSeenAt)}
                        </time>
                      </span>
                      <ResolveButton fingerprint={row.fingerprint} resolved={row.resolvedAt !== null} />
                    </span>
                  </div>

                  <p className="mt-2 text-[13px] leading-relaxed break-words text-[var(--fg-secondary)]">
                    {row.message}
                  </p>

                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg-muted)]">
                    <div className="flex gap-1.5">
                      <dt>화면</dt>
                      <dd className="tnum">{row.routePath}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>종류</dt>
                      <dd>{row.routeType}</dd>
                    </div>
                    {row.method && row.path && (
                      <div className="flex gap-1.5">
                        <dt>요청</dt>
                        <dd className="tnum">{row.method} {row.path}</dd>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <dt>처음</dt>
                      <dd>
                        <time dateTime={row.firstSeenAt.toISOString()}>
                          {adminDateTime.format(row.firstSeenAt)}
                        </time>
                      </dd>
                    </div>
                    {row.resolvedAt && (
                      <div className="flex gap-1.5">
                        <dt>처리</dt>
                        <dd>
                          <time dateTime={row.resolvedAt.toISOString()}>
                            {adminDateTime.format(row.resolvedAt)}
                          </time>
                          {row.resolvedBy && ` · ${row.resolvedBy}`}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {row.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-[var(--fg-secondary)]">
                        스택
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-sm bg-[var(--surface)] p-2 text-[11px]">
                        {row.stack}
                      </pre>
                    </details>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
