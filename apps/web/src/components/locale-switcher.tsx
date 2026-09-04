'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { LOCALES, LOCALE_LABEL, LOCALE_TAG } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';

/**
 * 언어 고르기.
 *
 * **스크립트 없이도 동작한다.** 평범한 폼 전송이라 버튼을 누르면 서버가
 * 쿠키를 심고 보던 화면으로 돌려보낸다. 클릭 핸들러로 만들면 스크립트가
 * 막힌 환경에서 언어만 못 바꾸게 된다.
 *
 * 각 언어를 **그 언어로 적는다** — 영어를 못 읽는 사람이 English 라는 글자를
 * 찾을 수는 있어도, 일본어 사용자가 'Japanese' 를 찾기를 기대할 수는 없다.
 * `lang` 을 붙여 낭독기가 그 이름만은 제 발음으로 읽게 한다.
 */
export function LocaleSwitcher() {
  const current = useLocale();
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams().toString();

  // 언어를 바꿨다고 보던 검색 결과를 잃으면 안 된다
  const next = params ? `${pathname}?${params}` : pathname;

  return (
    <form method="post" action="/api/locale" aria-label={t('nav.languageChange')}>
      <input type="hidden" name="next" value={next} />
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LOCALES.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <button
                type="submit"
                name="locale"
                value={locale}
                lang={LOCALE_TAG[locale]}
                // 지금 보고 있는 언어라는 사실을 색이 아니라 이름으로 알린다
                aria-current={active ? 'true' : undefined}
                className={`inline-flex h-9 items-center text-[13px] ${
                  active
                    ? 'font-medium text-[var(--fg)] underline underline-offset-4'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                }`}
              >
                {LOCALE_LABEL[locale]}
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
