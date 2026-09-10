'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { NavProgress } from './nav-progress';

/**
 * 누르면 반응하는 링크. `next/link` 자리에 그대로 끼운다.
 *
 * **왜 필요한가.** 이 앱의 화면은 거의 다 `force-dynamic` 이라, 링크를 눌러도
 * 서버가 다 그릴 때까지 화면이 그대로다. 기기에서 재 보니 확정 응답이 온 뒤
 * 주소가 바뀌기까지 336~813ms 가 더 걸렸다 — 그 사이 아무 표시가 없으면
 * 사람은 안 눌린 줄 알고 다시 누른다. 실제로 그렇게 신고돼서 `NavProgress`
 * 를 만들었는데, 정작 붙은 곳은 상품 카드가 지나는 `AppLink` 뿐이었다.
 *
 * 재 보니 이랬다 — 홈→상품은 표시가 있고, 빵부스러기·마이페이지 메뉴·
 * 장바구니의 링크는 전부 없었다.
 *
 * **왜 이런 모양인가.** `NavProgress` 는 `useLinkStatus` 로 **부모 링크의**
 * 이동 상태를 읽는다. 그래서 링크 안에 있기만 하면 되고, 바깥에서 상태를
 * 넘겨줄 필요가 없다. 그 성질 덕에 `import Link from 'next/link'` 한 줄만
 * 바꿔 끼우면 JSX 는 하나도 안 건드려도 된다.
 *
 * `loading.tsx` 로는 못 한다 — 그 길은 이미 시도했다가 뺐다. 껍데기를 먼저
 * 흘려보내면 상태 코드가 200 으로 굳어 없는 주소가 가짜 200 이 된다.
 * `NavProgress` 주석과 `test/streaming-boundaries.test.ts` 를 참고.
 */
/*
 * 제네릭을 그대로 흘려보낸다. `typedRoutes` 를 켜 두면 `Link` 의 href 가
 * 경로 문자열로 좁혀지는데, 제네릭을 잃으면 `/category/${slug}` 같은
 * 템플릿 주소가 전부 타입 오류가 된다 — 처음 이 파일을 쓸 때 그렇게 됐다.
 */
export function TrackedLink<RouteType>({
  children,
  ...rest
}: ComponentProps<typeof Link<RouteType>>) {
  return (
    <Link {...rest}>
      {children}
      <NavProgress />
    </Link>
  );
}
