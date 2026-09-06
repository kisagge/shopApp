import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { getTrafficHistory, getWebVitals } from '~/lib/queries/admin/traffic';
import { VITAL_THRESHOLD, formatVital } from '@shop/core';

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
export default async function TrafficPage() {
  const actor = await requireAdmin();
  const [{ months, rawSince }, { vitals, since }] = await Promise.all([
    getTrafficHistory(actor),
    getWebVitals(actor),
  ]);

  const peak = Math.max(1, ...months.map((m) => m.viewItems));
  const empty = months.every((m) => m.viewItems === 0 && m.purchases === 0);

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">트래픽 추이</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">최근 12개월</p>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section
          aria-labelledby="vitals-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-5 flex flex-col gap-1">
            <h2 id="vitals-title" className="text-base font-semibold">실사용자 성능</h2>
            <p className="max-w-[70ch] text-xs leading-relaxed text-[var(--fg-muted)]">
              실제 방문에서 브라우저가 잰 값입니다. <b>평균이 아니라 75 백분위</b>로
              봅니다 — 평균은 아주 느린 소수를 빠른 다수에 묻어 버립니다. 75 백분위는 &ldquo;넷 중 셋이
              이보다 빨랐다&rdquo; 는 뜻이라, 느린 쪽이 넷 중 하나를 넘으면 대표값이 그쪽을
              가리킵니다 — 구글이 Core Web Vitals 를 이 값으로 판정하는 것도 같은
              이유입니다. 기준선은 구글이 정한 값을 그대로 씁니다. {since.toISOString().slice(0, 10)} 이후.
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
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

          {vitals.every((v) => v.samples === 0) && (
            <p className="mt-4 text-[12px] text-[var(--fg-muted)]">
              아직 모인 값이 없습니다. 방문이 있어야 쌓입니다 — 지어내지 않습니다.
            </p>
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
                        className="block h-1.5 rounded-full bg-n-900"
                        style={{ width: `${Math.round((m.viewItems / peak) * 100)}%`, minWidth: m.viewItems > 0 ? '2px' : '0' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
