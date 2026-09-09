'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  translatorFor,
  DEFAULT_LOCALE,
  type Dictionary,
  type Locale,
  type Translator,
} from '@shop/i18n';
import { translateIssue, type IssueBounds } from './issue';

/**
 * 클라이언트 컴포넌트가 쓰는 언어.
 *
 * 서버가 정한 값을 그대로 내려받는다. **브라우저에서 다시 알아내지 않는다** —
 * `navigator.language` 로 한 번 더 정하면 서버가 그린 글자와 달라져
 * 하이드레이션이 깨진다. 정하는 곳은 요청을 받은 서버 한 곳이다.
 *
 * **말뿐 아니라 사전 자체를 컨텍스트로 받는다.** 예전에는 말만 받고
 * `createTranslator(locale)` 로 사전을 골랐는데, 고르는 코드가 브라우저에
 * 있으면 번들러는 고를 수 있는 사전을 전부 넣어야 한다. 사전을 고르는 일은
 * 언어가 이미 정해진 서버(layout)로 올라갔고, 여기로는 한 벌만 온다.
 */
type LocaleValue = { readonly locale: Locale; readonly dict: Dictionary };

const LocaleContext = createContext<LocaleValue | null>(null);

/**
 * 사전 한 벌을 화면 전체에 건다.
 *
 * 직접 쓰지 않는다 — `dict-ko` · `dict-en` · `dict-ja` 가 각자 자기 사전을
 * 물고 이것을 부르고, layout 이 그중 하나를 그린다. 그래야 번들이 말마다
 * 갈라진다.
 */
export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

function useLocaleValue(): LocaleValue | null {
  return useContext(LocaleContext);
}

export function useLocale(): Locale {
  return useLocaleValue()?.locale ?? DEFAULT_LOCALE;
}

export function useT(): Translator {
  const value = useLocaleValue();
  return useMemo(
    () =>
      value
        ? translatorFor(value.locale, value.dict)
        : // 사전 없이 그리는 자리는 없어야 하지만, 있다면 열쇠가 그대로
          // 보이는 편이 화면이 통째로 죽는 것보다 낫다.
          translatorFor(DEFAULT_LOCALE, {} as Dictionary),
    [value],
  );
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
