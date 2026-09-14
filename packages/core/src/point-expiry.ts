/**
 * 포인트 소멸 규칙. 순수 로직만, I/O 없음.
 *
 * 적립할 때 유효기간(expiresAt)을 찍어 두었지만 **그 값을 읽는 코드가 한 줄도
 * 없었다.** 만료된 포인트가 잔액에 그대로 남아 계속 쓸 수 있었고, 대사 배치는
 * 잔액과 원장 합계만 비교하니 둘 다 틀린 채로 &ldquo;정상&rdquo; 이라고 말했다.
 * 스키마에는 expiresAt 인덱스까지 있었다 — 아무도 쓰지 않는 질의를 위한
 * 인덱스였다.
 */

export interface PointLedgerEntry {
  /** 양수는 적립, 음수는 사용·소멸 */
  readonly amount: number;
  readonly createdAt: Date;
  /** 유효기간. 없으면 소멸하지 않는다(운영 조정·환불 반환 등). */
  readonly expiresAt: Date | null;
}

/**
 * 소멸시킬 금액.
 *
 * **먼저 없어질 것부터 쓴 것으로 친다.** 원장은 +/- 목록일 뿐이라 어떤 사용이
 * 어떤 적립을 썼는지 적혀 있지 않다. 그래서 여기서 짝을 짓는데, 기한이 가까운
 * 것부터 소진했다고 보는 편이 고객에게 유리하다 — 반대로 짝지으면 곧 사라질
 * 포인트를 남겨 두고 멀쩡한 것을 먼저 태우는 셈이 된다.
 *
 * 기한이 없는 적립은 맨 뒤로 보낸다. 언제든 쓸 수 있으니 아껴 두는 것이 맞다.
 *
 * 이미 적힌 소멸(EXPIRE)도 음수라 함께 차감된다 — 그래서 같은 포인트를 두 번
 * 소멸시키지 않는다. 배치가 하루에 몇 번 돌아도 결과가 같다.
 */
export function expirableAmount(entries: readonly PointLedgerEntry[], now: Date): number {
  const cutoff = now.getTime();
  return remainingEarnings(entries).reduce(
    (sum, e) => (e.expiresAt !== null && e.expiresAt.getTime() <= cutoff ? sum + e.remaining : sum),
    0,
  );
}

/**
 * 적립마다 아직 안 쓴 몫.
 *
 * 짝짓기는 **시각과 상관이 없다** — 기한 순으로 줄 세워 쓴 만큼 앞에서부터 깎을 뿐이다. 그래서 소멸 배치와
 * 화면의 소멸 예정 목록이 이 하나를 나눠 쓰고, 둘이 다른 금액을 말할 수 없다.
 */
function remainingEarnings(
  entries: readonly PointLedgerEntry[],
): { readonly expiresAt: Date | null; readonly remaining: number }[] {
  const earnings = entries
    .filter((e) => e.amount > 0)
    .map((e) => ({ ...e, remaining: e.amount }))
    .sort((a, b) => {
      const ax = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bx = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return ax - bx || a.createdAt.getTime() - b.createdAt.getTime();
    });

  // 쓴 것·소멸된 것의 합계. 음수의 합이므로 부호를 뒤집는다.
  let spent = entries.reduce((sum, e) => (e.amount < 0 ? sum - e.amount : sum), 0);

  for (const earning of earnings) {
    if (spent <= 0) break;
    const taken = Math.min(spent, earning.remaining);
    earning.remaining -= taken;
    spent -= taken;
  }
  return earnings;
}

/**
 * 곧 사라질 포인트.
 *
 * 화면에서 &ldquo;○○원이 N일 뒤 사라집니다&rdquo; 라고 알려 주는 데 쓴다.
 * 아무 말 없이 사라지면 고객은 잔액이 왜 줄었는지 알 수 없다.
 */
export const EXPIRY_NOTICE_DAYS = 30;

export function expiringSoonAmount(
  entries: readonly PointLedgerEntry[],
  now: Date,
  withinDays = EXPIRY_NOTICE_DAYS,
): number {
  const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  // 그 시점에 소멸될 총액에서 지금 이미 소멸될 것을 뺀다
  return expirableAmount(entries, horizon) - expirableAmount(entries, now);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PointExpiryDay {
  /** 소멸되는 날(KST) — `YYYY-MM-DD` */
  readonly date: string;
  /** 그날 사라지는 포인트. 같은 날 기한인 적립을 모두 더했다 */
  readonly amount: number;
  /** 그날 중 가장 이른 기한. 화면의 `<time>` 과 D-day 계산에 쓴다 */
  readonly expiresAt: Date;
  /** 오늘(KST)부터 며칠 남았는가. 오늘이면 0 */
  readonly daysLeft: number;
}

/**
 * 날짜별 소멸 예정.
 *
 * "30일 안에 ○○P" 한 줄로는 **언제** 사라지는지 모른다 — 다음 주에 사라지는지 29일 뒤인지에 따라 지금 쓸지가
 * 달라진다. 그래서 날짜마다 나눠 보여 준다.
 *
 * 날짜는 **KST 로 자른다.** 이 저장소의 다른 날짜 집계와 같은 기준이고, 자정 넘어 기한이 찍힌 적립이 UTC 로
 * 하루 앞 날짜에 묶이면 손님은 하루 일찍 쓰려고 서두르게 된다.
 *
 * 이미 기한이 지난 몫은 넣지 않는다 — 소멸 배치가 곧 지울 것이고, 지난 날짜를 "예정" 이라 적을 수는 없다.
 * `withinDays` 를 주면 그 안의 날만 — `expiringSoonAmount` 와 합이 같다(검사가 본다).
 */
export function pointExpirySchedule(
  entries: readonly PointLedgerEntry[],
  now: Date,
  withinDays?: number,
): PointExpiryDay[] {
  const cutoff = now.getTime();
  const horizon = withinDays === undefined ? Number.POSITIVE_INFINITY : cutoff + withinDays * DAY_MS;
  const today = kstDayIndex(now);

  const byDate = new Map<string, { amount: number; expiresAt: Date }>();
  for (const e of remainingEarnings(entries)) {
    if (e.remaining <= 0 || e.expiresAt === null) continue;
    const at = e.expiresAt.getTime();
    if (at <= cutoff || at > horizon) continue;

    const date = new Date(at + KST_OFFSET_MS).toISOString().slice(0, 10);
    const day = byDate.get(date);
    if (day) {
      day.amount += e.remaining;
      if (at < day.expiresAt.getTime()) day.expiresAt = e.expiresAt;
    } else {
      byDate.set(date, { amount: e.remaining, expiresAt: e.expiresAt });
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, d]) => ({ date, amount: d.amount, expiresAt: d.expiresAt, daysLeft: kstDayIndex(d.expiresAt) - today }));
}

/** KST 기준 날짜 번호 — 두 시각의 날짜 차를 시각이 아니라 달력으로 센다 */
const kstDayIndex = (at: Date): number => Math.floor((at.getTime() + KST_OFFSET_MS) / DAY_MS);
