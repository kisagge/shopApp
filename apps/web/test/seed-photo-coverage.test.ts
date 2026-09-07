import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 시드 상품은 전부 사진 검색어를 갖는다.
 *
 * 사진을 채우는 스크립트는 **상품 슬러그로 검색어 표를 찾는다.** 없으면
 * 경고 한 줄을 남기고 지나간다 — 스크립트를 돌린 사람이 그 줄을 놓치면
 * 그 상품만 톤 블록으로 남는다.
 *
 * 매대를 채우려고 상품 스물여섯 개를 한 번에 더하면서, 표에 한 줄씩 빠뜨리기
 * 딱 좋은 상태가 됐다. 경고는 사람이 읽어야 하지만 검사는 안 읽어도 진다.
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** PRODUCTS 배열 안의 슬러그만. 카테고리·브랜드 슬러그는 같은 모양이라 섞인다. */
function productSlugs(): string[] {
  const source = read('packages/db/src/seed.ts');
  const start = source.indexOf('const PRODUCTS: SeedProduct[] = [');
  expect(start, 'PRODUCTS 배열을 못 찾았다').toBeGreaterThan(-1);
  const end = source.indexOf('\n];', start);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s*slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]!);
}

function photoQueryKeys(): string[] {
  const source = read('apps/web/scripts/fetch-product-photos.ts');
  const start = source.indexOf('const QUERY: Readonly<Record<string, string>> = {');
  expect(start, 'QUERY 표를 못 찾았다').toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((m) => m[1]!);
}

describe('시드 상품과 사진 검색어', () => {
  const slugs = productSlugs();
  const keys = photoQueryKeys();

  it('둘 다 실제로 읽어 왔다', () => {
    // 파일 모양이 바뀌어 못 읽으면 아래 검사가 조용히 통과한다
    expect(slugs.length).toBeGreaterThan(20);
    expect(keys.length).toBeGreaterThan(20);
  });

  it('검색어 없는 상품이 없다', () => {
    const missing = slugs.filter((s) => !keys.includes(s));
    expect(
      missing,
      `사진 없이 남는다. fetch-product-photos 의 QUERY 표에 한 줄씩 더한다:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('상품 없는 검색어가 없다', () => {
    // 상품을 지웠는데 검색어만 남으면, 그 표가 무엇을 덮는지 알 수 없어진다
    const stale = keys.filter((k) => !slugs.includes(k));
    expect(stale, `없는 상품의 검색어가 남아 있다:\n${stale.join('\n')}`).toEqual([]);
  });
});
