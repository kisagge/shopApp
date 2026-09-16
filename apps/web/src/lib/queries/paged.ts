import 'server-only';
import { totalPagesOf } from '@shop/core';

/**
 * 범위를 넘은 쪽을 마지막 쪽으로 당긴다.
 *
 * **쪽 번호는 당기는데 목록은 안 당겼다.** 화면의 쪽 번호(core 의 pageNav)는 범위를
 * 벗어난 값을 가장 가까운 쪽으로 당겨 그리는데, 정작 줄을 읽는 쪽은 받은 숫자를 그대로
 * skip 에 넣었다. 그래서 `?page=999` 는 **마지막 쪽이 칠해진 채 목록만 빈** 화면이 됐다.
 * core 의 clampPage 에 적어 둔 뜻("빈 화면을 보여 주고 '없는 쪽입니다' 라고 말하는 것보다,
 * 있는 것을 보여 주는 편이 낫다")이 질의까지 닿지 않은 것이다.
 *
 * **손으로 고친 주소만의 일이 아니다.** 즐겨찾기에 담아 둔 `?page=5` 는 그 사이 주문이
 * 보관되면 사라진다. 그때 아무 설명 없는 빈 표를 주면 "왜 아무것도 없지" 로 끝난다.
 *
 * **넘쳤을 때만 한 번 더 읽는다.** 세고 나서 읽도록 순서를 바꾸면 멀쩡한 쪽까지 왕복이
 * 하나씩 는다 — 목록 화면은 이미 findMany 와 count 를 나란히 던지고 있다.
 */
export async function clampToLastPage<T>(
  first: readonly T[],
  range: { readonly page: number; readonly pageSize: number; readonly total: number },
  readAt: (page: number) => Promise<T[]>,
): Promise<readonly T[]> {
  if (first.length > 0 || range.total === 0) return first;

  const last = totalPagesOf(range.total, range.pageSize);
  // 첫 쪽이 비었는데 전체가 0 이 아니면 그 사이에 줄이 지워진 것이다 — 다시 읽어도 같다
  return range.page > last ? readAt(last) : first;
}
