/**
 * 실사용자 성능 지표. 순수 로직만.
 *
 * **내 기계에서 잰 숫자는 아무것도 말해 주지 않는다.** 로컬 DB, 캐시 데운
 * 상태, 유선 네트워크에서 잰 값은 지하철에서 3G 로 여는 사람의 화면과 관계가
 * 없다. 그래서 실제 방문에서 모은다.
 */

/**
 * 무엇을 재는가.
 *
 * 앞의 셋이 Core Web Vitals 다. 뒤의 둘은 그 셋이 나빴을 때 **어디서
 * 늦었는지** 를 가르는 데 쓴다 — TTFB 가 크면 서버가, FCP 만 크면 대개
 * 스크립트가 늦은 것이다.
 */
export const WEB_VITAL = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const;
export type WebVital = (typeof WEB_VITAL)[number];

export const isWebVital = (name: string): name is WebVital =>
  (WEB_VITAL as readonly string[]).includes(name);

export type VitalRating = 'good' | 'needs-improvement' | 'poor';

/**
 * 좋음·개선 필요·나쁨을 가르는 기준.
 *
 * 구글이 정한 값을 그대로 쓴다 — 우리가 다시 정하면 남들이 말하는 &ldquo;좋은
 * LCP&rdquo; 와 우리 화면의 &ldquo;좋음&rdquo; 이 달라진다. CLS 만 단위가 없고
 * 나머지는 밀리초다.
 */
export const VITAL_THRESHOLD: Readonly<Record<WebVital, { good: number; poor: number }>> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
};

export function rateVital(metric: WebVital, value: number): VitalRating {
  const { good, poor } = VITAL_THRESHOLD[metric];
  if (value <= good) return 'good';
  return value <= poor ? 'needs-improvement' : 'poor';
}

/**
 * 대표값은 **평균이 아니라 75 백분위**다.
 *
 * 평균은 아주 느린 소수를 빠른 다수에 묻어 버린다. 75 백분위는 **"넷 중 셋이
 * 이보다 빨랐다"** 는 뜻이라, 느린 쪽이 넷 중 하나를 넘으면 대표값이 그쪽을
 * 가리킨다 — 구글이 Core Web Vitals 를 이 값으로 판정하는 것도 같은 이유다.
 *
 * 한계도 분명하다: 아주 드물게 아주 느린 사람은 이 값에 잡히지 않는다.
 *
 * 값이 없으면 null 이다. 0 을 돌려주면 "아주 빠름" 으로 읽힌다.
 */
export function p75(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // 가장 가까운 순위법. 표본이 적을 때 보간하면 실제로 없는 값이 대표가 된다.
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

/** 화면에 쓸 자릿수. CLS 만 소수, 나머지는 밀리초라 정수다. */
export function formatVital(metric: WebVital, value: number): string {
  return metric === 'CLS' ? value.toFixed(3) : String(Math.round(value));
}

/**
 * 값을 **얼마나 거슬러** 볼 것인가.
 *
 * **28일로 고정돼 있었다.** 그래서 오늘 내보낸 고침은 지난 27일치 값에 묻혀
 * 거의 움직이지 않는다 — 표본이 서른 몇 개인 화면이라면 더 그렇다. 배포가
 * 값을 바꿨는지 보려면 **배포 뒤만** 볼 수 있어야 하고, 그 사이에 또 손대면
 * 무엇이 무엇을 바꿨는지 영영 가릴 수 없다.
 *
 * 하루·이레·네 주. 네 주가 기본인 것은 구글이 Core Web Vitals 를 28일로
 * 판정하기 때문이고, 하루는 방금 내보낸 것을 보려고 둔다.
 */
export const VITALS_WINDOW_DAYS = [1, 7, 28] as const;
export type VitalsWindow = (typeof VITALS_WINDOW_DAYS)[number];

export const DEFAULT_VITALS_WINDOW: VitalsWindow = 28;

/**
 * 주소에 적힌 구간을 읽는다.
 *
 * **목록에 없는 수는 기본값으로 돌린다.** 주소는 누구나 적어 보낼 수 있는데
 * 이 값은 그대로 질의의 구간이 된다 — 거르지 않으면 `?days=100000` 한 줄로
 * 이벤트 표를 통째로 훑게 할 수 있다. 숫자가 아닌 것, 음수, 소수도 같다.
 *
 * 같은 이름이 두 번 오면(`?days=1&days=7`) 주소 표는 배열을 준다. 마지막 것을
 * 쓴다 — 주소를 손으로 고쳐 붙인 사람이 뜻한 것은 나중에 적은 쪽이다.
 */
export function vitalsWindow(raw: string | readonly string[] | undefined): VitalsWindow {
  const one = Array.isArray(raw) ? raw[raw.length - 1] : (raw as string | undefined);
  const days = Number(one);
  return (VITALS_WINDOW_DAYS as readonly number[]).includes(days)
    ? (days as VitalsWindow)
    : DEFAULT_VITALS_WINDOW;
}

/**
 * **이만큼은 돼야 판정을 내린다.**
 *
 * 75 백분위는 표본이 적으면 "둘째로 느린 값" 과 다르지 않다. 표본 하나로 잰 CLS 0.283 에
 * 빨간 "나쁨" 을 붙이면, 읽는 사람은 **한 사람이 한 번 겪은 일을 회귀로 알고** 그것을 먼저
 * 고치러 간다 — 없는 것을 쫓는 데 시간을 쓰게 하는 쪽이, 아무것도 안 보여 주는 것보다 나쁘다.
 *
 * **값을 감추라는 뜻은 아니다.** 있는 자료를 지우면 "안드로이드는 아예 안 쌓인다" 로 읽힌다.
 * 숫자는 두되 판정만 거둔다 — 그 둘은 다른 말이다.
 */
export const VITALS_MIN_SAMPLES = 10;

export const enoughSamples = (samples: number): boolean => samples >= VITALS_MIN_SAMPLES;
