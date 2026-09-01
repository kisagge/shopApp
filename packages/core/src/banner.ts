/**
 * 홈 배너 규칙. 순수 로직만.
 *
 * 게시 여부는 **서버 시각으로** 판단한다. 브라우저 시계를 믿고 거르면
 * 기기 시계가 틀어진 사용자에게 끝난 기획전이 계속 보인다.
 */

export const BANNER_TONE = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;
export type BannerTone = (typeof BANNER_TONE)[number];

export const BANNER_TONE_LABEL: Readonly<Record<BannerTone, string>> = {
  sand: '샌드', stone: '스톤', clay: '클레이', olive: '올리브', mist: '미스트',
};

export function isBannerTone(value: string): value is BannerTone {
  return (BANNER_TONE as readonly string[]).includes(value);
}

/** 캐러셀이 감당할 수 있는 수. 이보다 많으면 아무도 끝까지 보지 않는다. */
export const MAX_BANNERS = 6;

export interface BannerSchedule {
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

/**
 * 지금 노출할 배너인가.
 *
 * 시작은 포함, 종료는 **제외**한다. 종료 시각을 포함하면 "9월 1일까지"로
 * 설정한 기획전이 9월 1일 하루를 통째로 더 노출된다.
 */
export function isBannerLive(banner: BannerSchedule, now: Date): boolean {
  if (!banner.isActive) return false;
  if (banner.startsAt !== null && now.getTime() < banner.startsAt.getTime()) return false;
  if (banner.endsAt !== null && now.getTime() >= banner.endsAt.getTime()) return false;
  return true;
}

/** 기간이 뒤집혀 있으면 아무 때도 노출되지 않는다 — 저장 전에 막아야 한다. */
export function hasValidWindow(banner: {
  startsAt: Date | null;
  endsAt: Date | null;
}): boolean {
  if (banner.startsAt === null || banner.endsAt === null) return true;
  return banner.startsAt.getTime() < banner.endsAt.getTime();
}

export type BannerStatus = 'LIVE' | 'SCHEDULED' | 'ENDED' | 'PAUSED';

export const BANNER_STATUS_LABEL: Readonly<Record<BannerStatus, string>> = {
  LIVE: '노출 중',
  SCHEDULED: '예정',
  ENDED: '종료',
  PAUSED: '중지',
};

/**
 * 어드민 목록에 보여 줄 상태.
 *
 * "활성"만 표시하면 왜 안 보이는지 알 수 없다. 예정인지, 끝났는지,
 * 사람이 껐는지를 구분해 줘야 운영자가 스스로 판단한다.
 */
export function bannerStatus(banner: BannerSchedule, now: Date): BannerStatus {
  if (!banner.isActive) return 'PAUSED';
  if (banner.startsAt !== null && now.getTime() < banner.startsAt.getTime()) return 'SCHEDULED';
  if (banner.endsAt !== null && now.getTime() >= banner.endsAt.getTime()) return 'ENDED';
  return 'LIVE';
}
