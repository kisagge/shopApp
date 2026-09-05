import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 캐시와 무효화가 짝을 이루는지 지킨다.
 *
 * **캐싱은 잘못돼도 조용하다.** 무효화를 빠뜨리면 화면이 낡은 값을 보여
 * 주는데, 개발 중에는 캐시가 비어 있어 아무 일도 안 일어나고 배포한 뒤에야
 * "왜 안 바뀌지" 가 된다. 요청 제한을 목록으로 지킨 것과 같은 이유다.
 *
 * 그리고 그보다 위험한 것 — **사용자마다 다른 값을 캐싱하는 것**이다.
 * 한 사람의 화면이 다음 사람에게 그대로 나간다.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** 캐싱해야 하는 공개 조회 */
const CACHED_READS = [
  'lib/queries/products.ts',
  'lib/queries/reviews.ts',
  'lib/admin/manage-banner.ts',
  'lib/queries/support.ts',
] as const;

/** 카탈로그를 털어야 하는 쓰기 창구 */
const CATALOG_WRITERS = [
  'app/api/admin/products/route.ts',
  'app/api/admin/products/[id]/route.ts',
  'app/api/admin/products/[id]/stock/route.ts',
  'app/api/admin/products/[id]/variants/route.ts',
  'app/api/admin/products/[id]/review/route.ts',
  'app/api/admin/products/[id]/images/route.ts',
  'app/api/admin/products/[id]/images/[imageId]/route.ts',
] as const;

const BANNER_WRITERS = [
  'app/api/admin/banners/route.ts',
  'app/api/admin/banners/[id]/route.ts',
  'app/api/admin/banners/[id]/image/route.ts',
] as const;

/**
 * 기획전 쓰기 창구.
 *
 * 기획전 조회는 `collections` 와 `catalog` 두 태그를 함께 단다 — 담긴 수는
 * 상품이 내려가도 달라지므로, 상품을 고쳤을 때도 함께 털려야 한다.
 */
const COLLECTION_WRITERS = [
  'app/api/admin/collections/route.ts',
  'app/api/admin/collections/[id]/route.ts',
  'app/api/admin/collections/[id]/items/route.ts',
  'app/api/admin/collections/[id]/image/route.ts',
] as const;

/**
 * 배치도 카탈로그를 턴다.
 *
 * 결제 대기 주문을 풀면 **재고가 늘어난다** — 품절로 보이던 것이 다시
 * 보여야 하는데, 캐시를 그대로 두면 최대 캐시 수명만큼 품절인 채로 남는다.
 * 사람이 누른 것이 아니라 배치가 한 일이라 아무도 새로고침하지 않는다.
 */
const CRON_WRITERS = ['app/api/cron/release-holds/route.ts'] as const;

/** 별점이 목록에 나오므로 리뷰 쓰기도 카탈로그를 턴다 */
const REVIEW_WRITERS = [
  'app/api/reviews/route.ts',
  'app/api/reviews/[id]/route.ts',
  'app/api/admin/reviews/[id]/restore/route.ts',
] as const;

/** 공지·FAQ 를 털어야 하는 쓰기 창구 */
const SUPPORT_WRITERS = [
  'app/api/admin/support/route.ts',
  'app/api/admin/support/[id]/route.ts',
] as const;

describe('캐싱한 자리', () => {
  it.each(CACHED_READS)('%s 가 캐시를 쓴다', (rel) => {
    expect(read(rel)).toContain('cachedRead');
  });

  it('사용자별 조회는 캐싱하지 않는다', () => {
    /*
     * getProductReviews 는 viewerId 를 받아 "내 리뷰인지" 를 담는다.
     * 이것이 캐시에 들어가면 남의 화면이 그대로 나간다.
     */
    const source = read('lib/queries/reviews.ts');
    const cachedAt = source.indexOf('cachedRead(');
    const viewerAt = source.indexOf('viewerId');

    expect(cachedAt).toBeGreaterThan(-1);
    // viewerId 를 쓰는 함수가 캐시 감싸개보다 앞에 있어야 한다
    expect(viewerAt).toBeLessThan(cachedAt);
  });

  it('어드민 조회는 캐싱하지 않는다 — 운영자는 방금 바꾼 값을 봐야 한다', () => {
    expect(read('lib/queries/admin.ts')).not.toContain('cachedRead');
    expect(read('lib/queries/admin-reviews.ts')).not.toContain('cachedRead');
  });

  it('고객센터도 운영진 목록만은 캐싱하지 않는다 — 초안이 보여야 고친다', () => {
    const source = read('lib/queries/support.ts');
    const adminAt = source.indexOf('getAdminSupportPosts');
    // 어드민 조회는 마지막에 있고, 그 뒤로는 캐시 감싸개가 없어야 한다
    expect(adminAt).toBeGreaterThan(-1);
    expect(source.slice(adminAt)).not.toContain('cachedRead');
  });

  it('마이페이지 조회도 캐싱하지 않는다', () => {
    expect(read('lib/queries/mypage.ts')).not.toContain('cachedRead');
  });
});

describe('무효화한 자리', () => {
  it.each(CATALOG_WRITERS)('%s 가 카탈로그를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateCatalog()');
  });

  it.each(BANNER_WRITERS)('%s 가 배너를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateBanners()');
  });

  it.each(CRON_WRITERS)('%s 가 카탈로그를 턴다 — 재고가 늘었다', (rel) => {
    expect(read(rel)).toContain('revalidateCatalog()');
  });

  it.each(COLLECTION_WRITERS)('%s 가 기획전을 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateCollections()');
  });

  it.each(REVIEW_WRITERS)('%s 가 리뷰를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateReviews()');
  });

  it.each(SUPPORT_WRITERS)('%s 가 공지·FAQ 를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateSupport()');
  });

  it('무효화를 부르는 라우트는 전부 목록에 있다', () => {
    // 반대 방향도 지킨다. 목록에 없는데 부르면 목록이 낡은 것이다.
    const listed = new Set<string>([
      ...CATALOG_WRITERS,
      ...BANNER_WRITERS,
      ...COLLECTION_WRITERS,
      ...CRON_WRITERS,
      ...REVIEW_WRITERS,
      ...SUPPORT_WRITERS,
    ]);
    const found: string[] = [];

    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
        else if (name === 'route.ts' && readFileSync(full, 'utf8').includes('~/lib/cache')) {
          found.push(`app/api/${prefix}${name}`);
        }
      }
    };
    walk(join(SRC, 'app', 'api'), '');

    expect(found.filter((f) => !listed.has(f))).toEqual([]);
  });
});
