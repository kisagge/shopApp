'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { THEMES, type Theme } from '@shop/core';
import { THEME_KEY } from '~/lib/i18n/enum-labels';
import { useT } from '~/lib/i18n/client';

/**
 * 화면 밝기 고르기.
 *
 * **스크립트 없이도 동작한다.** 언어 고르기와 같은 폼 전송이다 — 버튼을
 * 누르면 서버가 쿠키를 심고 보던 화면으로 돌려보내고, 다음 HTML 이 이미
 * 그 밝기로 나온다. 브라우저에서 클래스를 붙이는 방식으로 만들면 첫 그림이
 * 반드시 밝게 한 번 번쩍인다.
 *
 * **고른 것을 색으로만 알리지 않는다.** 밝기를 고르는 화면에서 "지금 이것"
 * 을 색으로 표시하면, 하필 그 색이 안 보이는 사람에게 아무 정보도 주지
 * 못한다. `aria-current` 로 이름에 붙이고 밑줄로도 표시한다.
 */
export function ThemeSwitcher({ current }: { current: Theme }) {
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams().toString();

  // 밝기를 바꿨다고 보던 검색 결과를 잃으면 안 된다
  const next = params ? `${pathname}?${params}` : pathname;

  return (
    <form method="post" action="/api/theme" aria-label={t('nav.themeChange')}>
      <input type="hidden" name="next" value={next} />
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {THEMES.map((theme: Theme) => {
          const active = theme === current;
          return (
            <li key={theme}>
              <button
                type="submit"
                name="theme"
                value={theme}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex h-9 items-center text-[13px] ${
                  active
                    ? 'font-medium text-[var(--fg)] underline underline-offset-4'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                }`}
              >
                {t(THEME_KEY[theme])}
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
