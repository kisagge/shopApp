'use client';

import { useSyncExternalStore } from 'react';
import { MAX_COMPARE, canAddToCompare } from '@shop/core';
import { useCompare } from '~/stores/compare';
import { useT } from '~/lib/i18n/client';

/**
 * 목록에서 상품을 비교함에 담는다.
 *
 * **체크박스다.** 담기와 빼기가 한 자리에서 일어나고, 지금 담겼는지가 눌러
 * 보지 않아도 보여야 한다 — 그건 버튼이 아니라 체크박스의 일이다. 낭독기도
 * "선택됨/선택 안 됨" 을 스스로 읽어 준다.
 *
 * **담을 수 없을 때 사라지지 않고 잠긴다.** 다른 갈래를 보고 있거나 이미
 * 가득 찼을 때 이 자리가 비어 버리면, 사람은 자기가 무엇을 잘못했는지 모른 채
 * 기능이 없어졌다고 여긴다. 잠근 채로 이유를 붙여 둔다.
 */
export function CompareToggle({
  slug,
  categorySlug,
  name,
}: {
  slug: string;
  categorySlug: string;
  name: string;
}) {
  const t = useT();
  const items = useCompare((s) => s.items);
  const toggle = useCompare((s) => s.toggle);

  /*
   * 저장소에서 읽어 오기 전에는 서버가 그린 것과 같은 모양이어야 한다.
   * 그렇지 않으면 담아 둔 것이 있는 사람의 화면에서 하이드레이션이 어긋난다.
   */
  const hydrated = useHydrated();

  const checked = hydrated && items.some((i) => i.slug === slug);
  const allowed = !hydrated || canAddToCompare(items, { slug, categorySlug });

  const reason = checked
    ? undefined
    : items.length >= MAX_COMPARE
      ? t('compare.full', { max: MAX_COMPARE })
      : !allowed
        ? t('compare.otherCategory')
        : undefined;

  return (
    <label
      className={`mt-1 flex w-fit items-center gap-1.5 text-[11px] ${
        allowed ? 'cursor-pointer text-[var(--fg-secondary)]' : 'cursor-not-allowed text-[var(--fg-muted)]'
      }`}
      {...(reason ? { title: reason } : {})}
    >
      <input
        type="checkbox"
        className="size-3.5 accent-[var(--brand)]"
        checked={checked}
        disabled={!allowed}
        onChange={() => toggle({ slug, categorySlug, name })}
      />
      <span aria-hidden="true">{t('compare.add')}</span>
      {/* 체크박스 스무 개가 모두 '비교' 로 읽히면 어느 상품 것인지 알 수 없다 */}
      <span className="sr-only">{name}</span>
      {/* 왜 못 담는지는 마우스를 올려야만 알 수 있으면 안 된다 */}
      {reason && <span className="sr-only">{reason}</span>}
    </label>
  );
}

/**
 * 저장소를 읽었는가.
 *
 * zustand 의 persist 는 첫 그림 뒤에 값을 채운다. 서버는 그 값을 모르므로,
 * 첫 그림에서 담긴 상태를 그리면 하이드레이션이 어긋난다.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
