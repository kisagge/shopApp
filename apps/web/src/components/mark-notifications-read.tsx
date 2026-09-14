'use client';

import { useEffect } from 'react';

/**
 * 목록을 연 뒤 읽음으로 표시한다.
 *
 * **GET 이 값을 바꾸지 않게** 하려고 따로 둔다. 화면을 그리면서 표시해
 * 버리면 브라우저가 링크를 미리 받아 두는 것만으로 뱃지가 사라진다.
 *
 * 화면을 새로 그리지 않는다. 이번 화면은 무엇이 새것이었는지 보여 주고
 * 있고, 다음에 들어올 때 뱃지가 없으면 그것으로 충분하다.
 */
export function MarkNotificationsRead({
  box = 'customer',
}: {
  /** 어느 알림함을 열었는가. 다른 알림함의 것까지 읽음으로 만들면 안 된다. */
  box?: 'customer' | 'console';
}) {
  useEffect(() => {
    void fetch(`/api/notifications/read?box=${box}`, { method: 'POST' }).catch(() => {
      // 못 눌러도 다음 방문에 다시 시도된다. 화면을 막을 이유가 없다.
    });
  }, [box]);

  return null;
}
