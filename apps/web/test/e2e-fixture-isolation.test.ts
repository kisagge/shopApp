import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 남이 붙잡고 있는 상품을 흔들지 않는다.
 *
 * slug-history 명세는 **진짜로 상품 이름을 바꾼다.** 그런데 처음에는 오버사이즈
 * 울 블렌드 코트를 골랐고, 그 상품은 다른 명세 다섯 곳이 주소로 직접 가리키고
 * 있었다. 이 검사는 어드민 프로젝트에서, 그 다섯은 손님·게스트 프로젝트에서
 * 도니 서로 겹친다.
 *
 * 옛 주소가 새 주소로 넘어가긴 하므로 대개는 지나간다. 다만 검사들이 같은
 * 것을 쥐고 흔드는 모양 자체가 산발 실패의 씨앗이다 — 장바구니 하나를 넷이
 * 나눠 쓰다 진 것과 같은 종류이고, 그때는 원인을 찾는 데 하루가 들었다.
 *
 * **목록을 손으로 적지 않는다.** e2e 폴더를 읽어 주소로 박아 둔 슬러그를
 * 모으고, 이름을 바꾸는 상품이 그 안에 들어 있지 않은지 본다.
 */
const E2E = join(process.cwd(), 'e2e');

const specs = readdirSync(E2E)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(E2E, name), 'utf8') }));

/** `/product/<slug>` 로 박아 둔 것들 */
function pinnedSlugs(source: string): Set<string> {
  return new Set([...source.matchAll(/\/product\/([a-z0-9-]+)/g)].map((m) => m[1]!));
}

/** 이름을 바꾸는 명세가 고른 상품 */
function renameTarget(source: string): string | null {
  return /const ORIGINAL = '([a-z0-9-]+)'/.exec(source)?.[1] ?? null;
}

describe('상품을 흔드는 명세', () => {
  const renamers = specs.filter((s) => s.source.includes('/api/admin/products/'));

  it('이름을 바꾸는 명세를 실제로 찾아낸다', () => {
    // 못 찾으면 아래 검사는 아무것도 지키지 못한다
    expect(specs.length).toBeGreaterThan(10);
    expect(renamers.length).toBeGreaterThan(0);
    expect(renamers.some((s) => renameTarget(s.source) !== null)).toBe(true);
  });

  it('바꾸는 상품을 다른 명세가 주소로 가리키지 않는다', () => {
    for (const renamer of renamers) {
      const target = renameTarget(renamer.source);
      if (target === null) continue;

      const others = specs
        .filter((s) => s.name !== renamer.name && pinnedSlugs(s.source).has(target))
        .map((s) => s.name);

      expect(
        others,
        `${renamer.name} 이 ${target} 의 이름을 바꾸는데, 이 명세들이 그 주소를 붙잡고 있다`,
      ).toEqual([]);
    }
  });
});

/**
 * **리뷰를 쓰는 명세와 읽는 명세가 같은 상품을 쓰지 않는다.**
 *
 * 한 상품의 리뷰 목록은 하나뿐이다. 한쪽이 리뷰를 쓰는 순간 다른 쪽이 보던
 * "첫 번째 리뷰" 가 바뀐다 — 도움됐어요 검사가 실제로 그렇게 졌다. 장바구니
 * 하나를 넷이 나눠 쓰다 산발로 지던 것과 같은 모양이다.
 *
 * 슬러그는 `e2e/state.ts` 에 모아 두었다. 떨어져 있으면 겹친 줄 모른다.
 */
