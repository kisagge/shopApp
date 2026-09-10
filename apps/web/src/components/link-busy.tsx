'use client';

import { useLinkStatus } from 'next/link';

/**
 * 이 링크로 이동하는 중이라는 표시 — **누른 자리에서 보인다.**
 *
 * 화면 맨 위의 띠(`NavProgress`)와 역할이 다르다. 그쪽은 "무언가 가는 중"
 * 이고, 이쪽은 **"방금 누른 이것"** 이다. 리뷰 정렬처럼 화면 한가운데의
 * 일부만 바뀌는 자리에서는 그 구분이 필요하다.
 *
 * **왜 Suspense 뼈대로는 안 되는가.** 정렬을 바꾸면 서버가 그 조각을 다시
 * 그리는데, React 는 라우터 전환 중에 **이미 있는 내용을 뼈대로 바꾸지
 * 않는다** — 새 내용이 준비될 때까지 옛 것을 그대로 둔다. 경계에 `key` 를
 * 걸어 봐도 마찬가지였다(재 보고 되돌렸다). 그래서 전환이 진행 중이라는
 * 사실을 **링크 쪽에서** 말해야 한다.
 *
 * 낭독기에는 알리지 않는다 — 자리를 옮긴 것은 Next 의 경로 알림이 이미
 * 말하고, 여기서 또 말하면 정렬을 누를 때마다 두 번 들린다.
 */
export function LinkBusy() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return <span aria-hidden="true" className="link-busy" />;
}
