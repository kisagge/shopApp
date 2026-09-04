/**
 * 포인트가 오간 이유.
 *
 * DB 의 PointReason 과 같은 집합이어야 한다 — 정합성 검사가 지킨다.
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
