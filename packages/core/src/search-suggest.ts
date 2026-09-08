/**
 * 검색 도우미 규칙. 순수 로직만, I/O 없음.
 */
import { standsAlone } from './catalog';

/**
 * 자동완성을 시작하는 글자 수.
 *
 * 로마자 한 글자로는 카탈로그 절반이 걸린다 — `a` 하나가 서른넷 중 열아홉을
 * 문다. 그건 제안이 아니라 목록이다.
 *
 * **한글 한 음절은 다르다.** `울` 은 여덟 개만 문다. 그래서 이 수가 아니라
 * standsAlone 이 먼저 답한다.
 */
export const SUGGEST_MIN_LENGTH = 2;

/** 한 번에 보여 줄 제안 수. 목록이 길면 고르는 것이 더 오래 걸린다. */
export const SUGGEST_LIMIT = 8;

export const canSuggest = (term: string): boolean => {
  const trimmed = term.trim();
  return trimmed.length >= SUGGEST_MIN_LENGTH || standsAlone(trimmed);
};

/**
 * 인기 검색어로 내보낼 만한가.
 *
 * 두 가지를 거른다.
 *
 * **결과가 없던 검색어는 빼야 한다.** 우리가 팔지 않는 것을 사람들이 찾았다는
 * 사실은 운영진에게는 값진 정보지만, 손님에게 권하면 빈 화면으로 보내는 것이
 * 된다 — 권한 대로 갔더니 아무것도 없는 경험이 가장 나쁘다.
 *
 * **한 사람이 여러 번 친 것은 인기가 아니다.** 같은 세션에서 스무 번 친
 * 검색어가 목록 맨 위에 오르면, 그것은 사람들이 찾는 것이 아니라 한 사람이
 * 헤맨 흔적이다. 그래서 횟수가 아니라 **서로 다른 세션 수**로 센다.
 */
export const POPULAR_MIN_SESSIONS = 3;

export interface SearchTermStat {
  readonly term: string;
  /** 서로 다른 세션 수. 횟수가 아니다. */
  readonly sessions: number;
  /** 그 검색어가 결과를 낸 적이 있는가 */
  readonly hadResults: boolean;
}

export function popularTerms(
  stats: readonly SearchTermStat[],
  limit: number,
  minSessions = POPULAR_MIN_SESSIONS,
): string[] {
  return stats
    .filter((s) => s.hadResults && s.sessions >= minSessions)
    .slice(0, limit)
    .map((s) => s.term);
}
