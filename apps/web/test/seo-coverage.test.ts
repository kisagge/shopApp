import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DISALLOWED_PATHS } from '@shop/core';

/**
 * 색인 정책이 화면과 어긋나지 않는지 지킨다.
 *
 * **robots.txt 만으로는 부족하다.** 그건 "긁지 마라" 이지 "색인하지 마라" 가
 * 아니라, 다른 데서 링크가 걸리면 내용 없이 주소만 검색 결과에 뜬다. 그래서
 * 화면 쪽 noindex 도 함께 있어야 하고, 둘 중 하나만 있으면 아무도 모른다.
 */

const APP = join(process.cwd(), 'src', 'app');

/** 이 경로 아래에 noindex 가 걸려 있는가 — 자기 자신이거나 조상 레이아웃이거나 */
function guarded(path: string): boolean {
  const dir = join(APP, path.replace(/^\//, ''));
  if (!existsSync(dir)) return false;

  for (const name of ['layout.tsx', 'page.tsx']) {
    const file = join(dir, name);
    if (existsSync(file) && readFileSync(file, 'utf8').includes('NO_INDEX')) return true;
  }

  // 하위 라우트만 있는 경우(order/[orderNo] 처럼) 그 안을 본다
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (!statSync(child).isDirectory()) continue;
    const page = join(child, 'page.tsx');
    if (existsSync(page) && readFileSync(page, 'utf8').includes('NO_INDEX')) return true;
  }
  return false;
}

describe('색인에서 빼는 경로', () => {
  it.each(DISALLOWED_PATHS.filter((p) => p !== '/api'))('%s 에 noindex 가 걸려 있다', (path) => {
    // /api 는 화면이 아니라 예외다
    expect(guarded(path)).toBe(true);
  });

  it('robots 와 sitemap 이 있다', () => {
    expect(existsSync(join(APP, 'robots.ts'))).toBe(true);
    expect(existsSync(join(APP, 'sitemap.ts'))).toBe(true);
  });

  it('robots 가 목록을 손으로 적지 않는다', () => {
    // 두 벌이 되면 어긋나고, 어긋난 쪽은 언제나 조용하다
    expect(readFileSync(join(APP, 'robots.ts'), 'utf8')).toContain('DISALLOWED_PATHS');
  });

  it('사이트맵에 검색 화면을 넣지 않는다', () => {
    const source = readFileSync(join(APP, 'sitemap.ts'), 'utf8');
    expect(source).not.toMatch(/['"`]\/search/);
  });
});

describe('공개 화면', () => {
  it('상품 상세는 색인돼야 한다', () => {
    const source = readFileSync(join(APP, 'product', '[slug]', 'page.tsx'), 'utf8');
    expect(source).not.toContain('NO_INDEX');
  });

  it('상품 상세가 구조화 데이터를 낸다', () => {
    const source = readFileSync(join(APP, 'product', '[slug]', 'page.tsx'), 'utf8');
    expect(source).toContain('application/ld+json');
    expect(source).toContain('productStructuredData');
  });

  it('구조화 데이터를 넣을 때 < 를 이스케이프한다', () => {
    /*
     * 상품명·설명은 운영자가 넣는 값이다. </script> 가 들어오면 그 자리에서
     * 스크립트가 끊기고 뒤가 마크업으로 읽힌다.
     */
    const source = readFileSync(join(APP, 'product', '[slug]', 'page.tsx'), 'utf8');
    expect(source).toMatch(/replace\(\/<\/g,\s*'\\\\u003c'\)/);
  });

  it('홈과 카테고리도 색인된다', () => {
    for (const file of [join(APP, 'page.tsx'), join(APP, 'category', '[slug]', 'page.tsx')]) {
      expect(readFileSync(file, 'utf8'), relative(APP, file)).not.toContain('NO_INDEX');
    }
  });
});
