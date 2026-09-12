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
