'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MIN_COMPARE } from '@shop/core';
import { useCompare } from '~/stores/compare';
import { useT } from '~/lib/i18n/client';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { AppLink } from './app-link';

/**
 * 담아 둔 것을 늘 보이게 하는 아래쪽 띠.
 *
 * **담아 둔 것이 없으면 아무것도 그리지 않는다.** 빈 띠가 화면 아래를 늘
 * 차지하면, 쓰지 않는 사람에게는 그냥 잘려 나간 화면이 된다.
 *
 * 하나만 담았을 때도 **사라지지 않고 남는다.** 담은 것이 보이지 않으면
 * 사람은 자기가 눌렀는지조차 확신하지 못한다. 대신 견주기 단추를 잠근다.
 *
 * **사는 흐름에서는 뜨지 않는다.** 장바구니와 결제 화면에는 이 앱이 쓰는
 * 아래쪽 조작 막대가 이미 있다. 폰에서 재 보니 비교함(z-40)이 장바구니의
 * `주문하기` 막대(z 없음)를 **통째로 덮고 있었다** — 버튼 한가운데를 짚으면
 * 비교함의 '빼기' 가 잡혔다. 비교함에 뭔가 담아 둔 사람은 폰에서 주문을
 * 할 수 없었다는 뜻이다.
 *
 * 겹침을 z-index 로 푸는 대신 **띄우지 않는다.** 견주는 일과 사는 일은 다른
 * 단계고, 결제 화면에서는 131px 짜리 띠가 키보드 위 공간까지 먹는다 —
 * 실기기에서 재니 받는 사람 칸과의 여유가 1px 이었다.
 */

/** 이 아래에서는 비교함을 띄우지 않는다. 저마다 아래쪽 조작 막대가 있다. */
const BUYING = ['/cart', '/checkout'];

export function CompareTray() {
  const items = useCompare((s) => s.items);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const pathname = usePathname();
  const t = useT();
  /*
   * 뺀 칩은 자기 단추와 함께 사라진다 — 챙기지 않으면 초점이 body 로 떨어져, 셋을 빼려면 문서 맨 앞에서
   * 탭으로 세 번 내려와야 한다. 다 비우면 띠 자체가 사라지므로 갈 곳이 없다(emptyRef 를 쓰지 않는다).
   */
  const { listRef, rememberRemoval } = useRemovalFocus(items.length);
  /** 무슨 일이 일어났는지 낭독기에 알린다 — 띠가 통째로 사라지면 눌렀는데 아무 일도 없던 것과 같다 */
  const [announcement, setAnnouncement] = useState('');

  if (items.length === 0) {
    /*
     * 알림 자리는 띠가 사라진 뒤에도 남아야 한다. 띠와 함께 지우면 방금 채운 글을 낭독기가 놓친다
     * (최근 본 상품이 같은 이유로 자리를 늘 둔다).
     */
    return <p role="status" className="sr-only">{announcement}</p>;
  }
  if (BUYING.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const enough = items.length >= MIN_COMPARE;
  const href = `/compare?slugs=${items.map((i) => i.slug).join(',')}` as const;

  return (
    <>
      {/*
        띠가 화면 아래에 고정되어 있어 그대로 두면 마지막 줄과 바닥글을 덮는다.
        같은 높이의 빈 자리를 흐름 안에 둬서 밀어 올린다.
      */}
      <div aria-hidden="true" className="h-16 print:hidden" />
      <p role="status" className="sr-only">{announcement}</p>
      <aside
      aria-label={t('compare.tray')}
      className="safe-b fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3">
        <p className="text-xs text-[var(--fg-secondary)]">
          {t('compare.count', { count: items.length })}
        </p>

        <ul ref={listRef as React.RefObject<HTMLUListElement>} className="flex flex-1 flex-wrap items-center gap-1.5">
          {items.map((item, index) => (
            <li key={item.slug}>
              <button
                type="button"
                data-remove-row
                onClick={() => {
                  rememberRemoval(index);
                  setAnnouncement(t('compare.removed', { name: item.name }));
                  remove(item.slug);
                }}
                className="flex items-center gap-1 rounded-sm border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg-secondary)] hover:bg-[var(--surface)]"
              >
                {item.name}
                <span aria-hidden="true">×</span>
                <span className="sr-only">{t('compare.removeOne')}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            setAnnouncement(t('compare.cleared'));
            clear();
          }}
          className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
        >
          {t('compare.clear')}
        </button>

        {enough ? (
          <AppLink
            href={href}
            className="flex h-9 items-center rounded-sm bg-[var(--brand)] px-4 text-xs font-medium text-[var(--bg)] no-underline hover:bg-n-950"
          >
            {t('compare.go')}
          </AppLink>
        ) : (
          <span
            className="flex h-9 cursor-not-allowed items-center rounded-sm bg-[var(--surface-2)] px-4 text-xs text-[var(--fg-muted)]"
            // 왜 눌리지 않는지 낭독기도 알아야 한다
            aria-disabled="true"
          >
            {t('compare.needMore', { min: MIN_COMPARE })}
          </span>
        )}
      </div>
      </aside>
    </>
  );
}
