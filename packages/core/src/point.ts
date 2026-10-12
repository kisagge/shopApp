/**
 * 포인트가 오간 이유.
 *
 * DB 의 PointReason 과 같은 집합이어야 한다 — `packages/db/test/enum-parity.test.ts` 가 지킨다.
 * **한동안 그 말이 거짓이었다.** 그 검사는 짝을 손으로 적고 있어서 여섯 개만 봤고, 이 목록은
 * 그중에 없었다. 이제는 이름 규칙으로 짝을 찾으니(`PointReason` ↔ `POINT_REASON`) 여기만
 * 늘리면 검사가 먼저 진다.
 * 이름표는 여기 없다: 무엇이 있는지는 규칙이고 뭐라고 부를지는 화면이다.
 */
export const POINT_REASON = [
  'EARN_PURCHASE',
  'USE_PURCHASE',
  'EARN_REVIEW',
  'EARN_SIGNUP',
  'CANCEL_REFUND',
  'EXPIRE',
  'ADMIN_ADJUST',
] as const;
export type PointReason = (typeof POINT_REASON)[number];

export const isPointReason = (value: unknown): value is PointReason =>
  typeof value === 'string' && (POINT_REASON as readonly string[]).includes(value);
