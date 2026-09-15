import { pointExpirySchedule, type PointLedgerEntry } from './point-expiry';

/**
 * 곧 사라질 쿠폰·적립금을 미리 알리는 규칙. 순수 로직만.
 *
 * 적립금 화면에 소멸 예정일을 날짜별로 보여 주지만 **들어와야 보인다.** 쿠폰은 쓰려고 할 때에야 기한이 지난 것을 안다.
 * 사라지기 한 주 전에 한 번 알린다 — 한 주면 한 번 더 살 여유가 있고, 매일 알리면 스팸이 된다.
 *
 * **한 번만 알린다.** 알린 쿠폰·적립 줄에 알린 때를 적어 두고 다음 실행이 건너뛴다. 날짜 창(정확히 7일 뒤 하루)으로
 * 거르지 않는 이유: 배치가 하루 빠지면 그날 기한인 것은 영영 안 알려진다. "7일 안에 들어왔는데 아직 안 알린 것" 이면
 * 하루 늦게 돌아도 잡힌다.
 */

export const EXPIRY_NOTICE_LEAD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 알릴 범위의 끝 — 지금부터 이때까지 사라지는 것 */
export const expiryNoticeUntil = (now: Date): Date => new Date(now.getTime() + EXPIRY_NOTICE_LEAD_DAYS * DAY_MS);

/** 알림에 싣는 날짜. 말과 상관없이 읽히는 `YYYY-MM-DD`(KST) */
export const kstDate = (at: Date): string => new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * 한 사람의 곧 사라질 적립금 — 안 쓴 몫만(먼저 사라질 것부터 썼다고 보는 소멸 규칙 그대로), 가장 이른 날과 날짜별 목록.
 * 사라질 것이 없으면 null.
 */
export function pointsExpiringSoon(
  entries: readonly PointLedgerEntry[],
  now: Date,
): { readonly amount: number; readonly firstDate: string; readonly days: readonly { date: string; amount: number }[] } | null {
  const days = pointExpirySchedule(entries, now, EXPIRY_NOTICE_LEAD_DAYS);
  const amount = days.reduce((sum, d) => sum + d.amount, 0);
  if (amount <= 0 || days.length === 0) return null;
  return { amount, firstDate: days[0]!.date, days: days.map((d) => ({ date: d.date, amount: d.amount })) };
}
