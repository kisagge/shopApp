// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import { RevenueChart } from '~/components/admin/revenue-chart';

/**
 * 운영 대시보드의 7일 매출 그래프.
 *
 * **이 조각에는 검사가 하나도 없었다** — 커버리지로 물어서 찾았다. 그리고 여기는
 * **조용히 틀리는 자리**다: 글자가 사전을 거치지 않아 e2e 가 글로 찾을 수 없고, axe 는
 * 마크업만 보므로(`role="img"` + title·desc 가 멀쩡하다) 숫자가 틀려도 통과한다.
 *
 * 그래서 보는 것은 셋이다 — **축이 사실을 말하는가**, **막대가 값에 비례하는가**, 그리고
 * **눈으로 보는 사람과 귀로 듣는 사람이 같은 숫자를 읽는가**(옆에 숨겨 둔 표).
 */

const day = (date: string, revenue: number) => ({ date, revenue });

/** 축 눈금 글자 — 왼쪽에 끝맞춤으로 서는 것들이다 */
const axisLabels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('text')]
    .filter((t) => t.getAttribute('text-anchor') === 'end')
    .map((t) => t.textContent ?? '');

/**
 * 막대 하나의 윗변 y.
 *
 * 경로의 첫 `L` 은 둥글리기 반지름만큼 아래다(`L x top+r`). 윗변은 그다음 `Q x top` 이
 * 가리키는 값이다 — 처음에 `L` 을 읽었다가 4px 어긋난 값을 받았다.
 */
const barTops = (container: HTMLElement): number[] =>
  [...container.querySelectorAll('path')].map((p) => {
    const d = p.getAttribute('d') ?? '';
    const m = /Q [\d.]+ ([\d.]+)/.exec(d);
    return Number(m?.[1]);
  });

/** 라벨을 숫자로 되돌린다 — '3만' → 30000, '8,000' → 8000 */
const asNumber = (label: string): number =>
  label.endsWith('만')
    ? Number(label.slice(0, -1).replaceAll(',', '')) * 10_000
    : Number(label.replaceAll(',', ''));

describe('데이터가 없을 때', () => {
  it('그래프 대신 말을 한다 — 빈 그림만 두면 고장인지 원래 그런지 알 수 없다', () => {
    render(<RevenueChart data={[]} label="최근 7일" />);

    expect(screen.getByText('아직 매출 데이터가 없습니다.')).toBeDefined();
  });
});

/**
 * **축이 거짓말을 하면 그래프는 쓸모가 없다.**
 *
 * 눈금 값은 천장의 0·¼·½·¾·1 인데, 라벨을 만원 단위로 **반올림**해서 적고 있었다. 천장이
 * 만원의 배수가 아니면 그 둘이 어긋난다 — 최댓값 3만이면 눈금은 7,500·15,000·22,500 인데
 * 라벨은 `1만·2만·2만` 이 됐다(2만이 두 번, 7,500 을 1만이라 적었다). **매출이 없는 날은
 * 축 전체가 `0만`** 이었다. 일 매출이 10만원 아래면 늘 그랬다 — 새 가게와 한가한 날이 전부
 * 그 자리다.
 */
describe('축의 눈금', () => {
  const maxima = [1, 7_000, 20_000, 30_000, 125_000, 1_000_000, 50_000_000];

  it.each(maxima)('최댓값이 %s 일 때 라벨이 겹치지 않는다', (max) => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', max)]} label="최근 7일" />,
    );

    const labels = axisLabels(container);
    expect(labels.length).toBeGreaterThanOrEqual(5);
    expect(new Set(labels).size, `겹치는 라벨: ${labels.join(' · ')}`).toBe(labels.length);
  });

  it.each(maxima)('최댓값이 %s 일 때 라벨이 그 눈금의 값과 같다', (max) => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', max)]} label="최근 7일" />,
    );

    const values = axisLabels(container).map(asNumber);
    // 0 에서 시작해 같은 간격으로 올라간다 — 네 칸이 천장을 덮는다
    expect(values[0]).toBe(0);
    const step = values[1]!;
    expect(values, `라벨: ${axisLabels(container).join(' · ')}`).toEqual([
      0, step, step * 2, step * 3, step * 4,
    ]);
    // 천장은 최댓값을 덮어야 한다 — 덮지 못하면 막대가 그래프를 넘는다
    expect(step * 4).toBeGreaterThanOrEqual(max);
  });

  /**
   * **천장이 최댓값에 바짝 붙어야 막대를 견줄 수 있다.**
   *
   * 눈금을 반듯하게 끊는 대가로 천장이 조금 올라간다. 그 "조금" 을 재지 않으면, 단위를
   * 한 칸 크게 잡는 것만으로 막대가 그래프 바닥에 깔려 어느 날이 많았는지 알 수 없게 된다
   * — 예컨대 늘 만원 단위로 끊으면 최댓값 7천원짜리 그래프의 천장이 4만원이 된다.
   */
  it.each(maxima.filter((m) => m >= 4_000))('최댓값이 %s 일 때 천장이 그 두 배를 넘지 않는다', (max) => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', max)]} label="최근 7일" />,
    );

    const ceiling = asNumber(axisLabels(container).at(-1)!);
    expect(ceiling, `천장 ${ceiling} / 최댓값 ${max}`).toBeLessThan(max * 2);
  });

  /** 한 그래프 안에서 단위가 섞이면 축을 읽을 수 없다 */
  it.each(maxima)('최댓값이 %s 일 때 단위가 섞이지 않는다', (max) => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', max)]} label="최근 7일" />,
    );

    const labels = axisLabels(container).filter((l) => l !== '0');
    const man = labels.filter((l) => l.endsWith('만')).length;
    expect(man === 0 || man === labels.length, `섞였다: ${labels.join(' · ')}`).toBe(true);
  });
});

