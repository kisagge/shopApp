import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '~/lib/admin/guard';
import { getRouteVitals, getTrafficHistory, getWebVitals } from '~/lib/queries/admin/traffic';
import {
  VITAL_THRESHOLD, formatVital, CLIENT_PLATFORM, CLIENT_PLATFORM_LABEL,
  VITALS_WINDOW_DAYS, vitalsWindow,
} from '@shop/core';

/**
 * 화면별 표에 세울 지표.
 *
 * **그리는 데까지 걸린 시간만 본다.** INP 는 누른 뒤의 이야기라 "어느 화면이 늦게 뜨나" 와
 * 섞이고, CLS 는 단위가 없어 같은 줄에 두면 밀리초로 읽힌다. 다섯을 다 세우면 가로로도 길어져
 * 폰에서는 아무것도 못 읽는다.
 */
const PAINT_VITALS = ['LCP', 'FCP', 'TTFB'] as const;

export const metadata: Metadata = { title: '트래픽 추이' };
export const dynamic = 'force-dynamic';

/**
 * 월별 트래픽.
 *
 * 대시보드가 90일까지만 보여 주는 이유는 원본 이벤트를 그때까지만 두기
 * 때문이다. 이 화면은 접힌 값을 읽으므로 원본이 지워진 뒤에도 남는다.
 *
 * **세션 수를 쓰지 않는다.** 접힌 세션 수는 하루 단위 고유값이라 달 단위로
 * 더하면 이틀에 걸쳐 온 세션이 두 번 세어진다. 여기서는 더해도 되는
 * 이벤트 수만 쓰고, 그래서 전환율도 세션이 아니라 이벤트 기준이다.
 */
