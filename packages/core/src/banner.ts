/**
 * 홈 배너 규칙. 순수 로직만.
 *
 * 게시 기간 판정은 **기획전과 같은 규칙**이라 schedule 에 두고 여기서는
 * 배너의 이름으로 다시 내보내기만 한다. 부르는 쪽을 고치지 않으면서 규칙은
 * 한 벌로 둔다.
 */
import { isLive, publishStatus, type Schedule, type PublishStatus } from './schedule';

export { hasValidWindow } from './schedule';

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

export type BannerSchedule = Schedule;

export const isBannerLive = isLive;

export type BannerStatus = PublishStatus;

export const BANNER_STATUS_LABEL: Readonly<Record<BannerStatus, string>> = {
  LIVE: '노출 중',
  SCHEDULED: '예정',
  ENDED: '종료',
  PAUSED: '중지',
};

export const bannerStatus = publishStatus;
