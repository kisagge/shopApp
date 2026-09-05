/**
 * 추천 목록을 만드는 규칙. 순수 로직만, I/O 없음.
 *
 * **첫날에도 빈칸이 아니어야 한다.** 함께 본 기록은 사람이 다녀가야 쌓이므로
 * 새 상품에는 없고, 문을 연 직후에는 어느 상품에도 없다. 그때 아무것도
 * 보여 주지 않으면 추천 자리가 "가끔 나오는 자리" 가 되어, 있는지 없는지를
 * 사용자가 예측할 수 없다.
 *
 * 그래서 **두 줄기를 이어 붙인다** — 기록에서 나온 것을 앞에 두고, 모자라는
 * 만큼을 뒤에서 채운다. 기록이 쌓일수록 뒤엣것이 밀려난다.
 */

export interface Ranked {
  readonly id: string;
}

export function mergeRecommendations<T extends Ranked>(input: {
  /** 함께 본 기록에서 나온 것. 강한 순으로 정렬돼 있어야 한다. */
  readonly primary: readonly T[];
  /** 기록이 모자랄 때 채울 것. 같은 카테고리의 잘 팔리는 것 같은. */
  readonly fallback: readonly T[];
  /** 지금 보고 있는 상품. 자기 자신을 추천하지 않는다. */
  readonly excludeId: string;
  readonly limit: number;
}): T[] {
  const { primary, fallback, excludeId, limit } = input;
  if (limit <= 0) return [];

  const picked: T[] = [];
  const seen = new Set<string>([excludeId]);

  for (const item of [...primary, ...fallback]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length === limit) break;
  }

  return picked;
}

/**
 * 보여 줄 만큼 모였는가.
 *
 * 한두 개만 뜨는 줄은 추천이 아니라 빈자리처럼 보인다. 최소치를 못 채우면
 * 줄 자체를 그리지 않는 편이 낫다.
 */
export const MIN_RECOMMENDATIONS = 3;

export const worthShowing = (count: number): boolean => count >= MIN_RECOMMENDATIONS;
