/**
 * **달력은 한국 시각으로 센다.**
 *
 * 가게는 한국에 있고, 손님도 운영자도 "며칠 기다렸나" 를 한국 달력으로 센다. 시각 차이를 24로
 * 나누면 안 된다 — 어제 밤 11시에 들어온 주문은 아홉 시간밖에 안 지났어도 **어제 것**이다.
 *
 * 이 두 줄은 `point-expiry` 와 `expiry-notice` 가 **각자 적어** 두고 있었다. 세 번째 자리(주문이
 * 기다린 날)가 생겼으니 여기로 모은다 — 같은 수를 세 곳에서 세면 언젠가 한 곳만 틀린다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 날짜 번호 — 두 시각의 날짜 차를 시각이 아니라 달력으로 센다 */
export const kstDayIndex = (at: Date): number => Math.floor((at.getTime() + KST_OFFSET_MS) / DAY_MS);

/** 말과 상관없이 읽히는 `YYYY-MM-DD`(KST) */
export const kstDate = (at: Date): string =>
  new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
