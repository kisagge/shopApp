/**
 * 게시 기간 규칙. 순수 로직만.
 *
 * 배너와 기획전이 같은 규칙을 쓴다. 두 벌로 두면 한쪽만 고쳐지고, 그 어긋남은
 * **끝난 기획전이 계속 걸려 있는 것**으로 나타난다 — 아무도 오류라고 말해 주지
 * 않는 종류다.
 *
 * 판정은 **서버 시각으로** 한다. 브라우저 시계를 믿고 거르면 기기 시계가
 * 틀어진 사용자에게 끝난 기획전이 계속 보인다.
 */

export interface Schedule {
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

/**
 * 지금 노출할 것인가.
 *
 * 시작은 포함, 종료는 **제외**한다. 종료 시각을 포함하면 "9월 1일까지"로
 * 설정한 기획전이 9월 1일 하루를 통째로 더 노출된다.
 */
export function isLive(item: Schedule, now: Date): boolean {
  if (!item.isActive) return false;
  if (item.startsAt !== null && now.getTime() < item.startsAt.getTime()) return false;
  if (item.endsAt !== null && now.getTime() >= item.endsAt.getTime()) return false;
  return true;
}

/** 기간이 뒤집혀 있으면 아무 때도 노출되지 않는다 — 저장 전에 막아야 한다. */
export function hasValidWindow(item: {
  startsAt: Date | null;
  endsAt: Date | null;
}): boolean {
  if (item.startsAt === null || item.endsAt === null) return true;
  return item.startsAt.getTime() < item.endsAt.getTime();
}

export type PublishStatus = 'LIVE' | 'SCHEDULED' | 'ENDED' | 'PAUSED';

/**
 * 어드민 목록에 보여 줄 상태.
 *
 * "활성"만 표시하면 왜 안 보이는지 알 수 없다. 예정인지, 끝났는지,
 * 사람이 껐는지를 구분해 줘야 운영자가 스스로 판단한다.
 */
export function publishStatus(item: Schedule, now: Date): PublishStatus {
  if (!item.isActive) return 'PAUSED';
  if (item.startsAt !== null && now.getTime() < item.startsAt.getTime()) return 'SCHEDULED';
  if (item.endsAt !== null && now.getTime() >= item.endsAt.getTime()) return 'ENDED';
  return 'LIVE';
}
