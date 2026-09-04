/**
 * Next 의 데이터 캐시를 테스트에서 대체한다.
 *
 * `unstable_cache` 는 Next 런타임의 incrementalCache 를 요구해서, 밖에서
 * 부르면 "Invariant: incrementalCache missing" 으로 던진다. 캐시 자체는
 * 우리가 만든 로직이 아니므로 여기서는 지나가게 둔다 — 'server-only' 를
 * 빈 모듈로 두는 것과 같다.
 *
 * **다만 직렬화는 흉내 낸다.** 진짜 캐시는 값을 JSON 으로 저장하므로
 * Date 가 문자열로 돌아온다. 그냥 통과시키면 테스트에서는 Date 인 채로
 * 남아서, `publishedAt.getTime is not a function` 같은 것을 배포한 뒤에야
 * 알게 된다 — 실제로 그렇게 겪었다. 캐시를 통과한 값은 여기서도 통과한
 * 값이어야 한다.
 */
export const unstable_cache =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> =>
    JSON.parse(JSON.stringify(await fn(...args))) as R;

export const revalidateTag = (): undefined => undefined;
export const revalidatePath = (): undefined => undefined;