describe('리뷰를 건드리는 명세', () => {
  const state = readFileSync(join(E2E, 'state.ts'), 'utf8');

  const slugOf = (key: string): string | null =>
    new RegExp(`${key}: '([a-z0-9-]+)'`).exec(state)?.[1] ?? null;

  it('읽는 쪽과 쓰는 쪽의 상품을 실제로 찾아냈다', () => {
    expect(slugOf('readOnly'), 'state.ts 에서 readOnly 상품을 못 찾았다').not.toBeNull();
    expect(slugOf('written'), 'state.ts 에서 written 상품을 못 찾았다').not.toBeNull();
  });

  it('둘이 다른 상품이다', () => {
    expect(
      slugOf('written'),
      '리뷰를 쓰는 명세와 읽는 명세가 같은 상품을 쥐고 있다',
    ).not.toBe(slugOf('readOnly'));
  });

  it('아무도 슬러그를 주소에 다시 박아 두지 않는다', () => {
    /*
     * state.ts 를 거치지 않고 주소에 직접 적으면 이 검사를 지나간다.
     * 리뷰를 건드리는 두 명세만 본다 — 나머지는 읽기만 하므로 상관없다.
     */
    const written = slugOf('written')!;
    const owners = specs.filter((s) =>
      /order-lifecycle|review-helpful/.test(s.name),
    );
    expect(owners.length, '리뷰를 건드리는 명세를 못 찾았다').toBe(2);
    for (const spec of owners) {
      expect(
        [...pinnedSlugs(spec.source)],
        `${spec.name} 이 상품 슬러그를 주소에 직접 박아 두었다 — state.ts 를 쓰자`,
      ).toEqual([]);
    }
    expect(written).toBeTruthy();
  });
});

/**
 * **재고를 흔드는 명세는 저마다 자기 상품을 쓴다.**
 *
 * `addFirstProductToCart` 는 홈의 첫 상품을 집고, 그 길을 아홉 명세가 함께
 * 쓴다. 재고 경쟁 검사는 그 변형의 재고를 1 로 내렸다가 되돌리는데, 그 사이에
 * 담으려던 다른 명세는 품절을 만난다 — 실제로 한 판이 그렇게 졌다. 쿠폰 쪽은
 * 한 변형에서 여섯 개를 한꺼번에 빼 간다.
 *
 * 그래서 이 둘은 홈에서 고르지 않고 `RACE_PRODUCT` 의 자기 주소로 간다.
 * 슬러그를 state.ts 에 모아 두는 이유는 리뷰 쪽과 같다 — 떨어져 있으면
 * 겹친 줄 모른다.
 */
