import type { Locale } from './locale';
import { formatMessage, type Message, type Vars } from './message';
import type { Dictionary, MessageKey } from './messages/ko';

/**
 * **이 파일은 사전을 하나도 import 하지 않는다.**
 *
 * 예전에는 여기서 ko·en·ja 를 전부 정적으로 불러 `createTranslator(locale)` 이
 * 셋 중 하나를 골랐다. 고르는 일은 실행 시각에 벌어지는데 import 는 빌드 시각에
 * 벌어지므로, 번들러는 셋을 다 넣을 수밖에 없었다 — 한국어 화면 하나를 여는
 * 사람이 영어와 일본어 사전까지 받았다(gzip 37.7KB 중 24KB).
 *
 * 그래서 **사전을 고르는 일을 부르는 쪽으로 올렸다.** 여기 있는 것은 사전을
 * 이미 손에 쥔 사람이 쓰는 함수다. 서버는 `@shop/i18n/all` 에서 셋을 다 받고,
 * 브라우저는 `dict-<locale>` 모듈 하나만 받는다. 열쇠 목록·모양 검사는 타입만
 * 쓰므로 번들에 바이트를 남기지 않는다.
 */
export type Translator = {
  (key: MessageKey, vars?: Vars): string;
  readonly locale: Locale;
  /**
   * 이 열쇠가 사전에 있는가.
   *
   * 계약이 돌려준 문구가 열쇠인지 그냥 문장인지 가릴 때 쓴다. 예전에는
   * `Object.keys(ko)` 로 만든 상수를 봤는데, 그러면 열쇠 목록을 얻자고
   * 한국어 사전 한 벌을 통째로 끌고 오게 된다.
   */
  readonly has: (key: string) => boolean;
  /**
   * 카테고리 이름.
   *
   * **DB 의 상품 데이터는 번역하지 않는다.** 상품명·설명은 브랜드가 적는 글이고,
   * 번역 칸을 만들면 등록 화면부터 검수까지 전부 세 벌이 된다. 카테고리만
   * 예외인 이유는 이것이 **우리가 정한 닫힌 목록**이기 때문이다 — 13개뿐이고
   * 화면 어디에나 나오며, 영어 화면의 내비게이션에 '아우터' 가 남아 있으면
   * 번역했다고 하기 어렵다.
   *
   * 사전에 없는 slug 는 **DB 의 이름을 그대로 쓴다.** 나중에 카테고리를 하나
   * 더했을 때 화면에 `category.new-thing` 같은 열쇠가 뜨는 것보다, 한국어로
   * 보이는 편이 낫다.
   */
  readonly category: (slug: string, fallback: string) => string;
};

/** 사전 한 벌로 번역기를 만든다. 고르는 일은 이미 끝나 있다. */
export function translatorFor(locale: Locale, dict: Dictionary): Translator {
  const loose = dict as Record<string, Message | undefined>;
  /**
   * **없는 열쇠에 화면을 걸지 않는다.**
   *
   * 예전에는 `dict[key]` 가 undefined 면 형태를 고르다가 TypeError 를
   * 던졌다 — 열쇠 하나가 빠지면 그 화면이 통째로 죽는다. 타입이 막아 주니
   * 일어날 수 없다고 보았는데, 브라우저로는 **사전의 일부만** 내려보내게
   * 되면서 그 전제가 사라졌다.
   *
   * 빠진 열쇠는 이름을 그대로 보여 준다. 보기 좋지는 않지만 **화면은 산다**,
   * 그리고 눈에 띄어서 고칠 수 있다. 흰 화면은 둘 다 못 한다.
   */
  const t = (key: MessageKey, vars?: Vars): string => {
    const message = loose[key];
    return message === undefined ? key : formatMessage(locale, message, vars);
  };
  return Object.assign(t, {
    locale,
    has: (key: string): boolean => loose[key] !== undefined,
    category: (slug: string, fallback: string): string => {
      const message = loose[`category.${slug}`];
      return typeof message === 'string' ? message : fallback;
    },
  } as const);
}