export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const actor = await requireAdmin();
  /*
   * **구간은 한 번만 정하고 둘에게 같이 준다.**
   *
   * 조회 둘이 저마다 28일을 기본으로 들고 있었고, 화면은 그중 하나가 돌려준 날짜
   * 한 줄만 적었다. 지금은 값이 같아 조용하지만, 한쪽 기본값을 고치는 날 화면은
   * 아래 표에 대해 **없는 날짜를 말하게 된다.**
   */
  const days = vitalsWindow((await searchParams).days);
  const [{ months, rawSince }, { vitals, since }, { routes, minSamples, hidden }] =
    await Promise.all([
      getTrafficHistory(actor),
      getWebVitals(actor, days),
      getRouteVitals(actor, days),
    ]);

  const peak = Math.max(1, ...months.map((m) => m.viewItems));
  const empty = months.every((m) => m.viewItems === 0 && m.purchases === 0);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">트래픽 추이</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">최근 12개월</p>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section
          aria-labelledby="vitals-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-5 flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <h2 id="vitals-title" className="text-base font-semibold">실사용자 성능</h2>
              {/*
                **구간을 좁혀 볼 수 있어야 배포가 값을 바꿨는지 알 수 있다.**

                28일 고정이던 동안, 오늘 내보낸 고침은 지난 27일치에 묻혀 거의
                움직이지 않았다 — 표본이 서른 몇 개인 화면이라면 더 그렇다.

                평범한 링크다. 구간이 주소에 남아야 다시 열어 보고 남에게 보낼 수
                있고, 자바스크립트 없이도 동작한다 — 리뷰 정렬과 같은 규칙이다.
              */}
              <nav aria-label="보는 구간">
                <ul className="flex flex-wrap gap-x-1">
                  {VITALS_WINDOW_DAYS.map((d) => {
                    const current = d === days;
                    return (
                      <li key={d}>
                        <Link
                          href={`/admin/traffic?days=${d}`}
                          // 지금 보고 있는 구간을 색이 아니라 이름으로 알린다
                          aria-current={current ? 'true' : undefined}
                          className={`tnum inline-flex h-8 items-center rounded-full px-3 text-[12px] no-underline ${
                            current
                              ? 'bg-[var(--surface-2)] font-medium text-[var(--fg)]'
                              : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                          }`}
                        >
                          {d}일
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
            <p className="max-w-[70ch] text-xs leading-relaxed text-[var(--fg-muted)]">
              실제 방문에서 브라우저가 잰 값입니다. <b>평균이 아니라 75 백분위</b>로
              봅니다 — 평균은 아주 느린 소수를 빠른 다수에 묻어 버립니다. 75 백분위는 &ldquo;넷 중 셋이
              이보다 빨랐다&rdquo; 는 뜻이라, 느린 쪽이 넷 중 하나를 넘으면 대표값이 그쪽을
              가리킵니다 — 구글이 Core Web Vitals 를 이 값으로 판정하는 것도 같은
              이유입니다. 기준선은 구글이 정한 값을 그대로 씁니다. {since.toISOString().slice(0, 10)} 이후
              {' '}{days}일간.
            </p>
          </div>

          {/*
            **다섯 칸은 넓은 화면에서만.** 768px 에서 다섯으로 나누면 타일이
            75px 이 되고, 그 안의 숫자(0.002 같은 것)가 잘렸다. 값이 잘리는
            지표판은 없는 것만 못하다.
          */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {vitals.map((v) => (
              <li
                key={v.metric}
                className="flex flex-col gap-1.5 rounded-sm border border-[var(--border)] p-4"
              >
                <span className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
                  {v.metric}
                </span>
                <span
                  className={`tnum text-[22px] font-semibold ${
                    v.rating === 'good'
                      ? 'text-success'
                      : v.rating === 'poor'
                        ? 'text-accent'
                        : v.rating === 'needs-improvement'
                          ? 'text-warning'
                          : 'text-[var(--fg-muted)]'
                  }`}
                >
                  {v.p75 === null ? '—' : formatVital(v.metric, v.p75)}
                  {v.p75 !== null && v.metric !== 'CLS' && (
                    <span className="ml-0.5 text-[13px] font-normal">ms</span>
                  )}
                </span>
                {/* 색만으로 좋고 나쁨을 말하지 않는다 */}
                <span className="text-[11px] text-[var(--fg-secondary)]">
                  {v.rating === null
                    ? '표본 없음'
                    : v.rating === 'good'
                      ? '좋음'
                      : v.rating === 'poor'
                        ? '나쁨'
                        : '개선 필요'}
                </span>
                <span className="tnum text-[10px] text-[var(--fg-muted)]">
                  기준 {formatVital(v.metric, VITAL_THRESHOLD[v.metric].good)} 이하 · 표본{' '}
                  {v.samples.toLocaleString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>

          {vitals.every((v) => v.samples === 0) ? (
            <p className="mt-4 text-[12px] text-[var(--fg-muted)]">
              아직 모인 값이 없습니다. 방문이 있어야 쌓입니다 — 지어내지 않습니다.
            </p>
          ) : (
            /*
              **앱과 모바일 웹을 갈라 놓는다.** 위의 타일은 전부 섞은 값이라
              "앱이 느린가" 에 답하지 못한다. 앱은 켤 때마다 웹뷰를 차게 띄우는
              값이 더 붙는데, 섞여 있으면 그게 앱 탓인지 화면 탓인지 모른다.

              타일이 아니라 표인 이유는 이 자리가 **견주어 보는 자리**이기
              때문이다. 같은 지표를 세 칸에 나란히 놓아야 차이가 눈에 든다.
            */
            <div
              className="table-scroll mt-6"
              tabIndex={0}
              role="region"
              aria-label="플랫폼별 실사용자 성능"
            >
              <table className="data-table border-collapse text-[13px]">
                <caption className="mb-2 text-left text-[12px] text-[var(--fg-muted)]">
                  어디서 들어왔는지로 나눈 같은 값. 앱 웹뷰는 브라우저가 쥔 것을 하나도
                  물려받지 못해 같은 화면이라도 값이 다릅니다. 어디서 왔는지 모르는
                  방문(이 구분이 생기기 전에 쌓인 것)은 위 타일에만 들어갑니다.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="py-2 text-left font-medium text-[var(--fg-muted)]">
                      지표
                    </th>
                    {CLIENT_PLATFORM.map((p) => (
                      <th
                        key={p}
                        scope="col"
                        className="py-2 text-right font-medium text-[var(--fg-muted)]"
                      >
                        {CLIENT_PLATFORM_LABEL[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vitals.map((v) => (
                    <tr key={v.metric} className="border-b border-[var(--border)] last:border-0">
                      <th
                        scope="row"
                        className="py-2 text-left text-[11px] font-medium tracking-[0.08em]"
                      >
                        {v.metric}
                      </th>
                      {CLIENT_PLATFORM.map((p) => {
                        const cell = v.byPlatform[p];
                        return (
                          <td key={p} className="tnum py-2 text-right">
                            {cell.p75 === null ? (
                              <span className="text-[var(--fg-muted)]">—</span>
                            ) : (
                              <>
                                <span
                                  className={
                                    cell.rating === 'good'
                                      ? 'text-success'
                                      : cell.rating === 'poor'
                                        ? 'text-accent'
                                        : 'text-warning'
                                  }
                                >
                                  {formatVital(v.metric, cell.p75)}
                                  {v.metric !== 'CLS' && (
                                    <span className="ml-0.5 text-[11px] font-normal">ms</span>
                                  )}
                                </span>
                                {/* 색만으로 말하지 않는다 — 위 타일과 같은 규칙 */}
                                <span className="block text-[10px] text-[var(--fg-muted)]">
                                  {cell.rating === 'good'
                                    ? '좋음'
                                    : cell.rating === 'poor'
                                      ? '나쁨'
                                      : '개선 필요'}
                                  {' · 표본 '}
                                  {cell.samples.toLocaleString('ko-KR')}
                                </span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/*
            **"느리다" 까지만 말하면 고치러 갈 데가 없다.**

            위의 값들은 전부 섞은 것이라 어느 화면이 끌어내리는지 모른다. 그 값은 이미 모으고
            있었다 — 이벤트마다 주소가 붙는다. 보여 주지 않았을 뿐이다. 느린 쪽부터 세운다.

            주소는 묶는다. 상품마다 다른 주소를 그대로 세우면 상품 수만큼 줄이 생기고, 줄마다
            표본이 하나씩이라 아무 말도 못 한다.

            **여기 없는 화면이 빠른 것은 아니다.** LCP·FCP·TTFB 는 문서를 새로 받을 때
            한 번씩 재는 값이고, 이 앱에서 화면 사이를 옮기는 것은 문서를 다시 받지 않는
            클라이언트 이동이다. 그래서 **처음 들어온 화면만** 쌓인다. 그 말을 표에 적지
            않으면 읽는 사람은 빠진 화면을 "빠른 화면" 으로 읽는다 — 없는 자료에서
            결론을 내리게 두는 셈이다.
          */}
          {routes.length === 0 ? (
            /*
              **사라진 표는 고장으로 읽힌다.**

              구간을 좁히면 표본도 같이 줄어 이 표가 통째로 없어진다. 그때 아무
              말도 없으면 읽는 사람은 "하루 치는 아직 없구나" 가 아니라 "표가
              깨졌구나" 로 읽고, 구간을 넓혀 볼 생각을 하지 않는다.

              방문이 없는 것과 **걸러 낸 것**은 다른 말이라 다르게 적는다.
            */
            <p className="mt-6 text-[12px] leading-relaxed text-[var(--fg-muted)]">
              {hidden > 0
                ? `이 구간에는 표본 ${minSamples}개를 넘긴 화면이 없습니다 — ${hidden}개 화면이 표본이 모자라 빠졌습니다.`
                : '이 구간에는 아직 화면별로 모인 값이 없습니다.'}{' '}
              구간을 넓혀 보세요.
            </p>
          ) : (
            <div
              className="table-scroll mt-6"
              tabIndex={0}
              role="region"
              aria-label="화면별 실사용자 성능"
            >
              <table className="data-table border-collapse text-[13px]">
                <caption className="mb-2 text-left text-[12px] text-[var(--fg-muted)]">
                  느린 화면부터. 상품·분류처럼 주소가 저마다 다른 화면은 한 칸으로 묶었습니다.
                  표본이 {minSamples}개가 안 되는 화면은 세우지 않습니다 — 75 백분위는 표본이
                  적으면 &ldquo;둘째로 느린 값&rdquo; 과 다르지 않고, 그 줄을 먼저 고치게 됩니다.
                  <b>여기 없는 화면이 빠른 것은 아닙니다</b> — 이 셋은 문서를 새로 받을 때
                  한 번씩 재는 값이고 화면 사이 이동은 문서를 다시 받지 않으므로,{' '}
                  <b>처음 들어온 화면</b>만 쌓입니다.
                  {/* 몇 개를 걸렀는지 말하지 않으면 짧은 표가 "이게 전부" 로 읽힌다 */}
                  {hidden > 0 && ` 이 구간에서 ${hidden}개 화면이 그렇게 빠졌습니다.`}
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="py-2 text-left font-medium text-[var(--fg-muted)]">
                      화면
                    </th>
                    {PAINT_VITALS.map((metric) => (
                      <th
                        key={metric}
                        scope="col"
                        className="py-2 text-right font-medium text-[var(--fg-muted)]"
                      >
                        {metric}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routes.map((row) => (
                    <tr key={row.route} className="border-b border-[var(--border)] last:border-0">
                      <th scope="row" className="py-2 text-left font-normal">
                        <span className="tnum">{row.route}</span>
                      </th>
                      {PAINT_VITALS.map((metric) => {
                        const cell = row.cells[metric];
                        return (
                          <td key={metric} className="tnum py-2 text-right">
                            {cell.p75 === null ? (
                              <span className="text-[var(--fg-muted)]">—</span>
                            ) : (
                              <>
                                <span
                                  className={
                                    cell.rating === 'good'
                                      ? 'text-success'
                                      : cell.rating === 'poor'
                                        ? 'text-accent'
                                        : 'text-warning'
                                  }
                                >
                                  {formatVital(metric, cell.p75)}
                                  <span className="ml-0.5 text-[11px] font-normal">ms</span>
                                </span>
                                {/* 색만으로 말하지 않는다 — 위 표와 같은 규칙 */}
                                <span className="block text-[10px] text-[var(--fg-muted)]">
                                  {cell.rating === 'good'
                                    ? '좋음'
                                    : cell.rating === 'poor'
                                      ? '나쁨'
                                      : '개선 필요'}
                                  {' · 표본 '}
                                  {cell.samples.toLocaleString('ko-KR')}
                                </span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="traffic-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-5 flex flex-col gap-1">
            <h2 id="traffic-title" className="text-base font-semibold">월별 이벤트</h2>
            <p className="max-w-[70ch] text-xs leading-relaxed text-[var(--fg-muted)]">
              일별 집계에서 읽습니다. 원본 이벤트는 90일({rawSince} 이후)만 보관하므로
              그보다 앞선 기간은 이 표에서만 볼 수 있습니다. 전환율은 세션이 아니라{' '}
              <b>이벤트 수 기준</b>입니다 — 하루 단위로 접은 세션 수는 달 단위로 더할 수
              없기 때문입니다. 세션 기준 퍼널은 대시보드에서 90일까지 볼 수 있습니다.
            </p>
          </div>

          {empty ? (
            <p className="py-12 text-center text-[13px] text-[var(--fg-muted)]">
              아직 접힌 이벤트가 없습니다. 롤업 배치는 매일 새벽에 어제치를 접습니다.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="월별 전환 지표">
              <table className="data-table border-collapse text-[13px]">
                <caption className="sr-only">
                  월별 상품 조회·장바구니 담기·결제 완료 이벤트 수와 전환율
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
                    <th scope="col" className="py-2 font-medium">월</th>
                    <th scope="col" className="py-2 text-right font-medium">상품 조회</th>
                    <th scope="col" className="py-2 text-right font-medium">장바구니</th>
                    <th scope="col" className="py-2 text-right font-medium">결제</th>
                    <th scope="col" className="py-2 text-right font-medium">전환율</th>
                    <th scope="col" className="py-2 pl-4 font-medium">조회 추이</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-[var(--border)] last:border-0">
                      <th scope="row" className="py-2.5 text-left font-medium">{m.month}</th>
                      <td className="tnum py-2.5 text-right">{m.viewItems.toLocaleString('ko-KR')}</td>
                      <td className="tnum py-2.5 text-right">{m.addToCarts.toLocaleString('ko-KR')}</td>
                      <td className="tnum py-2.5 text-right">{m.purchases.toLocaleString('ko-KR')}</td>
                      <td className="tnum py-2.5 text-right">{m.conversionRate}%</td>
                      <td className="py-2.5 pl-4">
                        {/*
                          막대는 표에 이미 있는 숫자를 눈으로 훑기 쉽게 만든 것뿐이라
                          스크린리더에는 감춘다. 읽어 봐야 같은 값을 두 번 듣는다.
                        */}
                        <span
                          aria-hidden="true"
                          className="block h-1.5 rounded-full bg-[var(--brand)]"
                          style={{ width: `${Math.round((m.viewItems / peak) * 100)}%`, minWidth: m.viewItems > 0 ? '2px' : '0' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
