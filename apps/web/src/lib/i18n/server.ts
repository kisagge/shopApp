import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import {
  createTranslator,
  resolveLocale,
  DEFAULT_LOCALE,
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
  /*
   * **요청 맥락이 없으면 기본 언어로 물러난다.**
   *
   * cookies()·headers() 는 요청 밖에서 부르면 던진다. 배치나 테스트가
   * 라우트 안의 함수를 직접 부르는 일이 있는데, 그때 언어를 못 정했다고
   * 통째로 터지면 검증 오류 하나가 500 이 된다 — 사용자에게는 "무엇이
   * 잘못됐는지" 대신 "서버가 죽었다" 가 간다.
   *
   * **다만 Next 가 흐름을 제어하려고 던지는 것은 그대로 넘긴다.** 빌드 중에
   * cookies() 를 부르면 Next 는 "이 화면은 미리 그릴 수 없다" 는 신호를
   * 던지는데, 그것까지 삼키면 화면이 정적으로 잡혀 **모두에게 같은 언어가
   * 나간다.** 실제로 처음 그렇게 적었더니 빌드가 /404 에서 깨졌고, 그게
   * 아니었으면 조용히 잘못된 화면이 배포됐을 것이다.
   */
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    return resolveLocale({
      cookie: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get('accept-language'),
    });
  } catch (error) {
    unstable_rethrow(error);
    return DEFAULT_LOCALE;
  }
});

/** 이번 요청의 문구 사전 */
export const getT = cache(async (): Promise<Translator> => createTranslator(await getLocale()));
