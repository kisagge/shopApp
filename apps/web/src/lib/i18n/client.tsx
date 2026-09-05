'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, DEFAULT_LOCALE, type Locale, type Translator } from '@shop/i18n';
import { translateIssue, type IssueBounds } from './issue';

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

/**
 * 계약이 돌려준 문구를 이 화면의 말로 바꾼다.
 *
 * 폼이 **보내기 전에 스스로 거를 때** 쓴다. 서버가 만든 응답은 이미 번역돼
 * 있지만, 그 길로 가기 전에 걸린 것은 아직 열쇠 그대로다.
 */
export function useIssueText(): (message: string, bounds?: IssueBounds) => string {
  const t = useT();
  return (message, bounds) => translateIssue(t, message, bounds);
}