describe('재고를 흔드는 명세', () => {
  const state = readFileSync(join(E2E, 'state.ts'), 'utf8');
  const raceBlock = /export const RACE_PRODUCT = \{([\s\S]*?)\} as const;/.exec(state)?.[1] ?? '';
  const slugOf = (key: string): string | null =>
    new RegExp(`${key}: '([a-z0-9-]+)'`).exec(raceBlock)?.[1] ?? null;

  const shakers = specs.filter((s) => s.source.includes('RACE_PRODUCT.'));

  /** RACE_PRODUCT 의 열쇠들. 손으로 적지 않고 블록에서 읽는다 */
  const raceKeys = [...raceBlock.matchAll(/^\s*(\w+): '[a-z0-9-]+'/gm)].map((m) => m[1]!);

  it('상품과 명세를 실제로 찾아냈다 — 못 찾으면 아래가 헛돈다', () => {
    expect(raceKeys.length, 'RACE_PRODUCT 에서 열쇠를 못 읽었다').toBeGreaterThanOrEqual(3);
    for (const key of raceKeys) {
      expect(slugOf(key), `state.ts 에서 ${key} 상품을 못 찾았다`).not.toBeNull();
    }
    /*
     * **줄어드는 것도 회귀다.** 자기 상품을 쓰던 명세가 홈의 첫 상품으로
     * 돌아가면 여기서 개수가 준다 — 그러면 아래의 "첫 상품을 집지 않는다"
     * 검사는 그 명세를 아예 안 보게 된다. 실제로 한 줄을 되돌려 보고
     * 이 자리에서 걸리는 것을 확인했다.
     */
    /*
     * 열쇠마다 명세 하나다. 열쇠 수와 어긋나면 누군가 자기 상품을 버리고 홈의
     * 첫 상품으로 돌아갔거나, 상품을 정해 두고 아무도 안 쓰는 것이다.
     */
    expect(
      shakers.map((s) => s.name),
      'RACE_PRODUCT 를 쓰는 명세 수가 열쇠 수와 다르다 — 재고를 흔드는 명세가 홈의 첫 상품으로 돌아갔는지 본다',
    ).toHaveLength(raceKeys.length);
  });

  it('재고를 손으로 세우는 곳은 그 둘뿐이다', () => {
    /*
     * 운영 재고 API 를 부르는 명세가 더 생기면, 그 명세도 자기 상품을 가져야
     * 한다. 여기서 개수가 안 맞으면 목록과 현실이 갈린 것이다.
     */
    const setters = specs.filter((s) => /products\/\$\{[^}]+\}\/stock/.test(s.source));
    expect(
      setters.map((s) => s.name).filter((name) => !shakers.some((s) => s.name === name)),
      '운영 재고 API 를 부르면서 자기 상품을 안 쓰는 명세가 있다',
    ).toEqual([]);
  });

  it('서로 다른 상품이다', () => {
    const slugs = raceKeys.map(slugOf);
    expect(new Set(slugs).size, `재고를 흔드는 명세들이 같은 상품을 나눠 쥐고 있다: ${slugs.join(', ')}`).toBe(
      slugs.length,
    );
  });

  it('리뷰를 건드리는 상품과도 겹치지 않는다', () => {
    // 재고가 1 이 되면 그 상품을 담아 리뷰를 쓰는 길이 막힌다
    const review = new Set(
      ['readOnly', 'written']
        .map((key) => new RegExp(`${key}: '([a-z0-9-]+)'`).exec(state)?.[1])
        .filter((v): v is string => v !== undefined),
    );
    for (const key of raceKeys) {
      expect(review.has(slugOf(key)!), `${key} 상품이 리뷰 명세와 겹친다`).toBe(false);
    }
  });

  it('재고를 흔드는 명세는 홈의 첫 상품을 집지 않는다', () => {
    /*
     * **이 검사가 이 묶음의 요점이다.** 자기 상품을 정해 두고도 예전 호출이
     * 한 줄 남아 있으면 다시 남의 상품을 흔든다 — 그리고 그 실패는 다른
     * 명세에서 산발로 나타난다.
     */
    for (const spec of shakers) {
      expect(
        spec.source.includes('addFirstProductToCart'),
        `${spec.name} 이 홈의 첫 상품을 집는다 — addProductToCart(자기 슬러그) 로 간다`,
      ).toBe(false);
    }
  });
});

/**
 * **브랜드 이름을 바꾸는 명세가 고른 브랜드는 다른 명세가 이름으로 부르지 않는다.**
 *
 * 이름을 바꿔 둔 그 잠깐 동안 매대·검색·운영 화면의 그 브랜드 이름이 달라진다. 다른 명세가 그
 * 이름을 찾고 있었다면 이유 없이 진다 — 상품 이름을 바꾸는 명세와 같은 사정이다.
 */
describe('브랜드 이름을 흔드는 명세', () => {
  const brandOf = (source: string): string | null => /const BRAND = '([^']+)'/.exec(source)?.[1] ?? null;
  const renamers = specs.filter((s) => brandOf(s.source) !== null);

  it('이름을 바꾸는 명세를 실제로 찾아낸다', () => {
    expect(renamers.map((s) => s.name)).toContain('slug-history.spec.ts');
  });

  it('바꾸는 브랜드를 다른 명세가 이름으로 부르지 않는다', () => {
    for (const renamer of renamers) {
      const brand = brandOf(renamer.source)!;
      const others = specs
        .filter((s) => s.name !== renamer.name && s.source.toLowerCase().includes(brand.toLowerCase()))
        .map((s) => s.name);
      expect(others, `${renamer.name} 이 이름을 바꾸는 "${brand}" 를 다른 명세가 부른다`).toEqual([]);
    }
  });
});
