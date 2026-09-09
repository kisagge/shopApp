import { describe, it, expect } from 'vitest';
import { createTranslator, messageKeys } from '../src/all';
import { ko } from '../src/messages/ko';
import { en } from '../src/messages/en';
import { ja } from '../src/messages/ja';
import { LOCALES } from '../src/locale';

describe('사전 세 벌', () => {
  it('열쇠가 정확히 같다', () => {
    // 타입이 이미 막지만, 타입은 배포된 문자열을 보지 않는다.
    const keys = [...messageKeys()].sort();
    expect(Object.keys(en).sort()).toEqual(keys);
    expect(Object.keys(ja).sort()).toEqual(keys);
  });

  it('빈 문구가 없다', () => {
    for (const [name, dict] of [
      ['ko', ko],
      ['en', en],
      ['ja', ja],
    ] as const) {
      for (const [key, message] of Object.entries(dict)) {
        const parts = typeof message === 'string' ? [message] : [message.one, message.other];
        for (const part of parts) {
          expect(part.trim(), `${name}/${key} 가 비었다`).not.toBe('');
        }
      }
    }
  });

  it('자리표시자가 세 벌에서 같다', () => {
    // {count} 를 한 벌에서 빠뜨리면 그 언어만 숫자가 사라진 문장이 나간다.
    const holes = (m: string | { one: string; other: string }) =>
      [...(typeof m === 'string' ? m : `${m.one} ${m.other}`).matchAll(/\{(\w+)\}/g)]
        .map((x) => x[1]!)
        .sort();

    for (const key of messageKeys()) {
      const base = holes(ko[key]);
      expect(new Set(holes(en[key])), `en/${key}`).toEqual(new Set(base));
      expect(new Set(holes(ja[key])), `ja/${key}`).toEqual(new Set(base));
    }
  });
});

describe('문구 만들기', () => {
  it('언어에 맞는 문구를 준다', () => {
    expect(createTranslator('ko')('nav.cart')).toBe('장바구니');
    expect(createTranslator('en')('nav.cart')).toBe('Cart');
    expect(createTranslator('ja')('nav.cart')).toBe('カート');
  });

  it('값을 자리에 넣는다', () => {
    expect(createTranslator('en')('search.resultsFor', { term: 'coat' })).toBe(
      'Results for “coat”',
    );
  });

  it('영어만 개수에 따라 모양이 바뀐다', () => {
    expect(createTranslator('en')('catalog.count', { count: 1 })).toBe('1 product');
    expect(createTranslator('en')('catalog.count', { count: 2 })).toBe('2 products');
    // 한국어·일본어에는 수 변화가 없다
    expect(createTranslator('ko')('catalog.count', { count: 1 })).toBe('상품 1개');
    expect(createTranslator('ja')('catalog.count', { count: 1 })).toBe('商品1点');
  });

  it('값을 안 넘긴 자리는 그대로 남긴다 — 지우면 빠진 줄 모른다', () => {
    expect(createTranslator('en')('search.resultsFor')).toContain('{term}');
  });
});

describe('카테고리 이름', () => {
  it('아는 카테고리는 그 언어로 부른다', () => {
    expect(createTranslator('en').category('outer', '아우터')).toBe('Outerwear');
    expect(createTranslator('ja').category('knit', '니트')).toBe('ニット');
    expect(createTranslator('ko').category('outer', '아우터')).toBe('아우터');
  });

  it('모르는 카테고리는 DB 이름을 그대로 쓴다 — 열쇠를 화면에 내보내지 않는다', () => {
    expect(createTranslator('en').category('brand-new', '신상 코너')).toBe('신상 코너');
  });
});

describe('모든 언어가 실제로 다르게 나온다', () => {
  it('사전이 복사본이 아니다', () => {
    const rendered = LOCALES.map((l) => createTranslator(l)('cart.checkout'));
    expect(new Set(rendered).size).toBe(LOCALES.length);
  });
});

describe('숫자 넣기', () => {
  it('자릿수를 그 나라 방식으로 끊는다', () => {
    expect(createTranslator('ko')('catalog.totalCount', { count: 1234 })).toBe('총 1,234개');
  });

  it('복수형 판정은 서식 전의 숫자로 한다', () => {
    // 부르는 쪽에서 미리 '1' 로 만들어 넘기면 여기가 'other' 로 떨어져
    // "1 items" 가 나간다
    expect(createTranslator('en')('catalog.totalCount', { count: 1 })).toBe('1 item');
    expect(createTranslator('en')('catalog.totalCount', { count: 2000 })).toBe('2,000 items');
  });
});
