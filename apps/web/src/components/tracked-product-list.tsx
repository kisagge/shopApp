'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { track } from '~/lib/analytics/client';

/**
 * 상품 목록의 노출과 클릭을 기록한다.
 *
 * 카드마다 핸들러를 다는 대신 이벤트 위임으로 한 번만 잡는다.
 * 카드(packages/ui)는 순수 표현 컴포넌트로 두고 추적 관심사를 섞지 않는다.
 * 대신 페이지가 각 항목에 data-product-id 를 붙여 주고 여기서 읽는다.
 */
export function TrackedProductList({
  listId,
  itemCount,
  children,
}: {
  listId: string;
  itemCount: number;
  children: ReactNode;
}) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    track('view_item_list', { listId, itemCount });
  }, [listId, itemCount]);

  return (
    <div
      onClickCapture={(e) => {
        const item = (e.target as HTMLElement).closest<HTMLElement>('[data-product-id]');
        const productId = item?.dataset['productId'];
        if (productId) track('select_item', { productId, listId });
      }}
    >
      {children}
    </div>
  );
}
