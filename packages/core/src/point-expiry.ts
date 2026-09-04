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

  const cutoff = now.getTime();
  return earnings.reduce(
    (sum, e) => (e.expiresAt !== null && e.expiresAt.getTime() <= cutoff ? sum + e.remaining : sum),
    0,
  );
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
