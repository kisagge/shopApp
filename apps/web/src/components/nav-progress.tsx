'use client';

import { createPortal } from 'react-dom';
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
 * ── 왜 body 로 옮겨 그리는가 ──────────────────────────────────
 * 처음에는 링크 안에 그대로 두고 `position: fixed` 로 화면 맨 위에 붙였다.
 * **그 전제가 틀렸다.** 조상에 `transform` 이나 `backdrop-filter` 가 있으면
 * fixed 의 기준이 화면이 아니라 **그 조상**이 된다. 비교함 띠(`backdrop-blur`)
 * 안의 '견주어보기' 를 누르자 띠가 화면 위가 아니라 **비교함을 가로질러**
 * 그려졌다 — 앱에서 그렇게 신고됐다.
 *
 * 링크가 어디에 살든 결과가 같아야 하므로 body 에 옮겨 그린다. 그러면
 * 조상이 무엇이든 기준이 화면이다.
 */
export function NavProgress() {
  const { pending } = useLinkStatus();
  // 서버 렌더에는 body 가 없다. pending 도 늘 false 라 여기까지 오지 않는다.
  if (!pending || typeof document === 'undefined') return null;

  return createPortal(
    <span
      // 화면이 바뀐 것은 Next 의 경로 알림이 이미 읽어 준다. 여기서 또
      // 말하면 이동할 때마다 두 번 들린다.
      aria-hidden="true"
      className="nav-progress"
    />,
    document.body,
  );
}
