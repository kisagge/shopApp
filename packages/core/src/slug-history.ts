/**
 * 주소는 이름이 바뀌어도 살아남아야 한다.
 *
 * slug 는 운영자가 직접 고칠 수 있는 값이다. 고치는 순간 그때까지 나간 모든
 * 링크가 죽는다 — 공유된 메시지, 검색엔진 색인, 광고 소재까지. 화면에는
 * 멀쩡한 404 가 나오므로 **아무도 사고인 줄 모른다.**
 *
 * 그래서 옛 주소를 기록해 두고 새 주소로 넘긴다. 여기 있는 것은 "무엇으로
 * 판단하는가" 뿐이고, 실제 조회와 넘기기는 앱이 한다.
 */

/** 주소 하나를 찾아본 결과 */
export type SlugLookup<T> =
  /** 지금 쓰는 주소다 */
  | { readonly kind: 'current'; readonly value: T }
  /** 옛 주소다. 새 주소로 넘긴다 */
  | { readonly kind: 'moved'; readonly to: string }
  /** 우리가 쓴 적 없는 주소다 */
  | { readonly kind: 'gone' };

/**
 * **지금 주소를 먼저 본다.**
 *
 * 되돌린 경우가 있다 — a → b 로 바꿨다가 다시 a 로 돌아오면, a 는 지금
 * 주소이면서 동시에 기록에도 남아 있다. 기록을 먼저 보면 자기 자신으로
 * 넘기는 고리가 생긴다.
 */
export function slugLookup<T>(input: {
  readonly current: T | null | undefined;
  readonly movedTo: string | null | undefined;
}): SlugLookup<T> {
  if (input.current !== null && input.current !== undefined) {
    return { kind: 'current', value: input.current };
  }
  if (input.movedTo) return { kind: 'moved', to: input.movedTo };
  return { kind: 'gone' };
}

/**
 * 이 주소를 쓸 수 있는가.
 *
 * **지금 쓰는 주소만 보면 모자란다.** 남이 버리고 간 주소를 새로 집어 가면,
 * 그 주소가 한쪽에서는 새 주인을 가리키고 다른 쪽에서는 옛 주인으로 넘긴다.
 * 그래서 **기록에 남은 주소도 남의 것이면 막는다.**
 *
 * 다만 **자기가 버린 주소는 다시 쓸 수 있다.** 고쳤다가 되돌리는 것은 흔한
 * 일이고, 그때까지 막으면 자기 옛 이름조차 못 쓴다.
 */
export function isSlugTaken(input: {
  /** 지금 그 주소를 쓰는 것의 id. 없으면 null */
  readonly liveOwnerId: string | null;
  /** 기록에 남은 그 주소의 옛 주인 id. 없으면 null */
  readonly historyOwnerId: string | null;
  /** 지금 이름을 정하려는 것의 id. 새로 만드는 중이면 없다 */
  readonly selfId?: string | undefined;
}): boolean {
  const { liveOwnerId, historyOwnerId, selfId } = input;
  if (liveOwnerId !== null && liveOwnerId !== selfId) return true;
  if (historyOwnerId !== null && historyOwnerId !== selfId) return true;
  return false;
}
