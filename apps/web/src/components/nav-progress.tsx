'use client';

import { useLinkStatus } from 'next/link';

/**
 * 누른 것을 **곧바로** 알린다.
 *
 * 폰 앱에서 홈의 상품을 누르면 화면이 0.9~1.5초 동안 그대로다. 주소조차
 * 안 바뀌므로 누른 사람은 안 눌린 줄 안다 — 실제로 그렇게 신고됐다.
 *
 * **왜 loading.tsx 가 아닌가.** 그 파일을 두면 Next 가 껍데기를 먼저
 * 흘려보내고 그 순간 상태 코드가 200 으로 굳는다. 없는 상품 주소가
 * 전부 200 으로 나가는 가짜 404 가 되어 검색엔진이 죽은 주소를 계속
 * 들고 있는다. 상품·카테고리·브랜드에 붙였다가 그것을 보고 뺐고,
 * `test/streaming-boundaries.test.ts` 가 다시 붙는 것을 막고 있다.
 *
 * 그래서 **경로가 아니라 누름에 붙인다.** `useLinkStatus` 는 그 링크의
 * 이동이 진행 중인지만 말해 주므로 상태 코드와 아무 상관이 없다.
 *
 * 띠는 링크 안에 있지만 `fixed` 라 링크의 칸을 차지하지 않는다 — 글자
 * 링크든 카드든 배치가 흔들리지 않는다.
 */
export function NavProgress() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      // 화면이 바뀐 것은 Next 의 경로 알림이 이미 읽어 준다. 여기서 또
      // 말하면 이동할 때마다 두 번 들린다.
      aria-hidden="true"
      className="nav-progress"
    />
  );
}
