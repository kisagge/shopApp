import { format, won } from '@shop/core';
import type { DailyRevenue } from '~/lib/queries/admin/dashboard';

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

  /**
   * 축의 눈금 하나 크기.
   *
   * **라벨이 말할 수 있는 값으로 천장을 올린다.** 예전에는 `Math.ceil(max / 4) * 4` 로
   * 올리고 라벨을 만원 단위로 **반올림**해 적었는데, 천장이 만원의 배수가 아니면 그 둘이
   * 어긋난다 — 최댓값 3만이면 눈금은 7,500·15,000·22,500 인데 라벨은 `1만·2만·2만` 이
   * 됐다(**2만이 두 번**, 7,500 을 1만이라 적었다). 최댓값 12만 5천이면 맨 위 눈금이
   * `13만` 으로 적혔다 — 거기 선 막대는 12만 5천이다. **매출이 없는 날은 축 전체가 `0만`**
   * 이었다. 일 매출이 10만원 아래면 늘 그랬고, 새 가게와 한가한 날이 전부 그 자리다.
   *
   * 그래서 눈금을 반듯한 값으로 끊어 **라벨이 그 값을 그대로 말하게** 한다. 작은 금액은
   * 천원 단위로(라벨이 짧아 원으로 적어도 된다), 큰 금액은 만원 단위로 끊는다 — 큰 쪽을
   * 원으로 적으면 축 글자가 그래프를 밀어낸다.
   */
  const roughStep = max / 4;
  const unit = roughStep >= 100_000 ? 10_000 : 1_000;
  // `Math.ceil` 이 이미 한 칸을 보장한다 — 하한을 따로 두었더니 닿을 수 없는 줄이었다
  const step = Math.ceil(roughStep / unit) * unit;
  const ceiling = step * 4;
  /**
   * 한 그래프 안에서 단위를 섞지 않는다.
   *
   * 눈금마다 "만원의 배수인가" 를 따로 물으면 `5,000 · 1만 · 15,000 · 2만` 처럼 섞인다.
   * 눈금 크기 하나로 정하면 다섯 줄이 같은 단위로 선다.
   */
  const inMan = step % 10_000 === 0;
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
              {v === 0 ? '0' : inMan ? `${v / 10_000}만` : format(won(v))}
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
