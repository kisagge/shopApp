import 'server-only';

/**
 * 유니크 제약 위반(Prisma 의 P2002)인가.
 *
 * **같은 판정이 저장소 안에 여섯 가지 모양으로 흩어져 있었다** — `instanceof
 * Prisma.PrismaClientKnownRequestError` 로 보는 곳, `'code' in error` 로 보는 곳, 오리
 * 타입으로 보는 곳. 그리고 "어느 칸이 부딪혔나" 를 함께 보는 여덟 줄이 세 곳에 복사돼
 * 있었다(주문번호·멱등 열쇠·적립 조정 열쇠).
 *
 * **모양으로 본다(instanceof 가 아니라).** 검사에서 흉내 낸 Prisma 는 평범한 객체를
 * 던지므로 `instanceof` 는 거기서 늘 거짓이다 — 그래서 멱등 검사들이 애초에 오리 타입으로
 * 적혀 있었다. 실제로 둘을 섞어 두면 "운영에서는 잡히는데 검사에서는 안 잡히는" 판정이
 * 생긴다.
 */
export function isUniqueViolation(error: unknown, column?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  if (column === undefined) return true;

  /*
   * **배열에 String() 을 씌우면 안 된다.** Prisma 는 부딪힌 칸을 배열로 주기도 하고
   * 문자열로 주기도 하는데, 배열에 String() 을 씌우면 "[object Object]" 가 되어 어떤
   * 이름과도 맞지 않는다. 그러면 재시도가 **조용히** 실패한다 — 주문번호가 부딪혔는데
   * 다시 뽑지 않고 그대로 터진다.
   */
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(column);
  return typeof target === 'string' && target.includes(column);
}
