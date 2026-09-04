'use client';

import { useEffect } from 'react';
import { useRecentlyViewed } from '~/stores/recently-viewed';

/**
 * 이 상품을 봤다고 기기에 적는다. 화면에는 아무것도 그리지 않는다.
 *
 * 분석의 `view_item` 과 **일부러 따로 둔다.** 그쪽은 동의를 켠 사람의 것만
 * 남기지만 이것은 남의 서버로 나가지 않으므로 동의와 무관하다. 하나로 합치면
 * 둘 중 좁은 쪽 규칙에 함께 묶인다.
 */
export function RecordRecentView({ slug }: { slug: string }) {
  const record = useRecentlyViewed((s) => s.record);

  useEffect(() => {
    record(slug);
  }, [record, slug]);

  return null;
}
