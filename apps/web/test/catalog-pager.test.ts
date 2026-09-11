import { describe, it, expect } from 'vitest';
import { CATALOG_CARRY_KEYS, catalogQuerySchema } from '@shop/contract';
import { nextPageQuery } from '~/components/catalog-pager';

/**
 * "더 보기" 가 조건을 그대로 들고 간다.
 *
 * **풀려 버리면 사용자는 모른다.** 같은 목록의 다음 쪽을 보고 있다고 믿는데
 * 실제로는 더 넓은 목록이 나온다 — 블랙으로 좁혀 놓고 눌렀더니 다른 색이
 * 섞여 나오는 식이다. 화면은 아무 말도 하지 않는다.
 *
 * **시드로는 이 자리를 밟을 수 없다.** 한 쪽이 24개인데 가장 큰 목록이
 * 13개라, 갓 시드한 DB 에서는 "더 보기" 가 아예 안 나온다. 그래서 화면
 * 검사가 아니라 주소를 만드는 규칙을 여기서 잰다.
 */

describe('다음 쪽 주소', () => {
  it('계약의 조건을 하나도 빠뜨리지 않는다', () => {
    /*
     * **이 검사가 이 파일의 요점이다.** 예전에는 `q`·`sort`·`minPrice`·
     * `maxPrice` 넷을 손으로 적어 두었고, 색·사이즈·브랜드·가격대 프리셋
     * 넷이 흘렀다. 목록을 손으로 들고 있으면 반드시 샌다.
     */
    const params: Record<string, string | string[]> = {};
    for (const key of CATALOG_CARRY_KEYS) params[key] = `값-${key}`;

    const query = nextPageQuery(params, 'cur-1');

    for (const key of CATALOG_CARRY_KEYS) {
      expect(query[key], `"더 보기" 가 ${key} 를 흘린다`).toBe(`값-${key}`);
    }
    expect(query['cursor']).toBe('cur-1');
  });

  it('들고 갈 조건을 실제로 찾아냈다 — 못 찾으면 위가 헛돈다', () => {
    // 빈 목록끼리는 언제나 같다. 눈을 감고 통과하는 자리를 먼저 막는다.
    expect(CATALOG_CARRY_KEYS.length).toBeGreaterThan(6);
    expect(CATALOG_CARRY_KEYS).toContain('color');
    expect(CATALOG_CARRY_KEYS).toContain('size');
    expect(CATALOG_CARRY_KEYS).toContain('brand');
    expect(CATALOG_CARRY_KEYS).toContain('price');
    // 커서는 갈아 끼우는 값이지 들고 가는 값이 아니다
    expect(CATALOG_CARRY_KEYS as readonly string[]).not.toContain('cursor');
  });

  it('여러 번 고른 값은 배열 그대로 간다', () => {
    // 하나만 남기면 고른 사이즈 중 하나가 조용히 사라진다
    const query = nextPageQuery({ size: ['M', 'L'], color: ['블랙'] }, 'cur-2');
    expect(query['size']).toEqual(['M', 'L']);
    expect(query['color']).toEqual(['블랙']);
  });

  it('안 고른 것은 주소에 붙이지 않는다', () => {
    // 빈 값을 붙이면 주소가 지저분해지고, 빈 문자열이 조건으로 읽힐 수 있다
    const query = nextPageQuery({ q: '코트', sort: '', color: [] }, 'cur-3');
    expect(query).toEqual({ q: '코트', cursor: 'cur-3' });
  });

  it('만든 주소를 계약이 다시 읽어 낸다', () => {
    /*
     * 들고 가기만 하고 계약이 못 읽으면 뜻이 없다. 한 바퀴 돌려 본다.
     */
    const query = nextPageQuery(
      { q: '코트', sort: 'price_asc', color: ['블랙'], size: ['M'], brand: ['moor'] },
      'cur-4',
    );
    const parsed = catalogQuerySchema.parse(query);

    expect(parsed.q).toBe('코트');
    expect(parsed.sort).toBe('price_asc');
    expect(parsed.color).toEqual(['블랙']);
    expect(parsed.size).toEqual(['M']);
    expect(parsed.brand).toEqual(['moor']);
    expect(parsed.cursor).toBe('cur-4');
  });
});
