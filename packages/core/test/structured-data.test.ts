import { describe, it, expect } from 'vitest';
import {
  productStructuredData, breadcrumbStructuredData, siteStructuredData, itemListStructuredData,
  isDisallowedPath, DISALLOWED_PATHS, AVAILABILITY,
} from '../src/structured-data';

const base = {
  url: 'https://plain.test/product/wool-coat',
  name: '오버사이즈 울 블렌드 코트',
  description: '두껍고 따뜻합니다',
  brand: 'STUDIO NOON',
  images: ['https://cdn.test/1.jpg'],
  price: 289_000,
  soldOut: false,
  rating: 4.35,
  reviewCount: 7,
};

describe('상품 구조화 데이터', () => {
  it('가격은 통화와 함께 문자열로 넣는다', () => {
    // 숫자로 두면 파서에 따라 지수 표기로 바뀌는 일이 있다
    const offer = productStructuredData(base).offers as Record<string, unknown>;
    expect(offer.price).toBe('289000');
    expect(offer.priceCurrency).toBe('KRW');
  });

  it('재고를 schema.org 표기로 옮긴다', () => {
    expect((productStructuredData(base).offers as any).availability).toBe(AVAILABILITY.inStock);
    expect((productStructuredData({ ...base, soldOut: true }).offers as any).availability)
      .toBe(AVAILABILITY.outOfStock);
  });

  it('리뷰가 없으면 별점을 아예 넣지 않는다', () => {
    /*
     * 리뷰 0건에 aggregateRating 을 붙이면 구글이 오류로 잡고 그 페이지의
     * 리치 결과를 통째로 뺀다. 없는 것이 잘못된 것보다 낫다.
     */
    const data = productStructuredData({ ...base, reviewCount: 0, rating: undefined });
    expect(data).not.toHaveProperty('aggregateRating');
  });

  it('별점은 화면이 보여 주는 것과 정확히 같아야 한다', () => {
    /*
     * 카드가 rating.toFixed(1) 로 그린다. 여기서 다르게 반올림하면 구조화
     * 데이터와 화면이 어긋나고, 구글은 그걸 스팸으로 본다.
     *
     * 4.35 가 '4.4' 가 아니라 '4.3' 인 것은 부동소수점 때문이다(4.35 는
     * 실제로 4.3499…). 화면도 같은 값을 쓰므로 어긋나지 않는다.
     */
    const rating = productStructuredData(base).aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe(base.rating.toFixed(1));
    expect(rating.reviewCount).toBe(7);
  });

  it('사진이 없으면 image 키를 넣지 않는다', () => {
    // 빈 배열을 넣으면 "사진이 있는데 비어 있다" 로 읽힌다
    expect(productStructuredData({ ...base, images: [] })).not.toHaveProperty('image');
  });

  it('브랜드를 Brand 로 감싼다', () => {
    expect(productStructuredData(base).brand).toEqual({ '@type': 'Brand', name: 'STUDIO NOON' });
  });
});

describe('이동 경로', () => {
  it('1부터 번호를 매긴다', () => {
    const data = breadcrumbStructuredData([
      { name: '홈', url: 'https://plain.test/' },
      { name: '코트', url: 'https://plain.test/category/coat' },
    ]);
    const items = data.itemListElement as { position: number; name: string }[];

    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items.map((i) => i.name)).toEqual(['홈', '코트']);
  });

  it('빈 경로도 형태는 유지한다', () => {
    expect(breadcrumbStructuredData([]).itemListElement).toEqual([]);
  });
});

describe('사이트', () => {
  it('검색 주소 틀을 만든다', () => {
    const data = siteStructuredData({
      name: 'PLAIN', url: 'https://plain.test/', description: '편집숍', searchPath: '/search?q=',
    });
    const action = data.potentialAction as { target: { urlTemplate: string } };

    // 끝의 슬래시가 겹치면 //search 가 된다
    expect(action.target.urlTemplate).toBe('https://plain.test/search?q={search_term_string}');
  });
});

describe('색인에서 빼는 경로', () => {
  it('개인 화면과 결제 경로를 막는다', () => {
    for (const path of ['/mypage', '/mypage/orders', '/checkout', '/order/20260101-1', '/admin']) {
      expect(isDisallowedPath(path), path).toBe(true);
    }
  });

  it('검색 결과도 막는다 — 같은 상품이 검색어마다 다른 주소로 잡힌다', () => {
    expect(isDisallowedPath('/search')).toBe(true);
  });

  it('공개 화면은 막지 않는다', () => {
    for (const path of ['/', '/product/wool-coat', '/category/coat']) {
      expect(isDisallowedPath(path), path).toBe(false);
    }
  });

  it('앞부분만 같은 경로를 잘못 막지 않는다', () => {
    // '/order' 를 막는다고 '/orders-guide' 까지 막으면 안 된다
    expect(isDisallowedPath('/orders-guide')).toBe(false);
    expect(isDisallowedPath('/logins')).toBe(false);
  });

  it('모든 경로가 슬래시로 시작한다', () => {
    for (const path of DISALLOWED_PATHS) expect(path.startsWith('/'), path).toBe(true);
  });
});

/**
 * 목록 화면이 담고 있는 것.
 *
 * 매대와 기획전은 상품 하나가 아니라 묶음이 내용인데, 아무 말도 하지 않고
 * 있었다 — 검색엔진에는 링크만 잔뜩 있는 문서로 보인다.
 */
describe('목록 구조화 데이터', () => {
  const urls = ['https://x.test/product/a', 'https://x.test/product/b'];

  it('화면에 보이는 순서를 그대로 담는다', () => {
    const data = itemListStructuredData(urls);
    const items = data['itemListElement'] as { position: number; url: string }[];
    expect(items.map((i) => [i.position, i.url])).toEqual([
      [1, urls[0]],
      [2, urls[1]],
    ]);
  });

  it('몇 개인지 함께 말한다', () => {
    expect(itemListStructuredData(urls)['numberOfItems']).toBe(2);
  });

  /**
   * **주소만 담는다.** 이름·가격까지 넣으면 목록이 상품 정보를 두 번째로
   * 주장하게 되고, 캐시 수명이 달라 어긋나는 순간 어느 쪽을 믿을지 알 수 없다.
   */
  it('상품의 사실을 두 번째로 주장하지 않는다', () => {
    const items = itemListStructuredData(urls)['itemListElement'] as Record<string, unknown>[];
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['@type', 'position', 'url']);
    }
  });

  it('비어 있어도 모양이 깨지지 않는다', () => {
    const data = itemListStructuredData([]);
    expect(data['numberOfItems']).toBe(0);
    expect(data['itemListElement']).toEqual([]);
  });
});
