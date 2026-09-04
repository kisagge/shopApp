import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import {
  createTranslator,
  resolveLocale,
  LOCALE_COOKIE,
  type Locale,
  type Translator,
} from '@shop/i18n';

/**
 * 이번 요청의 언어.
 *
 * **미들웨어를 두지 않았다.** 미들웨어는 이미지와 정적 파일 요청에도 걸리는데,
 * 여기서 하는 일은 헤더 한 줄을 읽는 것뿐이라 그 값에 비해 비싸다. 필요한
 * 곳에서 읽고 요청 안에서 한 번만 계산되게 감싼다.
 *
 * **처음 온 사람에게 쿠키를 심지 않는다.** 심어 두면 나중에 브라우저 언어를
 * 바꿔도 화면이 따라오지 않는다. 쿠키는 사용자가 직접 고를 때만 생기고,
 * 그때부터 추측을 그만둔다.
 *
 * 이 함수를 부르는 화면은 동적 렌더링이 된다 — 요청 헤더를 봐야 하니 미리
 * 그려 둘 수가 없다. 주소에 /en 을 붙이는 방식이면 피할 수 있지만, 그러면
 * "브라우저 언어를 따른다" 가 아니라 "주소로 정한다" 가 된다.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  });
});

/** 이번 요청의 문구 사전 */
export const getT = cache(async (): Promise<Translator> => createTranslator(await getLocale()));
