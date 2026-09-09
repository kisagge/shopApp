'use client';

import { MIN_COMPARE } from '@shop/core';
import { useCompare } from '~/stores/compare';
import { useT } from '~/lib/i18n/client';
import { AppLink } from './app-link';

/**
 * 담아 둔 것을 늘 보이게 하는 아래쪽 띠.
 *
 * **담아 둔 것이 없으면 아무것도 그리지 않는다.** 빈 띠가 화면 아래를 늘
 * 차지하면, 쓰지 않는 사람에게는 그냥 잘려 나간 화면이 된다.
 *
 * 하나만 담았을 때도 **사라지지 않고 남는다.** 담은 것이 보이지 않으면
 * 사람은 자기가 눌렀는지조차 확신하지 못한다. 대신 견주기 단추를 잠근다.
 */
export function CompareTray() {
  const items = useCompare((s) => s.items);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const t = useT();

  if (items.length === 0) return null;

  const enough = items.length >= MIN_COMPARE;
  const href = `/compare?slugs=${items.map((i) => i.slug).join(',')}` as const;

  return (
    <>
      {/*
        띠가 화면 아래에 고정되어 있어 그대로 두면 마지막 줄과 바닥글을 덮는다.
        같은 높이의 빈 자리를 흐름 안에 둬서 밀어 올린다.
      */}
      <div aria-hidden="true" className="h-16" />
      <aside
      aria-label={t('compare.tray')}
      className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3">
        <p className="text-xs text-[var(--fg-secondary)]">
          {t('compare.count', { count: items.length })}
        </p>

        <ul className="flex flex-1 flex-wrap items-center gap-1.5">
          {items.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => remove(item.slug)}
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
          onClick={clear}
          className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
        >
          {t('compare.clear')}
        </button>

        {enough ? (
          <AppLink
            href={href}
            className="flex h-9 items-center rounded-sm bg-n-900 px-4 text-xs font-medium text-n-0 no-underline hover:bg-n-950"
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
