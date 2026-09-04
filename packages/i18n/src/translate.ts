import type { Locale } from './locale';
import { DEFAULT_LOCALE } from './locale';
import { formatMessage, type Message, type Vars } from './message';
import { ko, type Dictionary, type MessageKey } from './messages/ko';
import { en } from './messages/en';
import { ja } from './messages/ja';

const DICTIONARIES: Record<Locale, Dictionary> = { ko, en, ja };

export type Translator = {
  (key: MessageKey, vars?: Vars): string;
  readonly locale: Locale;
};

export function createTranslator(locale: Locale): Translator {
  const dict = DICTIONARIES[locale];
  const t = (key: MessageKey, vars?: Vars): string =>
    formatMessage(locale, dict[key], vars);
  return Object.assign(t, { locale } as const);
}

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
export function categoryName(locale: Locale, slug: string, fallback: string): string {
  const key = `category.${slug}`;
  const dict = DICTIONARIES[locale] as Record<string, Message | undefined>;
  const message = dict[key];
  return typeof message === 'string' ? message : fallback;
}

/** 사전에 그 열쇠가 있는지. 테스트와 도구용. */
export function messageKeys(): readonly MessageKey[] {
  return Object.keys(ko) as MessageKey[];
}

export const FALLBACK_TRANSLATOR = createTranslator(DEFAULT_LOCALE);
