import { describe, it, expect } from 'vitest';
import { LOCALES } from '@shop/i18n';
import { DICTIONARIES } from '@shop/i18n/all';
import { uiMessage, uiText, type UiTextKey } from '../src/lib/ui-text';

/**
 * packages/ui 는 낱말 넷을 **스스로 들고 있다**. 사전 731개를 끌고 오면
 * 브라우저가 말마다 한 벌씩 셋을 받게 되기 때문이다(gzip 37KB).
 *
 * 대신 같은 문구가 두 곳에 적힌다. 그 둘이 어긋나면 상품 카드의 '품절' 과
 * 목록 화면의 '품절' 이 서로 다른 말이 되고, 그것은 사람이 눈으로 잡을 수 있는
 * 종류의 결함이 아니다. 그래서 여기서 대조한다.
 */
const KEYS: readonly UiTextKey[] = [
  'price.listPrice',
  'price.discount',
  'catalog.soldOut',
  'product.reviewCount',
];

describe('ui 가 따로 들고 있는 낱말', () => {
  it.each(LOCALES)('%s — 앱 사전과 글자가 같다', (locale) => {
    for (const key of KEYS) {
      expect(uiMessage(locale, key), `${locale}/${key}`).toEqual(DICTIONARIES[locale][key]);
    }
  });

  it('자리표시자를 채운다', () => {
    expect(uiText('ko', 'product.reviewCount', { count: 1234 })).toBe('리뷰 1,234개');
    expect(uiText('en', 'product.reviewCount', { count: 2 })).toBe('2 reviews');
    expect(uiText('en', 'product.reviewCount', { count: 1 })).toBe('1 review');
  });
});
