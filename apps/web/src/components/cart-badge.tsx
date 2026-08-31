'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCartStore, selectItemCount } from '~/stores/cart';

/**
 * 헤더의 장바구니 링크.
 *
 * 개수는 localStorage 에서 오므로 서버 렌더 결과와 다르다. 그대로 렌더하면
 * 하이드레이션 불일치가 난다. 마운트 뒤에만 숫자를 보여 준다.
 */
export function CartBadge() {
  const count = useCartStore(selectItemCount);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Link
      href="/cart"
      aria-label={mounted && count > 0 ? `장바구니, 상품 ${count}개` : '장바구니'}
      className="relative inline-flex h-9 items-center text-xs font-medium text-[var(--fg-secondary)] no-underline"
    >
      장바구니
      {mounted && count > 0 && (
        <span
          aria-hidden="true"
          className="tnum ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-n-900 px-1 text-[10px] font-semibold text-n-0"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
