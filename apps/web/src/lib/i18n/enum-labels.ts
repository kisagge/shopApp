import {
  ORDER_STATUS, MEMBER_GRADE, RETURN_TYPE, RETURN_REASON, RETURN_STATUS,
  SIZE_FIT, REPORT_REASON,
  type OrderStatus, type MemberGrade, type ReturnType, type ReturnReason,
  type ReturnStatus, type SizeFit, type ReportReason,
} from '@shop/core';
import type { MessageKey } from '@shop/i18n';

/**
 * 도메인 값의 이름표를 사전 열쇠로 잇는다.
 *
 * **core 에는 이름표가 없다.** 무엇이 있는지는 규칙이고 뭐라고 부를지는
 * 화면이라, 화면이 세 나라 말로 나가는 순간 그 표는 core 에 있을 수 없다.
 *
 * 표를 손으로 적지 않고 값 목록에서 만든다. 그래야 값이 하나 늘었을 때
 * **여기가 아니라 사전에서** 걸린다 — 열쇠가 없으면 화면에 열쇠 이름이
 * 그대로 뜨고, 그것을 검사가 잡는다(packages/db 의 enum 정합성 검사).
 */
const keysOf = <T extends string>(values: readonly T[], group: string): Record<T, MessageKey> =>
  Object.fromEntries(values.map((v) => [v, `${group}.${v}`])) as Record<T, MessageKey>;

export const ORDER_STATUS_KEY: Record<OrderStatus, MessageKey> = keysOf(
  ORDER_STATUS,
  'orderStatus',
);
export const GRADE_KEY: Record<MemberGrade, MessageKey> = keysOf(MEMBER_GRADE, 'grade');
export const RETURN_TYPE_KEY: Record<ReturnType, MessageKey> = keysOf(RETURN_TYPE, 'returnType');
export const RETURN_REASON_KEY: Record<ReturnReason, MessageKey> = keysOf(
  RETURN_REASON,
  'returnReason',
);
export const RETURN_STATUS_KEY: Record<ReturnStatus, MessageKey> = keysOf(
  RETURN_STATUS,
  'returnStatus',
);
export const SIZE_FIT_KEY: Record<SizeFit, MessageKey> = keysOf(SIZE_FIT, 'sizeFit');
export const REPORT_REASON_KEY: Record<ReportReason, MessageKey> = keysOf(
  REPORT_REASON,
  'reportReason',
);