describe('막대', () => {
  it('값이 클수록 높다 — 최댓값이 가장 위다', () => {
    const { container } = render(
      <RevenueChart
        data={[day('2026-11-01', 10_000), day('2026-11-02', 50_000), day('2026-11-03', 30_000)]}
        label="최근 7일"
      />,
    );

    const [low, high, mid] = barTops(container);
    // y 는 위로 갈수록 작아진다
    expect(high).toBeLessThan(mid!);
    expect(mid).toBeLessThan(low!);
  });

  it('0 인 날은 바닥에 붙는다', () => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', 40_000)]} label="최근 7일" />,
    );

    const [zero] = barTops(container);
    // 베이스라인이 200 이다 — 0 이면 높이가 없다
    expect(zero).toBe(200);
  });

  /** 막대와 축이 다른 천장을 쓰면 "눈금 3만" 자리에 3만이 아닌 막대가 선다 */
  it('막대와 축이 같은 천장을 쓴다', () => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 0), day('2026-11-02', 40_000)]} label="최근 7일" />,
    );

    const ceiling = asNumber(axisLabels(container).at(-1)!);
    const top = barTops(container).at(-1)!;
    // y(v) = 200 - (v / ceiling) * 180
    expect(top).toBeCloseTo(200 - (40_000 / ceiling) * 180, 5);
  });
});

/**
 * **눈으로 보는 사람과 귀로 듣는 사람이 같은 숫자를 읽어야 한다.**
 *
 * SVG 옆에 낭독기용 표를 숨겨 두는데, 그 표와 막대가 다른 값을 말하면 한쪽은 틀린 매출을
 * 읽는다. 그래프는 시각적 요약일 뿐이고 값을 읽어야 하는 사람에게는 표가 전부다.
 */
describe('숨겨 둔 표', () => {
  const data = [day('2026-11-01', 12_300), day('2026-11-02', 45_600)];

  it('모든 날이 들어간다 — 그래프에는 있고 표에는 없는 날이 없다', () => {
    render(<RevenueChart data={data} label="최근 7일" />);

    const table = screen.getByRole('table', { name: '최근 7일 일별 매출' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(data.length);
  });

  it('금액이 막대 라벨과 같은 형식·같은 수다', () => {
    const { container } = render(<RevenueChart data={data} label="최근 7일" />);

    const table = screen.getByRole('table', { name: '최근 7일 일별 매출' });
    const cells = [...table.querySelectorAll('tbody td')].map((td) => td.textContent ?? '');
    expect(cells).toEqual(['12,300원', '45,600원']);

    // 최댓값 막대에 얹힌 라벨도 같은 수를 말한다
    const bar = [...container.querySelectorAll('text')].find((t) => t.textContent === '45,600');
    expect(bar, '최댓값 막대의 금액 라벨이 없다').toBeTruthy();
  });

  it('그림에는 제목과 설명이 붙는다 — 낭독기가 무슨 그림인지 말할 수 있어야 한다', () => {
    render(<RevenueChart data={data} label="최근 7일" />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByText('최근 7일 일별 매출', { selector: 'title' })).toBeDefined();
  });
});

describe('오늘', () => {
  const data = [day('2026-11-01', 50_000), day('2026-11-02', 10_000)];

  /** 색만으로 구분하면 색을 못 보는 사람에게는 같은 막대다 */
  it('아직 집계 중이라고 글로도 적는다', () => {
    render(<RevenueChart data={data} label="최근 7일" />);

    expect(screen.getByText('진행 중')).toBeDefined();
  });

  it('금액 라벨은 최댓값과 오늘에만 얹는다 — 모든 막대에 숫자를 얹으면 그래프를 볼 이유가 없다', () => {
    const { container } = render(
      <RevenueChart
        data={[day('2026-11-01', 50_000), day('2026-11-02', 30_000), day('2026-11-03', 10_000)]}
        label="최근 7일"
      />,
    );

    const amounts = [...container.querySelectorAll('text')]
      .map((t) => t.textContent ?? '')
      .filter((text) => ['50,000', '30,000', '10,000'].includes(text));
    // 최댓값(50,000)과 오늘(10,000) 둘뿐이다
    expect(amounts.sort()).toEqual(['10,000', '50,000']);
  });

  it('오늘이 최댓값이면 금액을 두 번 적지 않는다', () => {
    const { container } = render(
      <RevenueChart data={[day('2026-11-01', 10_000), day('2026-11-02', 50_000)]} label="최근 7일" />,
    );

    const amounts = [...container.querySelectorAll('text')].filter(
      (t) => t.textContent === '50,000',
    );
    expect(amounts).toHaveLength(1);
  });
});
