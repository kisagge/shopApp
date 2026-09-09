import { formatMessage, DEFAULT_LOCALE, type Locale, type Message, type Vars } from '@shop/i18n';

/**
 * packages/ui 가 스스로 쓰는 낱말.
 *
 * **사전 전체를 끌고 오지 않으려고 여기 따로 둔다.** 이 꾸러미에서 글자가
 * 필요한 곳은 두 군데(가격·상품카드)뿐이고 낱말은 넷이다. 그것 때문에
 * `createTranslator(locale)` 를 부르면 열쇠 731개짜리 사전이 말마다 한 벌씩,
 * 세 벌이 브라우저로 따라온다 — 넷을 얻자고 gzip 37KB 를 받는 셈이었다.
 *
 * 문구를 **베껴 적지 않고 사전과 같은 모양(`Message`)으로 두고** 서식은
 * `formatMessage` 를 그대로 쓴다. 복수형·자리표시자 규칙을 두 벌 만들면
 * 영어에서 `1 reviews` 같은 것이 나온다.
 *
 * 앱의 사전과 같은 문구가 두 곳에 있는 것은 감수한다. 어긋나면
 * `test/ui-text.test.ts` 가 사전과 대조해서 잡는다.
 */
export type UiTextKey =
  | 'price.listPrice'
  | 'price.discount'
  | 'catalog.soldOut'
  | 'product.reviewCount';

const UI_TEXT: Record<Locale, Record<UiTextKey, Message>> = {
  ko: {
    'price.listPrice': '정가',
    'price.discount': '할인',
    'catalog.soldOut': '품절',
    'product.reviewCount': { one: '리뷰 {count}개', other: '리뷰 {count}개' },
  },
  en: {
    'price.listPrice': 'List price',
    'price.discount': 'off',
    'catalog.soldOut': 'Sold out',
    'product.reviewCount': { one: '{count} review', other: '{count} reviews' },
  },
  ja: {
    'price.listPrice': '定価',
    'price.discount': '割引',
    'catalog.soldOut': '売り切れ',
    'product.reviewCount': { one: 'レビュー{count}件', other: 'レビュー{count}件' },
  },
};

export function uiMessage(locale: Locale, key: UiTextKey): Message {
  return (UI_TEXT[locale] ?? UI_TEXT[DEFAULT_LOCALE])[key];
}

export function uiText(locale: Locale, key: UiTextKey, vars?: Vars): string {
  return formatMessage(locale, uiMessage(locale, key), vars);
}
