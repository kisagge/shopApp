'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, DEFAULT_LOCALE, type Locale, type Translator } from '@shop/i18n';

/**
 * 클라이언트 컴포넌트가 쓰는 언어.
 *
 * 서버가 정한 값을 그대로 내려받는다. **브라우저에서 다시 알아내지 않는다** —
 * `navigator.language` 로 한 번 더 정하면 서버가 그린 글자와 달라져
 * 하이드레이션이 깨진다. 정하는 곳은 요청을 받은 서버 한 곳이다.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
