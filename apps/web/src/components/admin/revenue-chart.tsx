import { format, won } from '@shop/core';
import type { DailyRevenue } from '~/lib/queries/admin';

/**
 * 7일 매출 추이.
 *
 * 단일 시리즈라 범례를 두지 않는다 — 제목이 시리즈를 설명한다.
 * 막대는 베이스라인에 고정하고 위쪽만 둥글린다. 최댓값과 오늘만 직접 라벨을
 * 붙인다. 모든 막대에 숫자를 얹으면 그래프를 볼 이유가 없어진다.
 *
 * SVG 옆에 스크린리더용 표를 숨겨 둔다. 그래프는 시각적 요약일 뿐이고
 * 값을 읽어야 하는 사람에게는 표가 필요하다.
 */
export function RevenueChart({
  data,
  label,
}: {
  data: readonly DailyRevenue[];
  /** '최근 30일' 처럼 이 차트가 무슨 기간인지. 표 제목과 대체 텍스트에 쓴다. */
  label: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
        아직 매출 데이터가 없습니다.
      </p>
    );
  }

  const W = 700;
  const TOP = 20;
  const BASE = 200;
  const H = BASE - TOP;
  const LEFT = 56;
  const RIGHT = 678;

  const max = Math.max(...data.map((d) => d.revenue), 1);
  const ceiling = Math.ceil(max / 4) * 4;
  const today = data.at(-1)?.date;

  const slot = (RIGHT - LEFT) / data.length;
  const barWidth = Math.min(56, slot * 0.62);
  const y = (v: number) => BASE - (v / ceiling) * H;
  const r = 4;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(ceiling * f));

  return (
    <>
      <svg viewBox={`0 0 ${W} 250`} width="100%" role="img" aria-labelledby="rc-t rc-d" className="block">
        <title id="rc-t">{label} 일별 매출</title>
        <desc id="rc-d">{data.map((d) => `${d.date} ${format(won(d.revenue))}원`).join(', ')}</desc>

        {gridValues.map((v) => (
          <g key={v}>
            <line x1={LEFT} y1={y(v)} x2={RIGHT} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text
              x={LEFT - 8} y={y(v) + 4} textAnchor="end"
              fontSize={10} fill="var(--fg-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {v === 0 ? '0' : `${Math.round(v / 10_000)}만`}
            </text>
          </g>
        ))}
        <line x1={LEFT} y1={BASE} x2={RIGHT} y2={BASE} stroke="var(--border-strong)" strokeWidth={1} />

        {data.map((d, i) => {
          const x = LEFT + slot * i + (slot - barWidth) / 2;
          const top = y(d.revenue);
          const isToday = d.date === today;
          const isMax = d.revenue === max;
          const path = [
            `M ${x} ${BASE}`,
            `L ${x} ${top + r}`,
            `Q ${x} ${top} ${x + r} ${top}`,
            `L ${x + barWidth - r} ${top}`,
            `Q ${x + barWidth} ${top} ${x + barWidth} ${top + r}`,
            `L ${x + barWidth} ${BASE} Z`,
          ].join(' ');

          return (
            <g key={d.date}>
              {/* 오늘은 아직 집계 중이라 톤을 낮추고 라벨로 알린다 —
                  색만으로 구분하면 의미가 전달되지 않는다 */}
              <path d={path} fill={isToday ? 'var(--border-strong)' : 'var(--color-n-800)'} />
              {(isMax || isToday) && (
                <text
                  x={x + barWidth / 2} y={top - 9} textAnchor="middle"
                  fontSize={11} fontWeight={600} fill="var(--fg-secondary)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {format(won(d.revenue))}
                </text>
              )}
              {isToday && (
                <text x={x + barWidth / 2} y={top - 24} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
                  진행 중
                </text>
              )}
              <text
                x={x + barWidth / 2} y={BASE + 20} textAnchor="middle"
                fontSize={11} fill={isToday ? 'var(--fg)' : 'var(--fg-secondary)'}
                fontWeight={isToday ? 600 : 400}
              >
                {d.date.slice(5).replace('-', '/')}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{label} 일별 매출</caption>
        <thead>
          <tr><th scope="col">날짜</th><th scope="col">매출</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{format(won(d.revenue))}원</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
