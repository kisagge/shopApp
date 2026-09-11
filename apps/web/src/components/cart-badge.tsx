'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCartStore, selectItemCount } from '~/stores/cart';
import { useT } from '~/lib/i18n/client';

/**
 * 헤더의 장바구니 링크.
 *
 * 개수는 localStorage 에서 오므로 서버 렌더 결과와 다르다. 그대로 렌더하면
 * 하이드레이션 불일치가 난다. 마운트 뒤에만 숫자를 보여 준다.
 */
export function CartBadge() {
  const count = useCartStore(selectItemCount);
  const t = useT();
  const [mounted, setMounted] = useState(false);
  /**
   * 서버는 localStorage 를 볼 수 없으므로 첫 렌더는 반드시 숫자 없이 나가야
   * 하고, 그 다음 렌더에서 채운다. 이 두 번 그리기가 목적이다.
   *
   * 규칙은 "이펙트 안의 setState 는 연쇄 렌더를 부른다" 고 경고하지만
   * 여기서는 마운트 시 딱 한 번이고, 이것이 하이드레이션 불일치를 피하는
   * 정석이다. 규칙을 피하려 구조를 비틀면 오히려 읽기 어려워진다.
   */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <Link
      href="/cart"
      aria-label={mounted && count > 0 ? t('nav.cartCount', { count }) : t('nav.cart')}
      className="relative inline-flex h-9 items-center text-xs font-medium text-[var(--fg-secondary)] no-underline"
    >
      {t('nav.cart')}
      {mounted && count > 0 && (
        <span
          aria-hidden="true"
          className="tnum ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-semibold text-[var(--bg)]"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
